import type { Gender, VideoId, VideoRef } from "./types"

/** Subtítulo en español de cada video (accesibilidad y apoyo al funcionario). */
export const CAPTIONS: Record<VideoId, string> = {
  saludo: "¡Buen día! Bienvenido/a.",
  solicitud: "¿Cuál es su solicitud?",
  documento: "Por favor, entregue su documento de identidad.",
  especialidad: "¿Qué especialidad necesita?",
  seleccion: "Seleccione una opción en la pantalla.",
  negacion: "Lo sentimos, no hay disponibilidad.",
  despedida: "Que tenga un buen día.",
  cancelada: "Su cita ha sido cancelada.",
  orden_medica: "Por favor, entregue su orden médica.",
  pago_efectivo: "Solo se recibe pago en efectivo.",
  valor: "El valor a pagar es:",
  recibo: "Aquí tiene su recibo.",
  espera_sala: "Por favor, espere en la sala.",
  con_gusto: "Con gusto. Que tenga un buen día.",
}

/** Variantes disponibles por video, generado por `npm run videos` en public/videos/manifest.json. */
export type VideoManifest = Partial<Record<VideoId, string[]>>

export async function loadManifest(): Promise<VideoManifest> {
  try { return await (await fetch(`${import.meta.env.BASE_URL}videos/manifest.json`)).json() } catch { return {} }
}

/**
 * Elige el video según el género del perfil del funcionario.
 * Si no existe esa variante se usa la del otro género y, por último, la grabación original.
 */
export function pickVideo(id: VideoId, gender: Gender, manifest: VideoManifest): VideoRef {
  const variants = manifest[id] ?? []
  const order = gender === "h" ? ["h", "m", "raw"] : ["m", "h", "raw"]
  const variant = order.find((v) => variants.includes(v)) ?? gender
  return { id, src: `${import.meta.env.BASE_URL}videos/${id}_${variant}.mp4`, caption: CAPTIONS[id] }
}
