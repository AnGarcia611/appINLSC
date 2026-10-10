import { useEffect, useRef, useState } from "react"
import Icon from "../shared/Icon"
import { PATHS } from "../shared/flows"
import type { SignGuess } from "../shared/types"
import VisionCamera, { type VisionStatus } from "../vision/VisionCamera"
import { INTENT_LABELS, SignRecognizer, type SignPhase } from "../vision/signs"
import { loadSignTemplates } from "../vision/templates"
import type { Frame } from "../vision/types"

interface Props {
  stream: MediaStream
  /** Del estado actual: al cambiar (p. ej. "Volver a captar seña") se reinicia el reconocimiento. */
  seq: number
  /** `value` = índice del trámite en PATHS. */
  onSign: (result: SignGuess & { alternatives: SignGuess[] }) => void
}

/**
 * Cámara de la detección del trámite con el reconocimiento de la seña (asignar, cancelar o facturar).
 * Todo se procesa en la tablet: solo sale el resultado (trámite + confianza), nunca el video.
 */
export default function IntentPanel({ stream, seq, onSign }: Props) {
  const recognizer = useRef<SignRecognizer | null>(null)
  const [status, setStatus] = useState<VisionStatus>({ state: "cargando" })
  const [phase, setPhase] = useState<SignPhase>("reposo")
  const [missing, setMissing] = useState(false)
  const send = useRef(onSign)
  send.current = onSign

  useEffect(() => {
    let alive = true
    recognizer.current = null
    setPhase("reposo")
    const settings = stream.getVideoTracks()[0]?.getSettings()
    const aspect = settings?.width && settings?.height ? settings.width / settings.height : 16 / 9
    loadSignTemplates().then((templates) => {
      if (!alive) return
      setMissing(!templates)
      if (templates) recognizer.current = new SignRecognizer({ accept: INTENT_LABELS, templates, aspect })
    })
    return () => { alive = false }
  }, [seq, stream])

  const onFrame = (frame: Frame) => {
    const r = recognizer.current
    if (!r) return
    const result = r.push(frame)
    setPhase((p) => (p === r.phase ? p : r.phase))
    if (!result) return
    const index = INTENT_LABELS.indexOf(result.value)
    if (index < 0 || !PATHS[index]) return
    send.current({
      value: index, confidence: result.confidence,
      alternatives: result.alternatives.map((a) => ({ value: INTENT_LABELS.indexOf(a.value), confidence: a.confidence })).filter((a) => a.value >= 0),
    })
  }

  const text = status.state === "error" || missing
    ? "Toque su opción debajo de la cámara."
    : status.state === "cargando" ? "Preparando la cámara…"
    : phase === "señando" ? "Viendo su seña…"
    : phase === "reconocido" ? "Listo. Espere la confirmación de recepción."
    : "Haga la seña de su solicitud o toque su opción"

  return (
    <div className="tab-camera tab-camera-vision">
      <VisionCamera stream={stream} onFrame={onFrame} onStatus={setStatus} />
      <div className="tab-guide"><span>Ubique sus manos dentro del recuadro</span></div>
      <span className="tab-live"><Icon name="radio_button_checked" /> Cámara activa</span>
      <div className={`tab-sign-status ${phase}`} aria-live="polite">
        <Icon name={phase === "reconocido" ? "check_circle" : "front_hand"} fill />{text}
      </div>
    </div>
  )
}
