import type { IconName } from "./Icon"

export type Gender = "h" | "m"

export type VideoId =
  | "saludo" | "solicitud" | "documento" | "especialidad" | "seleccion" | "negacion" | "despedida"
  | "cancelada" | "orden_medica" | "pago_efectivo" | "valor" | "recibo" | "espera_sala" | "con_gusto"

export interface VideoRef { id: VideoId; src: string; caption: string }

/** `title`: nombre completo del paso actual, para el resumen de la barra en pantallas pequeñas. */
export interface Progress { labels: string[]; current: number; color: string; title?: string }

export interface MenuOption { tab: string; text: string; icon: IconName; color: string }

export interface Slot { date: string; time: string } // "2026-10-01", "07:00"

/** Aviso escrito sobre el lado izquierdo del video (p. ej. "No hay disponibilidad"). */
export interface Notice { title: string; text: string }

export type TabletView =
  | { kind: "idle"; message?: string }
  | { kind: "video"; notice?: Notice }
  | { kind: "detect"; options: { icon: IconName; text: string }[]; detected: number | null }
  | { kind: "menu"; title: string; instruction: string; options: MenuOption[]; selected: number | null }
  | { kind: "horarios"; instruction: string; slots: Slot[]; selected: number | null }
  | { kind: "valor"; amount: number }
  | { kind: "resultado"; variant: "asignada" | "cancelada"; lines: { label: string; value: string }[] }

/** Lo que el panel del funcionario publica y la tablet dibuja. */
export interface TabletState {
  /** Cambia cuando el funcionario pide repetir el video, para reiniciarlo en la tablet. */
  seq: number
  view: TabletView
  video?: VideoRef
  progress?: Progress
  camera: boolean
  /** Qué debe reconocer la tablet con la cámara en este paso (sin campo: nada). */
  recognize?: Recognize
}

/** Seña del número de una opción (1..max), o seña libre del trámite (asignar, cancelar, facturar). */
export type Recognize = { task: "number"; max: number } | { task: "tramite" }

/** Número (o índice del trámite en PATHS) reconocido con su confianza (0–100). */
export interface SignGuess { value: number; confidence: number }

/** Lo que la tablet envía al panel del funcionario. */
export type TabletEvent =
  /** Toque en una opción. `seq` es el del estado que mostraba la tablet. */
  | { type: "select"; index: number; seq: number }
  /**
   * Seña reconocida en la tablet. `seq` es el del estado que la pidió: el panel descarta resultados de otro paso.
   * task "number": `value` = número 1..max · task "tramite": `value` = índice del trámite en PATHS.
   */
  | { type: "sign"; seq: number; task: "number" | "tramite"; value: number; confidence: number; alternatives: SignGuess[] }

/** Mensajes entre el panel y la tablet (por el servidor local o por WebRTC). */
export type WireMessage =
  | { type: "state"; state: TabletState } // panel → tablet
  | { type: "event"; event: TabletEvent } // tablet → panel
  | { type: "hb" } //                        latido, en ambos sentidos
  | { type: "bye" } //                       el otro extremo se desconectó
  | { type: "rejected" } //                  → tablet: la sesión ya tiene otra tablet
