import { useEffect, useRef, useState } from "react"
import { IPS_NAME, SEDE } from "../shared/config"
import { formatCOP, formatTime, parseDate } from "../shared/catalog"
import Icon, { type IconName } from "../shared/Icon"
import type { Progress, Slot, TabletState, VideoRef } from "../shared/types"

interface Props {
  state: TabletState
  /** Stream de la cámara de la tablet; en la vista previa del funcionario es null. */
  stream: MediaStream | null
  cameraError?: string | null
  preview?: boolean
  onSelect?: (index: number) => void
}

/** Pantalla completa del señante. Solo dibuja el estado que publica el funcionario. */
export default function TabletScreen({ state, stream, cameraError, preview, onSelect }: Props) {
  const { view, video, seq } = state
  const select = (i: number) => onSelect?.(i)

  return (
    <div className="tab-screen">
      <header className="tab-banner">
        <div className="tab-logo"><Icon name="front_hand" fill />InLSC</div>
        <div className="tab-welcome">
          <small>Bienvenido/a a</small>
          <strong>{IPS_NAME}.</strong>
          <span>Estamos listos para atenderte.</span>
        </div>
        <div className="tab-cross"><Icon name="health_cross" fill /></div>
      </header>

      <main className="tab-main">
        {view.kind === "idle" && (
          <div className="tab-idle">
            <div className="tab-idle-logo"><Icon name="front_hand" fill /></div>
            <strong>{view.message ?? `${IPS_NAME} · ${SEDE}`}</strong>
            {!view.message && <p>Esperando al funcionario de recepción…</p>}
            {!view.message && <em>Por favor, tenga a la mano su documento de identidad.</em>}
          </div>
        )}

        {view.kind === "video" && video && (
          <div className="tab-video-only"><LscVideo video={video} seq={seq} /></div>
        )}

        {view.kind === "detect" && (
          <div className="tab-split">
            <section className="tab-left">
              <Camera stream={stream} error={cameraError} preview={preview} large />
              <div className="tab-chips">
                {view.options.map((o, i) => (
                  <div key={o.text} className={`tab-chip ${view.detected === i ? "is-match" : ""}`}>
                    <Icon name={o.icon} />{o.text}{view.detected === i && <Icon name="check_circle" fill label="Reconocido" />}
                  </div>
                ))}
              </div>
            </section>
            <aside className="tab-right">
              <Instruction text="Haga la seña de su solicitud" icon="front_hand" />
              {video && <LscVideo video={video} seq={seq} compact />}
            </aside>
          </div>
        )}

        {view.kind === "menu" && (
          <div className="tab-split">
            <section className="tab-left">
              <h2 className="tab-title">{view.title}</h2>
              <div className={`tab-cards ${view.options.length > 6 ? "dense" : ""}`}>
                {view.options.map((o, i) => (
                  <button key={i} className={`tab-card ${view.selected === i ? "is-selected" : ""}`} style={{ "--c": o.color } as React.CSSProperties} onClick={() => select(i)}>
                    <span className="tab-card-tab">{o.tab}</span>
                    <span className="tab-card-body"><span className="tab-card-icon"><Icon name={o.icon} /></span><span>{o.text}</span></span>
                    <span className="tab-num">{i + 1}</span>
                  </button>
                ))}
              </div>
            </section>
            <aside className="tab-right">
              <Instruction text={view.instruction} icon="touch_app" />
              {video && <LscVideo video={video} seq={seq} compact />}
              <Camera stream={stream} error={cameraError} preview={preview} />
            </aside>
          </div>
        )}

        {view.kind === "horarios" && (
          <div className="tab-split">
            <section className="tab-left">
              <SlotBoard slots={view.slots} selected={view.selected} onSelect={select} />
            </section>
            <aside className="tab-right">
              <Instruction text={view.instruction} icon="touch_app" />
              {video && <LscVideo video={video} seq={seq} compact />}
              <Camera stream={stream} error={cameraError} preview={preview} />
            </aside>
          </div>
        )}

        {view.kind === "valor" && (
          <div className="tab-split">
            <section className="tab-left tab-center">
              <div className="tab-amount">
                <span>Valor a pagar</span>
                <strong>{formatCOP(view.amount)}</strong>
                <em><Icon name="payments" /> Solo efectivo</em>
              </div>
            </section>
            <aside className="tab-right">{video && <LscVideo video={video} seq={seq} compact />}</aside>
          </div>
        )}

        {view.kind === "resultado" && (
          <div className="tab-split">
            <section className="tab-left tab-center">
              <div className={`tab-result ${view.variant}`}>
                <div className="tab-check"><Icon name="check" /></div>
                <h2>{view.variant === "asignada" ? "¡Cita asignada!" : "Su cita ha sido cancelada"}</h2>
                <dl>{view.lines.map((l) => <div key={l.label}><dt>{l.label}</dt><dd>{l.value}</dd></div>)}</dl>
              </div>
            </section>
            <aside className="tab-right">{video && <LscVideo video={video} seq={seq} compact />}</aside>
          </div>
        )}
      </main>

      {state.progress && <ProgressBar progress={state.progress} />}
    </div>
  )
}

