import { useEffect, useRef, useState } from "react"
import Icon from "../shared/Icon"
import { PATHS } from "../shared/flows"
import type { SignGuess } from "../shared/types"
import VisionCamera, { type VisionStatus } from "../vision/VisionCamera"
import { IntentArbiter } from "../vision/intent"
import type { SignPhase } from "../vision/signs"
import { loadNumberTemplates, loadSignTemplates } from "../vision/templates"
import type { Frame } from "../vision/types"

interface Props {
  stream: MediaStream
  /** Del estado actual: al cambiar (p. ej. "Volver a captar seña") se reinicia el reconocimiento. */
  seq: number
  /** Opciones numeradas que también se pueden pedir con la seña del número (0 = solo la seña libre del trámite). */
  numbers?: number
  /**
   * `value` = índice del trámite en PATHS; `by`: con la seña libre o con la seña del número.
   * `seq`: el del estado con el que se creó el reconocedor (no el actual): un resultado de otro paso se descarta en el panel.
   */
  onSign: (result: SignGuess & { alternatives: SignGuess[]; by: "seña" | "número" }, seq: number) => void
}

/**
 * Cámara de la detección del trámite: reconoce la seña libre (asignar, cancelar o facturar) y, si el funcionario lo
 * activó, la seña del número de la opción (1, 2, 3). Si hay duda entre las dos, manda la seña libre (ver vision/intent.ts).
 * Todo se procesa en la tablet: solo sale el resultado (trámite + confianza), nunca el video.
 */
export default function IntentPanel({ stream, seq, numbers = 0, onSign }: Props) {
  const arbiter = useRef<IntentArbiter | null>(null)
  const arbiterSeq = useRef(seq)
  const [status, setStatus] = useState<VisionStatus>({ state: "cargando" })
  const [phase, setPhase] = useState<SignPhase>("reposo")
  const [pendingNumber, setPendingNumber] = useState<number | null>(null)
  const [done, setDone] = useState(false)
  const [missing, setMissing] = useState(false)
  const send = useRef(onSign)
  send.current = onSign

  useEffect(() => {
    let alive = true
    arbiter.current = null
    setPhase("reposo")
    setPendingNumber(null)
    setDone(false)
    const settings = stream.getVideoTracks()[0]?.getSettings()
    const aspect = settings?.width && settings?.height ? settings.width / settings.height : 16 / 9
    Promise.all([loadSignTemplates(), numbers > 0 ? loadNumberTemplates() : Promise.resolve([])]).then(([templates, numberTemplates]) => {
      if (!alive) return
      setMissing(!templates)
      if (templates) { arbiter.current = new IntentArbiter({ templates, numberTemplates, numbers, aspect }); arbiterSeq.current = seq }
    })
    return () => { alive = false }
  }, [seq, stream, numbers])

  const onFrame = (frame: Frame) => {
    const a = arbiter.current
    if (!a) return
    const d = a.push(frame)
    setPhase((p) => (p === a.phase ? p : a.phase))
    setPendingNumber((p) => (p === a.pendingNumber ? p : a.pendingNumber))
    if (!d || !PATHS[d.intent]) return
    setDone(true)
    send.current({ value: d.intent, confidence: d.confidence, alternatives: d.alternatives, by: d.by }, arbiterSeq.current)
  }

  const text = status.state === "error" || missing
    ? "Toque su opción debajo de la cámara."
    : status.state === "cargando" ? "Preparando la cámara…"
    : done ? "Listo. Espere la confirmación de recepción."
    : pendingNumber ? `Viendo el número ${pendingNumber}…`
    : phase === "señando" ? "Viendo su seña…"
    : numbers > 0 ? "Haga la seña de su solicitud o del número, o toque su opción"
    : "Haga la seña de su solicitud o toque su opción"

  return (
    <div className="tab-camera tab-camera-vision">
      <VisionCamera stream={stream} onFrame={onFrame} onStatus={setStatus} />
      <div className="tab-guide"><span>Ubique sus manos dentro del recuadro</span></div>
      <span className="tab-live"><Icon name="radio_button_checked" /> Cámara activa</span>
      <div className={`tab-sign-status ${done ? "reconocido" : phase}`} aria-live="polite">
        <Icon name={done ? "check_circle" : "front_hand"} fill />{text}
      </div>
    </div>
  )
}
