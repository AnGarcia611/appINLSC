// Procesa paquetes de captura: plantillas de forma para el reconocedor de números y un informe del dataset.
// Funciones puras (sin archivos): las usa scripts/dataset.ts y las pruebas.
import { dominantHand, fingerExtension, isRaised, shapeVector } from "../vision/features.ts"
import type { Template, TemplateFile } from "../vision/knn.ts"
import { decodeFrame, validatePackage, type CapturePackage } from "./format.ts"

/** Dedos extendidos de cada base (1–5); 6–9 usan la base del número menos 5. */
const BASE_FINGERS: Record<number, number[]> = { 1: [1], 2: [1, 2], 3: [1, 2, 3], 4: [1, 2, 3, 4], 5: [0, 1, 2, 3, 4] }
const TEMPLATES_PER_TAKE = 3

export interface Loaded { file: string; pkg: CapturePackage }
export interface Rejected { file: string; errors: string[] }

/** Valida y deduplica: si el mismo paquete llegó varias veces (reenvíos), se queda la versión más reciente. */
export function selectPackages(items: { file: string; data: unknown }[]): { ok: Loaded[]; rejected: Rejected[] } {
  const rejected: Rejected[] = []
  const byId = new Map<string, Loaded>()
  for (const { file, data } of items) {
    const errors = validatePackage(data)
    if (errors.length) { rejected.push({ file, errors }); continue }
    const pkg = data as CapturePackage
    const prev = byId.get(pkg.id)
    if (!prev || prev.pkg.updatedAt < pkg.updatedAt) byId.set(pkg.id, { file, pkg })
  }
  return { ok: [...byId.values()], rejected }
}

/**
 * Plantillas de forma (base 1–5) a partir de las tomas de números de quienes autorizaron el entrenamiento.
 * De cada toma se toman los fotogramas con los dedos de la base más extendidos (la fase "arriba" de 6–9)
 * y se guardan hasta 3, repartidos en el tiempo. Solo van ángulos de la mano: sin código de señante ni cuerpo.
 */
export function buildTemplates(packages: CapturePackage[], now = new Date()): TemplateFile {
  const templates: Template[] = []
  const signers = new Set<string>()
  for (const pkg of packages) {
    if (!pkg.consent.training) continue
    for (const take of pkg.takes) {
      const n = Number(take.label)
      if (!Number.isInteger(n) || n < 1 || n > 9) continue
      const base = n > 5 ? n - 5 : n
      const fingers = BASE_FINGERS[base]
      const frames = take.frames.map(decodeFrame).flatMap((f) => {
        const hand = dominantHand(f)
        if (!hand || !isRaised(hand, f.pose)) return []
        const ext = fingerExtension(hand.points)
        return [{ up: fingers.reduce((a, i) => a + ext[i], 0) / fingers.length, v: shapeVector(hand.points) }]
      })
      if (frames.length < 3) continue
      const cut = [...frames].map((f) => f.up).sort((a, b) => b - a)[Math.floor(frames.length / 2)]
      const high = frames.filter((f) => f.up >= cut)
      for (let k = 0; k < Math.min(TEMPLATES_PER_TAKE, high.length); k++) {
        const f = high[Math.floor(((k + 0.5) * high.length) / Math.min(TEMPLATES_PER_TAKE, high.length))]
        templates.push({ label: base, v: f.v.map((x) => Math.round(x * 1000) / 1000) })
      }
      signers.add(pkg.signer.code)
    }
  }
  return { version: 1, created: now.toISOString(), signers: signers.size, templates }
}

/** Informe en texto: tomas por seña y por señante, perfiles, validaciones de vocabulario y aciertos de las pruebas. */
export function report(packages: CapturePackage[]): string {
  const lines: string[] = []
  const count = <K extends string>(xs: K[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<K, number>())
  const fmt = (m: Map<string, number>) => [...m].sort((a, b) => a[0].localeCompare(b[0], "es", { numeric: true })).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"

  const takes = packages.flatMap((p) => p.takes.map((t) => ({ ...t, signer: p.signer.code })))
  lines.push(`Paquetes: ${packages.length} · Señantes: ${new Set(packages.map((p) => p.signer.code)).size} · Tomas: ${takes.length}`)
  lines.push(`Autorizan entrenar: ${packages.filter((p) => p.consent.training).length} · Autorizan evaluar: ${packages.filter((p) => p.consent.evaluation).length}`)
  lines.push(`Borradores de consentimiento sin revisar: ${packages.filter((p) => p.consent.version.startsWith("borrador")).length}`)
  lines.push("")
  lines.push("Tomas por etiqueta (señantes distintos):")
  const byLabel = new Map<string, Set<string>>()
  for (const t of takes) byLabel.set(t.label, (byLabel.get(t.label) ?? new Set()).add(t.signer))
  const labelCounts = count(takes.map((t) => t.label))
  for (const [label, n] of [...labelCounts].sort((a, b) => a[0].localeCompare(b[0], "es", { numeric: true }))) {
    lines.push(`  ${label.padEnd(10)} ${String(n).padStart(4)} tomas · ${byLabel.get(label)!.size} señantes`)
  }
  lines.push(`Tomas por señante: ${fmt(count(takes.map((t) => t.signer)))}`)
  lines.push(`Tomas con poca mano visible (< 50 %): ${takes.filter((t) => t.handRatio < 0.5).length}`)
  lines.push("")
  lines.push(`Audición: ${fmt(count(packages.map((p) => p.signer.profile.audicion ?? "sin dato")))}`)
  lines.push(`Mano: ${fmt(count(packages.map((p) => p.signer.profile.mano ?? "sin dato")))}`)
  lines.push(`Región: ${fmt(count(packages.map((p) => p.signer.profile.region?.trim() || "sin dato")))}`)
  lines.push("")
  const different = packages.flatMap((p) => p.validations.filter((v) => !v.matches).map((v) => ({ ...v, signer: p.signer.code })))
  lines.push(`Validación de vocabulario: ${packages.reduce((a, p) => a + p.validations.length, 0)} respuestas, ${different.length} "la hago distinto"`)
  for (const d of different) lines.push(`  ${d.task} (${d.signer})${d.comment ? `: ${d.comment}` : ""}`)
  lines.push("")
  const trials = packages.flatMap((p) => p.trials)
  for (const task of ["número", "cabeza"] as const) {
    const ts = trials.filter((t) => t.task === task)
    if (!ts.length) continue
    const ok = ts.filter((t) => t.correct).length
    lines.push(`Pruebas ${task}: ${ok}/${ts.length} aciertos (${Math.round((ok / ts.length) * 100)} %)`)
    const errors = count(ts.filter((t) => !t.correct).map((t) => `${t.expected}→${t.predicted ?? "nada"}`))
    if (errors.size) lines.push(`  Errores (hizo→entendió): ${fmt(errors)}`)
  }
  return lines.join("\n")
}
