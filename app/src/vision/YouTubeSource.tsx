import { useEffect, useRef, useState } from "react"
import type { Origin, Take } from "../capture/format"
import { download, packageFile } from "../capture/exporter"
import { MEDIAPIPE_VERSION, MODELS } from "./tracker"
import { PointsRecorder, RECORD_LABELS, recordedPackage } from "./pointsRecorder"
import type { Frame } from "./types"
import VisionCamera, { type VisionStatus } from "./VisionCamera"
import { captureElement, loadYouTubeApi, youtubeId, type YTPlayer } from "./youtube"

interface Props {
  onFrame: (frame: Frame) => void
  onStatus: (status: VisionStatus) => void
}

const PLAYING = 1
const RATES = [1, 0.75, 0.5]

/**
 * Fuente "YouTube" del laboratorio: el video se ve en el reproductor oficial y se analiza compartiendo esta pestaña,
 * recortada al reproductor. No se descarga ni se guarda el video: solo los puntos de lo que se graba, con la fuente citada.
 */
export default function YouTubeSource({ onFrame, onStatus }: Props) {
  const initial = new URLSearchParams(location.search).get("yt") ?? ""
  const [url, setUrl] = useState(initial)
  const [videoId, setVideoId] = useState<string | null>(youtubeId(initial))
  const [meta, setMeta] = useState<{ title: string; author: string } | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [label, setLabel] = useState("otra")
  const [signer, setSigner] = useState("")
  const [chunk, setChunk] = useState(4)
  const [license, setLicense] = useState("CC BY 3.0")
  const [recording, setRecording] = useState(false)
  const [takes, setTakes] = useState<Take[]>([])
  const holder = useRef<HTMLDivElement>(null)
  const player = useRef<YTPlayer | null>(null)
  const recorder = useRef<PointsRecorder | null>(null)
  const playingRef = useRef(false)
  playingRef.current = playing

  // Reproductor oficial en modo de privacidad mejorada. Se monta en un div propio: YouTube lo reemplaza por un iframe.
  useEffect(() => {
    if (!videoId || !holder.current) return
    let alive = true
    const mount = document.createElement("div")
    holder.current.appendChild(mount)
    setMeta(null)
    loadYouTubeApi().then((YT) => {
      if (!alive) return
      player.current = new YT.Player(mount, {
        host: "https://www.youtube-nocookie.com", videoId, width: "100%", height: "100%",
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            const d = player.current?.getVideoData()
            setMeta({ title: d?.title ?? "", author: d?.author ?? "" })
          },
          onStateChange: (e) => onState(e.data),
          onPlaybackRateChange: (e) => onRate(e.data),
        },
      })
    }).catch((e: Error) => setError(e.message))
    return () => { alive = false; recorder.current?.stop(); player.current?.destroy(); player.current = null; mount.remove() }
  }, [videoId])

  // La toma se abre al reproducir y se cierra al pausar: los tiempos son del video, no del reloj.
  const startTake = () => {
    const p = player.current
    if (recorder.current && p) recorder.current.start(performance.now(), p.getCurrentTime(), p.getPlaybackRate())
  }
  const onState = (state: number) => {
    const on = state === PLAYING
    setPlaying(on)
    // El nombre del canal a veces llega recién al reproducir.
    const d = player.current?.getVideoData()
    if (d?.author) setMeta({ title: d.title ?? "", author: d.author })
    if (on) startTake()
    else { recorder.current?.stop(); syncTakes() }
  }
  const onRate = (r: number) => { setRate(r); if (playingRef.current) startTake() }
  // Copia las tomas ya cerradas de la grabación actual (sin duplicar las que ya estaban en la lista).
  const syncTakes = () => {
    const done = recorder.current ? [...recorder.current.takes] : []
    setTakes((prev) => [...prev.filter((t) => !done.includes(t)), ...done])
  }

  const analyze = async () => {
    setError(null)
    try {
      const s = await captureElement(holder.current!)
      s.getVideoTracks()[0]?.addEventListener("ended", () => setStream(null))
      setStream(s)
    } catch (e) {
      const denied = e instanceof DOMException && e.name === "NotAllowedError"
      setError(denied ? "No se dio permiso para compartir la pestaña (o este navegador no lo permite). Use Chrome, Brave o Edge." : e instanceof Error && e.message ? e.message : "No se compartió la pestaña.")
    }
  }
  useEffect(() => () => stream?.getTracks().forEach((t) => t.stop()), [stream])

  const toggleRecording = () => {
    if (recording) {
      recorder.current?.stop()
      syncTakes()
      recorder.current = null
      setRecording(false)
      return
    }
    recorder.current = new PointsRecorder({ label, signer: signer.trim() || "YT-01", chunkS: chunk, source: videoId ?? "video" })
    setRecording(true)
    if (playingRef.current) startTake()
  }

  const frame = (f: Frame) => {
    if (playingRef.current) recorder.current?.push(f)
    onFrame(f)
  }

  const exportPackage = async () => {
    const id = videoId ?? ""
    const author = meta?.author || "YouTube"
    const origin: Origin = {
      dataset: `YouTube · ${author}`,
      license,
      citation: `${author}. ${meta?.title ?? id} [Video]. YouTube. https://www.youtube.com/watch?v=${id}`,
      url: `https://www.youtube.com/watch?v=${id}`,
    }
    const settings = stream?.getVideoTracks()[0]?.getSettings()
    const pkg = recordedPackage({
      signer: signer.trim() || "YT-01", origin, takes,
      camera: settings?.width && settings?.height ? { width: settings.width, height: settings.height } : null,
      app: { mediapipe: `${MEDIAPIPE_VERSION} (pestaña compartida)`, models: MODELS },
    })
    download(await packageFile(pkg))
  }

  return (
    <div className="yt">
      <form className="yt-row" onSubmit={(e) => { e.preventDefault(); const id = youtubeId(url); setError(id ? null : "No reconozco esa dirección de YouTube."); setVideoId(id) }}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Dirección del video de YouTube" aria-label="Dirección del video de YouTube" />
        <button type="submit">Cargar</button>
      </form>
      <div ref={holder} className="yt-player" />
      {meta && <p className="yt-meta">{meta.title} · {meta.author}</p>}
      <div className="yt-row">
        {!stream
          ? <button onClick={analyze} disabled={!videoId}>Analizar esta pestaña</button>
          : <button onClick={() => { stream.getTracks().forEach((t) => t.stop()); setStream(null) }}>Dejar de analizar</button>}
        <label>Velocidad
          <select value={rate} onChange={(e) => player.current?.setPlaybackRate(Number(e.target.value))}>
            {RATES.map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
        </label>
        <span className="yt-hint">{stream ? (playing ? "Analizando…" : "Reproduzca el video") : "Al pulsar, elija «Esta pestaña» y permita compartir."}</span>
      </div>
      {error && <p className="lab-empty">{error}</p>}
      {stream && (
        <div className="yt-preview">
          <VisionCamera stream={stream} mirrored={false} paused={!playing} onFrame={frame} onStatus={onStatus} />
        </div>
      )}
      <fieldset className="yt-rec" disabled={!stream}>
        <legend>Guardar puntos (sin video)</legend>
        <label>Qué se seña
          <select value={label} onChange={(e) => setLabel(e.target.value)} disabled={recording}>
            {RECORD_LABELS.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </label>
        <label>Persona
          <input value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="p. ej. UMNG-01" disabled={recording} />
        </label>
        <label>Tomas de
          <select value={chunk} onChange={(e) => setChunk(Number(e.target.value))} disabled={recording}>
            <option value={4}>4 s</option><option value={3}>3 s</option><option value={6}>6 s</option><option value={0}>una por grabación</option>
          </select>
        </label>
        <label>Licencia
          <select value={license} onChange={(e) => setLicense(e.target.value)}>
            <option>CC BY 3.0</option><option>CC BY 4.0</option><option>CC BY-NC 4.0</option><option>Con permiso del autor</option>
          </select>
        </label>
        <button type="button" onClick={toggleRecording} className={recording ? "on" : ""}>{recording ? "Parar" : "Grabar"}</button>
        <span>{takes.length} tomas</span>
        <button type="button" onClick={exportPackage} disabled={!takes.length || recording}>Exportar paquete</button>
        <button type="button" onClick={() => setTakes([])} disabled={!takes.length || recording}>Borrar</button>
      </fieldset>
      <p className="yt-hint">Verifique la licencia en la descripción del video. Se guardan solo puntos de manos y cuerpo, con la cita de la fuente. El video no se descarga.</p>
    </div>
  )
}
