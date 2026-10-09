// Escribe paquetes simulados (mismo formato que la captura) para revisarlos o usarlos con otras herramientas.
//   npm run simular -- <carpeta con los paquetes reales> <carpeta de salida> [--personas 50] [--semilla 1]
// No hace falta para entrenar: `npm run dataset` y `npm run evaluar` simulan en memoria con la misma semilla.
// ⚠️ Las dos carpetas deben estar FUERA del repositorio: las variantes siguen siendo derivados de datos biométricos.
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { simulate } from "../src/capture/synth.ts"
import { assertPrivate, loadPackages, option, positional } from "./packages.ts"

const [src, dst] = positional()
if (!src || !dst) {
  console.error("Uso: npm run simular -- <carpeta con los paquetes reales> <carpeta de salida> [--personas 50] [--semilla 1]")
  process.exit(1)
}
const out = assertPrivate(dst)
const real = loadPackages(src).filter((p) => !p.synthetic)
let files = 0, takes = 0
for (const pkg of simulate(real, { personas: option("personas", 50), seed: option("semilla", 1) })) {
  fs.writeFileSync(path.join(out, `${pkg.id.replace(/[^\w~-]/g, "_")}.json.gz`), zlib.gzipSync(JSON.stringify(pkg)))
  files++; takes += pkg.takes.length
}
console.log(`✓ ${files} paquetes simulados · ${takes} tomas → ${out}`)
