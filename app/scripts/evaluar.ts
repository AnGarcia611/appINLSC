// Mide los reconocedores con tomas reales que no se usaron para entrenar.
//   npm run evaluar -- <carpeta con los paquetes> [--grupos 5] [--personas 30] [--prueba 3] [--semilla 1]
// Para cada grupo de tomas entrena con las demás (reales + simuladas) y prueba con las del grupo.
import { evaluate, evaluationReport } from "../src/capture/evaluate.ts"
import { loadPackages, option, positional } from "./packages.ts"

const [dir] = positional()
if (!dir) {
  console.error("Uso: npm run evaluar -- <carpeta con los paquetes> [--grupos 5] [--personas 30] [--prueba 3] [--semilla 1]")
  process.exit(1)
}
const packages = loadPackages(dir).filter((p) => !p.synthetic)
const t0 = Date.now()
const outcomes = evaluate(packages, {
  folds: option("grupos", 5), personas: option("personas", 30), testPersonas: option("prueba", 3), seed: option("semilla", 1),
  log: (l) => console.log(l),
})
console.log(`\n${evaluationReport(outcomes)}\n\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`)
