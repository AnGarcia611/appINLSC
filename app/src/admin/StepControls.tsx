import { useState } from "react"
import { MOCK_CITAS, formatCOP, formatDate, formatTime } from "../shared/catalog"
import { PATHS } from "../shared/flows"
import { citaOptions, currentStep, optionCount, stepsOf, type Session, type SessionActions } from "./session"
import { AmountInput, SlotPicker, SpecialtyPicker } from "./pickers"
import Icon from "../shared/Icon"
import { ConfidenceBar, Msg } from "./widgets"

/** Controles del funcionario para el paso actual del trámite. */
export default function StepControls({ session: s, actions: a }: { session: Session; actions: SessionActions }) {
  const step = currentStep(s)
  const color = s.path?.color ?? "var(--blue)"
  const tag = `INLSC · PASO ${s.index + 1} DE ${stepsOf(s).length}${s.path ? "" : "+"} · ${step.label.toUpperCase()}`

  const nextButton = (
    <button className="btn primary" style={{ background: color }} onClick={a.advance}>
      {step.action ?? "Continuar"} <Icon name="arrow_forward" />
    </button>
  )

  switch (step.kind) {
    case "video":
      return <><Msg tag={tag}>{step.hint}</Msg>{nextButton}</>

    case "detect":
      return <DetectControls s={s} a={a} tag={tag} />

    case "especialidad":
      return (
        <>
          <Msg tag={tag}>{s.specialties ? "Infografía enviada. Esperando la selección del señante." : step.hint}</Msg>
          {s.specialties
            ? <PickControls s={s} a={a} labels={s.specialties.map((o) => `${o.tab} · ${o.text}`)} onEdit={() => a.sendSpecialties(null)} />
            : <SpecialtyPicker onSend={a.sendSpecialties} />}
        </>
      )

    case "cita":
      return (
        <>
          <Msg tag={tag}>{s.citasSent ? "Citas enviadas. Esperando la selección del señante." : step.hint}</Msg>
          {s.citasSent
            ? <PickControls s={s} a={a} labels={citaOptions().map((o) => `${o.tab} · ${o.text}`)} onEdit={() => a.sendCitas(false)} />
            : (
              <div className="picker">
                <ol className="picker-chosen">
                  {MOCK_CITAS.map((c, i) => <li key={i}><b>{i + 1}</b> {c.specialty} · {formatDate(c.date)} · {formatTime(c.time)} · {c.doctor}</li>)}
                </ol>
                <button className="btn primary" onClick={() => a.sendCitas(true)}>Enviar citas a la tablet <Icon name="arrow_forward" /></button>
              </div>
            )}
        </>
      )

    case "horario":
      if (s.noAvailability) return (
        <>
          <Msg tag={tag} tone="warn">Se mostró el video de negación: no hay disponibilidad.</Msg>
          <button className="btn ghost" onClick={() => a.setNoAvailability(false)}>Ofrecer otros horarios</button>
          <button className="btn danger-ghost" onClick={a.cancel}>Finalizar atención</button>
        </>
      )
      return (
        <>
          <Msg tag={tag}>{s.slots ? "Horarios enviados. Esperando la selección del señante." : step.hint}</Msg>
          {s.slots
            ? <PickControls s={s} a={a} labels={s.slots.map((x) => `${formatDate(x.date)} · ${formatTime(x.time)}`)} onEdit={() => a.sendSlots(null)} />
            : <SlotPicker onSend={a.sendSlots} onNone={() => a.setNoAvailability(true)} />}
        </>
      )

    case "valor":
      return (
        <>
          <Msg tag={tag}>{s.amount === null ? step.hint : `Valor enviado: ${formatCOP(s.amount)}`}</Msg>
          {s.amount === null
            ? <AmountInput onSend={a.sendAmount} />
            : <><button className="btn ghost" onClick={() => a.sendAmount(null)}>Cambiar valor</button>{nextButton}</>}
        </>
      )

    case "resultado":
      return <><Msg tag={tag} tone="ok">{step.hint}</Msg>{nextButton}</>
  }
}

