export type Gender = "h" | "m"

export type VideoId =
  | "saludo" | "solicitud" | "documento" | "especialidad" | "seleccion" | "negacion" | "despedida"
  | "cancelada" | "orden_medica" | "pago_efectivo" | "valor" | "recibo" | "espera_sala" | "con_gusto"

export interface VideoRef { id: VideoId; src: string; caption: string }

export interface Progress { labels: string[]; current: number; color: string }

export interface MenuOption { tab: string; text: string; icon: string; color: string }

export interface Slot { date: string; time: string } // "2026-10-01", "07:00"

export type TabletView =
  | { kind: "idle"; message?: string }
  | { kind: "video" }
  | { kind: "detect"; options: { icon: string; text: string }[]; detected: number | null }
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
}

/** Lo que la tablet envía al panel del funcionario. */
export type TabletEvent = { type: "select"; index: number }

export type ServerMessage =
  | { type: "state"; state: TabletState }
  | { type: "presence"; tablets: number }
  | { type: "tabletEvent"; event: TabletEvent }
