#!/usr/bin/env python3
"""Importa los puntos del dataset público LSC50 al formato de captura de InLSC (`inlsc-captura` v1), como "otras señas".

    python3 scripts/importar_lsc50.py <LANDMARKS.zip> <carpeta de salida>

Fuente: Flórez-Sierra AF, Solórzano DB, Segura-Quijano F, Cortés-Bello YM, Cubillos L, Giraldo LF, Cifuentes-De la
Portilla C. "LSC50: Colombian Sign Language Video and Inertial Measurement dataset". Scientific Data 11 (2024) 1347.
Datos: Figshare 27383016, archivo LANDMARKS.zip (2.8 GB). Licencia de los datos: CC BY 4.0 (citar a los autores).

LSC50 trae 50 señas cotidianas (gracias, buenos días, por favor, con gusto, perdón, permiso, ¿qué?, ¿dónde?…) de
5 personas, 4 repeticiones cada una. Ninguna es un número, un trámite ni sí/no: todas entran como "otra" seña, que es
justo lo que falta para que los reconocedores aprendan a no dispararse con señas de otras personas. Los puntos ya
vienen calculados (MediaPipe Holistic, video de 1920×1080 a 24 fps): no hace falta procesar video. Se toma 1 de cada 2
fotogramas (12 fps, cerca de los ~14 de la tablet). Holistic nombra las manos según la persona; aquí se usa la
convención de la app (cámara sin espejo: la mano derecha de la persona sale como "Left").
La salida debe quedar FUERA de este repositorio, que es público.
"""
import csv
import io
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from puntos_video import POSE_KEEP, assert_private, make_take, write_package  # noqa: E402

SRC_FPS = 24
STEP = 2
SIGNS = ["GRACIAS", "BUENOS DÍAS", "BUENAS TARDES", "BUENAS NOCHES", "SEÑA", "NOMBRE", "TRABAJAR", "COMER", "VIVIR", "POCO",
         "FAMILIA", "PERSONAS", "MUJER", "HOMBRE", "NIÑO", "NIÑA", "ABUELO", "TÍO", "HERMANO", "HAMBRE", "FELIZ", "CONTENTO",
         "TRISTE", "ABURRIDO", "BIEN", "MAL", "¿CÓMO ESTÁS?", "MÁS O MENOS", "SENTIR", "JUICIOSO", "HOLA", "ADIÓS", "POR FAVOR",
         "CON GUSTO", "BIENVENIDO", "PERDÓN", "PERMISO", "NUNCA", "YO", "TÚ", "USTEDES", "¿QUÉ?", "¿CUÁNDO?", "¿DÓNDE?",
         "¿CÓMO?", "¿POR QUÉ?", "¿QUIÉN?", "DIFERENTE", "TODOS", "MUCHO"]
ORIGIN = {
    "dataset": "LSC50",
    "license": "CC BY 4.0",
    "citation": "Flórez-Sierra AF, Solórzano DB, Segura-Quijano F, Cortés-Bello YM, Cubillos L, Giraldo LF, Cifuentes-De la Portilla C. LSC50: Colombian Sign Language Video and Inertial Measurement dataset. Scientific Data 11 (2024) 1347",
    "url": "https://doi.org/10.1038/s41597-024-04172-5",
}
APP = {"mediapipe": "Holistic (puntos del dataset LSC50)", "models": {"holistic": "MediaPipe Holistic"}}


def rows(z: zipfile.ZipFile, name: str):
    data = list(csv.reader(io.StringIO(z.read(name).decode("utf-8"))))[1:]
    return [[float(v) for v in r[1:]] for r in data]


def r4(x: float) -> float:
    return round(x, 4)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, out = Path(sys.argv[1]).expanduser().resolve(), Path(sys.argv[2]).expanduser().resolve()
    assert_private(out)
    z = zipfile.ZipFile(src)
    tags = sorted(Path(n).stem for n in z.namelist() if n.startswith("LANDMARKS/BODY_LANDMARKS/") and n.endswith(".csv"))
    by_signer, skipped = {}, 0
    for tag in tags:
        sign, vol, rep = (int(x) for x in tag.split("_"))
        try:
            body = rows(z, f"LANDMARKS/BODY_LANDMARKS/{tag}.csv")
            right = rows(z, f"LANDMARKS/HANDS_LANDMARKS/RIGHT_HAND_LANDMARKS/{tag}.csv")
            left = rows(z, f"LANDMARKS/HANDS_LANDMARKS/LEFT_HAND_LANDMARKS/{tag}.csv")
        except KeyError:
            skipped += 1
            continue
        n = min(len(body), len(right), len(left))
        frames = []
        for i in range(0, n, STEP):
            hands = [{"s": side, "c": 1.0, "p": [r4(v) for v in pts[i][:63]]} for side, pts in (("Left", right), ("Right", left)) if len(pts[i]) >= 63]
            b = body[i]
            pose = [v for k in range(POSE_KEEP) for v in (r4(b[3 * k]), r4(b[3 * k + 1]), r4(b[3 * k + 2]), 1.0)] if len(b) >= POSE_KEEP * 3 else None
            frames.append({"t": round(i * 1000 / SRC_FPS), "h": hands, "b": pose})
        if len(frames) < 3:
            skipped += 1
            continue
        signer = f"LSC50-V{vol}"
        take = make_take(f"lsc50-{tag}", "otra", "otra", frames, signer)
        take["note"] = SIGNS[sign] if sign < len(SIGNS) else str(sign)
        by_signer.setdefault(signer, []).append(take)
    for signer, takes in sorted(by_signer.items()):
        write_package(out, signer.lower(), signer, takes, (1920, 1080), ORIGIN, APP)
        print(f"  {signer}: {len(takes)} tomas")
    print(f"✓ {sum(len(t) for t in by_signer.values())} tomas de {len(by_signer)} personas → {out}" + (f" · {skipped} omitidas" if skipped else ""))


if __name__ == "__main__":
    main()
