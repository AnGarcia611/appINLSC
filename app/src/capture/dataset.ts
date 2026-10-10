// Procesa paquetes de captura: plantillas para los reconocedores (números y señas con movimiento) y un informe del dataset.
// Funciones puras (sin archivos): las usan scripts/dataset.ts, scripts/evaluar.ts y las pruebas.
import { dtw } from "../vision/dtw.ts"
import { dominantHand, fingerExtension, isRaised, shapeVector } from "../vision/features.ts"
import type { Template, TemplateFile } from "../vision/knn.ts"
import { motionSequence, SEQ_HZ } from "../vision/motion.ts"
import { Segmenter } from "../vision/segmenter.ts"
import type { SeqPrototype, SeqTemplateFile } from "../vision/signs.ts"
import { decodeFrame, validatePackage, type CapturePackage, type Take } from "./format.ts"
import { hashSeed, rng, type Rng } from "./synth.ts"

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

/** Máximo de plantillas por base: con datos simulados hay miles de candidatas y el k vecinos corre en cada fotograma. */
const MAX_PER_BASE = 400

/**
 * Plantillas de forma (base 1–5) a partir de las tomas de números de quienes autorizaron el entrenamiento
 * (reales y simuladas). De cada toma se toman los fotogramas con los dedos de la base más extendidos
 * (la fase "arriba" de 6–9) y se guardan hasta 3, repartidos en el tiempo. Si hay más de MAX_PER_BASE por base,
 * se elige una muestra al azar (con semilla). Solo van ángulos de la mano: sin código de señante ni cuerpo.
 */
export function buildTemplates(packages: Iterable<CapturePackage>, now = new Date(), seed = 1): TemplateFile {
  const pool = new ShapePool(seed)
  for (const pkg of packages) pool.addPackage(pkg)
  return pool.build(now)
}

/** Junta formas de mano por base con muestreo de reservorio (memoria acotada aunque haya miles de tomas simuladas). */
export class ShapePool {
  private readonly byBase = new Map<number, { seen: number; list: Template[] }>()
  private readonly signers = new Set<string>()
  private readonly r: Rng
  constructor(seed = 1) { this.r = rng(seed) }

  addPackage(pkg: CapturePackage, filter?: (t: Take) => boolean) {
    if (!pkg.consent.training) return
    for (const take of pkg.takes) {
      if (filter && !filter(take)) continue
      const n = Number(take.label)
      if (!Number.isInteger(n) || n < 1 || n > 9) continue
      const base = n > 5 ? n - 5 : n
      for (const v of numberShapes(take, base)) {
        const bucket = this.byBase.get(base) ?? { seen: 0, list: [] }
        this.byBase.set(base, bucket)
        bucket.seen++
        const t = { label: base, v: v.map((x) => Math.round(x * 1000) / 1000) }
        if (bucket.list.length < MAX_PER_BASE) bucket.list.push(t)
        else { const j = Math.floor(this.r() * bucket.seen); if (j < MAX_PER_BASE) bucket.list[j] = t }
      }
      if (!pkg.synthetic) this.signers.add(pkg.signer.code)
    }
  }

  build(now = new Date()): TemplateFile {
    const templates = [...this.byBase.keys()].sort().flatMap((b) => this.byBase.get(b)!.list)
    return { version: 1, created: now.toISOString(), signers: this.signers.size, templates }
  }
}

function numberShapes(take: Take, base: number): number[][] {
  const fingers = BASE_FINGERS[base]
  const frames = take.frames.map(decodeFrame).flatMap((f) => {
    const hand = dominantHand(f)
    if (!hand || !isRaised(hand, f.pose)) return []
    const ext = fingerExtension(hand.points)
    return [{ up: fingers.reduce((a, i) => a + ext[i], 0) / fingers.length, v: shapeVector(hand.points) }]
  })
  if (frames.length < 3) return []
  const cut = [...frames].map((f) => f.up).sort((a, b) => b - a)[Math.floor(frames.length / 2)]
  const high = frames.filter((f) => f.up >= cut)
  const n = Math.min(TEMPLATES_PER_TAKE, high.length)
  return Array.from({ length: n }, (_, k) => high[Math.floor(((k + 0.5) * high.length) / n)].v)
}

// ── Señas con movimiento ──

