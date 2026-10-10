#!/usr/bin/env python3
"""Importa los videos de números del dataset público LSC-54 al formato de captura de InLSC (`inlsc-captura` v1).

    ~/inlsc-publicos/.venv/bin/python scripts/importar_lsc54.py <carpeta con los videos> <carpeta de salida> [--sin-recorte]

Fuente: Mora-Zárate JE, Garzón-Castro CL, Castellanos-Rivillas JA. "LSC-54: A landmark-based dataset for Colombian
Sign Language". Data in Brief 63 (2025) 112145. Datos: Science Data Bank, DOI 10.57760/sciencedb.25639 (archivo
"Videos Numbers.zip"). Licencia CC BY-NC 4.0: solo uso no comercial y citando a los autores.

Los puntos se sacan como los vería la tablet (ver puntos_video.py). Los videos de LSC-54 son de cuerpo entero y de
lejos: sin el recorte con el encuadre de la tablet la mano mide ~25 px y MediaPipe la pierde en 4 de cada 10
fotogramas. Se escribe un
paquete por señante; sus tomas llevan el señante como grupo, así `npm run evaluar` prueba con personas no vistas.
El 10 no es una opción de la app: se guarda como "otra" seña (sirve para medir disparos falsos).

Requisitos (fuera del repo): python3 -m venv ~/inlsc-publicos/.venv && ~/inlsc-publicos/.venv/bin/pip install mediapipe opencv-python-headless
La salida debe quedar FUERA de este repositorio, que es público.
"""
import os
import sys
import unicodedata
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from puntos_video import assert_private, extract, make_take, tablet_crop, write_package  # noqa: E402

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


def take_of(item):
    video, signer, number, key = item
    frames, width, height = extract(video, tablet_crop(video) if CROP else None)
    if len(frames) < 3:
        return None
    task, label = (f"num-{number}", str(number)) if number <= 9 else ("otra", "otra")
    return signer, (width, height), make_take(f"lsc54-{key}", task, label, frames, f"LSC54-{signer}")


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
    for signer, takes in sorted(by_signer.items()):
        write_package(out, f"lsc54-{signer}", f"LSC54-{signer}", takes, cams[signer], ORIGIN)
    total = sum(len(t) for t in by_signer.values())
    print(f"✓ {len(by_signer)} señantes · {total} tomas → {out}")


if __name__ == "__main__":
    main()
