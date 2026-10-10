// Señas con movimiento (trámites, sí/no con la mano): cada fotograma se resume en un vector pequeño
// relativo al cuerpo, y la seña es la secuencia de esos vectores a 10 por segundo.
import { fingerExtension } from "./features.ts"
import { POSE, type Frame, type HandObs } from "./types.ts"

/** Muestras por segundo de la secuencia. */
export const SEQ_HZ = 10
/** 2 manos × (muñeca x, y · 5 extensiones · dirección de la mano x, y). */
export const SEQ_DIM = 18
/** Tiempo que se conserva la última posición de una mano que el detector perdió. */
const HOLD_MS = 300

/** Mano ausente: abajo, a su lado del cuerpo, relajada. */
const rest = (slot: 0 | 1) => [slot ? 0.9 : -0.9, 2.2, 0.3, 0.3, 0.3, 0.3, 0.3, 0, -1]

/**
 * Características de una mano relativas al cuerpo: posición de la muñeca (centro de hombros = 0, ancho de hombros = 1),
 * extensión de los 5 dedos y hacia dónde apunta la mano (muñeca → nudillo del medio).
 */
function handFeatures(h: HandObs, body: Body, aspect: number): number[] {
  const p = h.points
  const wx = (p[0].x * aspect - body.cx) / body.w
  const wy = (p[0].y - body.cy) / body.w
  const dx = (p[9].x - p[0].x) * aspect, dy = p[9].y - p[0].y
  const len = Math.hypot(dx, dy) || 1
  return [wx, wy, ...fingerExtension(p), dx / len, dy / len]
}

interface Body { cx: number; cy: number; w: number }

/**
 * Convierte fotogramas sueltos (a cualquier fps) en una secuencia regular a SEQ_HZ.
 * Las manos se ordenan por posición (izquierda / derecha de la imagen), no por la etiqueta de MediaPipe, que a veces se invierte.
 */
export class MotionTrack {
  /** Muestras a SEQ_HZ (la más reciente al final). */
  readonly samples: number[][] = []
  private body: Body | null = null
  private last: { v: number[]; t: number }[] = [{ v: rest(0), t: -Infinity }, { v: rest(1), t: -Infinity }]
  private nextTick = -Infinity
  private readonly maxSamples: number
  private readonly aspect: number

  constructor(aspect = 16 / 9, keepMs = 8000) {
    this.aspect = aspect
    this.maxSamples = Math.ceil((keepMs / 1000) * SEQ_HZ)
  }

  reset() { this.samples.length = 0; this.nextTick = -Infinity; this.last = [{ v: rest(0), t: -Infinity }, { v: rest(1), t: -Infinity }] }

  push(frame: Frame) {
    const a = this.aspect
    if (frame.pose) {
      const l = frame.pose[POSE.leftShoulder], r = frame.pose[POSE.rightShoulder]
      const w = Math.hypot((l.x - r.x) * a, l.y - r.y)
      if ((l.v ?? 1) > 0.3 && (r.v ?? 1) > 0.3 && w > 0.05) this.body = { cx: ((l.x + r.x) / 2) * a, cy: (l.y + r.y) / 2, w }
    }
    const body = this.body ?? { cx: a / 2, cy: 0.55, w: 0.25 * a }
    const hands = [...frame.hands].sort((h1, h2) => h1.points[0].x - h2.points[0].x)
    if (hands.length >= 2) {
      this.last[0] = { v: handFeatures(hands[0], body, a), t: frame.t }
      this.last[1] = { v: handFeatures(hands[hands.length - 1], body, a), t: frame.t }
    } else if (hands.length === 1) {
      const slot = hands[0].points[0].x * a < body.cx ? 0 : 1
      this.last[slot] = { v: handFeatures(hands[0], body, a), t: frame.t }
    }
    const current = () => [0, 1].flatMap((s) => (frame.t - this.last[s].t <= HOLD_MS ? this.last[s].v : rest(s as 0 | 1)))
    if (this.nextTick === -Infinity) this.nextTick = frame.t
    // Si llegan pocos fotogramas (< 10 fps) se repite la muestra para mantener el ritmo.
    while (frame.t >= this.nextTick) {
      this.samples.push(current())
      this.nextTick += 1000 / SEQ_HZ
    }
    if (this.samples.length > this.maxSamples) this.samples.splice(0, this.samples.length - this.maxSamples)
  }

  /** Las últimas `ms` de la secuencia. */
  window(ms: number): number[][] {
    return this.samples.slice(-Math.max(1, Math.round((ms / 1000) * SEQ_HZ)))
  }
}

/** Secuencia completa de una lista de fotogramas (para entrenar y evaluar). */
export function motionSequence(frames: Frame[], aspect = 16 / 9): { t: number; v: number[] }[] {
  const track = new MotionTrack(aspect, Infinity)
  const out: { t: number; v: number[] }[] = []
  let seen = 0
  for (const f of frames) {
    track.push(f)
    while (seen < track.samples.length) { out.push({ t: f.t, v: track.samples[seen] }); seen++ }
  }
  return out
}
