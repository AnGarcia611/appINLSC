// Reconocimiento de los números 1–9 en LSC (diccionario INSOR/ICC):
//   1–5: forma estática (1 = índice, 2 = índice + medio, 3 = + anular, 4 = cuatro dedos sin pulgar, 5 = mano abierta).
//   6–9: misma forma que 1–4, con los dedos flexionándose y extendiéndose varias veces.
// Etapa 1: forma de la mano → base 1–5 (reglas + k vecinos si hay plantillas).
// Etapa 2: oscilación de la extensión de los dedos extendidos → +5 (solo bases 1–4).
import { fingerExtension, isRaised, shapeVector } from "./features.ts"
import { knnScores, type Template } from "./knn.ts"
import { Segmenter } from "./segmenter.ts"
import type { Frame } from "./types.ts"

export interface Guess { value: number; confidence: number }
/** Resultado emitido: número, confianza en % y alternativas (mejor primero). */
export interface NumberResult extends Guess { alternatives: Guess[]; kind: "estático" | "movimiento" }

/** Extensión esperada de [pulgar, índice, medio, anular, meñique] para cada base. */
const BASES: Record<number, number[]> = {
  1: [0, 1, 0, 0, 0],
  2: [0, 1, 1, 0, 0],
  3: [0, 1, 1, 1, 0],
  4: [0, 1, 1, 1, 1],
  5: [1, 1, 1, 1, 1],
}
/** El pulgar es el dedo menos fiable del detector y el que más varía entre señantes. */
const WEIGHTS = [0.5, 1, 1, 1, 1]
/** Dedos que se flexionan en 6–9 (los extendidos de la base, sin el pulgar). */
const FLEX_FINGERS: Record<number, number[]> = { 1: [1], 2: [1, 2], 3: [1, 2, 3], 4: [1, 2, 3, 4] }

/** Puntaje 0..1 de cada base (índice 0 → base 1) según la extensión de los dedos. */
export function ruleScores(ext: number[]): number[] {
  const wsum = WEIGHTS.reduce((a, b) => a + b, 0)
  return [1, 2, 3, 4, 5].map((b) => 1 - BASES[b].reduce((s, target, i) => s + WEIGHTS[i] * Math.abs(ext[i] - target), 0) / wsum)
}

/**
 * `best` = base 1–5, o 0 si es un puño (no es un número).
 * Para el rechazo: `two` = otra mano también levantada, `wag` = ángulo del índice respecto al eje de la mano (rad).
 */
interface Sample { t: number; ext: number[]; scores: number[]; best: number; bestScore: number; margin: number; two: boolean; wag: number }

function sample(t: number, points: Frame["hands"][number]["points"], templates: Template[], two: boolean): Sample {
  const p = points
  let wag = Math.atan2(p[8].y - p[5].y, p[8].x - p[5].x) - Math.atan2(p[9].y - p[0].y, p[9].x - p[0].x)
  wag = Math.atan2(Math.sin(wag), Math.cos(wag))
  const extra = { two, wag }
  const ext = fingerExtension(points)
  let scores = ruleScores(ext)
  if (templates.length) {
    const knn = knnScores(shapeVector(points), templates)
    scores = scores.map((s, i) => 0.5 * s + 0.5 * (knn.get(i + 1) ?? 0))
  }
  const order = scores.map((s, i) => ({ s, b: i + 1 })).sort((a, b) => b.s - a.s)
  // Puño (todos los dedos doblados): clase de rechazo. Sin ella, un puño parece un 1 con un dedo de diferencia.
  const fist = 1 - ext.reduce((a, e, i) => a + WEIGHTS[i] * e, 0) / WEIGHTS.reduce((a, b) => a + b, 0)
  if (fist >= order[0].s) return { t, ext, scores, best: 0, bestScore: fist, margin: fist - order[0].s, ...extra }
  return { t, ext, scores, best: order[0].b, bestScore: order[0].s, margin: order[0].s - order[1].s, ...extra }
}

/**
 * ¿Es otra seña y no un número? Medido con la captura S-9BST:
 *   - dos manos levantadas en más de la mitad de la ventana (los trámites usan las dos; los números, casi nunca);
 *   - el índice va y viene de lado a lado 8 veces o más (NO con el índice: 7–21 por toma; números ≤ 5, salvo un 9 con 7).
 * Y un número estático exige el índice quieto (variación < WAG_STILL): el NO con el índice no pasa por un 1.
 */
export function looksLikeOtherSign(samples: Sample[]): boolean {
  if (samples.length < 4) return false
  if (samples.filter((s) => s.two).length / samples.length > 0.5) return true
  return wagSwings(samples) >= 8
}

/** Vaivenes del índice de lado a lado (cambios de sentido con histéresis de 0.12 rad). */
export function wagSwings(samples: Sample[]): number {
  const mean = samples.reduce((a, s) => a + s.wag, 0) / samples.length
  let state = 0, swings = 0
  for (const s of samples) {
    const d = s.wag - mean
    if (d > 0.12 && state !== 1) { if (state) swings++; state = 1 }
    else if (d < -0.12 && state !== -1) { if (state) swings++; state = -1 }
  }
  return swings
}