/** Etiqueta de cada tarea para el reconocedor de señas con movimiento. Los números cuentan como "otra". */
export function signLabel(task: string): string | null {
  if (task.startsWith("tramite-")) return task.slice("tramite-".length)
  if (task === "si-mano") return "sí"
  if (task === "no-indice") return "no"
  if (task === "nada" || task === "otra") return task
  if (task.startsWith("num-")) return "otra"
  return null // sí / no con la cabeza: los reconoce head.ts
}

export const SIGN_WINDOW_MS = 2500
/** Comparaciones en vivo: desde 1.5 s de seña, cada 0.5 s (ver SignRecognizer). */
const FIRST_MS = 1500
const STRIDE_MS = 500

/**
 * Ventanas de una toma tal como las verá el reconocedor en vivo: para cada momento t desde 1.5 s de seña,
 * las últimas min(t + 0.2 s, 2.5 s) de la secuencia. Solo dentro de tramos con la mano levantada.
 */
export function signWindows(take: Take, aspect: number): number[][][] {
  const frames = take.frames.map(decodeFrame)
  const seq = motionSequence(frames, aspect)
  const seg = new Segmenter({ restMs: 500, minMs: 600 })
  const spans: [number, number][] = []
  let start = -1
  for (const f of frames) {
    const { event } = seg.push(f)
    if (event?.type === "start") start = event.t
    if (event?.type === "end") { spans.push([start, event.t - 500]); start = -1 }
  }
  if (seg.active && start >= 0) spans.push([start, frames[frames.length - 1].t])
  const out: number[][][] = []
  for (const [a, b] of spans) {
    for (let t = a + FIRST_MS; t <= b + 1; t += STRIDE_MS) {
      const len = Math.min(t - a + 200, SIGN_WINDOW_MS)
      const n = Math.max(2, Math.round((len / 1000) * SEQ_HZ))
      const end = seq.findIndex((x) => x.t > t)
      const stop = end < 0 ? seq.length : end
      const w = seq.slice(Math.max(0, stop - n), stop).map((x) => x.v)
      if (w.length >= 2) out.push(w)
    }
  }
  return out
}

/** Prototipos por etiqueta: hay 3 trámites, sí, no y 2 clases de rechazo. */
const PROTOTYPES: Record<string, number> = { asignar: 36, cancelar: 36, facturar: 36, "sí": 24, no: 24, nada: 24, otra: 40 }
const MAX_CANDIDATES = 420

/** Junta ventanas por etiqueta con muestreo de reservorio (memoria acotada aunque haya miles de tomas). */
export class WindowPool {
  readonly byLabel = new Map<string, { seen: number; list: number[][][] }>()
  readonly signers = new Set<string>()
  private readonly r: Rng
  private readonly cap: number
  constructor(seed = 1, cap = MAX_CANDIDATES) { this.r = rng(seed); this.cap = cap }

  addPackage(pkg: CapturePackage, filter?: (t: Take) => boolean) {
    if (!pkg.consent.training) return
    const aspect = pkg.camera ? pkg.camera.width / pkg.camera.height : 16 / 9
    for (const take of pkg.takes) {
      if (filter && !filter(take)) continue
      const label = signLabel(take.task)
      if (!label) continue
      // Los números son muchos y solo sirven de rechazo: se toma 1 de cada 3.
      if (take.task.startsWith("num-") && hashSeed(take.id) % 3) continue
      for (const w of signWindows(take, aspect)) this.add(label, w)
      if (!pkg.synthetic) this.signers.add(pkg.signer.code)
    }
  }

  add(label: string, w: number[][]) {
    const b = this.byLabel.get(label) ?? { seen: 0, list: [] }
    this.byLabel.set(label, b)
    b.seen++
    if (b.list.length < this.cap) b.list.push(w)
    else { const j = Math.floor(this.r() * b.seen); if (j < this.cap) b.list[j] = w }
  }
}

/**
 * k-medoides con DTW: los prototipos son ventanas representativas (simuladas en su mayoría), no promedios borrosos.
 * Devuelve los índices de los medoides.
 */
