import { useEffect, useRef, useState } from "react"
import Icon from "../shared/Icon"
import type { Recognize } from "../shared/types"
import VisionCamera, { type VisionStatus } from "../vision/VisionCamera"
import { NumberRecognizer, type NumberResult, type RecognizerPhase } from "../vision/numbers"
import { loadNumberTemplates } from "../vision/templates"
import type { Frame } from "../vision/types"

interface Props {
  stream: MediaStream
  recognize: Extract<Recognize, { task: "number" }>
  /** Del estado actual: al cambiar (otro paso u otras opciones) se reinicia el reconocimiento. */
  seq: number
  /** `seq`: el del estado con el que se creó el reconocedor (no el actual): un resultado de otro paso se descarta en el panel. */
  onSign: (result: NumberResult, seq: number) => void
}

/** Cámara pequeña + lo que la tablet entendió. Todo se procesa aquí: el video no sale de la tablet. */
export default function SignPanel({ stream, recognize, seq, onSign }: Props) {
  const recognizer = useRef<NumberRecognizer | null>(null)
  const recognizerSeq = useRef(seq)
  const [status, setStatus] = useState<VisionStatus>({ state: "cargando" })
  const [phase, setPhase] = useState<RecognizerPhase>("reposo")
  const [last, setLast] = useState<NumberResult | null>(null)
  const send = useRef(onSign)
  send.current = onSign

  useEffect(() => {
    let alive = true
    recognizer.current = null
    setLast(null)
    setPhase("reposo")
    loadNumberTemplates().then((templates) => {
      if (alive) { recognizer.current = new NumberRecognizer({ max: recognize.max, templates }); recognizerSeq.current = seq }
    })
    return () => { alive = false }
  }, [seq, recognize.max])

  const onFrame = (frame: Frame) => {
    const r = recognizer.current
    if (!r) return
    const result = r.push(frame)
    setPhase((p) => (p === r.phase ? p : r.phase))
    if (result) { setLast(result); send.current(result, recognizerSeq.current) }
  }

  const sure = last && last.confidence >= 70
  return (
    <div className={`sign-panel ${sure ? "is-match" : ""} ${status.state === "error" ? "is-error" : ""}`} aria-live="polite">
      <VisionCamera stream={stream} onFrame={onFrame} onStatus={setStatus} />
      <div className="sign-panel-text">
        {status.state === "error" ? (
          <><strong><Icon name="touch_app" /> Toque su opción</strong><small>El reconocimiento de señas no está disponible en esta tablet.</small></>
        ) : status.state === "cargando" ? (
          <><strong>Preparando la cámara…</strong><small>Mientras tanto puede tocar su opción.</small></>
        ) : last ? (
          <>
            <span className="sign-big">{last.value}</span>
            <strong>{sure ? "Entendí este número" : `¿Es el ${last.value}?`}</strong>
            <small>{sure ? "Si no es correcto, repita la seña o toque su opción." : "Repita la seña con calma o toque su opción."}</small>
          </>
        ) : (
          <>
            <strong><Icon name="front_hand" fill /> {phase === "señando" ? "Viendo su seña…" : "Haga la seña del número"}</strong>
            <small>Levante la mano frente a la cámara. También puede tocar su opción.</small>
          </>
        )}
      </div>
    </div>
  )
}
