/**
 * Por qué la cámara no se puede usar en esta página (o null si sí se puede).
 * Los navegadores solo dan la cámara en un contexto seguro: https:// o http://localhost.
 * Una IP de la red local con http:// (p. ej. http://192.168.1.20:5173) no cuenta como segura.
 */
export function cameraBlockedReason(): string | null {
  if (!window.isSecureContext) {
    return "El navegador bloquea la cámara porque esta dirección no usa HTTPS. Abra la página con una dirección https:// (servidor iniciado con npm run dev) o, en el mismo computador, con http://localhost."
  }
  if (!navigator.mediaDevices?.getUserMedia) return "Este navegador no permite usar la cámara."
  return null
}
