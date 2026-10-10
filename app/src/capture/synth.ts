// Datos simulados: variantes creíbles de las tomas reales para entrenar y poner a prueba el reconocimiento.
// Cada "persona" sintética tiene otra mano (largo de huesos, pulgar), puede ser zurda y mueve los brazos a su manera;
// cada variante cambia además la cámara, la velocidad y el ruido del detector.
// Funciones puras con semilla: el mismo paquete y la misma semilla dan siempre el mismo resultado.
//
// Límite: se simula cómo varía una toma, no cómo señan otras personas. La evaluación final se hace con tomas reales.
import { dominantHand, fingerExtension, isRaised } from "../vision/features.ts"
import { POSE, type Frame, type HandObs, type Point } from "../vision/types.ts"
import { decodeFrame, encodeFrame, type CapturePackage, type Take } from "./format.ts"

// ── Azar con semilla ──

export type Rng = () => number

/** Generador mulberry32: 0 ≤ r() < 1. */
export function rng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

/** Semilla estable a partir de un texto (FNV-1a). */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}

const between = (r: Rng, a: number, b: number) => a + (b - a) * r()
function gauss(r: Rng): number {
  const u = Math.max(r(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r())
}

/**
 * Grupo (0..k-1) de una toma real. Las variantes de una toma van siempre al grupo de su toma de origen,
 * y las tomas con `group` (el señante, en datos públicos) van todas al mismo grupo.
 */
export const foldOf = (take: Pick<Take, "id" | "source" | "group">, k: number) => hashSeed(take.group ?? take.source ?? take.id) % k

// ── Personas y variaciones ──

export interface Persona {
  id: string
  /** Factor de largo de cada hueso de la mano: índice = punto hijo − 1 (20 huesos). */
  bones: number[]
  /** Giro del pulgar hacia la palma (rad): positivo = pulgar más pegado, negativo = más abierto. */
  thumb: number
  leftHanded: boolean
  /** Alcance de los brazos respecto a los hombros (señar grande o chico). */
  amplitude: number
  /** Velocidad propia. */
  tempo: number
  /** Proporciones del cuerpo y del lente. */
  stretch: { x: number; y: number }
}

export function makePersona(r: Rng, id: string): Persona {
  const palm = between(r, 0.9, 1.1)
  const finger = between(r, 0.88, 1.12)
  const bones = Array.from({ length: 20 }, (_, i) => {
    const child = i + 1
    const base = [1, 5, 9, 13, 17].includes(child) ? palm : finger
    return base * between(r, 0.95, 1.05)
  })
  return {
    id, bones,
    thumb: between(r, -0.25, 0.45),
    leftHanded: r() < 0.25,
    amplitude: between(r, 0.85, 1.15),
    tempo: between(r, 0.8, 1.2),
    stretch: { x: between(r, 0.92, 1.08), y: between(r, 0.92, 1.08) },
  }
}

export interface Variation {
  scale: number
  dx: number
  dy: number
  /** Inclinación de la cámara (rad). */
  roll: number
  /** Giro horizontal (rad): la persona no queda de frente. */
  yaw: number
  speed: number
  /** Deformación del tiempo: partes más rápidas y otras más lentas (|warp| < 1). */
  warp: number
  fps: number
  cropStart: number
  cropEnd: number
  /** Temblor de los puntos (fracción del cuadro). */
  jitter: number
  /** Probabilidad de que empiece un tramo sin mano detectada. */
  drop: number
  /** Probabilidad por fotograma de que MediaPipe marque la mano del lado contrario. */
  swap: number
  /** Probabilidad por fotograma de perder la segunda mano. */
  loseSecond: number
  /** Codos fuera de cuadro o mal vistos. */
  hideElbows: boolean
  /** En 6–9: repetir un ciclo de flexión. */
  extraCycle: boolean
}

export function makeVariation(r: Rng, p: Persona): Variation {
  return {
    scale: between(r, 0.75, 1.25),
    dx: between(r, -0.12, 0.12),
    dy: between(r, -0.08, 0.1),
    roll: between(r, -0.2, 0.2),
    yaw: between(r, -0.35, 0.35),
    speed: p.tempo * between(r, 0.85, 1.2),
    warp: between(r, -0.35, 0.35),
    fps: Math.round(between(r, 10, 28)),
    cropStart: between(r, 0, 250),
    cropEnd: between(r, 0, 250),
    jitter: between(r, 0.001, 0.005),
    drop: between(r, 0, 0.08),
    swap: r() < 0.3 ? between(r, 0, 0.1) : 0,
    loseSecond: r() < 0.3 ? between(r, 0, 0.25) : 0,
    hideElbows: r() < 0.12,
    extraCycle: r() < 0.35,
  }
}

// ── Geometría ──

/** Pares izquierda/derecha de MediaPipe Pose (0–24) para el espejo. */
const POSE_PAIRS: [number, number][] = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22], [23, 24]]
const MIRROR_INDEX = Array.from({ length: 25 }, (_, i) => {
  const pair = POSE_PAIRS.find(([a, b]) => a === i || b === i)
  return pair ? (pair[0] === i ? pair[1] : pair[0]) : i
})
const PARENT = (i: number) => ([1, 5, 9, 13, 17].includes(i) ? 0 : i - 1)

