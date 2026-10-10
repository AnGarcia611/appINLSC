// Evaluación con tomas reales no vistas: las tomas se reparten en k grupos; para cada grupo se entrena con los demás
// (tomas reales + sus variantes simuladas) y se prueba con las tomas reales del grupo, pasándolas por los
// reconocedores igual que en vivo. Las variantes de una toma nunca quedan en entrenamiento y prueba a la vez.
import { dominantHand, isRaised } from "../vision/features.ts"
import { HeadGestureDetector } from "../vision/head.ts"
import type { TemplateFile } from "../vision/knn.ts"
import { NumberRecognizer } from "../vision/numbers.ts"
import { INTENT_LABELS, SignRecognizer, type SeqTemplateFile } from "../vision/signs.ts"
import type { Frame } from "../vision/types.ts"
import { ShapePool, WindowPool, buildSignTemplates } from "./dataset.ts"
import { decodeFrame, type CapturePackage, type Take } from "./format.ts"
import { foldOf, simulate } from "./synth.ts"

export type Task = "números" | "trámites" | "sí/no mano" | "cabeza"

/** Qué debería responder cada reconocedor a cada tarea de captura (null = nada). */
export function expected(task: Task, take: Pick<Take, "task" | "label">): string | null {
  switch (task) {
    case "números": return take.task.startsWith("num-") ? take.label : null
    case "trámites": return take.task.startsWith("tramite-") ? take.label : null
    case "sí/no mano": return take.task === "si-mano" ? "sí" : take.task === "no-indice" ? "no" : null
    case "cabeza": return take.task === "si-cabeza" ? "sí" : take.task === "no-cabeza" ? "no" : null
  }
}

export interface Outcome { task: Task; take: string; from: string; source: "real" | "simulada"; expected: string | null; got: string | null; confidence: number | null
  /** Milisegundos desde que se levantó la mano hasta el resultado. */
  ms: number | null
}

export interface Models { numbers: TemplateFile; signs: SeqTemplateFile }

const aspectOf = (pkg: CapturePackage) => (pkg.camera ? pkg.camera.width / pkg.camera.height : 16 / 9)

/** Fotogramas de una toma + 0.7 s sin mano al final (la persona baja la mano). */
function replayFrames(take: Take): Frame[] {
  const frames = take.frames.map(decodeFrame)
  const end = frames[frames.length - 1]?.t ?? 0
  return [...frames, ...Array.from({ length: 10 }, (_, i) => ({ t: end + (i + 1) * 70, hands: [], pose: frames[frames.length - 1]?.pose ?? null }))]
}

/** Pasa una toma por los 4 reconocedores, como en vivo. Números: el último resultado (corrige 1→6); los demás: el primero. */
type Result = { got: string | null; confidence: number | null; ms: number | null }

export function runTake(take: Take, models: Models, aspect: number): Record<Task, Result> {
  const num = new NumberRecognizer({ templates: models.numbers.templates })
  const intents = new SignRecognizer({ accept: INTENT_LABELS, templates: models.signs, aspect })
  const yesNo = new SignRecognizer({ accept: ["sí", "no"], templates: models.signs, aspect })
  const head = new HeadGestureDetector()
  const none = (): Result => ({ got: null, confidence: null, ms: null })
  const out: Record<Task, Result> = { "números": none(), "trámites": none(), "sí/no mano": none(), "cabeza": none() }
  let raisedAt: number | null = null
  for (const f of replayFrames(take)) {
    const hand = dominantHand(f)
    if (raisedAt === null && hand && isRaised(hand, f.pose)) raisedAt = f.t
    const ms = raisedAt === null ? null : f.t - raisedAt
    const n = num.push(f)
    if (n) out["números"] = { got: String(n.value), confidence: n.confidence, ms }
    const i = intents.push(f)
    if (i && out["trámites"].got === null) out["trámites"] = { got: i.value, confidence: i.confidence, ms }
    const y = yesNo.push(f)
    if (y && out["sí/no mano"].got === null) out["sí/no mano"] = { got: y.value, confidence: y.confidence, ms }
    const h = head.push(f)
    if (h && out["cabeza"].got === null) out["cabeza"] = { got: h.value, confidence: h.confidence, ms }
  }
  return out
}

export interface EvalOptions {
  folds: number
  /** Personas simuladas por grupo para entrenar. */
  personas: number
  /** Personas simuladas extra para probar (variantes de las tomas de prueba). */
  testPersonas: number
  seed: number
  log?: (line: string) => void
}

/** Entrena los modelos con paquetes reales (filtrados) + sus variantes simuladas. */
export function trainModels(real: CapturePackage[], opts: { personas: number; seed: number; filter?: (t: Take) => boolean }): Models {
  const shapes = new ShapePool(opts.seed)
  const windows = new WindowPool(opts.seed)
  const calibration = new WindowPool(opts.seed + 1, 160)
  for (const pkg of real) { shapes.addPackage(pkg, opts.filter); windows.addPackage(pkg, opts.filter) }
  for (const sim of simulate(real, { personas: opts.personas, seed: opts.seed, filter: opts.filter })) {
    shapes.addPackage(sim)
    windows.addPackage(sim)
  }
  // Calibración con otras personas simuladas (otra semilla): nunca se usan para elegir prototipos.
  for (const sim of simulate(real, { personas: Math.max(2, Math.round(opts.personas / 6)), seed: opts.seed + 1000, filter: opts.filter })) calibration.addPackage(sim)
  return { numbers: shapes.build(), signs: buildSignTemplates(windows, calibration, new Date(), opts.seed) }
}

