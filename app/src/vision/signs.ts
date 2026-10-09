// Reconocimiento de señas con movimiento: trámites (asignar, cancelar, facturar) y sí / no con la mano.
// Compara la ventana reciente de la seña con prototipos (DTW + k vecinos). Los prototipos y los umbrales salen de
// `npm run dataset` (tomas reales + datos simulados). Hay clases de rechazo ("nada", "otra"): si la seña se parece
// más a una de ellas, o no se parece a nada conocido, no se emite resultado.
import { dtw } from "./dtw.ts"
import { MotionTrack } from "./motion.ts"
import { Segmenter } from "./segmenter.ts"
import type { Frame } from "./types.ts"

export interface SeqPrototype { label: string; s: number[][] }

/** Archivo `public/vision/signs.templates.json`, generado por `npm run dataset`. */
export interface SeqTemplateFile {
  version: 1
  created: string
  signers: number
  hz: number
  /** Largo de la ventana que se compara. */
  windowMs: number
  /** Distancia típica a la clase correcta (confianza plena) y distancia a partir de la cual "no se parece a nada". */
  near: number
  far: number
  prototypes: SeqPrototype[]
}

export interface SeqGuess { value: string; confidence: number }
export interface SeqResult extends SeqGuess { alternatives: SeqGuess[] }

/** Etiquetas que nunca se emiten: existen para que el reconocedor sepa decir "esto no es una seña de la lista". */
export const REJECT_LABELS = ["nada", "otra"]
export const INTENT_LABELS = ["asignar", "cancelar", "facturar"]

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/** Puntaje 0..1 por etiqueta para una ventana: votos de los k prototipos más cercanos × parecido del más cercano. */
export function classifyWindow(seq: number[][], file: SeqTemplateFile, k = 7): { scores: Map<string, number>; nearest: number } {
  const all = file.prototypes.map((p) => ({ label: p.label, d: dtw(seq, p.s) })).sort((a, b) => a.d - b.d)
  const top = all.slice(0, k)
  const scores = new Map<string, number>()
  if (!top.length || !Number.isFinite(top[0].d)) return { scores, nearest: Infinity }
  let total = 0
  for (const n of top) { const w = 1 / (n.d + 0.05); total += w; scores.set(n.label, (scores.get(n.label) ?? 0) + w) }
  const nearest = top[0].d
  const fit = nearest <= file.near ? 1 : clamp01(1 - (nearest - file.near) / (file.far - file.near))
  for (const [label, w] of scores) scores.set(label, (w / total) * fit)
  return { scores, nearest }
}

export interface SignRecognizerOptions {
  /** Etiquetas que se pueden emitir en este paso (p. ej. los 3 trámites). Las demás cuentan como rechazo. */
  accept: string[]
  templates: SeqTemplateFile
  /** Ancho / alto de la imagen de la cámara. */
  aspect?: number
  /** Tiempo mínimo de seña antes de empezar a comparar. */
  minMs?: number
  /** Si la mano sigue levantada, se decide con lo visto hasta aquí. La captura cortaba a los 6 s. */
  decideMs?: number
  /** Cada cuánto se compara. */
  everyMs?: number
}

export type SignPhase = "reposo" | "señando" | "reconocido"

/**
 * Reconocedor en línea: se le pasan fotogramas y devuelve un resultado por seña.
 *   - Mientras la mano está levantada compara la ventana reciente cada `everyMs`.
 *   - Emite cuando 3 comparaciones seguidas coinciden con confianza ≥ 60 %,
 *     o con el promedio de lo visto al llegar a `decideMs` o al bajar la mano.
 *   - No emite si lo más parecido es una clase de rechazo o si nada se parece lo suficiente.
 */
