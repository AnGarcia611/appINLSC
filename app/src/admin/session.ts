import { useCallback, useRef, useState } from "react"
import { MOCK_CITAS, formatDate, formatTime, specialtyByName } from "../shared/catalog"
import { SEDE } from "../shared/config"
import { INTRO, PATHS, type FlowPath, type Step } from "../shared/flows"
import { pickVideo, type VideoManifest } from "../shared/videos"
import type { Gender, MenuOption, Notice, Recognize, SignGuess, Slot, TabletEvent, TabletState } from "../shared/types"

export type Cita = (typeof MOCK_CITAS)[number]

/** Aviso que acompaña al video de negación en la tablet. */
const NO_AVAILABILITY: Notice = { title: "No hay disponibilidad", text: "Intente otro día." }

/** Confianza mínima (%) para que una seña de número marque la opción en la tablet sin intervención del funcionario. */
export const SIGN_ACCEPT = 70

/** Última seña de número reconocida en la tablet para la infografía actual. */
export interface SignRead extends SignGuess { alternatives: SignGuess[] }

export interface Session {
  active: boolean
  finished: boolean
  path: FlowPath | null
  index: number
  /** Se incrementa para reiniciar el video en la tablet. */
  seq: number
  detect: { status: "waiting" | "analyzing" | "done"; intent: number; confidence: number }
  specialties: MenuOption[] | null
  citasSent: boolean
  slots: Slot[] | null
  noAvailability: boolean
  amount: number | null
  /** Opción elegida en la infografía (null mientras no elige): por toque o por la seña del número. */
  pick: number | null
  /** Quién eligió la opción actual. */
  pickBy: "táctil" | "seña" | "funcionario" | null
  /** Última seña de número reconocida en este paso (aunque no haya marcado la opción por baja confianza). */
  sign: SignRead | null
  chosen: { specialty?: MenuOption; slot?: Slot; cita?: Cita }
}

const NEW_SESSION: Session = {
  active: false, finished: false, path: null, index: 0, seq: 0,
  detect: { status: "waiting", intent: 0, confidence: 0 },
  specialties: null, citasSent: false, slots: null, noAvailability: false, amount: null,
  pick: null, pickBy: null, sign: null, chosen: {},
}

export const stepsOf = (s: Session): Step[] => [...INTRO, ...(s.path?.steps ?? [])]
export const currentStep = (s: Session): Step => stepsOf(s)[s.index]

export const citaOptions = (): MenuOption[] =>
  MOCK_CITAS.map((c) => {
    const sp = specialtyByName(c.specialty)
    return { tab: c.specialty, text: `${formatDate(c.date)} · ${formatTime(c.time)}`, icon: sp?.icon ?? "event_available", color: sp?.color ?? "#145da0" }
  })

/** Número de opciones que el señante puede elegir en el paso actual (0 si no hay infografía enviada). */
export function optionCount(s: Session): number {
  const step = currentStep(s)
  if (step.kind === "especialidad") return s.specialties?.length ?? 0
  if (step.kind === "cita") return s.citasSent ? MOCK_CITAS.length : 0
  if (step.kind === "horario") return s.noAvailability ? 0 : s.slots?.length ?? 0
  return 0
}

const random = (min: number, max: number) => Math.round(min + Math.random() * (max - min))