/** Coordenadas isótropas: x se multiplica por el ancho/alto del cuadro para que girar no deforme. */
interface Iso { X: number; Y: number; Z: number }
const toIso = (p: Point, a: number): Iso => ({ X: p.x * a, Y: p.y, Z: p.z * a })
const fromIso = (q: Iso, a: number, v?: number): Point => ({ x: q.X / a, y: q.Y, z: q.Z / a, ...(v !== undefined ? { v } : {}) })

/** Mano con otros largos de hueso y otra abertura del pulgar; los ángulos de las articulaciones no cambian. */
export function reshapeHand(points: Point[], p: Persona, aspect: number): Point[] {
  const src = points.map((q) => toIso(q, aspect))
  const out: Iso[] = [src[0]]
  for (let i = 1; i < 21; i++) {
    const par = out[PARENT(i)]
    const f = p.bones[i - 1]
    out[i] = { X: par.X + (src[i].X - src[PARENT(i)].X) * f, Y: par.Y + (src[i].Y - src[PARENT(i)].Y) * f, Z: par.Z + (src[i].Z - src[PARENT(i)].Z) * f }
  }
  if (p.thumb) rotateThumb(out, p.thumb)
  return out.map((q) => fromIso(q, aspect))
}

const sub = (a: Iso, b: Iso): Iso => ({ X: a.X - b.X, Y: a.Y - b.Y, Z: a.Z - b.Z })
const cross = (a: Iso, b: Iso): Iso => ({ X: a.Y * b.Z - a.Z * b.Y, Y: a.Z * b.X - a.X * b.Z, Z: a.X * b.Y - a.Y * b.X })
const dot = (a: Iso, b: Iso) => a.X * b.X + a.Y * b.Y + a.Z * b.Z
const unit = (a: Iso): Iso | null => { const l = Math.hypot(a.X, a.Y, a.Z); return l ? { X: a.X / l, Y: a.Y / l, Z: a.Z / l } : null }
/** Rodrigues: v cos a + (n × v) sin a + n (n·v)(1 − cos a). `n` unitario. */
function rotate(v: Iso, n: Iso, a: number): Iso {
  const c = Math.cos(a), s = Math.sin(a), d = dot(n, v)
  const k = cross(n, v)
  return { X: v.X * c + k.X * s + n.X * d * (1 - c), Y: v.Y * c + k.Y * s + n.Y * d * (1 - c), Z: v.Z * c + k.Z * s + n.Z * d * (1 - c) }
}

