"""Puntos de manos y cuerpo a partir de un video, como los vería la tablet. Lo usan importar_lsc54.py e importar_videos.py.

Se usan los mismos modelos y ajustes que la app (public/vision/models, imagen de 640 px de ancho, ~15 fotogramas por
segundo como la tablet). Con `crop`, el video se recorta alrededor de la persona con el encuadre de la tablet (hombros
al 38 % del ancho y a 2/3 de la altura, medido en las capturas propias) y se amplía o reduce: así la mano ocupa en la
imagen lo mismo que en la tablet, aunque el video sea de cuerpo entero o de cerca.

Aviso: MediaPipe para Python (1.x) intenta enviar estadísticas de uso a play.googleapis.com/log. No encontramos cómo
apagarlo; los videos y los puntos se procesan en este equipo.
"""
import gzip
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "public" / "vision" / "models"
PROCESS_WIDTH = 640  # como src/vision/tracker.ts
TARGET_FPS = 15  # la tablet procesa ~14 fps
POSE_KEEP = 25  # como src/vision/types.ts
# Encuadre de la tablet (mediana de las capturas propias): ancho de hombros y altura de los hombros, en fracción del cuadro.
TABLET_SHOULDERS = 0.38
TABLET_SHOULDER_Y = 0.68
ASPECT = 16 / 9
# Para calcular el encuadre basta con una muestra de fotogramas.
CROP_SAMPLES = 60


def assert_private(out: Path):
    """Corta si la salida queda dentro de este repositorio (es público y los puntos son datos biométricos)."""
    def common(d: Path):
        try:
            return Path(d, subprocess.check_output(["git", "rev-parse", "--git-common-dir"], cwd=d, stderr=subprocess.DEVNULL, text=True).strip()).resolve()
        except Exception:
            return None
    out.mkdir(parents=True, exist_ok=True)
    ours = common(ROOT)
    if ours and common(out) == ours:
        sys.exit(f"✗ {out} está dentro de este repositorio, que es público. Use una carpeta fuera de él.")


def hand_landmarker():
    from mediapipe.tasks.python import BaseOptions, vision
    return vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(MODELS / "hand_landmarker.task")),
        running_mode=vision.RunningMode.VIDEO, num_hands=2,
        min_hand_detection_confidence=0.5, min_hand_presence_confidence=0.5, min_tracking_confidence=0.5))


def pose_landmarker():
    from mediapipe.tasks.python import BaseOptions, vision
    return vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=str(MODELS / "pose_landmarker_lite.task")),
        running_mode=vision.RunningMode.VIDEO, num_poses=1))


