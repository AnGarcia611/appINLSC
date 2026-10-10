#!/usr/bin/env python3
"""Importa los videos de números del dataset público LSC-54 al formato de captura de InLSC (`inlsc-captura` v1).

    ~/inlsc-publicos/.venv/bin/python scripts/importar_lsc54.py <carpeta con los videos> <carpeta de salida> [--sin-recorte]

Fuente: Mora-Zárate JE, Garzón-Castro CL, Castellanos-Rivillas JA. "LSC-54: A landmark-based dataset for Colombian
Sign Language". Data in Brief 63 (2025) 112145. Datos: Science Data Bank, DOI 10.57760/sciencedb.25639 (archivo
"Videos Numbers.zip"). Licencia CC BY-NC 4.0: solo uso no comercial y citando a los autores.

Los puntos se sacan con los mismos modelos y ajustes que la app (public/vision/models, imagen de 640 px de ancho,
~15 fotogramas por segundo como la tablet), para que se parezcan a lo que la app ve en vivo. Los videos de LSC-54
son de cuerpo entero y de lejos: cada uno se recorta alrededor de la persona con el encuadre de la tablet (hombros
al 38 % del ancho y a 2/3 de la altura, medido en las capturas propias) y se amplía, como si la cámara estuviera
a la distancia de la tablet. Sin el recorte la mano mide ~25 px y MediaPipe la pierde en 4 de cada 10 fotogramas. Se escribe un
paquete por señante; sus tomas llevan el señante como grupo, así `npm run evaluar` prueba con personas no vistas.
El 10 no es una opción de la app: se guarda como "otra" seña (sirve para medir disparos falsos).

Requisitos (fuera del repo): python3 -m venv ~/inlsc-publicos/.venv && ~/inlsc-publicos/.venv/bin/pip install mediapipe opencv-python-headless
La salida debe quedar FUERA de este repositorio, que es público.
Aviso: MediaPipe para Python (1.x) intenta enviar estadísticas de uso a play.googleapis.com/log. No encontramos cómo
apagarlo; los videos y los puntos se procesan en este equipo.
"""
import gzip
import json
import os
import re
import subprocess
import sys
import unicodedata
from concurrent.futures import ProcessPoolExecutor
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
NUMBERS = {"uno": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10, "dies": 10,
           "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}
ORIGIN = {
    "dataset": "LSC-54",
    "license": "CC BY-NC 4.0",
    "citation": "Mora-Zárate JE, Garzón-Castro CL, Castellanos-Rivillas JA. LSC-54: A landmark-based dataset for Colombian Sign Language. Data in Brief 63 (2025) 112145",
    "url": "https://doi.org/10.57760/sciencedb.25639",
}


def plain(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()


def parse(path: Path, base: Path):
    """(señante, número, clave) a partir de la ruta: "Videos Numbers/<señante>/Numeros/<número en palabras>/<repetición>.avi"."""
    parts = [plain(p) for p in path.relative_to(base).with_suffix("").parts]
    number = next((NUMBERS[p] for p in parts[:-1] if p in NUMBERS), None)
    signer = next((p for p in parts[:-1] if p.isdigit()), None)
    if number is None or signer is None:
        return None
    signer = f"S{int(signer):02d}"
    return signer, number, f"{signer}-{number}-{parts[-1]}"


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


def r4(x: float) -> float:
    return round(float(x), 4)


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


def tablet_crop(video: str):
    """Recorte (x, y, ancho, alto en px) con el encuadre de la tablet, a partir de los hombros (mediana del video)."""
    import cv2
    import mediapipe as mp
    pose = pose_landmarker()
    cap = cv2.VideoCapture(video)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    W, H = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    xs, ws, ys, i = [], [], [], 0
    while True:
        ok, img = cap.read()
        if not ok:
            break
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


def extract(video: str, crop=None):
    """Fotogramas compactos (como encodeFrame) de un video (o de su recorte), más el tamaño de la imagen procesada."""
    import cv2
    import mediapipe as mp

    hands, pose = hand_landmarker(), pose_landmarker()
    cap = cv2.VideoCapture(video)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width, height = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    step = max(1, round(src_fps / TARGET_FPS))
    frames, i = [], 0
    try:
        while True:
            ok, img = cap.read()
            if not ok:
                break
            if i % step == 0:
                if crop:
                    # Fuera del cuadro se rellena con el borde (la persona puede no estar centrada).
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
    if frames:
        t0 = frames[0]["t"]
        for f in frames:
            f["t"] -= t0
    return frames, width, height


def take_of(item):
    video, signer, number, key = item
    frames, width, height = extract(video, tablet_crop(video) if CROP else None)
    if len(frames) < 3:
        return None
    dur = frames[-1]["t"]
    label = str(number) if number <= 9 else "otra"
    return signer, (width, height), {
        "id": f"lsc54-{key}", "task": f"num-{number}" if number <= 9 else "otra", "label": label, "variant": False,
        "at": "", "durationMs": dur, "fps": round((len(frames) - 1) * 1000 / dur) if dur else 0,
        "handRatio": round(sum(1 for f in frames if f["h"]) / len(frames), 2), "frames": frames, "group": f"LSC54-{signer}",
    }


CROP = "--sin-recorte" not in sys.argv


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        sys.exit(__doc__)
    base, out = Path(args[0]).expanduser().resolve(), Path(args[1]).expanduser().resolve()
    assert_private(out)
    videos = sorted(p for p in base.rglob("*") if p.suffix.lower() in (".mp4", ".avi", ".mov", ".mkv", ".webm"))
    items, skipped = [], []
    for v in videos:
        parsed = parse(v, base)
        if parsed:
            items.append((str(v), *parsed))
        else:
            skipped.append(v)
    print(f"{len(videos)} videos · {len(items)} números · {len(skipped)} sin señante o número reconocible")
    for v in skipped[:5]:
        print(f"  ? {v.relative_to(base)}")
    by_signer, cams, done = {}, {}, 0
    with ProcessPoolExecutor(max_workers=max(1, (os.cpu_count() or 2) - 1)) as pool:
        for res in pool.map(take_of, items, chunksize=4):
            done += 1
            if done % 50 == 0:
                print(f"  {done}/{len(items)}")
            if res:
                signer, cam, take = res
                by_signer.setdefault(signer, []).append(take)
                cams[signer] = cam
    now = datetime.now(timezone.utc).isoformat()
    import mediapipe as mp
    for signer, takes in sorted(by_signer.items()):
        w, h = cams[signer]
        pkg = {
            "format": "inlsc-captura", "version": 1, "id": f"lsc54-{signer}", "createdAt": now, "updatedAt": now,
            "app": {"mediapipe": f"python {mp.__version__}", "models": {"hands": "hand_landmarker.task", "pose": "pose_landmarker_lite.task"}},
            "camera": {"width": w, "height": h},
            "consent": {"version": f"{ORIGIN['license']} · {ORIGIN['dataset']}", "acceptedAt": now, "training": True, "evaluation": True},
            "signer": {"code": f"LSC54-{signer}", "profile": {}},
            "validations": [], "takes": takes, "trials": [], "origin": ORIGIN,
        }
        with gzip.open(out / f"lsc54-{signer}.json.gz", "wt", encoding="utf-8") as f:
            json.dump(pkg, f, separators=(",", ":"))
    total = sum(len(t) for t in by_signer.values())
    print(f"✓ {len(by_signer)} señantes · {total} tomas → {out}")


if __name__ == "__main__":
    main()
