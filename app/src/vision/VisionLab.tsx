import { useEffect, useRef, useState } from "react"
import { TASKS, type SignTask } from "../capture/tasks"
import { FINGERS, dominantHand, fingerExtension, isRaised } from "./features"
import { HeadGestureDetector } from "./head"
import { NumberRecognizer, ruleScores, type RecognizerPhase } from "./numbers"
import { REJECT_LABELS, SignRecognizer, type SignPhase } from "./signs"
import { loadNumberTemplates, loadSignTemplates } from "./templates"
import type { Frame } from "./types"
import VisionCamera, { type VisionStatus } from "./VisionCamera"
import "./vision.css"
import { cameraBlockedReason } from "../shared/camera"

/** Reconocedor que dio el resultado. */
type Source = "número" | "seña" | "cabeza"
interface Out { from: Source; value: string; confidence: number; detail: string }

interface Live {
  ext: number[] | null; scores: number[] | null; raised: boolean; hands: number; pose: boolean
  phase: RecognizerPhase; signPhase: SignPhase
  motion: Map<string, number> | null
  flex: ReturnType<NumberRecognizer["diagnostics"]>
}
type Log = { at: string; text: string; ok?: boolean }
type Tally = Record<string, { ok: number; bad: number; missed: number }>

/** Qué reconocedor debe responder a cada seña de la lista de captura. `null`: ninguno (cualquier resultado es un disparo falso). */
const sourceOf = (t: SignTask): Source | null =>
  t.group === "Sin seña" ? null : t.group === "Números" ? "número" : t.id.endsWith("cabeza") ? "cabeza" : "seña"

/** Etiquetas de la seña con movimiento que se pueden emitir: todas menos las de rechazo. */
const MOTION_ACCEPT = ["asignar", "cancelar", "facturar", "sí", "no"]
const MOTION_BARS = [...MOTION_ACCEPT, ...REJECT_LABELS]

