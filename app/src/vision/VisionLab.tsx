import { useEffect, useRef, useState } from "react"
import { FINGERS, dominantHand, fingerExtension, isRaised } from "./features"
import { HeadGestureDetector, type HeadResult } from "./head"
import { NumberRecognizer, ruleScores, type NumberResult, type RecognizerPhase } from "./numbers"
import { loadNumberTemplates } from "./templates"
import type { Frame } from "./types"
import VisionCamera, { type VisionStatus } from "./VisionCamera"
import "./vision.css"
import { cameraBlockedReason } from "../shared/camera"

interface Live { ext: number[] | null; scores: number[] | null; raised: boolean; hands: number; pose: boolean; phase: RecognizerPhase }
type Log = { at: string; text: string }

/**
 * Laboratorio de visión (`/?lab`): diagnóstico en la tablet real (FPS, GPU o CPU, puntos detectados)
 * y prueba del reconocedor de números y de sí/no con la cabeza, con la cámara o con un video.
 */
export default function VisionLab() {
  // ?lab&src=videos/saludo_m.mp4 analiza un video publicado (útil sin cámara).
  const initialSrc = new URLSearchParams(location.search).get("src")
  const [source, setSource] = useState<"cámara" | "video">(initialSrc ? "video" : "cámara")
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(initialSrc && `${import.meta.env.BASE_URL}${initialSrc.replace(/^\//, "")}`)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<VisionStatus>({ state: "cargando" })
  const [live, setLive] = useState<Live | null>(null)
  const [log, setLog] = useState<Log[]>([])
  const numbers = useRef<NumberRecognizer | null>(null)
  const head = useRef(new HeadGestureDetector())
  const lastUi = useRef(0)

  useEffect(() => { loadNumberTemplates().then((templates) => { numbers.current = new NumberRecognizer({ templates }) }) }, [])

  useEffect(() => {
    if (source !== "cámara") return
    const blocked = cameraBlockedReason()
    if (blocked) { setError(blocked); return }
    let s: MediaStream | null = null
    let cancelled = false
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false })
      .then((x) => {
        // Si ya se cambió de fuente (o se desmontó) antes de que llegara la cámara, se apaga enseguida.
        if (cancelled) { x.getTracks().forEach((t) => t.stop()); return }
        s = x
        setStream(x)
      })
      .catch(() => { if (!cancelled) setError("No se pudo abrir la cámara. Revise el permiso de cámara del navegador.") })
    return () => { cancelled = true; s?.getTracks().forEach((t) => t.stop()); setStream(null) }
  }, [source])

  const add = (text: string) => setLog((l) => [{ at: new Date().toLocaleTimeString(), text }, ...l].slice(0, 30))

  const onFrame = (frame: Frame) => {
    const n: NumberResult | null = numbers.current?.push(frame) ?? null
    const h: HeadResult | null = head.current.push(frame)
    if (n) add(`Número ${n.value} · ${n.confidence} % · ${n.kind}${n.alternatives.length ? ` · alternativas ${n.alternatives.map((a) => `${a.value} (${a.confidence} %)`).join(", ")}` : ""}`)
    if (h) add(`Cabeza: ${h.value} · ${h.confidence} %`)
    // La interfaz se actualiza a ~8 Hz para no cargar a React.
    if (frame.t - lastUi.current < 120) return
    lastUi.current = frame.t
    const hand = dominantHand(frame)
    const ext = hand ? fingerExtension(hand.points) : null
    setLive({ ext, scores: ext ? ruleScores(ext) : null, raised: !!hand && isRaised(hand, frame.pose), hands: frame.hands.length, pose: !!frame.pose, phase: numbers.current?.phase ?? "reposo" })
  }

  return (
    <div className="lab">
      <header className="lab-head">
        <strong>InLSC · Laboratorio de visión</strong>
        <div className="seg sm" role="group" aria-label="Fuente">
          <button className={source === "cámara" ? "on" : ""} onClick={() => setSource("cámara")}>Cámara</button>
          <button className={source === "video" ? "on" : ""} onClick={() => setSource("video")}>Video</button>
        </div>
        {source === "video" && (
          <input type="file" accept="video/*" aria-label="Video para analizar" onChange={(e) => { const f = e.target.files?.[0]; if (f) setVideoUrl(URL.createObjectURL(f)) }} />
        )}
      </header>
      <div className="lab-body">
        <div className="lab-stage">
          {source === "cámara"
            ? <VisionCamera stream={stream} onFrame={onFrame} onStatus={setStatus} />
            : videoUrl ? <VisionCamera key={videoUrl} src={videoUrl} mirrored={false} onFrame={onFrame} onStatus={setStatus} /> : <p className="lab-empty">Elija un video para analizarlo.</p>}
          {error && source === "cámara" && <p className="lab-empty">{error}</p>}
        </div>
        <aside className="lab-side">
          <dl className="lab-stats">
            <div><dt>Estado</dt><dd>{status.state === "listo" ? `${status.delegate} · ${status.fps} fps` : status.state === "error" ? status.message : "cargando modelos…"}</dd></div>
            <div><dt>Manos</dt><dd>{live?.hands ?? 0}{live?.raised ? " · levantada" : ""}</dd></div>
            <div><dt>Cuerpo</dt><dd>{live?.pose ? "sí" : "no"}</dd></div>
            <div><dt>Reconocedor</dt><dd>{live?.phase ?? "reposo"}</dd></div>
          </dl>
          <h3>Extensión de los dedos</h3>
          {FINGERS.map((f, i) => <Bar key={f} label={f} value={live?.ext?.[i] ?? 0} />)}
          <h3>Forma (base 1–5)</h3>
          {[1, 2, 3, 4, 5].map((b) => <Bar key={b} label={String(b)} value={live?.scores?.[b - 1] ?? 0} />)}
          <h3>Resultados</h3>
          <ol className="lab-log">{log.map((l, i) => <li key={i}><time>{l.at}</time> {l.text}</li>)}</ol>
        </aside>
      </div>
    </div>
  )
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="lab-bar">
      <span>{label}</span>
      <div><i style={{ width: `${Math.round(value * 100)}%` }} /></div>
      <b>{value.toFixed(2)}</b>
    </div>
  )
}