/** Gira el pulgar (puntos 2–4) sobre su base, en el plano de la palma; positivo = hacia el índice. */
function rotateThumb(h: Iso[], angle: number) {
  const n = unit(cross(sub(h[5], h[0]), sub(h[17], h[0])))
  if (!n) return
  const rot = (v: Iso, a: number) => rotate(v, n, a)
  const pivot = h[1]
  const tipAfter = (a: number) => { const t = rot(sub(h[4], pivot), a); return Math.hypot(pivot.X + t.X - h[5].X, pivot.Y + t.Y - h[5].Y, pivot.Z + t.Z - h[5].Z) }
  // El sentido "hacia el índice" depende de la mano (izquierda o derecha): se elige el que acerca la punta al índice.
  const a = tipAfter(Math.abs(angle)) < tipAfter(-Math.abs(angle)) ? angle : -angle
  for (const i of [2, 3, 4]) {
    const v = rot(sub(h[i], pivot), a)
    h[i] = { X: pivot.X + v.X, Y: pivot.Y + v.Y, Z: pivot.Z + v.Z }
  }
}

export function mirrorFrame(f: Frame): Frame {
  return {
    t: f.t,
    hands: f.hands.map((h) => ({ ...h, side: h.side === "Left" ? "Right" : h.side === "Right" ? "Left" : h.side, points: h.points.map((p) => ({ ...p, x: 1 - p.x })) })),
    pose: f.pose ? MIRROR_INDEX.map((j) => ({ ...f.pose![j], x: 1 - f.pose![j].x })) : null,
  }
}

/** Centro y ancho de hombros (isótropos), o null sin cuerpo visible. */
function bodyFrame(pose: Point[] | null, aspect: number): { cx: number; cy: number } | null {
  if (!pose) return null
  const l = pose[POSE.leftShoulder], r = pose[POSE.rightShoulder]
  return { cx: ((l.x + r.x) / 2) * aspect, cy: (l.y + r.y) / 2 }
}

/** Persona + cámara aplicadas a un fotograma. */
function transformFrame(f: Frame, p: Persona, v: Variation, aspect: number, body: { cx: number; cy: number }): Frame {
  const cx0 = aspect / 2, cy0 = 0.5
  const cos = Math.cos(v.roll), sin = Math.sin(v.roll)
  const yawC = Math.cos(v.yaw), yawS = Math.sin(v.yaw)
  // Cámara: estirar (proporciones), girar el cuerpo (yaw, comprime x), inclinar, escalar y mover.
  const cam = (q: Iso): Iso => {
    let X = body.cx + (q.X - body.cx) * p.stretch.x * yawC
    let Y = body.cy + (q.Y - body.cy) * p.stretch.y
    X -= cx0; Y -= cy0
    const rx = (X * cos - Y * sin) * v.scale, ry = (X * sin + Y * cos) * v.scale
    return { X: rx + cx0 + v.dx * aspect, Y: ry + cy0 + v.dy, Z: q.Z * v.scale }
  }
  // Brazos más o menos abiertos: la muñeca se aleja o acerca del centro de los hombros y la mano entera la sigue.
  const reach = (q: Iso): Iso => ({ X: body.cx + (q.X - body.cx) * p.amplitude, Y: body.cy + (q.Y - body.cy) * p.amplitude, Z: q.Z })

  const hands: HandObs[] = []
  for (const h of f.hands) {
    const shaped = reshapeHand(h.points, p, aspect).map((q) => toIso(q, aspect))
    const w = shaped[0]
    const moved = reach(w)
    const shift = { X: moved.X - w.X, Y: moved.Y - w.Y }
    const pts = shaped.map((q) => {
      // Yaw de la mano alrededor de su muñeca: cambia un poco cómo se ven los dedos.
      const lx = q.X - w.X, lz = q.Z - w.Z
      const turned = { X: w.X + lx * yawC + lz * yawS, Y: q.Y, Z: w.Z - lx * yawS + lz * yawC }
      return fromIso(cam({ X: turned.X + shift.X, Y: turned.Y + shift.Y, Z: turned.Z }), aspect)
    })
    // MediaPipe no detecta una mano con la muñeca fuera del cuadro.
    if (pts[0].x < 0 || pts[0].x > 1 || pts[0].y < 0 || pts[0].y > 1) continue
    hands.push({ side: h.side, score: h.score, points: pts })
  }
  const ARM = new Set([13, 14, 15, 16, 17, 18, 19, 20, 21, 22])
  const pose = f.pose
    ? f.pose.map((q, i) => {
        const iso = toIso(q, aspect)
        return fromIso(cam(ARM.has(i) ? reach(iso) : iso), aspect, q.v)
      })
    : null
  return { t: f.t, hands, pose }
}

