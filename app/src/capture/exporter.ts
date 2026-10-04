// Empaqueta el borrador (JSON comprimido con gzip) y lo entrega por el menú de compartir del sistema
// (correo con el archivo adjunto) o, si el navegador no puede compartir archivos, como descarga + correo prellenado.
import { CAPTURE_EMAIL, CAPTURE_UPLOAD_URL } from "../shared/config"
import type { CapturePackage } from "./format"

export async function packageFile(pkg: CapturePackage): Promise<File> {
  const json = new Blob([JSON.stringify(pkg)], { type: "application/json" })
  const day = new Date(pkg.updatedAt).toLocaleDateString("sv") // AAAA-MM-DD en la hora local
  if (typeof CompressionStream === "undefined") return new File([json], `inlsc_captura_${pkg.signer.code}_${day}.json`, { type: "application/json" })
  const gz = await new Response(json.stream().pipeThrough(new CompressionStream("gzip"))).blob()
  return new File([gz], `inlsc_captura_${pkg.signer.code}_${day}.json.gz`, { type: "application/gzip" })
}

export const mailSubject = (pkg: CapturePackage) => `InLSC captura de señas · ${pkg.signer.code}`

export function mailBody(pkg: CapturePackage) {
  return [
    `Paquete de captura de señas InLSC.`,
    `Señante: ${pkg.signer.code}`,
    `Tomas: ${pkg.takes.length} · Validaciones: ${pkg.validations.length} · Pruebas: ${pkg.trials.length}`,
    `Consentimiento: ${pkg.consent.version} (${pkg.consent.acceptedAt.slice(0, 10)})`,
    ``,
    `El archivo va adjunto. Contiene solo puntos de referencia, sin video.`,
  ].join("\n")
}

export const mailtoUrl = (pkg: CapturePackage) =>
  `mailto:${CAPTURE_EMAIL}?subject=${encodeURIComponent(mailSubject(pkg))}&body=${encodeURIComponent(mailBody(pkg))}`

export const canUpload = () => !!CAPTURE_UPLOAD_URL

/**
 * Envío automático: el servicio de captura-mail reenvía el archivo como adjunto a CAPTURE_EMAIL.
 * Devuelve null si salió bien o el motivo del fallo (sin internet, servicio caído, límite de envíos…).
 */
export async function uploadFile(pkg: CapturePackage, file: File): Promise<string | null> {
  if (!CAPTURE_UPLOAD_URL) return "El envío automático no está configurado."
  const summary = `${pkg.takes.length} tomas · ${pkg.validations.length} validaciones · ${pkg.trials.length} pruebas · consentimiento ${pkg.consent.version}`
  try {
    const res = await fetch(CAPTURE_UPLOAD_URL, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream", "X-InLSC-File": file.name, "X-InLSC-Summary": encodeURIComponent(summary) },
      body: file,
    })
    if (res.ok) return null
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    return body?.error ? `El servicio respondió: ${body.error}.` : `El servicio respondió con un error (${res.status}).`
  } catch {
    return "No hay conexión con el servicio de envío (¿sin internet?)."
  }
}

export function canShareFile(file: File): boolean {
  return typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })
}

/** Abre el menú de compartir con el archivo adjunto. Devuelve false si el usuario lo cerró sin compartir. */
export async function shareFile(pkg: CapturePackage, file: File): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title: mailSubject(pkg), text: `${mailBody(pkg)}\n\nEnviar a: ${CAPTURE_EMAIL}` })
    return true
  } catch {
    return false
  }
}

export function download(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement("a")
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
