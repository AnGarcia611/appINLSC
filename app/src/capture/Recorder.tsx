import { useEffect, useRef, useState } from "react"
import Icon from "../shared/Icon"
import VisionCamera, { draw, type VisionStatus } from "../vision/VisionCamera"
import { Segmenter } from "../vision/segmenter"
import type { Frame } from "../vision/types"
import { decodeFrame, encodeFrame, type CompactFrame, type Take } from "./format"
import type { SignTask } from "./tasks"

/**
 * Tope por defecto de una toma "seña" (cada tarea puede tener el suyo: los trámites, 20 s), tiempo con la mano
 * abajo para darla por terminada, y tiempo máximo esperando a que aparezca la mano.
 * Historia: era 6 s y en la captura S-9BST todas las tomas de trámites llegaron al tope, incompletas.
 */
const MAX_MS = 12000
const REST_MS = 500
const WAIT_MS = 8000
/** En los últimos segundos la barra de tiempo avisa que la grabación está por terminar. */
const WARN_MS = 3000

type StopReason = "fin" | "tiempo" | "sin-mano" | "manual"

const secs = (ms: number) => `0:${String(Math.max(0, Math.ceil(ms / 1000))).padStart(2, "0")}`

type Phase =
  | { kind: "listo" }
  | { kind: "cuenta"; n: number }
  | { kind: "grabando"; startedAt: number }
  | { kind: "revisar"; take: Take; warning: string | null; reason: StopReason }

interface Props {
  task: SignTask
  stream: MediaStream
  variant: boolean
  done: number
  onSave: (take: Take) => void
}

