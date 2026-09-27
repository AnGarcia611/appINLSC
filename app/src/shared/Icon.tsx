// Iconos de Material Symbols (Rounded, peso 400) empaquetados como SVG locales: no dependen de internet
// ni de una fuente web, y solo entran al bundle los que se listan aquí.
const RAW = import.meta.glob<string>(
  [
    "/node_modules/@material-symbols/svg-400/rounded/{accessible,add,arrow_forward,autorenew,block,calendar_month,cardiology,check,check_circle,chevron_right,close,dark_mode,dentistry,dermatology,edit,ent,event_available,event_busy,family_home,front_hand,gastroenterology,gynecology,health_cross,hourglass_top,keyboard_arrow_down,light_mode,link_off,movie,nutrition,oncology,orthopedics,pause_circle,payments,pediatrics,photo_camera,physical_therapy,play_arrow,pregnant_woman,psychiatry,psychology,pulmonology,radio_button_checked,radiology,record_voice_over,remove,replay,restart_alt,sensors,sentiment_very_satisfied,settings,stethoscope,surgical,sync,syringe,touch_app,warning,wifi_off,wifi_tethering}.svg",
    // Variantes rellenas: solo las que se usan con `fill`.
    "/node_modules/@material-symbols/svg-400/rounded/{block,check_circle,front_hand,health_cross,pause_circle,play_arrow,touch_app,warning}-fill.svg",
  ],
  { query: "?raw", import: "default", eager: true },
)

/** Contenido interno de cada SVG (los <path>), indexado por nombre: "check", "check-fill"… */
const PATHS: Record<string, string> = Object.fromEntries(
  Object.entries(RAW).map(([file, svg]) => [file.slice(file.lastIndexOf("/") + 1, -4), svg.replace(/^<svg[^>]*>|<\/svg>$/g, "")]),
)

export type IconName =
  | "accessible" | "add" | "arrow_forward" | "autorenew" | "block" | "calendar_month" | "cardiology" | "check"
  | "check_circle" | "chevron_right" | "close" | "dark_mode" | "dentistry" | "dermatology" | "edit" | "ent"
  | "event_available" | "event_busy" | "family_home" | "front_hand" | "gastroenterology" | "gynecology"
  | "health_cross" | "hourglass_top" | "keyboard_arrow_down" | "light_mode" | "link_off" | "movie" | "nutrition"
  | "oncology" | "orthopedics" | "pause_circle" | "payments" | "pediatrics" | "photo_camera" | "physical_therapy"
  | "play_arrow" | "pregnant_woman" | "psychiatry" | "psychology" | "pulmonology" | "radio_button_checked" | "radiology"
  | "record_voice_over" | "remove" | "replay" | "restart_alt" | "sensors" | "sentiment_very_satisfied" | "settings" | "stethoscope"
  | "surgical" | "sync" | "syringe" | "touch_app" | "warning" | "wifi_off" | "wifi_tethering"

interface Props {
  name: IconName
  /** Variante rellena (estados activos o de énfasis, como recomienda Material). */
  fill?: boolean
  /** Texto alternativo. Sin él, el icono es decorativo y se oculta a los lectores de pantalla. */
  label?: string
  className?: string
}

/** Icono del tamaño y color del texto que lo rodea (1em, currentColor), como los emojis que reemplaza. */
export default function Icon({ name, fill, label, className }: Props) {
  const inner = PATHS[fill ? `${name}-fill` : name] ?? PATHS[name]
  return (
    <svg
      className={`icon ${className ?? ""}`}
      viewBox="0 -960 960 960"
      fill="currentColor"
      focusable="false"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  )
}
