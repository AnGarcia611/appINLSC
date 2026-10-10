// Detección del trámite con dos formas de pedirlo: la seña libre (asignar, cancelar, facturar) y, si el funcionario lo
// activa, la seña del número de la opción en pantalla (1, 2, 3). Los dos reconocedores corren a la vez; esta clase decide.
//
// Regla: la seña libre manda. Un número se guarda como pendiente y se envía cuando la persona baja la mano o pasan
// NUMBER_HOLD_MS sin que la seña libre dé un trámite. Así, si al empezar la seña de un trámite la mano pasa por una forma
// de número (p. ej. un índice extendido = 1), el trámite reconocido después la reemplaza.
// Solo valen los números 1..`numbers` reconocidos tal cual: un 6–9 (la mano se movió) no se convierte en 1–4.
import type { Template } from "./knn.ts"
import { NumberRecognizer } from "./numbers.ts"
import { INTENT_LABELS, SignRecognizer, type SeqTemplateFile, type SignPhase } from "./signs.ts"
import type { Frame } from "./types.ts"

export interface IntentDecision {
  /** Cómo lo pidió: con la seña libre del trámite o con la seña del número de la opción. */
  by: "seña" | "número"
  /** Índice del trámite (0 = asignar, 1 = cancelar, 2 = facturar). */
  intent: number
  confidence: number
  alternatives: { value: number; confidence: number }[]
}

/** Espera máxima de un número pendiente con la mano arriba antes de enviarlo (la seña libre tarda ~2 s en decidir). */
export const NUMBER_HOLD_MS = 1500

export interface IntentArbiterOptions {
  templates: SeqTemplateFile
  numberTemplates?: Template[]
  /** Cuántas opciones numeradas hay (0 = sin seña del número). */
  numbers: number
  aspect?: number
  /** Espera de un número pendiente (ms); por defecto NUMBER_HOLD_MS. */
  holdMs?: number
}

export class IntentArbiter {
  private readonly signs: SignRecognizer
  private readonly digits: NumberRecognizer | null
  private readonly numbers: number
  private readonly holdMs: number
  private pending: { decision: IntentDecision; at: number } | null = null
  private wasUp = false

  constructor(opts: IntentArbiterOptions) {
    this.signs = new SignRecognizer({ accept: INTENT_LABELS, templates: opts.templates, aspect: opts.aspect })
    // max 9: un 6–9 se reconoce como tal y se descarta, en vez de convertirse en su alternativa 1–4.
    this.digits = opts.numbers > 0 ? new NumberRecognizer({ templates: opts.numberTemplates ?? [] }) : null
    this.numbers = opts.numbers
    this.holdMs = opts.holdMs ?? NUMBER_HOLD_MS
  }

  /** Fase para la vista: "señando" si cualquiera de los dos está viendo una seña. */
  get phase(): SignPhase {
    if (this.signs.phase === "reconocido") return "reconocido"
    return this.pending || this.signs.phase === "señando" || this.digits?.phase === "señando" ? "señando" : "reposo"
  }

  /** Número que se está por enviar (para mostrarlo en la tablet mientras se decide). */
  get pendingNumber(): number | null { return this.pending ? this.pending.decision.intent + 1 : null }

  reset() { this.signs.reset(); this.digits?.reset(); this.pending = null; this.wasUp = false }

  push(frame: Frame): IntentDecision | null {
    const s = this.signs.push(frame)
    if (s) {
      const intent = INTENT_LABELS.indexOf(s.value)
      if (intent >= 0) {
        this.pending = null
        return {
          by: "seña", intent, confidence: s.confidence,
          alternatives: s.alternatives.map((a) => ({ value: INTENT_LABELS.indexOf(a.value), confidence: a.confidence })).filter((a) => a.value >= 0),
        }
      }
    }
    if (!this.digits) return null

    const n = this.digits.push(frame)
    if (n) {
      if (n.value >= 1 && n.value <= this.numbers) {
        this.pending = {
          at: frame.t,
          decision: {
            by: "número", intent: n.value - 1, confidence: n.confidence,
            alternatives: n.alternatives.filter((a) => a.value >= 1 && a.value <= this.numbers).map((a) => ({ value: a.value - 1, confidence: a.confidence })),
          },
        }
      } else {
        // La mano se movió (6–9) o es otro número: lo pendiente no era una elección.
        this.pending = null
      }
    }

    // Se envía al bajar la mano o tras holdMs sin trámite.
    const up = this.digits.phase !== "reposo" || this.signs.phase === "señando"
    const lowered = this.wasUp && !up
    this.wasUp = up
    if (this.pending && (lowered || frame.t - this.pending.at >= this.holdMs)) {
      const d = this.pending.decision
      this.pending = null
      return d
    }
    return null
  }
}
