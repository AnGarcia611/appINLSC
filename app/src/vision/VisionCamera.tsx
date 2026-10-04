import { useEffect, useRef, useState, type ReactNode } from "react"
import { loadTracker, type Delegate } from "./tracker"
import type { Frame, Point } from "./types"
import "./vision.css"

export type VisionStatus =
  | { state: "cargando" }
  | { state: "listo"; delegate: Delegate; fps: number }
  | { state: "error"; message: string }

interface Props {
  /** Cámara en vivo. */
  stream?: MediaStream | null
  /** O un video grabado (laboratorio). */
  src?: string
  /** Cada fotograma procesado (≈ 20 por segundo). */
  onFrame?: (frame: Frame) => void
  onStatus?: (status: VisionStatus) => void
  /** Dibuja el esqueleto encima del video. */
  skeleton?: boolean
  /** Espejo como en un espejo: lo natural para la cámara frontal. Los puntos no cambian, solo la vista. */
  mirrored?: boolean
  /** Pausa el procesamiento sin cerrar la cámara. */
  paused?: boolean
  className?: string
  children?: ReactNode
}

/** Intervalo mínimo entre fotogramas procesados: ≈ 22 fps, suficiente para señas y liviano para la tablet. */
const MIN_INTERVAL_MS = 45

/** Video + esqueleto + bucle de reconocimiento. El video es visible: iOS no decodifica videos ocultos. */
export default function VisionCamera({ stream, src, onFrame, onStatus, skeleton = true, mirrored = true, paused, className, children }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cb = useRef({ onFrame, onStatus, skeleton, paused })
  cb.current = { onFrame, onStatus, skeleton, paused }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (stream) { video.srcObject = stream; video.removeAttribute("src") } else { video.srcObject = null }
    void video.play().catch(() => undefined)
  }, [stream, src])

  useEffect(() => {
    let stopped = false
    let handle = 0
    let last = 0
    let lastVideoTime = -1
    let frames = 0
    let fpsWindow = performance.now()
    const video = videoRef.current!
    cb.current.onStatus?.({ state: "cargando" })

    loadTracker().then((tracker) => {
      if (stopped) return
      setLoading(false)
      cb.current.onStatus?.({ state: "listo", delegate: tracker.delegate, fps: 0 })
      const schedule = () => {
        if (stopped) return
        handle = "requestVideoFrameCallback" in video
          ? video.requestVideoFrameCallback(tick)
          : requestAnimationFrame(tick)
      }
      const tick = () => {
        const now = performance.now()
        const ready = video.readyState >= 2 && video.videoWidth > 0 && !video.paused
        if (ready && !cb.current.paused && now - last >= MIN_INTERVAL_MS && video.currentTime !== lastVideoTime) {
          last = now
          lastVideoTime = video.currentTime
          try {
            const frame = tracker.detect(video, now)
            if (cb.current.skeleton) draw(canvasRef.current, video, frame)
            cb.current.onFrame?.(frame)
            frames++
          } catch (e) {
            console.error("[visión]", e)
          }
          if (now - fpsWindow >= 1000) {
            cb.current.onStatus?.({ state: "listo", delegate: tracker.delegate, fps: Math.round((frames * 1000) / (now - fpsWindow)) })
            frames = 0
            fpsWindow = now
          }
        }
        schedule()
      }
      schedule()
    }).catch((e) => {
      console.error("[visión]", e)
      if (!stopped) cb.current.onStatus?.({ state: "error", message: "No se pudo cargar el reconocimiento de señas" })
    })

    return () => {
      stopped = true
      if ("cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(handle)
      cancelAnimationFrame(handle)
    }
  }, [])

  return (
    <div className={`vcam ${mirrored ? "mirrored" : ""} ${className ?? ""}`}>
      <video ref={videoRef} src={stream ? undefined : src} autoPlay muted playsInline loop={!!src} />
      <canvas ref={canvasRef} />
      {loading && <span className="vcam-loading">Preparando reconocimiento…</span>}
      {children}
    </div>
  )
}

// ── Dibujo del esqueleto ──

const HAND_LINKS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]]
const POSE_LINKS = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24]]

/** Dibuja manos y cuerpo sobre el canvas, ajustado al recuadro visible del video (object-fit: cover). */
export function draw(canvas: HTMLCanvasElement | null, video: { videoWidth: number; videoHeight: number } | null, frame: Frame | null) {
  if (!canvas) return
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr) }
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  if (!frame) return

  // Escala de "cover": el video llena el recuadro y se recorta lo que sobra.
  const vw = video?.videoWidth || w
  const vh = video?.videoHeight || h
  const s = Math.max(w / vw, h / vh)
  const ox = (w - vw * s) / 2
  const oy = (h - vh * s) / 2
  const at = (p: Point) => [ox + p.x * vw * s, oy + p.y * vh * s] as const

  const lines = (pts: Point[], links: number[][], color: string, width: number) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = "round"
    ctx.beginPath()
    for (const [a, b] of links) {
      if (!pts[a] || !pts[b] || (pts[a].v ?? 1) < 0.4 || (pts[b].v ?? 1) < 0.4) continue
      const [x1, y1] = at(pts[a])
      const [x2, y2] = at(pts[b])
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
    }
    ctx.stroke()
  }

  if (frame.pose) lines(frame.pose, POSE_LINKS, "rgba(255,255,255,0.75)", 3)
  for (const hand of frame.hands) {
    lines(hand.points, HAND_LINKS, "#2fd27a", 3)
    ctx.fillStyle = "#ffffff"
    for (const p of hand.points) {
      const [x, y] = at(p)
      ctx.beginPath()
      ctx.arc(x, y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