export function useSession() {
  const [session, setSession] = useState<Session>(NEW_SESSION)
  // Evita que un temporizador de una simulación anterior modifique un paso distinto.
  const stepToken = useRef(0)

  const update = useCallback((fn: (s: Session) => Session) => setSession(fn), [])

  const start = () => { stepToken.current++; setSession({ ...NEW_SESSION, active: true }) }
  const cancel = () => { stepToken.current++; setSession(NEW_SESSION) }
  const replay = () => update((s) => ({ ...s, seq: s.seq + 1 }))

  const advance = () => {
    stepToken.current++
    update((s) => {
      const last = s.index >= stepsOf(s).length - 1
      if (last) return { ...s, active: false, finished: true }
      return { ...s, index: s.index + 1, seq: s.seq + 1, pick: null, pickBy: null, sign: null }
    })
  }

  // ── Detección simulada del trámite ──
  const simulateDetection = (intent: number, low: boolean) => {
    const token = ++stepToken.current
    const confidence = low ? random(41, 58) : random(87, 96)
    update((s) => ({ ...s, detect: { status: "analyzing", intent, confidence } }))
    setTimeout(() => {
      if (token !== stepToken.current) return
      update((s) => ({ ...s, detect: { ...s.detect, status: "done" } }))
    }, 1800)
  }
  const retryDetection = () => { stepToken.current++; update((s) => ({ ...s, seq: s.seq + 1, detect: { status: "waiting", intent: 0, confidence: 0 } })) }
  const chooseIntent = (intent: number) => update((s) => ({ ...s, detect: { ...s.detect, intent } }))
  const confirmIntent = () => {
    stepToken.current++
    update((s) => ({ ...s, path: PATHS[s.detect.intent], index: s.index + 1, seq: s.seq + 1, pick: null, pickBy: null, sign: null }))
  }

  // ── Selección en infografías: el señante toca la opción o hace la seña del número ──
  const selectByTouch = (index: number) => update((s) => index < optionCount(s) ? { ...s, pick: index, pickBy: "táctil", sign: null } : s)

  /**
   * Seña de número reconocida en la tablet. Se descarta si viene de otro paso (seq distinto) o fuera de rango.
   * Con confianza ≥ SIGN_ACCEPT marca la opción; si no, queda como sugerencia para que el funcionario decida.
   */
  const selectBySign = (e: Extract<TabletEvent, { type: "sign" }>) => update((s) => {
    if (e.seq !== s.seq || e.value < 1 || e.value > optionCount(s)) return s
    const sign: SignRead = { value: e.value, confidence: e.confidence, alternatives: e.alternatives.filter((a) => a.value <= optionCount(s)) }
    return e.confidence >= SIGN_ACCEPT ? { ...s, sign, pick: e.value - 1, pickBy: "seña" } : { ...s, sign }
  })
  /** El funcionario acepta una sugerencia de baja confianza (o una alternativa). */
  const acceptSign = (value: number) => update((s) => (value >= 1 && value <= optionCount(s) ? { ...s, pick: value - 1, pickBy: "funcionario" } : s))
  // seq + 1: la tablet reinicia el reconocimiento y descarta señas en curso.
  const clearPick = () => update((s) => ({ ...s, pick: null, pickBy: null, sign: null, seq: s.seq + 1 }))

  const confirmPick = () => {
    update((s) => {
      const i = s.pick
      if (i === null) return s
      const step = currentStep(s)
      const chosen = { ...s.chosen }
      if (step.kind === "especialidad") chosen.specialty = s.specialties![i]
      if (step.kind === "horario") chosen.slot = s.slots![i]
      if (step.kind === "cita") chosen.cita = MOCK_CITAS[i]
      return { ...s, chosen }
    })
    advance()
  }

  return {
    session,
    actions: {
      start, cancel, replay, advance,
      simulateDetection, retryDetection, chooseIntent, confirmIntent,
      selectByTouch, selectBySign, acceptSign, clearPick, confirmPick,
      sendSpecialties: (options: MenuOption[] | null) => update((s) => ({ ...s, specialties: options, pick: null, pickBy: null, sign: null, seq: s.seq + 1 })),
      sendCitas: (sent: boolean) => update((s) => ({ ...s, citasSent: sent, pick: null, pickBy: null, sign: null, seq: s.seq + 1 })),
      sendSlots: (slots: Slot[] | null) => update((s) => ({ ...s, slots, noAvailability: false, pick: null, pickBy: null, sign: null, seq: s.seq + 1 })),
      setNoAvailability: (value: boolean) => update((s) => ({ ...s, noAvailability: value, slots: null, pick: null, pickBy: null, sign: null, seq: s.seq + 1 })),
      sendAmount: (amount: number | null) => update((s) => ({ ...s, amount, seq: s.seq + 1 })),
    },
  }
}

