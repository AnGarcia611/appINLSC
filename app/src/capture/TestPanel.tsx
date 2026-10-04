import { useEffect, useRef, useState } from "react"
import Icon from "../shared/Icon"
import VisionCamera, { type VisionStatus } from "../vision/VisionCamera"
import { HeadGestureDetector } from "../vision/head"
import { NumberRecognizer } from "../vision/numbers"
import { loadNumberTemplates } from "../vision/templates"
import type { Frame } from "../vision/types"
import type { Trial } from "./format"

type Result = { task: Trial["task"]; predicted: string; confidence: number }

const CHOICES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "sí", "no"]

/** El señante prueba el reconocimiento en vivo y marca si acertó: cada intento queda como dato de evaluación real. */
export default function TestPanel({ stream, trials, onTrial, onBack }: { stream: MediaStream; trials: Trial[]; onTrial: (t: Trial) => void; onBack: () => void }) {
  const numbers = useRef<NumberRecognizer | null>(null)
  const head = useRef(new HeadGestureDetector())
  const [status, setStatus] = useState<VisionStatus>({ state: "cargando" })
  const [result, setResult] = useState<Result | null>(null)
  const [correcting, setCorrecting] = useState(false)
  const pending = useRef(false)

  useEffect(() => { loadNumberTemplates().then((templates) => { numbers.current = new NumberRecognizer({ templates }) }) }, [])

  const onFrame = (frame: Frame) => {
    if (pending.current) return // espera la respuesta ✓/✗ antes de reconocer otra seña
    const n = numbers.current?.push(frame)
    const h = head.current.push(frame)
    const r: Result | null = n ? { task: "número", predicted: String(n.value), confidence: n.confidence } : h ? { task: "cabeza", predicted: h.value, confidence: h.confidence } : null
    if (r) { pending.current = true; setResult(r); setCorrecting(false) }
  }

  const answer = (correct: boolean, expected?: string) => {
    if (!result) return
    onTrial({ task: result.task, expected: expected ?? result.predicted, predicted: result.predicted, confidence: result.confidence, correct, at: new Date().toISOString() })
    next()
  }
  /** "No hice ninguna seña": falso positivo. */
  const falsePositive = () => {
    if (!result) return
    onTrial({ task: result.task, expected: "ninguna", predicted: result.predicted, confidence: result.confidence, correct: false, at: new Date().toISOString() })
    next()
  }
  /** El reconocedor no respondió a una seña: se registra como fallo sin predicción. */
  const missed = (expected: string) => {
    onTrial({ task: expected === "sí" || expected === "no" ? "cabeza" : "número", expected, predicted: null, confidence: null, correct: false, at: new Date().toISOString() })
    next()
  }
  const next = () => {
    setResult(null)
    setCorrecting(false)
    numbers.current?.reset()
    head.current.reset()
    pending.current = false
  }

  const ok = trials.filter((t) => t.correct).length
  return (
    <div>
      <div className="cap-task-head">
        <button className="cap-btn ghost sm" onClick={onBack}>← Lista de señas</button>
        <h1>Probar el reconocimiento</h1>
      </div>
      <div className="rec">
        <div className="rec-stage"><VisionCamera stream={stream} onFrame={onFrame} onStatus={setStatus} /></div>
        <div className="rec-side" aria-live="polite">
          <p className="rec-instruction">Haga la seña de un número del 1 al 9, o asienta o niegue con la cabeza.</p>
          {status.state === "listo" && <p className="cap-muted">Cámara lista · {status.delegate} · {status.fps} fps</p>}
          {status.state === "error" && <p className="rec-warn"><Icon name="warning" fill /> {status.message}</p>}

          {result ? (
            <div className="test-result">
              <span className="test-big">{result.predicted}</span>
              <span>Entendí <b>{result.task === "cabeza" ? `“${result.predicted}” con la cabeza` : `el número ${result.predicted}`}</b> · {result.confidence} %</span>
              {!correcting ? (
                <div className="cap-row">
                  <button className="cap-btn primary" onClick={() => answer(true)}><Icon name="check" /> Acertó</button>
                  <button className="cap-btn ghost" onClick={() => setCorrecting(true)}><Icon name="close" /> No acertó</button>
                </div>
              ) : (
                <>
                  <p>¿Qué seña hizo?</p>
                  <div className="cap-chips">
                    {CHOICES.map((c) => <button key={c} onClick={() => answer(false, c)}>{c}</button>)}
                    <button onClick={falsePositive}>No hice ninguna seña</button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <p className="rec-hint">Esperando una seña…</p>
              <details className="cap-missed">
                <summary>Hice una seña y no la reconoció</summary>
                <div className="cap-chips">{CHOICES.map((c) => <button key={c} onClick={() => missed(c)}>{c}</button>)}</div>
              </details>
            </>
          )}
          <p className="cap-muted">Pruebas registradas: {trials.length} · aciertos: {ok}</p>
        </div>
      </div>
    </div>
  )
}
