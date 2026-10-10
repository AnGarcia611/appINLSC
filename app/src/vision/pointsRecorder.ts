// Graba puntos (nunca imágenes) de un video que se está reproduciendo y los arma como tomas de captura.
// Los tiempos se guardan en tiempo del video: a 0.5× un tramo de 4 s del video dura 8 s en pantalla, pero la toma dura 4 s.
// Sin dependencias del navegador: también lo usan las pruebas.
import { PACKAGE_FORMAT, PACKAGE_VERSION, encodeFrame, type CapturePackage, type CompactFrame, type Origin, type Take } from "../capture/format.ts"
import type { Frame } from "./types.ts"

/** Etiquetas que se pueden asignar a lo grabado: tarea (`tasks.ts`) y etiqueta de entrenamiento. */
export const RECORD_LABELS: { id: string; task: string; label: string; title: string }[] = [
  { id: "otra", task: "otra", label: "otra", title: "Otra seña (no es de la app)" },
  { id: "nada", task: "nada", label: "nada", title: "Sin seña" },
  { id: "asignar", task: "tramite-asignar", label: "asignar", title: "Pedir una cita" },
  { id: "cancelar", task: "tramite-cancelar", label: "cancelar", title: "Cancelar una cita" },
  { id: "facturar", task: "tramite-facturar", label: "facturar", title: "Pagar o facturar una cita" },
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ id: String(n), task: `num-${n}`, label: String(n), title: `Número ${n}` })),
  { id: "si-mano", task: "si-mano", label: "sí", title: "Sí con la mano" },
  { id: "no-indice", task: "no-indice", label: "no", title: "No con el índice" },
  { id: "si-cabeza", task: "si-cabeza", label: "sí", title: "Sí con la cabeza" },
  { id: "no-cabeza", task: "no-cabeza", label: "no", title: "No con la cabeza" },
]

export interface RecorderOptions {
  /** Id de RECORD_LABELS. */
  label: string
  /** Código de la persona que seña: sus tomas van juntas al probar. */
  signer: string
  /** Partir en tomas de este largo (s de video); 0 = una toma por grabación. */
  chunkS: number
  /** Para el id de las tomas, p. ej. el id del video de YouTube. */
  source: string
  /** Separación mínima entre fotogramas guardados (ms de video): ~15 por segundo, como la tablet. */
  minGapMs?: number
}

interface Open { startWall: number; startVideo: number; rate: number; frames: CompactFrame[]; lastT: number; hands: number }

export class PointsRecorder {
  readonly takes: Take[] = []
  private open: Open | null = null
  private readonly gap: number
  private readonly opts: RecorderOptions

  constructor(opts: RecorderOptions) { this.opts = opts; this.gap = opts.minGapMs ?? 66 }

  get recording() { return this.open !== null }

  /** Empieza (o retoma tras una pausa) en `videoSec` del video, reproduciéndose a `rate`. */
  start(wallMs: number, videoSec: number, rate: number) {
    this.finish()
    this.open = { startWall: wallMs, startVideo: videoSec, rate, frames: [], lastT: -Infinity, hands: 0 }
  }

  /** Cierra la toma abierta (pausa, cambio de velocidad o fin de la grabación). */
  stop() { this.finish(); this.open = null }

  push(frame: Frame): void {
    const o = this.open
    if (!o) return
    const t = (frame.t - o.startWall) * o.rate
    if (this.opts.chunkS > 0 && t >= this.opts.chunkS * 1000) {
      // Cambio de tramo: la toma nueva empieza en este fotograma.
      const startVideo = o.startVideo + t / 1000
      const { rate } = o
      this.finish()
      this.open = { startWall: frame.t, startVideo, rate, frames: [], lastT: -Infinity, hands: 0 }
      return this.push(frame)
    }
    if (t - o.lastT < this.gap) return
    o.lastT = t
    if (frame.hands.length) o.hands++
    o.frames.push({ ...encodeFrame(frame, o.startWall), t: Math.round(t) })
  }

  private finish() {
    const o = this.open
    if (!o || o.frames.length < 3) return
    const dur = o.frames[o.frames.length - 1].t
    const def = RECORD_LABELS.find((l) => l.id === this.opts.label) ?? RECORD_LABELS[0]
    this.takes.push({
      id: `${this.opts.source}~${o.startVideo.toFixed(1)}`,
      task: def.task, label: def.label, variant: false, at: new Date().toISOString(),
      durationMs: dur, fps: dur > 0 ? Math.round(((o.frames.length - 1) * 1000) / dur) : 0,
      handRatio: Math.round((o.hands / o.frames.length) * 100) / 100,
      frames: o.frames, group: this.opts.signer,
    })
    o.frames = []
  }
}

export interface PackageInfo {
  signer: string
  origin: Origin
  takes: Take[]
  camera: { width: number; height: number } | null
  app: CapturePackage["app"]
}

/** Paquete de captura (mismo formato que `/?captura`) con la fuente citada en `origin`. */
export function recordedPackage(info: PackageInfo, now = new Date()): CapturePackage {
  const at = now.toISOString()
  return {
    format: PACKAGE_FORMAT, version: PACKAGE_VERSION,
    id: `${info.origin.dataset}-${info.signer}-${at}`, createdAt: at, updatedAt: at,
    app: info.app, camera: info.camera,
    consent: { version: `${info.origin.license} · ${info.origin.dataset}`, acceptedAt: at, training: true, evaluation: true },
    signer: { code: info.signer, profile: {} }, validations: [], takes: info.takes, trials: [], origin: info.origin,
  }
}