export class SignRecognizer {
  phase: SignPhase = "reposo"
  /** Última comparación (para la vista de diagnóstico). */
  live: { label: string; confidence: number } | null = null
  private readonly opts: Required<Omit<SignRecognizerOptions, "aspect">>
  private readonly track: MotionTrack
  private readonly segmenter = new Segmenter({ restMs: 500, minMs: 600 })
  private startedAt = 0
  private lastEval = -Infinity
  private history: Map<string, number>[] = []
  private emitted = false

  constructor(opts: SignRecognizerOptions) {
    this.opts = { minMs: 1500, decideMs: 4500, everyMs: 250, ...opts }
    this.track = new MotionTrack(opts.aspect ?? 16 / 9)
  }

  reset() { this.track.reset(); this.segmenter.reset(); this.history = []; this.emitted = false; this.phase = "reposo"; this.live = null }

  push(frame: Frame): SeqResult | null {
    this.track.push(frame)
    const { event } = this.segmenter.push(frame)
    if (event?.type === "start") { this.startedAt = event.t; this.history = []; this.emitted = false; this.lastEval = -Infinity; this.phase = "señando" }
    if (event?.type === "end") {
      const done = this.emitted
      const elapsed = event.durationMs
      let result: SeqResult | null = null
      if (!done && elapsed >= this.opts.minMs * 0.8) { this.evaluate(elapsed); result = this.decide() }
      this.history = []; this.emitted = false; this.phase = "reposo"; this.live = null
      return result
    }
    if (!this.segmenter.active || this.emitted) return null

    const elapsed = frame.t - this.startedAt
    if (elapsed < this.opts.minMs || frame.t - this.lastEval < this.opts.everyMs) return null
    this.lastEval = frame.t
    this.evaluate(elapsed)

    const last3 = this.history.slice(-3).map(best)
    const agree = last3.length === 3 && last3.every((b) => b.label === last3[0].label && b.score >= 0.6) && this.opts.accept.includes(last3[0].label)
    if (agree) return this.emit({ value: last3[0].label, confidence: Math.round((last3.reduce((a, b) => a + b.score, 0) / 3) * 100), alternatives: this.alternatives(last3[0].label) })
    if (elapsed >= this.opts.decideMs) {
      const r = this.decide()
      this.emitted = true // con o sin resultado: se espera a que baje la mano
      return r ? this.emit(r) : null
    }
    return null
  }

  private evaluate(elapsed: number) {
    const ms = Math.min(elapsed + 200, this.opts.templates.windowMs)
    const { scores } = classifyWindow(this.track.window(ms), this.opts.templates)
    this.history.push(scores)
    if (this.history.length > 8) this.history.shift()
    const b = best(scores)
    this.live = b.label ? { label: b.label, confidence: Math.round(b.score * 100) } : null
  }

  /** Promedio de las últimas comparaciones. Confianza baja (< 70 %) = el funcionario debe validar. */
  private decide(): SeqResult | null {
    const avg = averaged(this.history.slice(-6))
    const b = best(avg)
    if (!b.label || !this.opts.accept.includes(b.label) || b.score < 0.25) return null
    return { value: b.label, confidence: Math.round(b.score * 100), alternatives: this.alternatives(b.label, avg) }
  }

  private alternatives(winner: string, scores = averaged(this.history.slice(-6))): SeqGuess[] {
    return this.opts.accept.filter((l) => l !== winner).map((l) => ({ value: l, confidence: Math.round((scores.get(l) ?? 0) * 100) }))
      .filter((g) => g.confidence > 0).sort((a, b) => b.confidence - a.confidence)
  }

  private emit(r: SeqResult): SeqResult {
    this.emitted = true
    this.phase = "reconocido"
    return r
  }
}

function best(scores: Map<string, number>): { label: string; score: number } {
  let label = "", score = 0
  for (const [l, s] of scores) if (s > score) { label = l; score = s }
  return { label, score }
}

function averaged(list: Map<string, number>[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of list) for (const [l, s] of m) out.set(l, (out.get(l) ?? 0) + s / list.length)
  return out
}