const SHAPE_MIN = 0.8 // forma clara: tolera dedos a medio camino, no un dedo del todo distinto
const HIGH = 0.68 // extensión "dedos arriba"
const LOW = 0.42 // extensión "dedos doblados"
const WAG_STILL = 0.2 // rad: variación máxima del ángulo del índice en una forma "quieta" (números quietos: ≈ 0.02)

/** Base más frecuente entre los fotogramas con forma clara (las fases dobladas de 6–9 no cuentan). */
export function dominantBase(samples: Sample[]): { base: number; share: number; meanScore: number } | null {
  const clear = samples.filter((s) => s.best > 0 && s.bestScore >= SHAPE_MIN)
  if (!clear.length) return null
  const counts = new Map<number, number>()
  for (const s of clear) counts.set(s.best, (counts.get(s.best) ?? 0) + 1)
  const [base, n] = [...counts].sort((a, b) => b[1] - a[1])[0]
  const own = clear.filter((s) => s.best === base)
  return { base, share: n / clear.length, meanScore: own.reduce((a, s) => a + s.bestScore, 0) / own.length }
}

/**
 * Ciclos completos de flexión (arriba → abajo → arriba) de los dedos de la base.
 * Una mano que entra cerrada y se abre (o se cierra al bajar) no cuenta: hace falta volver arriba.
 */
export function flexCycles(samples: Sample[], base: number): number {
  const fingers = FLEX_FINGERS[base]
  if (!fingers) return 0
  let phase: "inicio" | "arriba" | "abajo" = "inicio"
  let cycles = 0
  for (const s of samples) {
    const e = fingers.reduce((a, f) => a + s.ext[f], 0) / fingers.length
    if (phase === "inicio" && e > HIGH) phase = "arriba"
    else if (phase === "arriba" && e < LOW) phase = "abajo"
    else if (phase === "abajo" && e > HIGH) { cycles++; phase = "arriba" }
  }
  return cycles
}

const pct = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 100)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

export interface RecognizerOptions {
  /** Solo se emiten números entre 1 y `max` (las opciones de la infografía). */
  max?: number
  /** Tiempo con la misma forma quieta para aceptar un número estático. */
  holdMs?: number
  templates?: Template[]
}

export type RecognizerPhase = "reposo" | "señando" | "reconocido"

/**
 * Reconocedor en línea: se le pasan fotogramas y devuelve un resultado cuando reconoce un número.
 *   - Estático (1–5): la misma forma, clara y quieta, durante `holdMs`.
 *   - Movimiento (6–9): 2 ciclos de flexión, o 1 ciclo al terminar la seña.
 *   - Si tras emitir un estático aparece la flexión de esa misma base, se corrige una vez (p. ej. 1 → 6).
 * Tras emitir, no repite el mismo número hasta que la mano baja o cambia de forma.
 * No emite si la ventana parece otra seña (dos manos o el NO con el índice).
 */
export class NumberRecognizer {
  phase: RecognizerPhase = "reposo"
  /** Último fotograma analizado (para la vista de diagnóstico). */
  live: Sample | null = null
  max: number
  private readonly holdMs: number
  private readonly templates: Template[]
  private readonly segmenter = new Segmenter()
  private buffer: Sample[] = []
  /**
   * Lo último emitido en esta seña: la forma base (1–5) y el tipo, ANTES de limitar a 1..max.
   * Comparar contra el valor final fallaba: tras un 6 (base 1) el 1 quieto se emitía encima, y un número
   * fuera de rango (cambiado por su alternativa) se reemitía en cada fotograma.
   */
  private emitted: { base: number; kind: NumberResult["kind"] } | null = null

  constructor(opts: RecognizerOptions = {}) {
    this.max = opts.max ?? 9
    this.holdMs = opts.holdMs ?? 700
    this.templates = opts.templates ?? []
  }

  reset() { this.segmenter.reset(); this.buffer = []; this.emitted = null; this.phase = "reposo"; this.live = null }

