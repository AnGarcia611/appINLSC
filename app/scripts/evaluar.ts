// Mide los reconocedores con tomas reales que no se usaron para entrenar.
//   npm run evaluar -- <carpeta con los paquetes> [<otra carpeta>…] [--grupos 5] [--personas 30] [--prueba 3] [--semilla 1] [--publicos-solo-medir]
// Para cada grupo de tomas entrena con las demás (reales + simuladas) y prueba con las del grupo.
// Con un dataset público importado (p. ej. ~/inlsc-publicos/lsc54) sus señantes se reparten entre los grupos.
import { evaluate, evaluationReport } from "../src/capture/evaluate.ts"
import { loadFolders, option, positional } from "./packages.ts"

const dirs = positional()
if (!dirs.length) {
  console.error("Uso: npm run evaluar -- <carpeta con los paquetes> [<otra carpeta>…] [--grupos 5] [--personas 30] [--prueba 3] [--semilla 1]")
  process.exit(1)
}
// --publicos-solo-medir: los datasets públicos solo se usan para probar (para comparar con y sin ellos al entrenar).
const evalOnly = process.argv.includes("--publicos-solo-medir")
const packages = loadFolders(dirs).filter((p) => !p.synthetic)
  .map((p) => (evalOnly && p.origin ? { ...p, consent: { ...p.consent, training: false } } : p))
const t0 = Date.now()
const outcomes = evaluate(packages, {
  folds: option("grupos", 5), personas: option("personas", 30), testPersonas: option("prueba", 3), seed: option("semilla", 1),
  log: (l) => console.log(l),
})
console.log(`\n${evaluationReport(outcomes)}\n\n(${((Date.now() - t0) / 1000).toFixed(0)} s)`)