function DetectControls({ s, a, tag }: { s: Session; a: SessionActions; tag: string }) {
  const [scripted, setScripted] = useState(0)
  const { status, intent, confidence } = s.detect
  const path = PATHS[intent]

  if (status === "waiting") return (
    <>
      <Msg tag={tag}>Cámara activa en la tablet. El señante hace la seña de su solicitud.</Msg>
      <div className="demo-box">
        <div className="demo-title"><Icon name="movie" /> Guion de la demo</div>
        <label className="field">
          Resultado a simular
          <select value={scripted} onChange={(e) => setScripted(Number(e.target.value))}>
            {PATHS.map((p, i) => <option key={p.id} value={i}>{p.name}</option>)}
          </select>
        </label>
        <button className="btn primary" onClick={() => a.simulateDetection(scripted, false)}><Icon name="play_arrow" fill /> Simular reconocimiento</button>
        <button className="btn ghost sm" onClick={() => a.simulateDetection(scripted, true)}>Simular confianza baja</button>
      </div>
    </>
  )

  if (status === "analyzing") return (
    <>
      <Msg tag={tag}>Interpretando la seña de solicitud…</Msg>
      <ConfidenceBar value={confidence} animating label="Precisión de interpretación LSC" />
    </>
  )

  const low = confidence < 70
  return (
    <>
      <div className="detected" style={{ borderColor: path.color }}>
        <Icon name={path.icon} />
        <div><strong>{path.name}</strong><em>Seña LSC interpretada</em></div>
      </div>
      <ConfidenceBar value={confidence} animating={false} label="Precisión de interpretación LSC" />
      {low && <Msg tag="VALIDACIÓN REQUERIDA" tone="warn">La intención no se reconoció con suficiente confianza. Repita la seña o confirme el trámite manualmente.</Msg>}
      <button className="btn warn-ghost" onClick={a.retryDetection}><Icon name="restart_alt" /> Volver a captar seña</button>
      <p className="label">O confirme el trámite:</p>
      <div className="intent-list">
        {PATHS.map((p, i) => (
          <button key={p.id} className={`intent ${i === intent ? "active" : ""}`} style={{ "--c": p.color } as React.CSSProperties} aria-pressed={i === intent} onClick={() => a.chooseIntent(i)}>
            <Icon name={p.icon} /> {p.name} {i === intent && <b><Icon name="check" label="Detectado" /></b>}
          </button>
        ))}
      </div>
      <button className="btn primary" style={{ background: path.color }} onClick={a.confirmIntent}>Confirmar: {path.name} <Icon name="arrow_forward" /></button>
    </>
  )
}

function PickControls({ s, a, labels, onEdit }: { s: Session; a: SessionActions; labels: string[]; onEdit: () => void }) {
  const { selected, source, confidence, analyzing } = s.pick
  const count = optionCount(s)

  return (
    <>
      {analyzing && <ConfidenceBar value={confidence} animating label="Precisión de detección del número" />}
      {!analyzing && selected !== null && (
        <div className="picked">
          <span className="picked-num">{selected + 1}</span>
          <div>
            <strong>{labels[selected]}</strong>
            <em>{source === "táctil" ? "Seleccionado en la pantalla táctil" : `Seña de número detectada · ${confidence} %`}</em>
          </div>
        </div>
      )}
      {!analyzing && selected === null && <p className="waiting"><Icon name="hourglass_top" /> Esperando selección (toque en la tablet o seña del número)…</p>}

      <div className="demo-box">
        <div className="demo-title"><Icon name="movie" /> Simular seña de número</div>
        <div className="num-row">
          {Array.from({ length: count }, (_, i) => (
            <button key={i} className="num" disabled={analyzing} onClick={() => a.simulateNumberSign(i)} aria-label={`Simular seña del número ${i + 1}`}>{i + 1}</button>
          ))}
        </div>
      </div>

      <button className="btn primary" disabled={selected === null || analyzing} onClick={a.confirmPick}>
        {selected === null ? "Confirmar opción" : `Confirmar opción ${selected + 1}`} <Icon name="arrow_forward" />
      </button>
      <div className="row">
        {selected !== null && <button className="btn ghost sm" onClick={a.resetPick}><Icon name="restart_alt" /> Recaptar</button>}
        <button className="btn ghost sm" onClick={onEdit}><Icon name="edit" /> Editar opciones</button>
      </div>
    </>
  )
}
