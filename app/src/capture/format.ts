// Formato del paquete que envía la página de captura (`/?captura`) y que lee `npm run dataset`.
// Sin dependencias del navegador: también lo usa Node.
//
// Solo se guardan puntos de referencia (manos y parte superior del cuerpo), nunca imágenes ni video.
import type { Frame } from "../vision/types.ts"
import { POSE_KEEP } from "../vision/types.ts"

export const PACKAGE_FORMAT = "inlsc-captura"
export const PACKAGE_VERSION = 1

/** Mano compacta: lado según MediaPipe, puntaje y 21 × (x, y, z) redondeados. */
export interface CompactHand { s: string; c: number; p: number[] }
/** Fotograma compacto. `t` en ms desde el inicio de la toma; `b` = cuerpo 25 × (x, y, z, visibilidad) o null. */
export interface CompactFrame { t: number; h: CompactHand[]; b: number[] | null }

export interface Take {
  id: string
  /** Id de la tarea (`tasks.ts`), p. ej. "num-7". */
  task: string
  /** Etiqueta para entrenar, p. ej. "7", "sí", "asignar". */
  label: string
  /** El señante dijo que hace la seña distinto a la referencia. */
  variant: boolean
  at: string
  durationMs: number
  fps: number
  /** Fracción de fotogramas con al menos una mano detectada. */
  handRatio: number
  frames: CompactFrame[]
  /** Solo en tomas simuladas (`synth.ts`): id de la toma real de la que salió. */
  source?: string
  /**
   * Grupo para separar entrenamiento y prueba: las tomas del mismo grupo van siempre al mismo lado.
   * En datos públicos es el señante, para medir con personas que el modelo no vio. Sin grupo: cada toma es su grupo.
   */
  group?: string
}

/** Paquete importado de un dataset público (no viene de `/?captura`). */
export interface Origin { dataset: string; license: string; citation: string; url: string }

/** Respuesta de la validación de vocabulario: ¿así hace usted esta seña? */
export interface Validation { task: string; matches: boolean; comment?: string; at: string }

/** Prueba del reconocedor: qué entendió y si acertó según el señante. */
export interface Trial { task: "número" | "cabeza" | "trámite"; expected: string; predicted: string | null; confidence: number | null; correct: boolean; at: string }

export interface Profile {
  audicion?: "sordo" | "hipoacúsico" | "oyente"
  rol?: "usuario LSC" | "intérprete" | "docente o modelo LSC" | "otro"
  mano?: "derecha" | "izquierda" | "ambas"
  edad?: "menos de 18" | "18–29" | "30–44" | "45–59" | "60 o más"
  region?: string
  aniosLSC?: "menos de 2" | "2–5" | "6–10" | "más de 10"
}

export interface Consent {
  version: string
  acceptedAt: string
  /** Usar las tomas para entrenar el reconocedor. */
  training: boolean
  /** Usar las tomas para medir qué tan bien funciona. */
  evaluation: boolean
}

export interface CapturePackage {
  format: typeof PACKAGE_FORMAT
  version: typeof PACKAGE_VERSION
  id: string
  createdAt: string
  updatedAt: string
  app: { mediapipe: string; models: Record<string, string> }
  camera: { width: number; height: number } | null
  consent: Consent
  signer: { code: string; profile: Profile }
  validations: Validation[]
  takes: Take[]
  trials: Trial[]
  /** Solo en paquetes simulados: no son de una persona real y nunca se usan para evaluar. */
  synthetic?: { from: string; persona: string; seed: number }
  /** Solo en paquetes importados de un dataset público (`scripts/importar_lsc54.py`). */
  origin?: Origin
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4
const r2 = (x: number) => Math.round(x * 100) / 100

export function encodeFrame(f: Frame, t0: number): CompactFrame {
  return {
    t: Math.round(f.t - t0),
    h: f.hands.map((h) => ({ s: h.side, c: r2(h.score), p: h.points.flatMap((p) => [r4(p.x), r4(p.y), r4(p.z)]) })),
    b: f.pose ? f.pose.slice(0, POSE_KEEP).flatMap((p) => [r4(p.x), r4(p.y), r4(p.z), r2(p.v ?? 1)]) : null,
  }
}

export function decodeFrame(c: CompactFrame): Frame {
  const pts = (a: number[], step: number) =>
    Array.from({ length: a.length / step }, (_, i) => ({ x: a[i * step], y: a[i * step + 1], z: a[i * step + 2], ...(step === 4 ? { v: a[i * step + 3] } : {}) }))
  return { t: c.t, hands: c.h.map((h) => ({ side: h.s, score: h.c, points: pts(h.p, 3) })), pose: c.b ? pts(c.b, 4) : null }
}

/** Revisión mínima de un paquete recibido; devuelve los problemas encontrados (vacío = válido). */
export function validatePackage(p: unknown): string[] {
  const errors: string[] = []
  const pkg = p as Partial<CapturePackage>
  if (pkg?.format !== PACKAGE_FORMAT) errors.push("no es un paquete de captura de InLSC")
  if (pkg?.version !== PACKAGE_VERSION) errors.push(`versión ${String(pkg?.version)} no soportada`)
  if (!pkg?.consent?.acceptedAt) errors.push("sin consentimiento registrado")
  if (!pkg?.signer?.code) errors.push("sin código de señante")
  if (!Array.isArray(pkg?.takes)) errors.push("sin tomas")
  for (const t of pkg?.takes ?? []) {
    if (!t.id || !t.label || !Array.isArray(t.frames)) { errors.push(`toma inválida ${t.id ?? "?"}`); break }
    if (t.frames.some((f) => f.h.some((h) => h.p.length !== 63) || (f.b && f.b.length !== POSE_KEEP * 4))) { errors.push(`toma ${t.id}: fotogramas con tamaño inesperado`); break }
  }
  return errors
}
