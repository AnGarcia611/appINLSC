// Reproductor oficial de YouTube (modo de privacidad mejorada) y captura de la pestaña recortada al video.
// El navegador no deja leer las imágenes de un video de otro sitio: por eso se comparte la pestaña (el usuario lo
// autoriza) y se recorta al recuadro del reproductor. No se descarga ni se guarda el video: solo se calculan puntos.

/** Lo mínimo que se usa de la API del reproductor (https://developers.google.com/youtube/iframe_api_reference). */
export interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getPlaybackRate(): number
  setPlaybackRate(rate: number): void
  getPlayerState(): number
  getVideoData(): { video_id?: string; title?: string; author?: string }
  destroy(): void
}

interface YTNamespace {
  Player: new (el: HTMLElement, opts: {
    host?: string
    videoId: string
    width?: string | number
    height?: string | number
    playerVars?: Record<string, number | string>
    events?: { onReady?: () => void; onStateChange?: (e: { data: number }) => void; onPlaybackRateChange?: (e: { data: number }) => void }
  }) => YTPlayer
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number }
}

declare global {
  interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void }
}

/** Id del video a partir de una URL de YouTube (watch, youtu.be, shorts, embed) o del id solo. */
export function youtubeId(text: string): string | null {
  const s = text.trim()
  if (/^[\w-]{11}$/.test(s)) return s
  try {
    const u = new URL(s)
    if (u.hostname.endsWith("youtu.be")) return u.pathname.slice(1, 12) || null
    const v = u.searchParams.get("v")
    if (v && /^[\w-]{11}$/.test(v)) return v
    const m = u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]{11})/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

let api: Promise<YTNamespace> | null = null

/** Carga la API del reproductor una sola vez. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  api ??= new Promise<YTNamespace>((resolve, reject) => {
    if (window.YT?.Player) { resolve(window.YT); return }
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { prev?.(); if (window.YT) resolve(window.YT) }
    const s = document.createElement("script")
    s.src = "https://www.youtube.com/iframe_api"
    s.async = true
    s.onerror = () => { api = null; reject(new Error("No se pudo cargar el reproductor de YouTube (¿sin internet?).")) }
    document.head.appendChild(s)
  })
  return api
}

/** Recorte de una pista de video a un elemento (Region Capture, Chrome/Brave/Edge). */
interface CropTargetStatic { fromElement(el: Element): Promise<unknown> }
type CroppableTrack = MediaStreamTrack & { cropTo?: (target: unknown) => Promise<void> }

/**
 * Pide compartir esta pestaña y recorta la imagen al elemento (el reproductor).
 * Devuelve el stream recortado; lanza un error con un mensaje para mostrar si no se puede.
 */
export async function captureElement(el: HTMLElement): Promise<MediaStream> {
  const CropTarget = (window as unknown as { CropTarget?: CropTargetStatic }).CropTarget
  if (!navigator.mediaDevices?.getDisplayMedia || !CropTarget) {
    throw new Error("Este navegador no permite recortar la pestaña compartida. Use Chrome, Brave o Edge en un computador.")
  }
  const target = await CropTarget.fromElement(el)
  const options = {
    video: { frameRate: 30 },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
  } as DisplayMediaStreamOptions
  const stream = await navigator.mediaDevices.getDisplayMedia(options)
  const track = stream.getVideoTracks()[0] as CroppableTrack | undefined
  if (!track?.cropTo) {
    stream.getTracks().forEach((t) => t.stop())
    throw new Error("Este navegador no permite recortar la pestaña compartida. Use Chrome, Brave o Edge en un computador.")
  }
  try {
    await track.cropTo(target)
  } catch {
    stream.getTracks().forEach((t) => t.stop())
    throw new Error("Hay que compartir esta misma pestaña (la del laboratorio) para recortar el video.")
  }
  return stream
}