/**
 * Laboratorio de visión (`/?lab`): diagnóstico en la tablet real (FPS, GPU o CPU, puntos detectados)
 * y prueba de todas las señas: números 1–9, trámites, sí/no con la mano y con la cabeza, con la cámara o con un video.
 * Con una seña elegida en "Probar", cada resultado se marca como acierto o fallo y se lleva la cuenta por seña.
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
  const [signsMissing, setSignsMissing] = useState(false)
  const [target, setTarget] = useState<SignTask | null>(null)
  const [tally, setTally] = useState<Tally>({})
  const numbers = useRef<NumberRecognizer | null>(null)
  const motion = useRef<SignRecognizer | null>(null)
  const head = useRef(new HeadGestureDetector())
  const targetRef = useRef(target)
  targetRef.current = target
  const lastUi = useRef(0)

  useEffect(() => { loadNumberTemplates().then((templates) => { numbers.current = new NumberRecognizer({ templates }) }) }, [])

  // La seña con movimiento depende de la proporción de la imagen: se crea de nuevo al cambiar de cámara o video.
  useEffect(() => {
    let alive = true
    motion.current = null
    const settings = stream?.getVideoTracks()[0]?.getSettings()
    const aspect = settings?.width && settings?.height ? settings.width / settings.height : 16 / 9
    loadSignTemplates().then((templates) => {
      if (!alive) return
      setSignsMissing(!templates)
      if (templates) motion.current = new SignRecognizer({ accept: MOTION_ACCEPT, templates, aspect })
    })
    return () => { alive = false }
  }, [stream, videoUrl])

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

  const count = (id: string, key: keyof Tally[string]) =>
    setTally((t) => {
      const c = t[id] ?? { ok: 0, bad: 0, missed: 0 }
      return { ...t, [id]: { ...c, [key]: c[key] + 1 } }
    })

  const report = (o: Out) => {
    const t = targetRef.current
    const ok = t ? sourceOf(t) === o.from && t.label === o.value : undefined
    if (t) count(t.id, ok ? "ok" : "bad")
    const name = o.from === "número" ? `Número ${o.value}` : o.from === "cabeza" ? `Cabeza: ${o.value}` : `Seña: ${o.value}`
    setLog((l) => [{ at: new Date().toLocaleTimeString(), text: `${name} · ${o.confidence} %${o.detail}`, ok }, ...l].slice(0, 40))
  }

  const onFrame = (frame: Frame) => {
    const n = numbers.current?.push(frame) ?? null
    const m = motion.current?.push(frame) ?? null
    const h = head.current.push(frame)
    const alts = (a: { value: string | number; confidence: number }[]) => (a.length ? ` · alternativas ${a.map((x) => `${x.value} (${x.confidence} %)`).join(", ")}` : "")
    if (n) report({ from: "número", value: String(n.value), confidence: n.confidence, detail: ` · ${n.kind}${alts(n.alternatives)}` })
    if (m) report({ from: "seña", value: m.value, confidence: m.confidence, detail: alts(m.alternatives) })
    if (h) report({ from: "cabeza", value: h.value, confidence: h.confidence, detail: "" })
    // La interfaz se actualiza a ~8 Hz para no cargar a React.
    if (frame.t - lastUi.current < 120) return
    lastUi.current = frame.t
    const hand = dominantHand(frame)
    const ext = hand ? fingerExtension(hand.points) : null
    setLive({
      ext, scores: ext ? ruleScores(ext) : null, raised: !!hand && isRaised(hand, frame.pose), hands: frame.hands.length, pose: !!frame.pose,
      phase: numbers.current?.phase ?? "reposo", signPhase: motion.current?.phase ?? "reposo",
      motion: motion.current?.liveScores ?? null, flex: numbers.current?.diagnostics() ?? null,
    })
  }

  const pick = (t: SignTask | null) => {
    setTarget(t)
    numbers.current?.reset(); motion.current?.reset(); head.current.reset()
  }
  const totals = Object.values(tally).reduce((a, x) => ({ ok: a.ok + x.ok, all: a.all + x.ok + x.bad + x.missed }), { ok: 0, all: 0 })

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
        <div className="lab-main">
          <div className="lab-stage">
            {source === "cámara"
              ? <VisionCamera stream={stream} onFrame={onFrame} onStatus={setStatus} />
              : videoUrl ? <VisionCamera key={videoUrl} src={videoUrl} mirrored={false} onFrame={onFrame} onStatus={setStatus} /> : <p className="lab-empty">Elija un video para analizarlo.</p>}
            {error && source === "cámara" && <p className="lab-empty">{error}</p>}
          </div>
          <section className="lab-test">
            <div className="lab-test-head">
              <h3>Probar una seña</h3>
              <span>{totals.all ? `${totals.ok} de ${totals.all} aciertos` : "Elija la seña que va a hacer"}</span>
              {target && <button onClick={() => count(target.id, "missed")}>No respondió</button>}
              {target && <button onClick={() => pick(null)}>Dejar de probar</button>}
              {totals.all > 0 && <button onClick={() => setTally({})}>Borrar cuenta</button>}
            </div>
            {target && <p className="lab-ref"><b>{target.title}.</b> {target.reference ?? target.instruction}{sourceOf(target) ? "" : " Cualquier resultado cuenta como disparo falso."}</p>}
            {signsMissing && <p className="lab-ref">Faltan los prototipos de señas con movimiento (signs.templates.json): ejecute <code>npm run dataset</code>.</p>}
            {(["Números", "Sí y no", "Trámites", "Sin seña"] as const).map((g) => (
              <div key={g} className="lab-chips" role="group" aria-label={g}>
                <small>{g}</small>
                {TASKS.filter((t) => t.group === g).map((t) => {
                  const c = tally[t.id]
                  const all = c ? c.ok + c.bad + c.missed : 0
                  return (
                    <button key={t.id} className={target?.id === t.id ? "on" : ""} onClick={() => pick(t)} title={t.reference ?? t.instruction}>
                      {g === "Números" ? t.label : t.title}
                      {all > 0 && <em className={c.ok / all >= 0.8 ? "good" : c.ok / all >= 0.5 ? "mid" : "bad"}>{c.ok}/{all}</em>}
                    </button>
                  )
                })}
              </div>
            ))}
          </section>
        </div>
        <aside className="lab-side">
          <dl className="lab-stats">
            <div><dt>Estado</dt><dd>{status.state === "listo" ? `${status.delegate} · ${status.fps} fps` : status.state === "error" ? status.message : "cargando modelos…"}</dd></div>
            <div><dt>Manos</dt><dd>{live?.hands ?? 0}{live?.raised ? " · levantada" : ""}</dd></div>
            <div><dt>Cuerpo</dt><dd>{live?.pose ? "sí" : "no"}</dd></div>
            <div><dt>Números · señas</dt><dd>{live?.phase ?? "reposo"} · {live?.signPhase ?? "reposo"}</dd></div>
          </dl>
          <h3>Resultados</h3>
          <ol className="lab-log">{log.map((l, i) => <li key={i} className={l.ok === undefined ? "" : l.ok ? "ok" : "bad"}><time>{l.at}</time> {l.ok === undefined ? "" : l.ok ? "✓ " : "✗ "}{l.text}</li>)}</ol>
          <h3>Extensión de los dedos</h3>
          {FINGERS.map((f, i) => <Bar key={f} label={f} value={live?.ext?.[i] ?? 0} />)}
          <h3>Forma (base 1–5)</h3>
          {[1, 2, 3, 4, 5].map((b) => <Bar key={b} label={String(b)} value={live?.scores?.[b - 1] ?? 0} />)}
          <h3>Movimiento (6–9 y rechazo)</h3>
          <dl className="lab-stats">
            <div><dt>Forma dominante</dt><dd>{live?.flex?.base || "—"}</dd></div>
            <div><dt>Ciclos de flexión</dt><dd>{live?.flex?.cycles ?? 0} <small>(2 = 6–9)</small></dd></div>
            <div><dt>Vaivenes del índice</dt><dd>{live?.flex?.swings ?? 0} <small>(8 = NO)</small></dd></div>
            <div><dt>¿Otra seña?</dt><dd>{live?.flex?.other ? "sí" : "no"}</dd></div>
          </dl>
          <h3>Seña con movimiento (trámites y sí/no con la mano)</h3>
          {MOTION_BARS.map((l) => <Bar key={l} label={l} value={live?.motion?.get(l) ?? 0} muted={REJECT_LABELS.includes(l)} />)}
        </aside>
      </div>
    </div>
  )
}

function Bar({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={`lab-bar ${muted ? "muted" : ""}`}>
      <span>{label}</span>
      <div><i style={{ width: `${Math.round(value * 100)}%` }} /></div>
      <b>{value.toFixed(2)}</b>
    </div>
  )
}
