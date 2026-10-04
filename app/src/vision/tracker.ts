// Puntos de referencia de manos y cuerpo con MediaPipe Tasks Vision, en el navegador y sin internet.
// Los archivos se sirven desde public/vision (scripts/prepare-vision.mjs). MediaPipe se carga con import()
// dinámico: solo lo descargan las pantallas que usan la cámara (tablet, captura, laboratorio), nunca el panel.
import type { HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision"
import { POSE_KEEP, type Frame } from "./types"

export const VISION_BASE = `${import.meta.env.BASE_URL}vision/`
export const MEDIAPIPE_VERSION = "0.10.35"
export const MODELS = { hands: "hand_landmarker.task (float16/1)", pose: "pose_landmarker_lite.task (float16/1)" }

export type Delegate = "GPU" | "CPU"

/** Ancho al que se reduce cada fotograma antes de procesarlo. */
const PROCESS_WIDTH = 640

export interface Tracker {
  delegate: Delegate
  /** Procesa el fotograma actual del video. `t` en ms y siempre creciente. */
  detect(source: HTMLVideoElement, t: number): Frame
}

let shared: Promise<Tracker> | null = null

/**
 * Tracker único para toda la página (crear los modelos tarda 1–3 s y ocupa memoria de GPU).
 * Intenta GPU (WebGL2) y, si falla al crearse, usa CPU. `?delegate=cpu` fuerza la CPU para comparar.
 */
export function loadTracker(): Promise<Tracker> {
  shared ??= create().catch((e) => { shared = null; throw e })
  return shared
}

async function create(): Promise<Tracker> {
  const mp = await import("@mediapipe/tasks-vision")
  const fileset = await mp.FilesetResolver.forVisionTasks(`${VISION_BASE}wasm`)

  const build = async (delegate: Delegate) => {
    const hands: HandLandmarker = await mp.HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${VISION_BASE}models/hand_landmarker.task`, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
    try {
      const pose: PoseLandmarker = await mp.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${VISION_BASE}models/pose_landmarker_lite.task`, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
      })
      return { hands, pose }
    } catch (e) { hands.close(); throw e }
  }

  const forced = new URLSearchParams(location.search).get("delegate")?.toUpperCase()
  let delegate: Delegate = forced === "CPU" ? "CPU" : "GPU"
  let models: Awaited<ReturnType<typeof build>>
  try {
    models = await build(delegate)
  } catch (e) {
    if (delegate === "CPU") throw e
    console.warn("[visión] GPU no disponible, se usa CPU", e)
    delegate = "CPU"
    models = await build(delegate)
  }

  const { hands, pose } = models
  // Se procesa una copia reducida del fotograma: en CPU es ~2× más rápido (medido: 98 → 50 ms por fotograma con video 1080p).
  // Los modelos ya reducen la imagen internamente a 192–256 px. Los puntos salen normalizados (0..1), igual que antes.
  const small = document.createElement("canvas")
  const ctx = small.getContext("2d")
  return {
    delegate,
    detect(source, t) {
      let input: HTMLVideoElement | HTMLCanvasElement = source
      if (ctx && source.videoWidth > PROCESS_WIDTH) {
        const w = PROCESS_WIDTH
        const hgt = Math.round((source.videoHeight / source.videoWidth) * w)
        if (small.width !== w || small.height !== hgt) { small.width = w; small.height = hgt }
        ctx.drawImage(source, 0, 0, w, hgt)
        input = small
      }
      const h = hands.detectForVideo(input, t)
      const p = pose.detectForVideo(input, t)
      return {
        t,
        hands: h.landmarks.map((points, i) => ({
          side: h.handedness[i]?.[0]?.categoryName ?? "",
          score: h.handedness[i]?.[0]?.score ?? 0,
          points: points.map(({ x, y, z }) => ({ x, y, z })),
        })),
        pose: p.landmarks[0]?.slice(0, POSE_KEEP).map(({ x, y, z, visibility }) => ({ x, y, z, v: visibility })) ?? null,
      }
    },
  }
}