// ── Tiempo ──

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const lerpPoints = (a: Point[], b: Point[], k: number): Point[] =>
  a.map((p, i) => ({ x: lerp(p.x, b[i].x, k), y: lerp(p.y, b[i].y, k), z: lerp(p.z, b[i].z, k), ...(p.v !== undefined ? { v: lerp(p.v, b[i].v ?? p.v, k) } : {}) }))

/** Fotograma en el instante t (interpola si los dos vecinos tienen las mismas manos). */
function sampleAt(frames: Frame[], t: number): Frame {
  let i = 0
  while (i < frames.length - 1 && frames[i + 1].t <= t) i++
  const a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)]
  if (a === b || b.t <= a.t) return { ...a, t }
  const k = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)))
  const sameHands = a.hands.length === b.hands.length && a.hands.every((h, j) => h.side === b.hands[j].side)
  if (!sameHands) return { ...(k < 0.5 ? a : b), t }
  return {
    t,
    hands: a.hands.map((h, j) => ({ ...h, points: lerpPoints(h.points, b.hands[j].points, k) })),
    pose: a.pose && b.pose ? lerpPoints(a.pose, b.pose, k) : (k < 0.5 ? a.pose : b.pose),
  }
}

/** Nueva línea de tiempo: otra velocidad, partes más rápidas o lentas, otros fps y recorte de bordes. */
function retime(frames: Frame[], v: Variation, r: Rng): Frame[] {
  if (frames.length < 2) return frames
  const t0 = frames[0].t
  const src = frames.map((f) => ({ ...f, t: f.t - t0 }))
  const D = src[src.length - 1].t
  const D2 = D / v.speed
  const step = 1000 / v.fps
  const out: Frame[] = []
  for (let tau = v.cropStart; tau <= D2 - v.cropEnd; tau += step * between(r, 0.9, 1.1)) {
    const u = tau / D2
    const g = u + (v.warp / (2 * Math.PI)) * Math.sin(2 * Math.PI * u) // monótona si |warp| < 1
    out.push({ ...sampleAt(src, g * D), t: Math.round(tau - v.cropStart) })
  }
  return out
}

/** Repite un ciclo de flexión (6–9): de un "arriba" al siguiente pasando por un "abajo". */
function repeatCycle(frames: Frame[], base: number): Frame[] {
  const fingers = ({ 1: [1], 2: [1, 2], 3: [1, 2, 3], 4: [1, 2, 3, 4] } as Record<number, number[]>)[base]
  if (!fingers) return frames
  const e = frames.map((f) => {
    const h = dominantHand(f)
    if (!h) return null
    const ext = fingerExtension(h.points)
    return fingers.reduce((a, i) => a + ext[i], 0) / fingers.length
  })
  let up = -1, down = -1
  for (let i = 0; i < e.length; i++) {
    const x = e[i]
    if (x === null) continue
    if (up < 0 && x > 0.68) up = i
    else if (up >= 0 && down < 0 && x < 0.42) down = i
    else if (down >= 0 && x > 0.68) {
      const span = frames[i].t - frames[up].t
      const copy = frames.slice(up, i).map((f) => ({ ...f, t: f.t + span }))
      return [...frames.slice(0, i), ...copy, ...frames.slice(i).map((f) => ({ ...f, t: f.t + span }))]
    }
  }
  return frames
}