  push(frame: Frame): NumberResult | null {
    const { hand, event } = this.segmenter.push(frame)
    if (event?.type === "end") {
      const result = !this.emitted && event.valid ? this.evaluateEnd() : this.upgradeAtEnd()
      this.buffer = []
      this.emitted = null
      this.phase = "reposo"
      this.live = null
      return result
    }
    if (!hand) { this.live = null; return null }

    const two = frame.hands.filter((h) => isRaised(h, frame.pose)).length >= 2
    const s = sample(frame.t, hand.points, this.templates, two)
    this.live = s
    this.buffer.push(s)
    // Ventana de 3 s: suficiente para 2–3 ciclos de flexión.
    while (this.buffer.length && frame.t - this.buffer[0].t > 3000) this.buffer.shift()
    if (this.phase === "reposo") this.phase = "señando"

    const dom = dominantBase(this.buffer)
    if (!dom || looksLikeOtherSign(this.buffer)) return null
    const cycles = flexCycles(this.buffer, dom.base)

    // Movimiento: 2 ciclos bastan para decidir sin esperar a que baje la mano.
    // (Otro número con movimiento sin bajar la mano: vale si cambió la forma, p. ej. 6 → 7.)
    if (cycles >= 2 && dom.base <= 4 && !(this.emitted?.kind === "movimiento" && this.emitted.base === dom.base)) {
      return this.emit(this.dynamicResult(dom, cycles), dom.base, "movimiento")
    }

    // Estático: misma forma clara y quieta durante holdMs, sin flexión en la ventana.
    const recent = this.buffer.filter((x) => frame.t - x.t <= this.holdMs)
    const spanOk = recent.length >= 4 && frame.t - recent[0].t >= this.holdMs * 0.85
    if (!spanOk || cycles > 0) return null
    const same = recent[0].best > 0 && recent.every((x) => x.best === recent[0].best && x.bestScore >= SHAPE_MIN)
    if (!same) return null
    // Quieta de verdad: el índice no se mueve de lado a lado (eso es el NO con el índice, no un 1).
    const wags = recent.map((x) => x.wag)
    if (Math.max(...wags) - Math.min(...wags) > WAG_STILL) return null
    const base = recent[0].best
    // Misma forma que lo ya emitido (también tras un 6–9 de esa base: la mano quieta al final no es un 1–4).
    if (this.emitted && this.emitted.base === base) return null
    if (this.emitted) this.buffer = recent // cambió de forma sin bajar la mano: empieza otra seña
    return this.emit(this.staticResult(base, recent), base, "estático")
  }

  private emit(r: NumberResult | null, base: number, kind: NumberResult["kind"]): NumberResult | null {
    if (!r) return null
    this.emitted = { base, kind }
    this.phase = "reconocido"
    return r
  }

  /** Al bajar la mano sin haber emitido: decide con lo que haya (1 ciclo de flexión cuenta como movimiento). */
  private evaluateEnd(): NumberResult | null {
    const dom = dominantBase(this.buffer)
    if (!dom || looksLikeOtherSign(this.buffer)) return null
    const cycles = flexCycles(this.buffer, dom.base)
    if (cycles >= 1 && dom.base <= 4) return this.dynamicResult(dom, cycles)
    const own = this.buffer.filter((x) => x.best === dom.base && x.bestScore >= SHAPE_MIN)
    // Una forma vista menos de ~250 ms no es una seña.
    if (own.length < 3 || own[own.length - 1].t - own[0].t < 250) return null
    return this.staticResult(dom.base, own, 0.9)
  }

  /** Al bajar la mano tras emitir un estático: si hubo 1 ciclo de flexión de esa base, corrige a 6–9. */
  private upgradeAtEnd(): NumberResult | null {
    if (this.emitted?.kind !== "estático" || this.emitted.base > 4) return null
    const cycles = flexCycles(this.buffer, this.emitted.base)
    const dom = dominantBase(this.buffer)
    if (cycles < 1 || !dom || dom.base !== this.emitted.base) return null
    return this.dynamicResult(dom, cycles)
  }

  private staticResult(base: number, frames: Sample[], factor = 1): NumberResult | null {
    const mean = frames.reduce((a, x) => a + x.scores[base - 1], 0) / frames.length
    const margin = frames.reduce((a, x) => a + x.margin, 0) / frames.length
    const conf = mean * (0.7 + 0.3 * clamp01(margin / 0.3)) * factor
    const alts: Guess[] = []
    if (base <= 4) alts.push({ value: base + 5, confidence: pct(conf * 0.35) })
    const second = secondBest(frames, base)
    if (second) alts.push({ value: second.base, confidence: pct(second.score * conf * 0.6) })
    return this.restrict({ value: base, confidence: pct(conf), alternatives: alts, kind: "estático" })
  }

  private dynamicResult(dom: { base: number; share: number; meanScore: number }, cycles: number): NumberResult | null {
    const conf = dom.meanScore * (cycles >= 2 ? 0.97 : 0.82) * (0.75 + 0.25 * dom.share)
    return this.restrict({
      value: dom.base + 5, confidence: pct(conf), kind: "movimiento",
      alternatives: [{ value: dom.base, confidence: pct(conf * (cycles >= 2 ? 0.2 : 0.45)) }],
    })
  }

  /** Limita el resultado a 1..max: si el número no es una opción, se usa la mejor alternativa válida (con menos confianza). */
  private restrict(r: NumberResult): NumberResult | null {
    const valid = (g: Guess) => g.value >= 1 && g.value <= this.max
    const alternatives = r.alternatives.filter(valid).sort((a, b) => b.confidence - a.confidence)
    if (valid(r)) return { ...r, alternatives }
    const [first, ...rest] = alternatives
    if (!first) return null
    return { ...r, value: first.value, confidence: Math.round(first.confidence * 0.8), alternatives: rest }
  }
}

function secondBest(frames: Sample[], base: number): { base: number; score: number } | null {
  const sums = [0, 0, 0, 0, 0]
  for (const f of frames) f.scores.forEach((s, i) => { sums[i] += s })
  const order = sums.map((s, i) => ({ base: i + 1, score: s / frames.length })).filter((x) => x.base !== base).sort((a, b) => b.score - a.score)
  return order[0] ?? null
}
