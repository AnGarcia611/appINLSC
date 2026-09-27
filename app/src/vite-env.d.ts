/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "peer" en el build de GitHub Pages; por defecto se usa el servidor local. */
  readonly VITE_SYNC?: "local" | "peer"
}