// ── 6–9 fabricados desde 1–4 ──

/** Dedos que se flexionan en 6–9 según la base (sin el pulgar) y sus puntos: articulación MCP, PIP, DIP y punta. */
const FLEX_BASE: Record<number, number[]> = { 1: [1], 2: [1, 2], 3: [1, 2, 3], 4: [1, 2, 3, 4] }
const FINGER_POINTS = (f: number) => [f * 4 + 1, f * 4 + 2, f * 4 + 3, f * 4 + 4]
/** Reparto de la flexión entre MCP, PIP y DIP (la PIP es la que más se dobla en una flexión rápida). */
const CURL_SHARE = [0.4, 0.4, 0.2]

/**
 * Dobla los dedos `fingers` una fracción `k` (0 = como están, 1 = cerrados del todo, ≈ 2.7 rad entre las tres articulaciones).
 * El giro es alrededor del eje transversal de la palma (índice → meñique), hacia el lado de la palma: el lado donde
 * están las puntas de los dedos que ya están doblados (o el pulgar, en el 4).
 */
export function curlFingers(points: Point[], fingers: number[], k: number, aspect: number): Point[] {
  if (k <= 0) return points
  const h = points.map((q) => toIso(q, aspect))
  const axis = unit(sub(h[17], h[5]))
  const normal = unit(cross(sub(h[5], h[0]), sub(h[17], h[0])))
  if (!axis || !normal) return points
  const folded = [1, 2, 3, 4].filter((f) => !fingers.includes(f)).map((f) => f * 4 + 4)
  const refs = folded.length ? folded : [4]
  const ref = refs.reduce((a, i) => ({ X: a.X + h[i].X / refs.length, Y: a.Y + h[i].Y / refs.length, Z: a.Z + h[i].Z / refs.length }), { X: 0, Y: 0, Z: 0 })
  const palmSide = Math.sign(dot(sub(ref, h[0]), normal)) || 1
  for (const f of fingers) {
    const chain = FINGER_POINTS(f)
    // El sentido del giro es el que acerca la punta al lado de la palma.
    const tip = sub(h[chain[3]], h[chain[0]])
    const probe = (a: number) => dot(rotate(tip, axis, a), normal) * palmSide
    const dir = probe(0.3) > probe(-0.3) ? 1 : -1
    for (let j = 0; j < 3; j++) {
      const pivot = h[chain[j]]
      const a = dir * k * 2.7 * CURL_SHARE[j]
      for (const i of chain.slice(j + 1)) {
        const v = rotate(sub(h[i], pivot), axis, a)
        h[i] = { X: pivot.X + v.X, Y: pivot.Y + v.Y, Z: pivot.Z + v.Z }
      }
    }
  }
  return h.map((q, i) => fromIso(q, aspect, points[i].v))
}

/** Extensión media de los dedos de la base para considerar que la forma de 1–4 ya está hecha. */
const FORMED = 0.8

export interface FlexStyle {
  /** Ciclos de flexión completos. */
  cycles: number
  /** Ciclos por segundo. */
  hz: number
  /** Hasta dónde se doblan (fracción de cerrar del todo): 0.45 = flexión a medias. */
  depth: number
  /** Retraso antes del primer ciclo, en fracción del tramo quieto. */
  lead: number
}

export function makeFlexStyle(r: Rng): FlexStyle {
  // "Varias veces": casi siempre 2–4 ciclos; a veces uno solo (seña apurada).
  return { cycles: r() < 0.15 ? 1 : 2 + Math.floor(r() * 3), hz: between(r, 1.4, 3.6), depth: between(r, 0.45, 1), lead: between(r, 0, 0.3) }
}

/**
 * 6–9 a partir de una toma real de 1–4: en el tramo con la mano levantada se doblan y estiran los dedos de la base
 * `style.cycles` veces. Si el tramo no alcanza, se alarga repitiendo su último fotograma (la persona sostiene la mano).
 * Devuelve null si la toma no tiene un tramo con la mano levantada.
 */
