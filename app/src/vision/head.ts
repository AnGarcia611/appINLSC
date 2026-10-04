// SÍ / NO con la cabeza (variantes naturales registradas en el diccionario INSOR/ICC):
//   SÍ = asentir varias veces (oscilación vertical de la nariz); NO = negar (oscilación horizontal).
// Usa solo los puntos de cara gruesos de MediaPipe Pose (nariz, ojos, hombros): no necesita un modelo de cara.
import { POSE, type Frame } from "./types.ts"

export type HeadAnswer = "sí" | "no"
export interface HeadResult { value: HeadAnswer; confidence: number }

interface Sample { t: number; x: number; y: number }

/** Transiciones entre +a y −a (con histéresis) de la señal sin su media. */
function swings(values: number[], a: number): { count: number; amplitude: number } {
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  let state = 0
  let count = 0
  let lo = Infinity
  let hi = -Infinity
  for (const raw of values) {
    const v = raw - mean
    lo = Math.min(lo, v)
    hi = Math.max(hi, v)
    if (v > a && state !== 1) { if (state) count++; state = 1 }
    else if (v < -a && state !== -1) { if (state) count++; state = -1 }
  }
  return { count, amplitude: hi - lo }
}

/**
 * Detector en línea de asentir/negar. Ventana de 1.6 s; hacen falta ≥ 3 cambios de sentido
 * (ida, vuelta, ida) con amplitud mínima relativa al ancho de hombros, para no confundirlo con moverse al hablar.
 */
export class HeadGestureDetector {
  private buffer: Sample[] = []
  private cooldownUntil = 0
  private readonly windowMs = 1600
  /** Umbral de histéresis: fracción del ancho de hombros. */
  private readonly a = 0.018

  reset() { this.buffer = []; this.cooldownUntil = 0 }

  push(frame: Frame): HeadResult | null {
    const p = frame.pose
    if (!p) return null
    const nose = p[POSE.nose]
    const ls = p[POSE.leftShoulder]
    const rs = p[POSE.rightShoulder]
    if ((nose.v ?? 1) < 0.5 || (ls.v ?? 1) < 0.5 || (rs.v ?? 1) < 0.5) return null
    const w = Math.hypot(ls.x - rs.x, ls.y - rs.y)
    if (w < 0.05) return null
    const mx = (ls.x + rs.x) / 2
    const my = (ls.y + rs.y) / 2
    this.buffer.push({ t: frame.t, x: (nose.x - mx) / w, y: (nose.y - my) / w })
    while (this.buffer.length && frame.t - this.buffer[0].t > this.windowMs) this.buffer.shift()
    if (frame.t < this.cooldownUntil || this.buffer.length < 8) return null

    const sx = swings(this.buffer.map((s) => s.x), this.a)
    const sy = swings(this.buffer.map((s) => s.y), this.a)
    const yes = sy.count >= 3 && sy.amplitude > sx.amplitude * 1.3
    const no = sx.count >= 3 && sx.amplitude > sy.amplitude * 1.3
    if (!yes && !no) return null

    const s = yes ? sy : sx
    const confidence = Math.round(100 * Math.min(1, 0.55 + 0.1 * (s.count - 3) + 2 * (s.amplitude - 2 * this.a)))
    this.buffer = []
    this.cooldownUntil = frame.t + 1500
    return { value: yes ? "sí" : "no", confidence: Math.max(50, Math.min(97, confidence)) }
  }
}