export function kMedoids(items: number[][][], k: number, r: Rng, iterations = 8): number[] {
  const n = items.length
  if (n <= k) return items.map((_, i) => i)
  const D = Array.from({ length: n }, () => new Float32Array(n))
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = dtw(items[i], items[j]); D[i][j] = d; D[j][i] = d }
  // Inicio tipo k-means++: cada medoide nuevo lejos de los anteriores.
  const med = [Math.floor(r() * n)]
  while (med.length < k) {
    const near = Array.from({ length: n }, (_, i) => Math.min(...med.map((m) => D[i][m])) ** 2)
    const total = near.reduce((a, b) => a + b, 0)
    let x = r() * total, pick = 0
    for (; pick < n - 1 && x > near[pick]; pick++) x -= near[pick]
    if (!med.includes(pick)) med.push(pick)
    else med.push(near.indexOf(Math.max(...near)))
  }
  for (let it = 0; it < iterations; it++) {
    const groups = med.map(() => [] as number[])
    for (let i = 0; i < n; i++) {
      let g = 0
      for (let m = 1; m < med.length; m++) if (D[i][med[m]] < D[i][med[g]]) g = m
      groups[g].push(i)
    }
    let changed = false
    groups.forEach((g, gi) => {
      if (!g.length) return
      let bestI = med[gi], bestCost = Infinity
      for (const c of g) { let cost = 0; for (const o of g) cost += D[c][o]; if (cost < bestCost) { bestCost = cost; bestI = c } }
      if (bestI !== med[gi]) { med[gi] = bestI; changed = true }
    })
    if (!changed) break
  }
  return med
}

const quantile = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))] ?? 0 }

/**
 * Prototipos y umbrales del reconocedor de señas con movimiento.
 * `calibration`: ventanas que no se usaron para elegir prototipos (otras personas simuladas); con ellas se mide
 * qué distancia tiene una seña conocida a su prototipo más cercano (near = percentil 75, far = el mayor entre percentil 99 × 1.5 y near × 3).
 */
/**
 * Problemas que impiden usar un archivo de prototipos (vacío = utilizable): faltan trámites o los umbrales
 * no tienen sentido (sin tomas de calibración quedan en 0 y el reconocedor nunca emitiría).
 */
export function signTemplateProblems(file: SeqTemplateFile, required: string[]): string[] {
  const problems: string[] = []
  const missing = required.filter((l) => !file.prototypes.some((p) => p.label === l))
  if (missing.length) problems.push(`sin tomas utilizables de: ${missing.join(", ")}`)
  if (!(file.near > 0 && Number.isFinite(file.far) && file.far > file.near)) problems.push(`umbrales inválidos (near ${file.near}, far ${file.far})`)
  return problems
}

export function buildSignTemplates(pool: WindowPool, calibration: WindowPool, now = new Date(), seed = 1): SeqTemplateFile {
  const r = rng(seed)
  const prototypes: SeqPrototype[] = []
  for (const [label, { list }] of [...pool.byLabel].sort((a, b) => a[0].localeCompare(b[0]))) {
    const k = PROTOTYPES[label] ?? 24
    for (const i of kMedoids(list, k, r)) prototypes.push({ label, s: list[i].map((v) => v.map((x) => Math.round(x * 100) / 100)) })
  }
  const own: number[] = []
  for (const [label, { list }] of calibration.byLabel) {
    if (label === "nada" || label === "otra") continue
    const mine = prototypes.filter((p) => p.label === label)
    if (!mine.length) continue
    for (const w of list.slice(0, 120)) { const d = Math.min(...mine.map((p) => dtw(w, p.s))); if (Number.isFinite(d)) own.push(d) }
  }
  // Las tomas reales quedan más lejos de los prototipos que las simuladas de calibración: márgenes amplios.
  const near = Math.round(quantile(own, 0.75) * 1000) / 1000
  const far = Math.round(Math.max(quantile(own, 0.99) * 1.5, near * 3) * 1000) / 1000
  return { version: 1, created: now.toISOString(), signers: pool.signers.size, hz: SEQ_HZ, windowMs: SIGN_WINDOW_MS, near, far, prototypes }
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
  for (const task of ["número", "trámite", "cabeza"] as const) {
    const ts = trials.filter((t) => t.task === task)
    if (!ts.length) continue
    const ok = ts.filter((t) => t.correct).length
    lines.push(`Pruebas ${task}: ${ok}/${ts.length} aciertos (${Math.round((ok / ts.length) * 100)} %)`)
    const errors = count(ts.filter((t) => !t.correct).map((t) => `${t.expected}→${t.predicted ?? "nada"}`))
    if (errors.size) lines.push(`  Errores (hizo→entendió): ${fmt(errors)}`)
  }
  return lines.join("\n")
}