function Instruction({ text, icon }: { text: string; icon: IconName }) {
  return <div className="tab-instruction"><Icon name={icon} fill />{text}</div>
}

export function LscVideo({ video, seq, compact }: { video: VideoRef; seq: number; compact?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [ended, setEnded] = useState(false)
  useEffect(() => setEnded(false), [video.src, seq])

  const replay = () => {
    const el = ref.current
    if (!el) return
    el.currentTime = 0
    void el.play()
    setEnded(false)
  }

  return (
    <figure className={`lsc-video ${compact ? "compact" : ""}`}>
      <div className="lsc-frame">
        <video key={`${video.src}#${seq}`} ref={ref} src={video.src} autoPlay muted playsInline onEnded={() => setEnded(true)} />
        <span className="lsc-tag">LSC</span>
        {ended && <button className="lsc-replay" onClick={replay}><Icon name="replay" /> Repetir</button>}
      </div>
      <figcaption><span>CC</span>{video.caption}</figcaption>
    </figure>
  )
}

function Camera({ stream, error, preview, large }: { stream: MediaStream | null; error?: string | null; preview?: boolean; large?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream }, [stream])

  return (
    <div className={`tab-camera ${large ? "large" : ""}`}>
      {stream ? <video ref={ref} autoPlay muted playsInline /> : (
        <div className="tab-camera-empty">{preview ? <span><Icon name="photo_camera" /> Cámara de la tablet</span> : error ?? "Activando cámara…"}</div>
      )}
      {large && <div className="tab-guide"><span>Ubique sus manos dentro del recuadro</span></div>}
      {(stream || preview) && <span className="tab-live"><Icon name="radio_button_checked" /> Cámara activa</span>}
    </div>
  )
}

function SlotBoard({ slots, selected, onSelect }: { slots: Slot[]; selected: number | null; onSelect: (i: number) => void }) {
  const indexed = slots.map((s, i) => ({ ...s, i, p: parseDate(s.date) }))
  const months = [...new Set(indexed.map((s) => `${s.p.month} ${s.p.year}`))]
  return (
    <div className="tab-slots">
      <div className="tab-slots-icon"><Icon name="calendar_month" /></div>
      {months.map((m, mi) => (
        <section key={m}>
          <h3 className={mi % 2 ? "alt" : ""}>{m.split(" ")[0]}</h3>
          <div className="tab-slot-row">
            {indexed.filter((s) => `${s.p.month} ${s.p.year}` === m).map((s) => (
              <button key={s.i} className={`tab-slot ${selected === s.i ? "is-selected" : ""}`} onClick={() => onSelect(s.i)}>
                <span className="tab-num">{s.i + 1}</span>
                <span className="tab-slot-day"><b>{String(s.p.day).padStart(2, "0")}</b>{s.p.weekday}</span>
                <span className="tab-slot-time">{Number(s.time.split(":")[0]) < 12 ? <Icon name="light_mode" className="sun" /> : <Icon name="dark_mode" className="moon" />} {formatTime(s.time)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ProgressBar({ progress }: { progress: Progress }) {
  return (
    <footer className="tab-progress" style={{ "--c": progress.color } as React.CSSProperties}>
      {progress.labels.map((label, i) => {
        const state = i < progress.current ? "done" : i === progress.current ? "active" : "pending"
        return (
          <div key={i} className={`tp-item ${state}`}>
            {i > 0 && <span className="tp-line" />}
            <span className="tp-dot">{state === "done" ? <Icon name="check" label="Completado" /> : i + 1}</span>
            <span className="tp-label">{label}</span>
          </div>
        )
      })}
    </footer>
  )
}