/** Grabación guiada de una toma: cuenta regresiva → grabación (corte automático) → repetición del esqueleto → guardar o repetir. */
export default function Recorder({ task, stream, variant, done, onSave }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "listo" })
  const [status, setStatus] = useState<VisionStatus>({ state: "cargando" })
  const rec = useRef<{ t0: number; frames: CompactFrame[]; seg: Segmenter; started: boolean; withHand: number } | null>(null)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const [elapsed, setElapsed] = useState(0)
  const limit = task.mode === "fija" ? task.durationMs ?? 3000 : task.maxMs ?? MAX_MS

  // Reloj visible mientras graba.
  useEffect(() => {
    if (phase.kind !== "grabando") return
    setElapsed(0)
    const id = setInterval(() => setElapsed(performance.now() - phase.startedAt), 200)
    return () => clearInterval(id)
  }, [phase])

  // Cuenta regresiva 3-2-1.
  useEffect(() => {
    if (phase.kind !== "cuenta") return
    const id = setTimeout(() => {
      if (phase.n > 1) setPhase({ kind: "cuenta", n: phase.n - 1 })
      else {
        rec.current = { t0: performance.now(), frames: [], seg: new Segmenter({ restMs: task.restMs ?? REST_MS }), started: false, withHand: 0 }
        setPhase({ kind: "grabando", startedAt: performance.now() })
      }
    }, 800)
    return () => clearTimeout(id)
  }, [phase])

  const finish = (reason: StopReason) => {
    const r = rec.current
    rec.current = null
    if (!r) return
    const durationMs = r.frames.length ? r.frames[r.frames.length - 1].t : 0
    const handRatio = r.frames.length ? r.withHand / r.frames.length : 0
    const take: Take = {
      id: crypto.randomUUID(), task: task.id, label: task.label, variant, at: new Date().toISOString(),
      durationMs, fps: durationMs ? Math.round((r.frames.length * 1000) / durationMs) : 0, handRatio: Math.round(handRatio * 100) / 100, frames: r.frames,
    }
    let warning: string | null = null
    if (reason === "sin-mano") warning = "No se vio la mano levantada. Ubíquese frente a la cámara y levante la mano para señar."
    else if (reason === "tiempo" && task.mode === "seña") warning = `Se llegó al máximo de ${limit / 1000} segundos. Si no alcanzó a terminar la seña, toque Repetir.`
    else if (task.mode === "seña" && handRatio < 0.5) warning = "La mano no se vio bien en buena parte de la toma. Revise la luz y que la mano quede dentro del recuadro."
    else if (task.mode === "fija" && !r.frames.some((f) => f.b)) warning = "No se vio bien su cuerpo. Aléjese un poco para que se vean la cabeza y los hombros."
    else if (r.frames.length < 8) warning = "La toma quedó muy corta."
    setPhase({ kind: "revisar", take, warning, reason })
  }

  const onFrame = (frame: Frame) => {
    const r = rec.current
    if (!r || phaseRef.current.kind !== "grabando") return
    r.frames.push(encodeFrame(frame, r.t0))
    if (frame.hands.length) r.withHand++
    const elapsed = frame.t - r.t0
    if (task.mode === "fija") {
      if (elapsed >= limit) finish("tiempo")
      return
    }
    const { event } = r.seg.push(frame)
    if (event?.type === "start") r.started = true
    if (event?.type === "end") finish("fin")
    else if (!r.started && elapsed > WAIT_MS) finish("sin-mano")
    else if (elapsed > limit) finish("tiempo")
  }

  const ready = status.state === "listo"
  const target = task.takes
  const left = limit - elapsed
  const ending = phase.kind === "grabando" && left <= WARN_MS
  const stopped: Record<StopReason, string> = {
    fin: "Grabación terminada: bajó la mano.",
    tiempo: task.mode === "fija" ? "Grabación terminada." : "Grabación terminada: se acabó el tiempo.",
    "sin-mano": "Grabación terminada: no se vio la mano.",
    manual: "Grabación detenida.",
  }
  return (
    <div className="rec">
      <div className="rec-stage">
        {phase.kind === "revisar"
          ? <Replay frames={phase.take.frames} stream={stream} />
          : (
            <VisionCamera stream={stream} onFrame={onFrame} onStatus={setStatus}>
              {phase.kind === "cuenta" && <div className="rec-count" aria-live="assertive">{phase.n}</div>}
              {phase.kind === "grabando" && (
                <>
                  <div className={`rec-live ${ending ? "ending" : ""}`} aria-live="polite"><span /> Grabando · {secs(elapsed)} de {secs(limit)}{ending ? ` · quedan ${Math.ceil(left / 1000)} s` : ""}</div>
                  <div className={`rec-timebar ${ending ? "ending" : ""}`} aria-hidden="true"><i style={{ width: `${Math.min(100, (elapsed / limit) * 100)}%` }} /></div>
                </>
              )}
            </VisionCamera>
          )}
        {phase.kind === "revisar" && (() => {
          // Verde si la toma terminó como se esperaba; amarillo si conviene revisarla o repetirla.
          const bad = phase.reason === "sin-mano" || (phase.reason === "tiempo" && task.mode === "seña")
          return <div className={`rec-stopped ${bad ? "bad" : ""}`} role="status"><Icon name={bad ? "warning" : "check_circle"} fill /> {stopped[phase.reason]}</div>
        })()}
      </div>

      <div className="rec-side">
        <p className="rec-progress">Toma {Math.min(done + 1, target)} de {target}{done >= target ? " · ya completó esta seña (puede grabar más)" : ""}</p>
        <p className="rec-instruction">{task.instruction}</p>
        {status.state === "error" && <p className="rec-warn"><Icon name="warning" fill /> {status.message}</p>}

        {phase.kind === "listo" && (
          <p className="rec-hint">{task.mode === "seña"
            ? `Tras la cuenta 3-2-1, grabe la seña. La grabación termina sola cuando baja la mano (máximo ${limit / 1000} segundos).`
            : `Tras la cuenta 3-2-1, la grabación dura ${limit / 1000} segundos.`}</p>
        )}
        {phase.kind === "listo" && (
          <button className="cap-btn primary" disabled={!ready} onClick={() => setPhase({ kind: "cuenta", n: 3 })}>
            <Icon name="radio_button_checked" /> {ready ? "Grabar" : "Preparando cámara…"}
          </button>
        )}
        {phase.kind === "cuenta" && <p className="rec-hint">Prepárese…</p>}
        {phase.kind === "grabando" && (
          <>
            <p className={`rec-clock ${ending ? "ending" : ""}`} aria-hidden="true">● Grabando · quedan {Math.max(0, Math.ceil(left / 1000))} s</p>
            {task.mode === "seña" && <p className="rec-hint">Baje la mano cuando termine la seña.</p>}
            <button className="cap-btn ghost" onClick={() => finish("manual")}>Detener</button>
          </>
        )}
        {phase.kind === "revisar" && (
          <>
            <p className="rec-hint">Revise el esqueleto. ¿Quedó bien la seña?</p>
            {phase.warning && <p className="rec-warn"><Icon name="warning" fill /> {phase.warning}</p>}
            <div className="cap-row">
              <button className="cap-btn primary" onClick={() => { onSave(phase.take); setPhase({ kind: "listo" }) }}><Icon name="check" /> Guardar</button>
              <button className="cap-btn ghost" onClick={() => setPhase({ kind: "listo" })}><Icon name="replay" /> Repetir</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** Repite en bucle el esqueleto grabado (no hay video: solo los puntos). */
export function Replay({ frames, stream }: { frames: CompactFrame[]; stream?: MediaStream }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const settings = stream?.getVideoTracks()[0]?.getSettings()
    const dims = { videoWidth: settings?.width ?? 640, videoHeight: settings?.height ?? 480 }
    const decoded = frames.map(decodeFrame)
    const total = (decoded[decoded.length - 1]?.t ?? 0) + 600
    let raf = 0
    const start = performance.now()
    const loop = (now: number) => {
      const t = (now - start) % total
      let f: Frame | null = null
      for (const x of decoded) { if (x.t > t) break; f = x }
      draw(ref.current, dims, f)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [frames, stream])
  return <div className="vcam mirrored rec-replay"><canvas ref={ref} /><span className="rec-replay-tag">Repetición · solo puntos, sin video</span></div>
}
