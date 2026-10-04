import { useEffect, useRef, useState, type ReactNode } from "react"
import { IPS_NAME, SEDE } from "../shared/config"
import { formatCOP, formatTime, parseDate } from "../shared/catalog"
import Icon, { type IconName } from "../shared/Icon"
import type { Notice, Progress, Slot, TabletState, VideoRef } from "../shared/types"

interface Props {
  state: TabletState
  /** Stream de la cámara de la tablet; en la vista previa del funcionario es null. */
  stream: MediaStream | null
  cameraError?: string | null
  preview?: boolean
  /** Indicador de conexión (solo en la tablet real). Va en el encabezado para no tapar la barra de progreso. */
  status?: ReactNode
  onSelect?: (index: number) => void
}

/**
 * Pantalla completa del señante. Solo dibuja el estado que publica el funcionario.
 * Se adapta a su propio tamaño (consultas de contenedor en styles.css): tablet horizontal, celular vertical u horizontal.
 */
export default function TabletScreen({ state, stream, cameraError, preview, status, onSelect }: Props) {
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
        <div className="tab-banner-end">
          {status}
          <div className="tab-cross"><Icon name="health_cross" fill /></div>
        </div>
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
          <div className="tab-video-only"><LscVideo video={video} seq={seq} notice={view.notice} /></div>
        )}

        {view.kind === "detect" && (
          <div className="tab-split">
            <section className="tab-left">
              <Camera stream={stream} error={cameraError} preview={preview} />
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
              <div className={`tab-cards ${view.options.length <= 4 ? "few" : ""}`}>
                {view.options.map((o, i) => (
                  <button key={i} className={`tab-card ${view.selected === i ? "is-selected" : ""}`} aria-pressed={view.selected === i} style={{ "--c": o.color } as React.CSSProperties} onClick={() => select(i)}>
                    <span className="tab-card-tab">{o.tab}</span>
                    <span className="tab-card-body"><span className="tab-card-icon"><Icon name={o.icon} /></span><span className="tab-card-text">{o.text}</span></span>
                    <span className="tab-num">{i + 1}</span>
                    {view.selected === i && <SelectedMark />}
                  </button>
                ))}
              </div>
            </section>
            <aside className="tab-right">
              <Instruction text={view.instruction} icon="touch_app" />
              {video && <LscVideo video={video} seq={seq} compact />}
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

export function LscVideo({ video, seq, compact, notice }: { video: VideoRef; seq: number; compact?: boolean; notice?: Notice }) {
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
    <figure className={`lsc-video ${compact ? "compact" : ""} ${notice ? "has-notice" : ""}`}>
      <div className="lsc-frame">
        <video key={`${video.src}#${seq}`} ref={ref} src={video.src} autoPlay muted playsInline onEnded={() => setEnded(true)} />
        <span className="lsc-tag">LSC</span>
        {/* Sobre el lado izquierdo del cuadro, que en estos videos está vacío: no tapa a la intérprete. */}
        {notice && (
          <div className="lsc-notice">
            <Icon name="event_busy" />
            <strong>{notice.title}</strong>
            <span>{notice.text}</span>
          </div>
        )}
        {ended && <button className="lsc-replay" onClick={replay}><Icon name="replay" /> Repetir</button>}
      </div>
      {/* Con aviso no se repite el subtítulo: el aviso ya dice lo mismo y más. */}
      {!notice && <figcaption><span>CC</span>{video.caption}</figcaption>}
    </figure>
  )
}

/** Cámara de la tablet: solo en la detección de la seña (en las elecciones el señante toca la pantalla). */
function Camera({ stream, error, preview }: { stream: MediaStream | null; error?: string | null; preview?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream }, [stream])

  return (
    <div className="tab-camera">
      {stream ? <video ref={ref} autoPlay muted playsInline /> : (
        <div className="tab-camera-empty">{preview ? <span><Icon name="photo_camera" /> Cámara de la tablet</span> : error ?? "Activando cámara…"}</div>
      )}
      <div className="tab-guide"><span>Ubique sus manos dentro del recuadro</span></div>
      {(stream || preview) && <span className="tab-live"><Icon name="radio_button_checked" /> Cámara activa</span>}
    </div>
  )
}

/** Marca ✓ de la opción elegida: el estado no depende solo del color (WCAG 1.4.1). */
function SelectedMark() {
  return <span className="tab-selected-mark"><Icon name="check" label="Seleccionada" /></span>
}

function SlotBoard({ slots, selected, onSelect }: { slots: Slot[]; selected: number | null; onSelect: (i: number) => void }) {
  const indexed = slots.map((s, i) => ({ ...s, i, p: parseDate(s.date) }))
  const months = [...new Set(indexed.map((s) => `${s.p.month} ${s.p.year}`))]
  return (
    <>
      <h2 className="tab-title"><Icon name="calendar_month" /> Horarios disponibles</h2>
      <div className="tab-slots">
        {months.map((m, mi) => (
          <section key={m}>
            <h3 className={mi % 2 ? "alt" : ""}>{m.split(" ")[0]}</h3>
            {/* Cuadrícula: los horarios de un mes bajan de fila cuando no caben. */}
            <div className="tab-slot-grid">
              {indexed.filter((s) => `${s.p.month} ${s.p.year}` === m).map((s) => (
                <button key={s.i} className={`tab-slot ${selected === s.i ? "is-selected" : ""}`} aria-pressed={selected === s.i} onClick={() => onSelect(s.i)}>
                  <span className="tab-num">{s.i + 1}</span>
                  {selected === s.i && <SelectedMark />}
                  <span className="tab-slot-day"><b>{String(s.p.day).padStart(2, "0")}</b>{s.p.weekday}</span>
                  <span className="tab-slot-time">{Number(s.time.split(":")[0]) < 12 ? <Icon name="light_mode" className="sun" /> : <Icon name="dark_mode" className="moon" />} {formatTime(s.time)}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}

function ProgressBar({ progress }: { progress: Progress }) {
  return (
    <footer className="tab-progress" style={{ "--c": progress.color } as React.CSSProperties}>
      <div className="tp-track">
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
      </div>
      {/* En pantallas pequeñas las etiquetas no caben: se oculta cada una y se muestra solo el paso actual. */}
      <p className="tp-caption">Paso {progress.current + 1} · {progress.title ?? progress.labels[progress.current]}</p>
    </footer>
  )
}
