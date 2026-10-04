// Datos de la institución que se muestran en la tablet y en el portal simulado.
// ⚠️ Usar la marca real solo si existe un acuerdo con la IPS.
export const IPS_NAME = "IPS Virrey Solís"
export const SEDE = "Sede Olaya"

/**
 * Correo que recibe los paquetes de la página de captura de señas (`/?captura`).
 * ⚠️ Queda visible en el sitio publicado y en el repositorio.
 */
export const CAPTURE_EMAIL = "afgarciaos@gmail.com"

/**
 * Servicio que envía los paquetes por correo automáticamente (../captura-mail, Cloudflare Worker).
 * Se fija en el build con VITE_CAPTURE_URL, p. ej. https://inlsc-captura.<cuenta>.workers.dev/captura.
 * Sin él, la página usa el menú Compartir o la descarga + correo.
 */
export const CAPTURE_UPLOAD_URL: string | null = import.meta.env.VITE_CAPTURE_URL || null