export function flexTake(take: Take, style: FlexStyle, aspect: number, id = `${take.id}~flex`): Take | null {
  const base = Number(take.label)
  const fingers = FLEX_BASE[base]
  if (!fingers) return null
  const frames = take.frames.map(decodeFrame)
  // Tramo con la forma ya hecha: mano levantada y dedos de la base estirados (la mano suele subir cerrada).
  const formed = frames.map((f) => {
    const h = dominantHand(f)
    if (!h || !isRaised(h, f.pose)) return false
    const ext = fingerExtension(h.points)
    return fingers.reduce((a, i) => a + ext[i], 0) / fingers.length >= FORMED
  })
  const first = formed.indexOf(true), last = formed.lastIndexOf(true)
  if (first < 0 || last - first < 3) return null
  const t0 = frames[first].t + (frames[last].t - frames[first].t) * style.lead
  const need = (style.cycles / style.hz) * 1000
  const tEnd = t0 + need
  // Alargar el tramo levantado si hace falta: se repite el último fotograma con mano y se corre lo que sigue.
  let out = frames
  const lack = tEnd - frames[last].t
  if (lack > 0) {
    const step = frames.length > 1 ? (frames[frames.length - 1].t - frames[0].t) / (frames.length - 1) : 70
    const extra = Array.from({ length: Math.ceil(lack / step) }, (_, i) => ({ ...frames[last], t: frames[last].t + (i + 1) * step }))
    const shift = extra.length * step
    out = [...frames.slice(0, last + 1), ...extra, ...frames.slice(last + 1).map((f) => ({ ...f, t: f.t + shift }))]
  }
  const curled = out.map((f) => {
    if (f.t < t0 || f.t > tEnd) return f
    const k = style.depth * (1 - Math.cos(2 * Math.PI * style.hz * ((f.t - t0) / 1000))) / 2
    const h = dominantHand(f)
    return h ? { ...f, hands: f.hands.map((x) => (x === h ? { ...x, points: curlFingers(x.points, fingers, k, aspect) } : x)) } : f
  })
  const n = base + 5
  return finishTake({ ...take, id, task: `num-${n}`, label: String(n), source: take.source ?? take.id }, curled)
}

// ── Ruido del detector ──

function noisy(frames: Frame[], v: Variation, r: Rng): Frame[] {
  let lost = 0
  return frames.map((f) => {
    if (lost > 0) { lost--; return { ...f, hands: [] } }
    if (r() < v.drop) { lost = Math.floor(between(r, 0, 4)); return { ...f, hands: [] } }
    let hands = f.hands.map((h) => {
      const ox = gauss(r) * v.jitter * 0.5, oy = gauss(r) * v.jitter * 0.5
      return {
        side: r() < v.swap ? (h.side === "Left" ? "Right" : "Left") : h.side,
        score: h.score,
        points: h.points.map((p) => ({ x: p.x + ox + gauss(r) * v.jitter * 0.4, y: p.y + oy + gauss(r) * v.jitter * 0.4, z: p.z + gauss(r) * v.jitter })),
      }
    })
    if (hands.length > 1 && r() < v.loseSecond) hands = [hands.reduce((a, b) => (a.points[0].y < b.points[0].y ? a : b))]
    const pose = f.pose
      ? f.pose.map((p, i) => ({
          x: p.x + gauss(r) * v.jitter * 0.5, y: p.y + gauss(r) * v.jitter * 0.5, z: p.z,
          v: v.hideElbows && (i === POSE.leftElbow || i === POSE.rightElbow) ? 0.15 : p.v,
        }))
      : null
    return { t: f.t, hands, pose }
  })
}

// ── Variantes de una toma ──

const aspectOf = (pkg: CapturePackage) => (pkg.camera ? pkg.camera.width / pkg.camera.height : 16 / 9)

