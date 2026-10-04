// Manos sintéticas con los 21 puntos de MediaPipe, para probar el motor sin cámara.
import type { Frame, Point } from "../src/vision/types.ts"

/** Flexión de cada dedo, 0 = extendido, 1 = doblado: [pulgar, índice, medio, anular, meñique]. */
export type Curl = [number, number, number, number, number]

export const SHAPES: Record<number, Curl> = {
  1: [1, 0, 1, 1, 1],
  2: [1, 0, 0, 1, 1],
  3: [1, 0, 0, 0, 1],
  4: [1, 0, 0, 0, 0],
  5: [0, 0, 0, 0, 0],
  0: [1, 1, 1, 1, 1], // puño
}

export interface Placement { x?: number; y?: number; scale?: number; rotation?: number; mirror?: boolean; jitter?: number; seed?: number }

const MCP: [number, number][] = [[-0.3, -0.95], [-0.05, -1.0], [0.18, -0.95], [0.38, -0.85]]
const SEG = [0.45, 0.28, 0.22]
const THUMB_SEG = [0.45, 0.35, 0.3]

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 - 0.5 }
}

/** Mano en coordenadas locales (muñeca en el origen, dedos hacia −y, palma ≈ 1). */
function localHand(curl: Curl): [number, number, number][] {
  const pts: [number, number, number][] = [[0, 0, 0]]
  // Pulgar: gira dentro del plano de la palma hacia el centro de la mano.
  let a = Math.atan2(-0.45, -0.9)
  let p: [number, number, number] = [-0.25, -0.25, 0]
  pts.push(p)
  ;[0.6, 0.8, 0.7].forEach((k, i) => {
    a += k * curl[0]
    p = [p[0] + THUMB_SEG[i] * Math.cos(a), p[1] + THUMB_SEG[i] * Math.sin(a), p[2] + 0.05 * curl[0]]
    pts.push(p)
  })
  // Dedos: se doblan hacia la palma (rotación en el plano y–z).
  MCP.forEach(([mx, my], f) => {
    let q: [number, number, number] = [mx, my, 0]
    pts.push(q)
    let phi = 0
    ;[1.4, 1.7, 1.0].forEach((k, i) => {
      phi += k * curl[f + 1]
      q = [q[0], q[1] - SEG[i] * Math.cos(phi), q[2] + SEG[i] * Math.sin(phi)]
      pts.push(q)
    })
  })
  return pts
}

export function hand(curl: Curl, place: Placement = {}): Point[] {
  const { x = 0.5, y = 0.45, scale = 0.12, rotation = 0, mirror = false, jitter = 0, seed = 1 } = place
  const r = rng(seed)
  const c = Math.cos(rotation)
  const s = Math.sin(rotation)
  return localHand(curl).map(([lx, ly, lz]) => {
    const mx = mirror ? -lx : lx
    return {
      x: x + scale * (c * mx - s * ly) + jitter * r(),
      y: y + scale * (s * mx + c * ly) + jitter * r(),
      z: scale * lz + jitter * r(),
    }
  })
}

/** Cuerpo mínimo: hombros y codos por debajo de una mano levantada (y = 0.45). */
export const POSE_UP: Point[] = Array.from({ length: 25 }, (_, i) => {
  const at: Record<number, [number, number]> = { 0: [0.5, 0.3], 2: [0.48, 0.28], 5: [0.52, 0.28], 11: [0.6, 0.55], 12: [0.4, 0.55], 13: [0.65, 0.75], 14: [0.35, 0.75] }
  const [px, py] = at[i] ?? [0.5, 0.9]
  return { x: px, y: py, z: 0, v: 0.99 }
})

export const frame = (t: number, points: Point[] | null, pose: Point[] | null = POSE_UP): Frame =>
  ({ t, hands: points ? [{ side: "Right", score: 0.95, points }] : [], pose })

/** Secuencia a 20 fps: `fn(i)` da la mano del fotograma i (o null si no hay mano). */
export function sequence(n: number, fn: (i: number) => Point[] | null, t0 = 0, pose: Point[] | null = POSE_UP): Frame[] {
  return Array.from({ length: n }, (_, i) => frame(t0 + i * 50, fn(i), pose))
}

export const mix = (a: Curl, b: Curl, k: number): Curl => a.map((v, i) => v + (b[i] - v) * k) as Curl
