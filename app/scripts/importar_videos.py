#!/usr/bin/env python3
"""Importa videos de cualquier origen (archivos de un canal, videos del proyecto, descargas con licencia CC) al formato
de captura de InLSC (`inlsc-captura` v1), a partir de una lista CSV. Solo se guardan puntos, nunca video.

    ~/inlsc-publicos/.venv/bin/python scripts/importar_videos.py <lista.csv> <carpeta de salida> [--sin-recorte]

Columnas de la lista (la primera fila es el encabezado):
  archivo    ruta del video (relativa a la lista o absoluta)
  etiqueta   1–9, asignar, cancelar, facturar, si-mano, no-indice, si-cabeza, no-cabeza, otra o nada
  senante    código de la persona que seña: sus tomas van juntas al probar (personas no vistas)
  inicio     segundo de inicio (opcional)
  fin        segundo final (opcional)
  trozo      segundos por toma para partir videos largos, p. ej. 4 para usar una charla como "otra" (opcional)
  dataset    nombre de la fuente, p. ej. "FENASCOL (YouTube)"
  licencia   p. ej. "CC BY 3.0" o "propios del proyecto"
  cita       referencia para citar la fuente
  url        enlace de la fuente

Los puntos se sacan como los vería la tablet (ver puntos_video.py). Se escribe un paquete por fuente y señante.
La salida debe quedar FUERA de este repositorio, que es público.
"""
import csv
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from puntos_video import assert_private, extract, make_take, rebase, tablet_crop, write_package  # noqa: E402

TASKS = {
    "asignar": ("tramite-asignar", "asignar"), "cancelar": ("tramite-cancelar", "cancelar"), "facturar": ("tramite-facturar", "facturar"),
    "si-mano": ("si-mano", "sí"), "no-indice": ("no-indice", "no"), "si-cabeza": ("si-cabeza", "sí"), "no-cabeza": ("no-cabeza", "no"),
    "otra": ("otra", "otra"), "nada": ("nada", "nada"),
    **{str(n): (f"num-{n}", str(n)) for n in range(1, 10)},
}
CROP = "--sin-recorte" not in sys.argv


def num(text: str):
    text = (text or "").strip().replace(",", ".")
    return float(text) if text else None


def process(row):
    video, start, end, chunk = row["path"], num(row.get("inicio")), num(row.get("fin")), num(row.get("trozo"))
    task, label = TASKS[row["etiqueta"].strip().lower()]
    frames, width, height = extract(video, tablet_crop(video, start, end) if CROP else None, start, end)
    if len(frames) < 3:
        return row, (width, height), []
    base_id = f"{row['dataset']}~{row['senante']}~{Path(video).stem}~{start or 0:g}"
    if not chunk:
        return row, (width, height), [make_take(base_id, task, label, frames, row["senante"])]
    # Video largo: tomas de `chunk` segundos (cada una como si fuera una seña aparte).
    takes, span = [], chunk * 1000
    for k in range(int(frames[-1]["t"] // span) + 1):
        part = [f for f in frames if k * span <= f["t"] < (k + 1) * span]
        if len(part) >= 3:
            takes.append(make_take(f"{base_id}~{k}", task, label, rebase(part), row["senante"]))
    return row, (width, height), takes


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        sys.exit(__doc__)
    manifest, out = Path(args[0]).expanduser().resolve(), Path(args[1]).expanduser().resolve()
    assert_private(out)
    with open(manifest, newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if (r.get("archivo") or "").strip()]
    bad = [r for r in rows if r["etiqueta"].strip().lower() not in TASKS]
    if bad:
        sys.exit(f"✗ etiquetas desconocidas: {sorted({r['etiqueta'] for r in bad})}. Use: {', '.join(TASKS)}")
    for r in rows:
        p = Path(r["archivo"].strip()).expanduser()
        r["path"] = str(p if p.is_absolute() else (manifest.parent / p).resolve())
        if not Path(r["path"]).exists():
            sys.exit(f"✗ no existe: {r['path']}")
    print(f"{len(rows)} videos en la lista")
    groups, cams = {}, {}
    with ProcessPoolExecutor(max_workers=max(1, (os.cpu_count() or 2) - 1)) as pool:
        for row, cam, takes in pool.map(process, rows):
            key = (row["dataset"], row["senante"])
            groups.setdefault(key, {"row": row, "takes": []})["takes"].extend(takes)
            cams[key] = cam
    for (dataset, signer), g in sorted(groups.items()):
        r = g["row"]
        origin = {"dataset": dataset, "license": r.get("licencia", ""), "citation": r.get("cita", ""), "url": r.get("url", "")}
        write_package(out, f"{dataset}-{signer}", signer, g["takes"], cams[(dataset, signer)], origin)
        labels = {}
        for t in g["takes"]:
            labels[t["label"]] = labels.get(t["label"], 0) + 1
        print(f"  {dataset} · {signer}: {len(g['takes'])} tomas ({', '.join(f'{k} {v}' for k, v in sorted(labels.items()))})")
    print(f"✓ {sum(len(g['takes']) for g in groups.values())} tomas → {out}")


if __name__ == "__main__":
    main()
