// Lectura de paquetes de captura desde una carpeta privada (fuera del repositorio).
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { selectPackages } from "../src/capture/dataset.ts"
import type { CapturePackage } from "../src/capture/format.ts"

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

/** Mismo repositorio git (también si es otro worktree): se compara el directorio .git común. */
const gitDir = (cwd: string) => {
  try { return path.resolve(cwd, execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim()) } catch { return null }
}

/** Corta el programa si la carpeta está dentro de este repositorio, que es público. */
export function assertPrivate(dir: string) {
  const abs = path.resolve(dir)
  fs.mkdirSync(abs, { recursive: true })
  const ours = gitDir(root)
  if (ours && gitDir(abs) === ours) {
    console.error(`✗ ${abs} está dentro de este repositorio, que es público. Guarde los paquetes en una carpeta privada fuera de él.`)
    process.exit(1)
  }
  return abs
}

/** Lee los .json y .json.gz de la carpeta, valida y deduplica (queda la versión más reciente de cada paquete). */
export function loadPackages(dir: string, quiet = false): CapturePackage[] {
  const abs = assertPrivate(dir)
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
  if (!quiet) console.log(`${files.length} archivos · ${ok.length} paquetes válidos · ${rejected.length} rechazados\n`)
  return ok.map((x) => x.pkg)
}

/** Paquetes de varias carpetas (p. ej. las grabaciones propias y un dataset público importado). */
export function loadFolders(dirs: string[]): CapturePackage[] {
  return dirs.flatMap((d) => { console.log(`· ${d}`); return loadPackages(d) })
}

/** Valor de una opción `--nombre valor` de la línea de comandos. */
export function option(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? Number(process.argv[i + 1]) : fallback
}

/** Argumentos sin las opciones `--nombre valor`. */
export function positional(): string[] {
  const args = process.argv.slice(2)
  return args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"))
}