/** Una variante simulada de una toma real, como la haría `persona` frente a otra cámara. */
export function varyTake(take: Take, persona: Persona, r: Rng, aspect: number, suffix = persona.id): Take {
  const v = makeVariation(r, persona)
  let frames = take.frames.map(decodeFrame)
  const n = Number(take.label)
  if (v.extraCycle && n >= 6 && n <= 9) frames = repeatCycle(frames, n - 5)
  if (persona.leftHanded) frames = frames.map(mirrorFrame)
  const body = frames.map((f) => bodyFrame(f.pose, aspect)).find(Boolean) ?? { cx: aspect / 2, cy: 0.55 }
  frames = frames.map((f) => transformFrame(f, persona, v, aspect, body))
  frames = noisy(retime(frames, v, r), v, r)
  return finishTake({ ...take, id: `${take.id}~${suffix}`, source: take.source ?? take.id }, frames)
}

function finishTake(base: Take, frames: Frame[]): Take {
  const dur = frames.length ? frames[frames.length - 1].t - frames[0].t : 0
  return {
    ...base,
    durationMs: Math.round(dur),
    fps: dur > 0 ? Math.round(((frames.length - 1) * 1000) / dur) : 0,
    handRatio: frames.length ? Math.round((frames.filter((f) => f.hands.length).length / frames.length) * 100) / 100 : 0,
    frames: frames.map((f) => encodeFrame(f, frames[0]?.t ?? 0)),
  }
}

// ── Negativos simulados ──

/**
 * "Nada": persona quieta que en un momento se lleva la mano a la cara (rascarse, acomodarse) y la baja.
 * Se arma con un cuerpo real y una mano real relajada o cerrada, movida por una trayectoria nueva.
 */
export function fidgetTake(bodies: Frame[], relaxed: Point[][], r: Rng, id: string): Take | null {
  const withPose = bodies.filter((f) => f.pose)
  if (!withPose.length || !relaxed.length) return null
  const pose = withPose[Math.floor(r() * withPose.length)].pose!
  const hand = relaxed[Math.floor(r() * relaxed.length)]
  const side = r() < 0.5 ? 0 : 1
  const elbow = pose[side ? POSE.rightElbow : POSE.leftElbow]
  const nose = pose[POSE.nose]
  const rest = { x: elbow.x, y: elbow.y + 0.12 }
  const goal = r() < 0.6 ? { x: nose.x + between(r, -0.06, 0.06), y: nose.y + between(r, 0, 0.08) } : { x: between(r, 0.3, 0.7), y: elbow.y - between(r, 0.02, 0.1) }
  const dur = between(r, 2500, 4500)
  const up = between(r, 0.2, 0.35), hold = between(r, 0.15, 0.4)
  const frames: Frame[] = []
  for (let t = 0; t <= dur; t += 1000 / 15) {
    const u = t / dur
    const k = u < up ? u / up : u < up + hold ? 1 : u < up * 2 + hold ? 1 - (u - up - hold) / up : 0
    const s = k * k * (3 - 2 * k) // suave al subir y al bajar
    const wx = lerp(rest.x, goal.x, s), wy = lerp(rest.y, goal.y, s)
    const pts = hand.map((p) => ({ x: p.x - hand[0].x + wx, y: p.y - hand[0].y + wy, z: p.z }))
    frames.push({ t, hands: wy < 0.98 ? [{ side: side ? "Left" : "Right", score: 0.9, points: pts }] : [], pose })
  }
  return finishTake({ id, task: "nada", label: "nada", variant: false, at: "", durationMs: 0, fps: 0, handRatio: 0, frames: [] }, frames)
}

/** "Otra": una seña real al revés en el tiempo (mismas formas, otro movimiento). */
export function reversedTake(take: Take, id: string): Take {
  const frames = take.frames.map(decodeFrame)
  const end = frames[frames.length - 1]?.t ?? 0
  return finishTake({ ...take, id, task: "otra", label: "otra", source: take.source ?? take.id }, frames.reverse().map((f) => ({ ...f, t: end - f.t })))
}

