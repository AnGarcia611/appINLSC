// Procesa los paquetes recibidos por correo desde la página de captura (/?captura).
//   npm run dataset -- <carpeta con los paquetes> [--personas 40] [--semilla 1]
// Con las tomas reales y sus variantes simuladas (src/capture/synth.ts) genera, sin datos personales:
//   public/vision/numbers.templates.json  formas de mano de los números (ángulos)
//   public/vision/signs.templates.json    prototipos de trámites y sí/no con la mano (trayectorias relativas al cuerpo)
// ⚠️ La carpeta de paquetes debe estar FUERA de este repositorio: el repo es público y los paquetes son datos biométricos.
import fs from "node:fs"
import path from "node:path"
import { report, signTemplateProblems } from "../src/capture/dataset.ts"
import { INTENT_LABELS } from "../src/vision/signs.ts"
import { trainModels } from "../src/capture/evaluate.ts"
import { loadPackages, option, positional, root } from "./packages.ts"

const [dir] = positional()
if (!dir) {
  console.error("Uso: npm run dataset -- <carpeta con los paquetes> [--personas 40] [--semilla 1]")
  process.exit(1)
}
const packages = loadPackages(dir).filter((p) => !p.synthetic)
console.log(report(packages))

const personas = option("personas", 40)
const t0 = Date.now()
console.log(`\nSimulando ${personas} personas por paquete y eligiendo prototipos…`)
const { numbers, signs } = trainModels(packages, { personas, seed: option("semilla", 1) })
if (!numbers.templates.length) {
  console.error("\n✗ No hay tomas de números utilizables: no se modifican las plantillas.")
  process.exit(1)
}
const out = path.join(root, "public/vision")
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, "numbers.templates.json"), JSON.stringify(numbers))
console.log(`\n✓ ${numbers.templates.length} formas de número → public/vision/numbers.templates.json`)
const problems = signTemplateProblems(signs, INTENT_LABELS)
if (problems.length) {
  // Un archivo así haría que la tablet nunca reconozca un trámite: se deja el anterior.
  console.warn(`✗ No se modifica public/vision/signs.templates.json: ${problems.join("; ")}`)
} else {
  fs.writeFileSync(path.join(out, "signs.templates.json"), JSON.stringify(signs))
  const labels = [...new Set(signs.prototypes.map((p) => p.label))].map((l) => `${l} ${signs.prototypes.filter((p) => p.label === l).length}`).join(" · ")
  console.log(`✓ ${signs.prototypes.length} prototipos (${labels}) · near ${signs.near} · far ${signs.far} → public/vision/signs.templates.json`)
}
console.log(`  ${numbers.signers} señante(s) real(es) · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