def tablet_crop(video: str, start: float | None = None, end: float | None = None):
    """Recorte (x, y, ancho, alto en px) con el encuadre de la tablet, a partir de los hombros (mediana del tramo)."""
    import cv2
    import mediapipe as mp
    pose = pose_landmarker()
    cap = cv2.VideoCapture(video)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    first = round((start or 0) * src_fps)
    last = round(end * src_fps) if end else int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    step = max(1, (last - first) // CROP_SAMPLES)
    if first:
        cap.set(cv2.CAP_PROP_POS_FRAMES, first)
    xs, ws, ys, i = [], [], [], first
    while i < last:
        ok, img = cap.read()
        if not ok:
            break
        if (i - first) % step == 0:
            r = pose.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB)), round(i * 1000 / src_fps))
            if r.pose_landmarks:
                l, rr = r.pose_landmarks[0][11], r.pose_landmarks[0][12]
                xs.append((l.x + rr.x) / 2 * W); ws.append(abs(l.x - rr.x) * W); ys.append((l.y + rr.y) / 2 * H)
        i += 1
    cap.release()
    pose.close()
    if not ws:
        return None
    med = lambda v: sorted(v)[len(v) // 2]
    cw = med(ws) / TABLET_SHOULDERS
    ch = cw / ASPECT
    return round(med(xs) - cw / 2), round(med(ys) - TABLET_SHOULDER_Y * ch), round(cw), round(ch)


def r4(x: float) -> float:
    return round(float(x), 4)


def extract(video: str, crop=None, start: float | None = None, end: float | None = None):
    """Fotogramas compactos (como encodeFrame) del tramo [start, end] en segundos, más el tamaño de la imagen procesada."""
    import cv2
    import mediapipe as mp

    hands, pose = hand_landmarker(), pose_landmarker()
    cap = cv2.VideoCapture(video)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    step = max(1, round(src_fps / TARGET_FPS))
    first = round((start or 0) * src_fps)
    last = round(end * src_fps) if end else None
    if first:
        cap.set(cv2.CAP_PROP_POS_FRAMES, first)
    frames, i = [], first
    try:
        while last is None or i < last:
            ok, img = cap.read()
            if not ok:
                break
            if (i - first) % step == 0:
                if crop:
                    # Fuera del cuadro se rellena con el borde (la persona puede no estar centrada o estar muy cerca).
                    x, y, cw, ch = crop
                    img = cv2.copyMakeBorder(img, max(0, -y), max(0, y + ch - img.shape[0]), max(0, -x), max(0, x + cw - img.shape[1]), cv2.BORDER_REPLICATE)
                    img = img[max(0, y):max(0, y) + ch, max(0, x):max(0, x) + cw]
                    img = cv2.resize(img, (PROCESS_WIDTH, round(PROCESS_WIDTH / ASPECT)), interpolation=cv2.INTER_CUBIC)
                    width, height = img.shape[1], img.shape[0]
                h, w = img.shape[:2]
                if w > PROCESS_WIDTH:
                    img = cv2.resize(img, (PROCESS_WIDTH, round(h * PROCESS_WIDTH / w)), interpolation=cv2.INTER_AREA)
                t = round(i * 1000 / src_fps)
                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
                hr = hands.detect_for_video(image, t)
                pr = pose.detect_for_video(image, t)
                frames.append({
                    "t": t,
                    "h": [{"s": hr.handedness[k][0].category_name if hr.handedness[k] else "",
                           "c": round(float(hr.handedness[k][0].score), 2) if hr.handedness[k] else 0,
                           "p": [r4(v) for p in pts for v in (p.x, p.y, p.z)]} for k, pts in enumerate(hr.hand_landmarks)],
                    "b": [v for p in pr.pose_landmarks[0][:POSE_KEEP] for v in (r4(p.x), r4(p.y), r4(p.z), round(float(p.visibility or 0), 2))] if pr.pose_landmarks else None,
                })
            i += 1
    finally:
        cap.release()
        hands.close()
        pose.close()
    return rebase(frames), width, height


def rebase(frames):
    """Tiempos desde el primer fotograma (ms)."""
    if frames:
        t0 = frames[0]["t"]
        frames = [{**f, "t": f["t"] - t0} for f in frames]
    return frames


def make_take(take_id: str, task: str, label: str, frames, group: str):
    dur = frames[-1]["t"] if frames else 0
    return {
        "id": take_id, "task": task, "label": label, "variant": False, "at": "", "durationMs": dur,
        "fps": round((len(frames) - 1) * 1000 / dur) if dur else 0,
        "handRatio": round(sum(1 for f in frames if f["h"]) / len(frames), 2) if frames else 0,
        "frames": frames, "group": group,
    }


def write_package(out: Path, pkg_id: str, signer_code: str, takes, camera, origin: dict):
    """Un paquete `inlsc-captura` v1 (comprimido) con las tomas de una persona de un dataset público."""
    import mediapipe as mp
    now = datetime.now(timezone.utc).isoformat()
    w, h = camera
    pkg = {
        "format": "inlsc-captura", "version": 1, "id": pkg_id, "createdAt": now, "updatedAt": now,
        "app": {"mediapipe": f"python {mp.__version__}", "models": {"hands": "hand_landmarker.task", "pose": "pose_landmarker_lite.task"}},
        "camera": {"width": w, "height": h},
        "consent": {"version": f"{origin['license']} · {origin['dataset']}", "acceptedAt": now, "training": True, "evaluation": True},
        "signer": {"code": signer_code, "profile": {}},
        "validations": [], "takes": takes, "trials": [], "origin": origin,
    }
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in pkg_id)
    with gzip.open(out / f"{safe}.json.gz", "wt", encoding="utf-8") as f:
        json.dump(pkg, f, separators=(",", ":"))