// ── Paquetes simulados ──

export interface SimulateOptions {
  personas: number
  seed: number
  /** Solo se simulan las tomas que cumplan esta condición (p. ej. las de entrenamiento de un grupo). */
  filter?: (take: Take) => boolean
  /** Para qué se simula: entrenar (por defecto) exige permiso de entrenar; evaluar, permiso de evaluar. */
  purpose?: "training" | "evaluation"
}

/** Los paquetes de datasets públicos se simulan con 1 de cada PUBLIC_SHARE personas. */
const PUBLIC_SHARE = 6

/** Fracción de tomas de 1–4 que además se convierten en 6–9 por persona simulada. */
const FLEX_SHARE = 0.5

/** Tareas que se simulan como "otra" al revés: señas con movimiento propio. */
const REVERSIBLE = new Set(["tramite-asignar", "tramite-cancelar", "tramite-facturar", "si-mano", "no-indice"])

/**
 * Un paquete simulado por persona: una variante de cada toma real + negativos (nada y otra).
 * Solo usa paquetes con permiso para ese fin (entrenar, por defecto, o evaluar).
 */
export function* simulate(packages: CapturePackage[], opts: SimulateOptions): Generator<CapturePackage> {
  const purpose = opts.purpose ?? "training"
  const sources = packages.filter((p) => p.consent[purpose] && !p.synthetic)
  for (let k = 0; k < opts.personas; k++) {
    const pid = `SIM-${String(k + 1).padStart(3, "0")}`
    const r = rng(hashSeed(`${opts.seed}:${pid}`))
    const persona = makePersona(r, pid)
    for (const pkg of sources) {
      // Los datasets públicos ya traen muchas personas reales: basta con menos variantes simuladas.
      if (pkg.origin && k >= Math.ceil(opts.personas / PUBLIC_SHARE)) continue
      const aspect = aspectOf(pkg)
      const takes = pkg.takes.filter((t) => !opts.filter || opts.filter(t))
      const out = takes.map((t) => varyTake(t, persona, r, aspect))
      // 6–9 fabricados: la mitad de las tomas de 1–4 también se doblan y estiran, con otro ritmo y profundidad.
      for (const t of takes) {
        if (!FLEX_BASE[Number(t.label)] || !t.task.startsWith("num-") || r() >= FLEX_SHARE) continue
        const f = flexTake(t, makeFlexStyle(r), aspect)
        if (f) out.push(varyTake(f, persona, r, aspect))
      }
      // Negativos: 1 de cada 4 tomas con movimiento propio va también al revés; y movimientos sin seña.
      for (const t of takes) {
        if (REVERSIBLE.has(t.task) && r() < 0.25) out.push(varyTake(reversedTake(t, `${t.id}~rev`), persona, r, aspect))
      }
      const bodies = takes.flatMap((t) => t.frames.slice(0, 3).map(decodeFrame))
      const relaxed = takes.filter((t) => t.task === "nada" || t.task === "si-mano").flatMap((t) => t.frames.map(decodeFrame).flatMap((f) => {
        const h = dominantHand(f)
        return h && fingerExtension(h.points).slice(1).every((e) => e < 0.45) ? [h.points] : []
      }))
      const fidgets = Math.max(2, Math.round(takes.length / 15))
      for (let i = 0; i < fidgets; i++) {
        const f = fidgetTake(bodies, relaxed, r, `${pkg.id}~nada${i}`)
        if (f) out.push(varyTake({ ...f, source: `${pkg.id}~nada${i}` }, persona, r, aspect))
      }
      yield {
        ...pkg,
        id: `${pkg.id}~${pid}`,
        signer: { code: pid, profile: { mano: persona.leftHanded ? "izquierda" : "derecha" } },
        validations: [], trials: [], takes: out,
        synthetic: { from: pkg.id, persona: pid, seed: opts.seed },
      }
    }
  }
}
