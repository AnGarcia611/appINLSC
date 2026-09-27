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

export function SpecialtyPicker({ onSend }: { onSend: (options: MenuOption[]) => void }) {
  const [chosen, setChosen] = useState<MenuOption[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  const isChosen = (o: MenuOption) => chosen.some((c) => c.tab === o.tab && c.text === o.text)
  const toggle = (o: MenuOption) =>
    setChosen((list) => isChosen(o) ? list.filter((c) => !(c.tab === o.tab && c.text === o.text)) : list.length < MAX_OPTIONS ? [...list, o] : list)

  const visible = SPECIALTIES.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="picker">
      <div className="picker-row">
        <input placeholder="Buscar especialidad…" aria-label="Buscar especialidad" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn ghost sm" onClick={() => setChosen(EXAMPLE_SERVICES.map(([a, b]) => toOption(a, b)))}>Ejemplo</button>
      </div>
      <div className="picker-list">
        {visible.map((sp) => (
          <div key={sp.name} className="picker-group">
            <button className="picker-head" aria-expanded={open === sp.name} onClick={() => setOpen(open === sp.name ? null : sp.name)}>
              <span className="dot" style={{ background: sp.color }} /><Icon name={sp.icon} /> {sp.name}
              <em>{chosen.filter((c) => c.tab === sp.name).length || ""}</em>
              <Icon name={open === sp.name ? "keyboard_arrow_down" : "chevron_right"} />
            </button>
            {open === sp.name && sp.services.map((sv) => {
              const o = toOption(sp.name, sv)
              return (
                <label key={sv} className="picker-item">
                  <input type="checkbox" checked={isChosen(o)} onChange={() => toggle(o)} /> {sv}
                </label>
              )
            })}
          </div>
        ))}
      </div>
      {chosen.length > 0 && (
        <ol className="picker-chosen">
          {chosen.map((c, i) => <li key={i}><b>{i + 1}</b> {c.tab} · {c.text} <button onClick={() => toggle(c)} aria-label={`Quitar ${c.tab} · ${c.text}`}><Icon name="close" /></button></li>)}
        </ol>
      )}
      <button className="btn primary" disabled={!chosen.length} onClick={() => onSend(chosen)}>
        Enviar a la tablet ({chosen.length}/{MAX_OPTIONS}) <Icon name="arrow_forward" />
      </button>
    </div>
  )
}

const EXAMPLE_SLOTS: Slot[] = [
  { date: "2026-10-01", time: "07:00" }, { date: "2026-10-13", time: "17:00" },
  { date: "2026-11-03", time: "18:00" }, { date: "2026-11-04", time: "09:00" },
  { date: "2026-12-07", time: "10:20" }, { date: "2026-12-11", time: "17:40" },
]

export function SlotPicker({ onSend, onNone }: { onSend: (slots: Slot[]) => void; onNone: () => void }) {
  const [slots, setSlots] = useState<Slot[]>([])
  const [date, setDate] = useState("")
  const [time, setTime] = useState("08:00")

  const add = () => {
    if (!date || !time || slots.length >= MAX_OPTIONS) return
    setSlots((list) => [...list, { date, time }].sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)))
  }

  return (
    <div className="picker">
      <div className="picker-row">
        <input type="date" aria-label="Fecha" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" aria-label="Hora" value={time} onChange={(e) => setTime(e.target.value)} />
        <button className="btn ghost sm" onClick={add} disabled={!date}><Icon name="add" /> Agregar</button>
      </div>
      <button className="btn ghost sm" onClick={() => setSlots(EXAMPLE_SLOTS)}>Usar horarios de ejemplo</button>
      {slots.length > 0 && (
        <ol className="picker-chosen">
          {slots.map((s, i) => (
            <li key={i}><b>{i + 1}</b> {formatDate(s.date)} · {formatTime(s.time)} <button onClick={() => setSlots(slots.filter((_, j) => j !== i))} aria-label={`Quitar ${formatDate(s.date)} ${formatTime(s.time)}`}><Icon name="close" /></button></li>
          ))}
        </ol>
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
