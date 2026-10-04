// Características de la mano independientes de la posición, el tamaño, la rotación y el espejo de la cámara.
import type { Frame, HandObs, Point } from "./types.ts"
import { POSE } from "./types.ts"

export const FINGERS = ["pulgar", "índice", "medio", "anular", "meñique"] as const

/** Índices de cada dedo en los 21 puntos de MediaPipe: [base, articulación, articulación, punta]. */
const CHAIN = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
] as const

const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const len = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z)
export const dist = (a: Point, b: Point) => len(sub(a, b))

/** Ángulo de flexión en `b` (0 = recto, π = doblado del todo). */
function bend(a: Point, b: Point, c: Point): number {
  const u = sub(b, a)
  const v = sub(c, b)
  const d = len(u) * len(v)
  if (!d) return 0
  return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y + u.z * v.z) / d)))
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/** Tamaño de referencia de la mano: muñeca → nudillo del dedo medio. */
export const palmSize = (p: Point[]) => dist(p[0], p[9]) || 1e-6

/**
 * 15 ángulos de flexión (3 por dedo, en radianes). Son invariantes a traslación, escala, rotación y espejo,
 * por eso sirven igual con la cámara frontal espejada o no.
 */
export function jointAngles(p: Point[]): number[] {
  const out: number[] = []
  for (const [a, b, c, d] of CHAIN) out.push(bend(p[0], p[a], p[b]), bend(p[a], p[b], p[c]), bend(p[b], p[c], p[d]))
  return out
}

/**
 * Extensión de cada dedo, de 0 (doblado) a 1 (extendido), combinando dos señales:
 *   - rectitud: suma de flexiones de las articulaciones;
 *   - alcance: distancia punta–muñeca relativa al tamaño de la palma.
 * Para el pulgar, el alcance se mide desde la base del índice (el pulgar doblado queda pegado a la palma).
 */
export function fingerExtension(p: Point[]): number[] {
  const size = palmSize(p)
  const angles = jointAngles(p)
  return CHAIN.map(([, , , tip], f) => {
    const curl = angles[f * 3] * (f === 0 ? 0.5 : 1) + angles[f * 3 + 1] + angles[f * 3 + 2]
    if (f === 0) {
      const reach = dist(p[tip], p[5]) / size // pulgar: punta lejos de la base del índice
      const straight = clamp01(1 - (angles[1] + angles[2] - 0.35) / 1.3)
      return clamp01(0.6 * clamp01((reach - 0.45) / 0.5) + 0.4 * straight)
    }
    const reach = dist(p[tip], p[0]) / size // ≈ 1.9 extendido, ≈ 0.9 cerrado
    const straight = clamp01(1 - (curl - 0.5) / 2.2) // ≈ 0.2 rad extendido, ≈ 3 rad cerrado
    return clamp01(0.5 * clamp01((reach - 1.0) / 0.8) + 0.5 * straight)
  })
}

/**
 * Vector de forma para comparar manos entre sí (k vecinos): extensiones + ángulos escalados a 0..1.
 * 20 valores.
 */
export function shapeVector(p: Point[]): number[] {
  return [...fingerExtension(p), ...jointAngles(p).map((a) => a / Math.PI)]
}

/**
 * Mano que está señando: entre las visibles, la que está más arriba (menor y de la muñeca),
 * con preferencia por la que está por encima del codo.
 */
export function dominantHand(frame: Frame): HandObs | null {
  if (!frame.hands.length) return null
  return frame.hands.reduce((best, h) => (h.points[0].y < best.points[0].y ? h : best))
}

/**
 * ¿La mano está "presentada" (levantada para señar) y no en reposo sobre el mostrador?
 * Con el cuerpo visible: la muñeca por encima del codo más bajo + un margen. Sin cuerpo: en los 4/5 superiores de la imagen.
 */
export function isRaised(hand: HandObs, pose: Point[] | null): boolean {
  const wrist = hand.points[0]
  if (pose && pose.length > POSE.rightElbow) {
    const le = pose[POSE.leftElbow]
    const re = pose[POSE.rightElbow]
    const elbows = [le, re].filter((e) => (e.v ?? 1) > 0.3)
    if (elbows.length) {
      const lowest = Math.max(...elbows.map((e) => e.y))
      return wrist.y < lowest + 0.02
    }
  }
  return wrist.y < 0.8
}
