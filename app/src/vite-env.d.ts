/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "relay" en el build de GitHub Pages; por defecto se usa el servidor local. */
  readonly VITE_SYNC?: "local" | "relay"
  /** Servicio de envío automático de la página de captura (ver captura-mail/). */
  readonly VITE_CAPTURE_URL?: string
}
