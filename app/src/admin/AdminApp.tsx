import { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import { IPS_NAME, SEDE } from "../shared/config"
import { SYNC_MODE, newSessionCode, useAdminSync } from "../shared/sync"
import { loadManifest, type VideoManifest } from "../shared/videos"
import type { Gender } from "../shared/types"
import TabletScreen from "../tablet/TabletScreen"
import StepControls from "./StepControls"
import { buildTabletState, currentStep, stepsOf, useSession, type Session } from "./session"
import Icon from "../shared/Icon"
import { ScaledPreview } from "./widgets"

type Side = "right" | "left"

function useStored<T extends string>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { return (localStorage.getItem(key) as T) ?? initial } catch { return initial }
  })
  const set = (v: T) => { setValue(v); try { localStorage.setItem(key, v) } catch { /* sin almacenamiento */ } }
  return [value, set] as const
}

export default function AdminApp() {
  const [gender, setGender] = useStored<Gender>("inlsc.gender", "m")
  const [side, setSide] = useStored<Side>("inlsc.side", "right")
  const [open, setOpen] = useState(false)
  const [manifest, setManifest] = useState<VideoManifest>({})
  // Código de la sesión de emparejamiento. Se conserva al recargar para que la tablet se reconecte sola.
  const [code, setCode] = useStored<string>("inlsc.session", "")
  const { session, actions } = useSession()

  useEffect(() => { loadManifest().then(setManifest) }, [])
  useEffect(() => { if (!code) setCode(newSessionCode()) }, [code]) // eslint-disable-line react-hooks/exhaustive-deps

  const sync = useAdminSync(code || null, (event) => { if (event.type === "select") actions.selectByTouch(event.index) })
  // Sin tablet conectada no se puede iniciar ni avanzar; una atención en curso queda en pausa.
  const tablet = sync.tablet

  const tabletState = useMemo(() => buildTabletState(session, gender, manifest), [session, gender, manifest])
  const serialized = JSON.stringify(tabletState)
  // `tablet` en las dependencias: al (re)conectarse la tablet se vuelve a publicar el estado actual.
  useEffect(() => { sync.send(tabletState) }, [serialized, tablet, sync.online]) // eslint-disable-line react-hooks/exhaustive-deps

  const newCode = () => setCode(newSessionCode())
  const pairing = <TabletPairing code={code} onNewCode={newCode} />

  // La vista previa se aparta mientras se arman especialidades u horarios, para dejarles espacio.
  // El funcionario puede mostrarla u ocultarla; su elección vale hasta que cambia el paso.
  const composing = isComposing(session)
  const previewKey = `${session.index}:${composing}`
  const [previewToggle, setPreviewToggle] = useState<{ key: string; open: boolean } | null>(null)
  const previewOpen = previewToggle?.key === previewKey ? previewToggle.open : !composing

  const startAttention = () => { setOpen(true); if (!session.active && tablet) actions.start() }
  const connection = <ConnectionAlert online={sync.online} tablet={tablet} paused={session.active} pairing={pairing} />

  return (
    <div className="portal">
      <PortalBackground />

      {!open && (
        <section className={`launcher ${side}`}>
          <div className="launcher-top"><div className="brand-mark"><Icon name="front_hand" fill /></div><div><strong>InLSC</strong><span>Asistente en LSC salud</span></div></div>
          {session.active ? (
            <>
              <p className="launcher-eyebrow">ATENCIÓN EN CURSO</p>
              <h2>{session.path?.name ?? "Nueva atención"}</h2>
              {!tablet && <p className="launcher-alert"><Icon name="pause_circle" fill /> En pausa: tablet desconectada</p>}
              <button className="launcher-start" onClick={() => setOpen(true)}>Abrir panel <Icon name="arrow_forward" /></button>
            </>
          ) : (
            <>
              <p className="launcher-eyebrow">ATENCIÓN INCLUSIVA</p>
              <h2>¿Necesita ayuda?</h2>
              <p>Inicie una atención administrativa en Lengua de Señas Colombiana.</p>
              {/* "Iniciar atención" arranca directo desde aquí, así que el intérprete también se elige aquí. */}
              <div className="launcher-gender"><span>Intérprete</span><GenderSwitch gender={gender} setGender={setGender} small /></div>
              <button className="launcher-start" onClick={startAttention}>{tablet ? "Iniciar atención" : "Conectar tablet"} <Icon name="arrow_forward" /></button>
              <p className={`launcher-note ${tablet ? "ok" : "off"}`}><Icon name={tablet ? "check_circle" : "link_off"} fill={tablet} /> {tablet ? "Tablet conectada" : "Tablet desconectada"} · Sesión {code}</p>
            </>
          )}
        </section>
      )}

      {open && (
        <aside className={`dock ${side}`}>
          <header className="dock-header">
            <div className="brand-mark"><Icon name="front_hand" fill /></div>
            <div className="dock-title">
              <strong>InLSC</strong>
              <span>{session.path ? <><Icon name={session.path.icon} /> {session.path.name}</> : session.active ? "Nueva atención · Recepción" : "Recepción"}</span>
            </div>
            <span className={`status ${tablet ? "ok" : "off"}`} title="Estado de la tablet">
              <Icon name={tablet ? "check_circle" : sync.online ? "link_off" : "wifi_off"} fill={tablet} />
              {tablet ? "Tablet conectada" : sync.online ? "Sin tablet" : "Sin conexión"}
            </span>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Minimizar panel"><Icon name="remove" /></button>
          </header>

          <div className="demo-badge">MODO DEMO · reconocimiento de señas simulado</div>

          {connection}

          <div className="dock-body">
            {session.active ? (
              <>
                {/* Durante la atención solo se ven el progreso, la pantalla del señante y las indicaciones del paso. */}
                <AdminSteps labels={stepsOf(session).map((s) => s.label)} current={session.index} color={session.path?.color} />
                <div className="label-row">
                  <p className="label">PANTALLA DEL SEÑANTE</p>
                  <button className="link-btn" aria-expanded={previewOpen} onClick={() => setPreviewToggle({ key: previewKey, open: !previewOpen })}>
                    <Icon name={previewOpen ? "visibility_off" : "visibility"} /> {previewOpen ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                {previewOpen && (
                  <div className="preview-frame">
                    <ScaledPreview width={1180} height={820}>
                      <TabletScreen state={tabletState} stream={null} preview />
                    </ScaledPreview>
                  </div>
                )}
                {/* fieldset deshabilitado: bloquea todos los botones y campos del paso mientras no hay tablet */}
                <fieldset className="controls-lock" disabled={!tablet}>
                  <StepControls session={session} actions={actions} />
                </fieldset>
              </>
            ) : (
              <div className="dock-idle">
                {session.finished && <div className="done-card"><span><Icon name="check" /></span><strong>Trámite completado</strong></div>}
                {/* Preferencias a la vista (sin ⚙) mientras no hay atención; al iniciarla desaparecen. */}
                <Preferences gender={gender} setGender={setGender} side={side} setSide={setSide} />
                {tablet && (
                  <div className="session-line">
                    <span><Icon name="check_circle" fill /> Tablet conectada · Sesión {code}</span>
                    <button className="btn ghost sm" onClick={newCode} title="Desconecta la tablet actual y genera otro código"><Icon name="autorenew" /> Nueva sesión</button>
                  </div>
                )}
                <button className="btn primary" onClick={actions.start} disabled={!tablet} title={tablet ? undefined : "Conecte la tablet para iniciar"}>{session.finished ? "Nueva atención" : "Iniciar atención"} <Icon name="arrow_forward" /></button>
              </div>
            )}
          </div>

          <footer className="dock-footer">
            {session.active && <button className="btn ghost sm" onClick={actions.replay} disabled={!tablet}><Icon name="replay" /> Repetir video</button>}
            {session.active && <button className="btn ghost sm" onClick={actions.cancel}><Icon name="close" /> Cancelar atención</button>}
            <span>El sistema de la IPS sigue disponible en el resto de la pantalla.</span>
          </footer>
        </aside>
      )}
    </div>
  )
}

/** Aviso visible cuando no hay tablet conectada (o no hay conexión con el bus). Incluye el QR para conectarla. */
function ConnectionAlert({ online, tablet, paused, pairing }: { online: boolean; tablet: boolean; paused: boolean; pairing: React.ReactNode }) {
  if (tablet) return null
  const title = paused ? "Atención en pausa: tablet desconectada" : "Tablet desconectada"
  const text = !online
    ? SYNC_MODE === "relay"
      ? "No hay conexión con los servidores de enlace. Revise la conexión a internet del computador."
      : "No hay conexión con el servidor local. Verifique que `npm run dev` siga en ejecución."
    : paused
      ? "No se puede avanzar hasta que la tablet se reconecte. La atención continuará en el mismo paso."
      : "Conecte la tablet para iniciar una atención."
  return (
    <div className="conn-alert" role="alert">
      <strong><Icon name={paused ? "pause_circle" : "link_off"} fill={paused} /> {title}</strong>
      <span>{text}</span>
      {pairing}
    </div>
  )
}

function AdminSteps({ labels, current, color = "var(--blue)" }: { labels: string[]; current: number; color?: string }) {
  return (
    <ol className="adm-steps" style={{ "--c": color } as React.CSSProperties}>
      {labels.map((l, i) => (
        <li key={i} className={i < current ? "done" : i === current ? "active" : ""} title={l}>
          <span>{i < current ? <Icon name="check" label="Completado" /> : i + 1}</span><small>{l}</small>
        </li>
      ))}
    </ol>
  )
}

/** Pasos en los que el funcionario arma la infografía (especialidades u horarios) antes de enviarla. */
function isComposing(s: Session) {
  if (!s.active) return false
  const kind = currentStep(s).kind
  return (kind === "especialidad" && !s.specialties) || (kind === "horario" && !s.slots && !s.noAvailability)
}

function GenderSwitch({ gender, setGender, small }: { gender: Gender; setGender: (g: Gender) => void; small?: boolean }) {
  return (
    <div className={`seg ${small ? "sm" : ""}`} role="group" aria-label="Intérprete de los videos">
      <button className={gender === "m" ? "on" : ""} aria-pressed={gender === "m"} onClick={() => setGender("m")}>Mujer</button>
      <button className={gender === "h" ? "on" : ""} aria-pressed={gender === "h"} onClick={() => setGender("h")}>Hombre</button>
    </div>
  )
}

function Preferences({ gender, setGender, side, setSide }: { gender: Gender; setGender: (g: Gender) => void; side: Side; setSide: (s: Side) => void }) {
  return (
    <div className="prefs">
      <div className="field">
        Intérprete de los videos (según perfil del funcionario)
        <GenderSwitch gender={gender} setGender={setGender} />
        <small>Si falta el video de hombre, se usa el de mujer.</small>
      </div>
      <div className="field">
        Posición del panel
        <div className="seg" role="group" aria-label="Posición del panel">
          <button className={side === "left" ? "on" : ""} aria-pressed={side === "left"} onClick={() => setSide("left")}>Izquierda</button>
          <button className={side === "right" ? "on" : ""} aria-pressed={side === "right"} onClick={() => setSide("right")}>Derecha</button>
        </div>
      </div>
    </div>
  )
}

function TabletPairing({ code, onNewCode }: { code: string; onNewCode: () => void }) {
  const [urls, setUrls] = useState<string[]>([])
  const [qr, setQr] = useState<string | null>(null)

  useEffect(() => {
    // Si el modo se forzó con ?sync=, la tablet debe usar el mismo.
    const forced = new URLSearchParams(location.search).has("sync") ? `&sync=${SYNC_MODE}` : ""
    const tabletUrl = (origin: string) => `${origin}${location.pathname}?tablet&s=${code}${forced}`
    if (SYNC_MODE === "relay") { setUrls([tabletUrl(location.origin)]); return }
    fetch("api/host").then((r) => r.json())
      .then(({ ips, port }: { ips: string[]; port: number }) => setUrls(ips.map((ip) => tabletUrl(`${location.protocol}//${ip}:${port}`))))
      .catch(() => setUrls([tabletUrl(location.origin)]))
  }, [code])

  useEffect(() => {
    if (!urls[0]) return
    QRCode.toDataURL(urls[0], { margin: 1, width: 360 }).then(setQr).catch(() => setQr(null))
  }, [urls])

  return (
    <div className="pairing">
      <strong><Icon name="wifi_tethering" /> Conectar la tablet</strong>
      <div className="pairing-row">
        {qr && <img className="pairing-qr" src={qr} alt="Código QR para abrir la tablet" />}
        <div className="pairing-code">
          <small>Código de sesión</small>
          <b>{code}</b>
          <button className="btn ghost sm" onClick={onNewCode} title="Desconecta las tablets actuales"><Icon name="autorenew" /> Nueva sesión</button>
        </div>
      </div>
      <span>
        Escanee el QR con la tablet, o abra la dirección y escriba el código
        {SYNC_MODE === "local" ? " (misma red WiFi):" : " (requiere internet):"}
      </span>
      {urls.map((u) => <code key={u}>{u}</code>)}
    </div>
  )
}

function PortalBackground() {
  return (
    <div className="portal-bg">
      <header><span className="portal-logo">{IPS_NAME.toUpperCase()}</span><span>Portal de atención · {SEDE}</span></header>
      <div className="portal-hero">
        <p>{IPS_NAME.toUpperCase()} · {SEDE.toUpperCase()}</p>
        <h1>Calidad e innovación<br />para mejorar tu salud.</h1>
        <div className="portal-links"><span>Portal de gestión de citas</span><span>Información de servicios</span><span>Canales de atención</span></div>
      </div>
    </div>
  )
}
