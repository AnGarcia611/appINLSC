import { useState } from "react"
import { SPECIALTIES, formatDate, formatTime, specialtyByName } from "../shared/catalog"
import Icon from "../shared/Icon"
import type { MenuOption, Slot } from "../shared/types"

const MAX_OPTIONS = 9

/** Selección de ejemplo igual a la infografía de referencia. */
const EXAMPLE_SERVICES: [string, string][] = [
  ["Anestesiología", "Valoración anestésica"],
  ["Odontología general", "Higiene oral"],
  ["Nutrición y dietética", "Consulta de nutrición"],
  ["Dermatología", "Consulta dermatológica"],
  ["Gastroenterología", "Endoscopia digestiva"],
  ["Obstetricia", "Control prenatal"],
  ["Ortopedia", "Consulta de ortopedia"],
  ["Medicina general", "Consulta medicina general"],
]

const toOption = (specialty: string, service: string): MenuOption => {
  const sp = specialtyByName(specialty)!
  return { tab: sp.name, text: service, icon: sp.icon, color: sp.color }
}

/** Minúsculas y sin tildes, para que "pediatria" encuentre "Pediatría". */
const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

export function SpecialtyPicker({ onSend }: { onSend: (options: MenuOption[]) => void }) {
  const [chosen, setChosen] = useState<MenuOption[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  const isChosen = (o: MenuOption) => chosen.some((c) => c.tab === o.tab && c.text === o.text)
  const toggle = (o: MenuOption) =>
    setChosen((list) => isChosen(o) ? list.filter((c) => !(c.tab === o.tab && c.text === o.text)) : list.length < MAX_OPTIONS ? [...list, o] : list)
  const full = chosen.length >= MAX_OPTIONS

  // Se busca por especialidad y por servicio; con pocos resultados se muestran abiertos.
  const q = normalize(query.trim())
  const visible = SPECIALTIES.filter((s) => !q || normalize(s.name).includes(q) || s.services.some((sv) => normalize(sv).includes(q)))
  const expandAll = q !== "" && visible.length <= 3

  return (
    <div className="picker">
      <div className="picker-row">
        <input placeholder="Buscar especialidad o servicio…" aria-label="Buscar especialidad o servicio" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn ghost sm" onClick={() => setChosen(EXAMPLE_SERVICES.map(([a, b]) => toOption(a, b)))}>Ejemplo</button>
      </div>
      <div className="picker-list">
        {visible.map((sp) => {
          const expanded = expandAll || open === sp.name
          const count = chosen.filter((c) => c.tab === sp.name).length
          return (
            <div key={sp.name} className="picker-group" style={{ "--c": sp.color } as React.CSSProperties}>
              <button className="picker-head" aria-expanded={expanded} onClick={() => setOpen(open === sp.name ? null : sp.name)}>
                <span className="picker-icon"><Icon name={sp.icon} /></span> {sp.name}
                <em>{count || ""}</em>
                <Icon name={expanded ? "keyboard_arrow_down" : "chevron_right"} />
              </button>
              {expanded && (
                <div className="picker-services" role="group" aria-label={`Servicios de ${sp.name}`}>
                  {sp.services.map((sv) => {
                    const o = toOption(sp.name, sv)
                    const on = isChosen(o)
                    return (
                      <button key={sv} className={`chip ${on ? "on" : ""}`} aria-pressed={on} disabled={!on && full} onClick={() => toggle(o)}>
                        {on && <Icon name="check" />}{sv}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
        {!visible.length && <p className="picker-empty">Ninguna especialidad o servicio coincide con «{query}».</p>}
      </div>
      {chosen.length > 0 && (
        <>
          <p className="label">ASÍ SE VERÁN EN LA TABLET ({chosen.length}/{MAX_OPTIONS})</p>
          <ol className="picker-chosen">
            {chosen.map((c, i) => <li key={i}><b>{i + 1}</b> {c.tab} · {c.text} <button onClick={() => toggle(c)} aria-label={`Quitar ${c.tab} · ${c.text}`}><Icon name="close" /></button></li>)}
          </ol>
        </>
      )}
      <button className="btn primary" disabled={!chosen.length} onClick={() => onSend(chosen)}>
        Enviar a la tablet ({chosen.length}/{MAX_OPTIONS}) <Icon name="arrow_forward" />
      </button>
    </div>
  )
}

/** Horas que se agregan con un toque a la fecha elegida. */
const QUICK_TIMES = ["07:00", "08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"]

/** Fecha local en formato ISO ("2026-10-05"); toISOString usaría UTC y en la noche daría el día siguiente. */
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

const sortSlots = (list: Slot[]) => [...list].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))

/** Horarios de ejemplo en los próximos días hábiles, para que la demo nunca ofrezca fechas pasadas. */
function exampleSlots(): Slot[] {
  const plan: [number, string][] = [[1, "07:00"], [1, "10:20"], [2, "17:00"], [6, "09:00"], [13, "18:00"], [30, "17:40"]]
  return sortSlots(plan.map(([days, time]) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    if (d.getDay() === 6) d.setDate(d.getDate() + 2) // sábado → lunes
    if (d.getDay() === 0) d.setDate(d.getDate() + 1) // domingo → lunes
    return { date: isoDate(d), time }
  }))
}

export function SlotPicker({ onSend, onNone }: { onSend: (slots: Slot[]) => void; onNone: () => void }) {
  const [slots, setSlots] = useState<Slot[]>([])
  const [date, setDate] = useState("")
  const [time, setTime] = useState("08:00")

  const full = slots.length >= MAX_OPTIONS
  const has = (d: string, t: string) => slots.some((s) => s.date === d && s.time === t)
  const add = (t: string) => { if (date && t && !full && !has(date, t)) setSlots((list) => sortSlots([...list, { date, time: t }])) }
  const remove = (d: string, t: string) => setSlots((list) => list.filter((s) => !(s.date === d && s.time === t)))

  // Agrupados por fecha, en el mismo orden (y con el mismo número) que verá el señante.
  const days = [...new Set(slots.map((s) => s.date))]

  return (
    <div className="picker">
      <div className="picker-row fields">
        <label className="picker-field">Fecha<input type="date" min={isoDate(new Date())} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="picker-field">Hora<input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        <button className="btn ghost sm" onClick={() => add(time)} disabled={!date || full || has(date, time)}><Icon name="add" /> Agregar</button>
      </div>
      <div className="quick-times" role="group" aria-label="Horas frecuentes para la fecha elegida">
        {QUICK_TIMES.map((t) => {
          const on = !!date && has(date, t)
          return (
            <button key={t} className={`chip ${on ? "on" : ""}`} aria-pressed={on} disabled={!date || (full && !on)} onClick={() => on ? remove(date, t) : add(t)}>
              {on && <Icon name="check" />}{formatTime(t)}
            </button>
          )
        })}
      </div>
      <small className="hint">{date ? `Toque las horas para agregarlas al ${formatDate(date).toLowerCase()}.` : "Elija una fecha y toque las horas disponibles."}</small>
      <button className="btn ghost sm" onClick={() => setSlots(exampleSlots())}>Usar horarios de ejemplo</button>
      {slots.length > 0 && (
        <>
          <p className="label">ASÍ SE VERÁN EN LA TABLET ({slots.length}/{MAX_OPTIONS})</p>
          <div className="slot-groups">
            {days.map((d) => (
              <div key={d} className="slot-group">
                <strong>{formatDate(d)}</strong>
                <div className="slot-chips">
                  {slots.filter((s) => s.date === d).map((s) => (
                    <span key={s.time} className="slot-chip">
                      <b>{slots.indexOf(s) + 1}</b>{formatTime(s.time)}
                      <button onClick={() => remove(s.date, s.time)} aria-label={`Quitar ${formatDate(s.date)} ${formatTime(s.time)}`}><Icon name="close" /></button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <button className="btn primary" disabled={!slots.length} onClick={() => onSend(slots)}>Enviar horarios a la tablet ({slots.length}) <Icon name="arrow_forward" /></button>
      <button className="btn danger-ghost" onClick={onNone}>Sin disponibilidad · mostrar video de negación</button>
    </div>
  )
}

export function AmountInput({ onSend }: { onSend: (amount: number) => void }) {
  const [value, setValue] = useState("")
  const amount = Number(value.replace(/\D/g, ""))
  return (
    <div className="picker">
      <div className="picker-row">
        <span className="currency" aria-hidden="true">$</span>
        <input inputMode="numeric" placeholder="Valor de la factura" aria-label="Valor de la factura en pesos" value={value ? amount.toLocaleString("es-CO") : ""} onChange={(e) => setValue(e.target.value)} />
      </div>
      <button className="btn primary" disabled={!amount} onClick={() => onSend(amount)}>Mostrar valor en la tablet <Icon name="arrow_forward" /></button>
    </div>
  )
}
