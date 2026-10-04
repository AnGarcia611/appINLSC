// Procesa los paquetes recibidos por correo desde la página de captura (/?captura).
//   npm run dataset -- <carpeta con los .json.gz>
// Genera public/vision/numbers.templates.json (plantillas de forma, sin datos personales) e imprime un informe.
// ⚠️ La carpeta de paquetes debe estar FUERA de este repositorio: el repo es público y los paquetes son datos biométricos.
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { buildTemplates, report, selectPackages } from "../src/capture/dataset.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dir = process.argv[2]
const out = process.argv[3] ?? path.join(root, "public/vision/numbers.templates.json")

if (!dir) {
  console.error("Uso: npm run dataset -- <carpeta con los paquetes .json.gz> [salida.json]")
  process.exit(1)
}
const abs = path.resolve(dir)
// Mismo repositorio git (también si es otro worktree): se compara el directorio .git común.
const gitDir = (cwd: string) => {
  try { return path.resolve(cwd, execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim()) } catch { return null }
}
const ours = gitDir(root)
if (ours && gitDir(abs) === ours) {
  console.error(`✗ ${abs} está dentro de este repositorio, que es público. Guarde los paquetes en una carpeta privada fuera de él.`)
  process.exit(1)
}

const files = fs.readdirSync(abs).filter((f) => f.endsWith(".json.gz") || f.endsWith(".json"))
const items = files.flatMap((file) => {
  try {
    const raw = fs.readFileSync(path.join(abs, file))
    return [{ file, data: JSON.parse((file.endsWith(".gz") ? zlib.gunzipSync(raw) : raw).toString("utf8")) as unknown }]
  } catch (e) {
    console.warn(`✗ ${file}: no se pudo leer (${(e as Error).message})`)
    return []
  }
})

const { ok, rejected } = selectPackages(items)
for (const r of rejected) console.warn(`✗ ${r.file}: ${r.errors.join("; ")}`)
const packages = ok.map((x) => x.pkg)
console.log(`${files.length} archivos · ${packages.length} paquetes válidos · ${rejected.length} rechazados\n`)
console.log(report(packages))

const templates = buildTemplates(packages)
if (!templates.templates.length) {
  console.error("\n✗ No hay tomas de números utilizables: no se modifica el archivo de plantillas.")
  process.exit(1)
}
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(templates))
console.log(`\n✓ ${templates.templates.length} plantillas de ${templates.signers} señantes → ${path.relative(process.cwd(), out)}`)