export type SessionActions = ReturnType<typeof useSession>["actions"]

/**
 * Traduce la sesión del funcionario a lo que debe mostrar la tablet.
 * `signNumbers`: en las infografías, además del toque, la tablet reconoce la seña del número de la opción.
 */
export function buildTabletState(s: Session, gender: Gender, manifest: VideoManifest, signNumbers = false): TabletState {
  const video = (id: Parameters<typeof pickVideo>[0]) => pickVideo(id, gender, manifest)

  if (!s.active) {
    return { seq: s.seq, camera: false, view: { kind: "idle", message: s.finished ? "Gracias por usar InLSC. ¡Que tenga un buen día!" : undefined } }
  }

  const steps = stepsOf(s)
  const step = steps[s.index]
  const base = {
    seq: s.seq,
    camera: false,
    progress: { labels: steps.map((x) => x.short), current: s.index, color: s.path?.color ?? "#145da0", title: step.label },
  }
  const selected = s.pick
  // Infografía con opciones: cámara y reconocimiento del número solo si el funcionario lo tiene activado.
  const choice = (count: number, instruction: string) => signNumbers
    ? { camera: true, recognize: { task: "number", max: count } satisfies Recognize, instruction: `${instruction} o haga la seña del número` }
    : { instruction }

  switch (step.kind) {
    case "video":
      return { ...base, view: { kind: "video" }, video: video(step.video!) }

    case "detect":
      return {
        ...base, camera: true, video: video("solicitud"),
        view: { kind: "detect", options: PATHS.map((p) => ({ icon: p.icon, text: p.name })), detected: s.detect.status === "done" && s.detect.confidence >= 70 ? s.detect.intent : null },
      }

    case "especialidad":
      if (!s.specialties) return { ...base, view: { kind: "video" }, video: video("especialidad") }
      {
        const { instruction, ...rec } = choice(s.specialties.length, "Seleccione su cita en la pantalla")
        return { ...base, ...rec, video: video("seleccion"), view: { kind: "menu", title: "Especialidades disponibles", instruction, options: s.specialties, selected } }
      }

    case "cita":
      if (!s.citasSent) return { ...base, view: { kind: "idle", message: "Un momento, estamos consultando sus citas…" } }
      {
        const { instruction, ...rec } = choice(MOCK_CITAS.length, "Seleccione la cita que desea cancelar")
        return { ...base, ...rec, video: video("seleccion"), view: { kind: "menu", title: "Sus citas registradas", instruction, options: citaOptions(), selected } }
      }

    case "horario":
      if (s.noAvailability) return { ...base, view: { kind: "video", notice: NO_AVAILABILITY }, video: video("negacion") }
      if (!s.slots) return { ...base, view: { kind: "idle", message: "Un momento, estamos consultando la disponibilidad…" } }
      {
        const { instruction, ...rec } = choice(s.slots.length, "Seleccione horario en la pantalla")
        return { ...base, ...rec, video: video("seleccion"), view: { kind: "horarios", instruction, slots: s.slots, selected } }
      }

    case "valor":
      if (s.amount === null) return { ...base, view: { kind: "idle", message: "Un momento, estamos calculando el valor…" } }
      return { ...base, view: { kind: "valor", amount: s.amount }, video: video("valor") }

    case "resultado": {
      const { specialty, slot, cita } = s.chosen
      const lines = step.variant === "asignada"
        ? [
            { label: "Especialidad", value: specialty?.tab ?? "—" },
            { label: "Servicio", value: specialty?.text ?? "—" },
            { label: "Fecha", value: slot ? formatDate(slot.date) : "—" },
            { label: "Hora", value: slot ? formatTime(slot.time) : "—" },
            { label: "Sede", value: SEDE },
          ]
        : [
            { label: "Especialidad", value: cita?.specialty ?? "—" },
            { label: "Fecha", value: cita ? formatDate(cita.date) : "—" },
            { label: "Hora", value: cita ? formatTime(cita.time) : "—" },
          ]
      return { ...base, view: { kind: "resultado", variant: step.variant!, lines }, video: video(step.video!) }
    }
  }
}