export function evaluate(packages: CapturePackage[], opts: EvalOptions): Outcome[] {
  const real = packages.filter((p) => !p.synthetic)
  const outcomes: Outcome[] = []
  const tasks: Task[] = ["números", "trámites", "sí/no mano", "cabeza"]
  for (let f = 0; f < opts.folds; f++) {
    const t0 = Date.now()
    const train = (t: Take) => foldOf(t, opts.folds) !== f
    const models = trainModels(real, { personas: opts.personas, seed: opts.seed + f, filter: train })
    const record = (take: Take, source: Outcome["source"], aspect: number) => {
      const res = runTake(take, models, aspect)
      for (const task of tasks) outcomes.push({ task, take: take.id, from: take.task, source, expected: expected(task, take), got: res[task].got, confidence: res[task].confidence, ms: res[task].ms })
    }
    let n = 0
    for (const pkg of real.filter((p) => p.consent.evaluation)) {
      for (const take of pkg.takes.filter((t) => !train(t))) { record(take, "real", aspectOf(pkg)); n++ }
    }
    for (const sim of simulate(real, { personas: opts.testPersonas, seed: opts.seed + 5000 + f, filter: (t) => !train(t), purpose: "evaluation" })) {
      for (const take of sim.takes) record(take, "simulada", aspectOf(sim))
    }
    opts.log?.(`grupo ${f + 1}/${opts.folds}: ${n} tomas reales de prueba · ${models.numbers.templates.length} formas · ${models.signs.prototypes.length} prototipos · near ${models.signs.near} far ${models.signs.far} · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  }
  return outcomes
}

// ── Informe ──

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—")

export interface Summary { task: Task; source: Outcome["source"]; hits: number; total: number; falseTriggers: number; negatives: number; lowConfidence: number }

export function summarize(outcomes: Outcome[]): Summary[] {
  const out: Summary[] = []
  for (const task of ["números", "trámites", "sí/no mano", "cabeza"] as Task[]) {
    for (const source of ["real", "simulada"] as const) {
      const xs = outcomes.filter((o) => o.task === task && o.source === source)
      const pos = xs.filter((o) => o.expected !== null)
      const neg = xs.filter((o) => o.expected === null)
      out.push({
        task, source,
        hits: pos.filter((o) => o.got === o.expected).length, total: pos.length,
        lowConfidence: pos.filter((o) => o.got === o.expected && (o.confidence ?? 0) < 70).length,
        falseTriggers: neg.filter((o) => o.got !== null).length, negatives: neg.length,
      })
    }
  }
  return out
}

/** Informe en texto: aciertos, falsos disparos y matriz de confusión (filas = lo que se hizo, columnas = lo que entendió). */
export function evaluationReport(outcomes: Outcome[]): string {
  const lines: string[] = []
  lines.push("Aciertos con las señas de cada reconocedor y falsos disparos con las demás tomas")
  lines.push("(real = tomas reales no vistas al entrenar · simulada = variantes de esas mismas tomas)\n")
  lines.push(`${"reconocedor".padEnd(12)} ${"fuente".padEnd(9)} ${"aciertos".padStart(16)} ${"con conf. < 70".padStart(15)} ${"falsos disparos".padStart(20)}`)
  for (const s of summarize(outcomes)) {
    if (!s.total && !s.negatives) continue
    lines.push(`${s.task.padEnd(12)} ${s.source.padEnd(9)} ${`${s.hits}/${s.total} (${pct(s.hits, s.total)})`.padStart(16)} ${String(s.lowConfidence).padStart(15)} ${`${s.falseTriggers}/${s.negatives} (${pct(s.falseTriggers, s.negatives)})`.padStart(20)}`)
  }
  const lat = outcomes.filter((o) => o.task === "trámites" && o.source === "real" && o.got !== null && o.got === o.expected && o.ms !== null).map((o) => o.ms!).sort((a, b) => a - b)
  if (lat.length) lines.push(`\nTrámites: resultado a los ${(lat[Math.floor(lat.length / 2)] / 1000).toFixed(1)} s de levantar la mano (mediana; el más lento ${(lat[lat.length - 1] / 1000).toFixed(1)} s)`)
  for (const task of ["números", "trámites", "sí/no mano", "cabeza"] as Task[]) {
    const xs = outcomes.filter((o) => o.task === task && o.source === "real" && o.expected !== null)
    if (!xs.length) continue
    lines.push(`\nMatriz de confusión · ${task} · tomas reales`)
    const rows = [...new Set(xs.map((o) => o.expected!))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }))
    const cols = [...new Set([...rows, ...xs.map((o) => o.got ?? "—")])].sort((a, b) => a.localeCompare(b, "es", { numeric: true }))
    lines.push(`${"".padEnd(10)}${cols.map((c) => c.padStart(9)).join("")}`)
    for (const r of rows) lines.push(`${r.padEnd(10)}${cols.map((c) => String(xs.filter((o) => o.expected === r && (o.got ?? "—") === c).length || "·").padStart(9)).join("")}`)
    const neg = outcomes.filter((o) => o.task === task && o.source === "real" && o.expected === null && o.got !== null)
    if (neg.length) {
      const by = new Map<string, number>()
      for (const o of neg) { const k = `${o.from}→${o.got}`; by.set(k, (by.get(k) ?? 0) + 1) }
      lines.push(`  Falsos disparos (seña hecha→entendió): ${[...by].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(" · ")}`)
    }
  }
  return lines.join("\n")
}
