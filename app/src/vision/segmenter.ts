// ¿Está señando? Detecta cuándo empieza y termina un tramo con la mano levantada.
import { dominantHand, isRaised } from "./features.ts"
import type { Frame, HandObs } from "./types.ts"

export interface SegmenterOptions {
  /** Tiempo sin mano levantada para dar por terminada la seña (histéresis contra parpadeos del detector). */
  restMs?: number
  /** Duración mínima de una seña válida. */
  minMs?: number
}

export type SegmentEvent = { type: "start"; t: number } | { type: "end"; t: number; durationMs: number; valid: boolean }

/**
 * Máquina de estados reposo → señando → reposo.
 * Empieza con el primer fotograma con la mano levantada; termina tras `restMs` sin mano levantada.
 */
export class Segmenter {
  active = false
  startedAt = 0
  private lastActiveAt = 0
  private readonly restMs: number
  private readonly minMs: number

  constructor(opts: SegmenterOptions = {}) {
    this.restMs = opts.restMs ?? 350
    this.minMs = opts.minMs ?? 300
  }

  /** Devuelve la mano que está señando (o null) y, si cambió el estado, el evento. */
  push(frame: Frame): { hand: HandObs | null; event: SegmentEvent | null } {
    const hand = dominantHand(frame)
    const raised = !!hand && isRaised(hand, frame.pose)
    if (raised) {
      this.lastActiveAt = frame.t
      if (!this.active) {
        this.active = true
        this.startedAt = frame.t
        return { hand, event: { type: "start", t: frame.t } }
      }
      return { hand, event: null }
    }
    if (this.active && frame.t - this.lastActiveAt >= this.restMs) {
      this.active = false
      const durationMs = this.lastActiveAt - this.startedAt
      return { hand: null, event: { type: "end", t: frame.t, durationMs, valid: durationMs >= this.minMs } }
    }
    return { hand: this.active ? hand : null, event: null }
  }

  reset() { this.active = false; this.startedAt = 0; this.lastActiveAt = 0 }
}
