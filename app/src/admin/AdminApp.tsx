import { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import { IPS_NAME, SEDE } from "../shared/config"
import { SYNC_MODE, newSessionCode, useAdminSync } from "../shared/sync"
import { loadManifest, type VideoManifest } from "../shared/videos"
import type { Gender } from "../shared/types"
import TabletScreen from "../tablet/TabletScreen"
import StepControls from "./StepControls"
import { buildTabletState, stepsOf, useSession } from "./session"
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
  const [settings, setSettings] = useState(false)
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

  const pairing = <TabletPairing code={code} onNewCode={() => setCode(newSessionCode())} />

  const startAttention = () => { setOpen(true); if (!session.active && tablet) actions.start() }
  const connection = <ConnectionAlert online={sync.online} tablet={tablet} paused={session.active} pairing={pairing} />

  return (
    <div className="portal">
      <PortalBackground />

      {!open && (
        <section className={`launcher ${side}`}>
          <div className="launcher-top"><div className="brand-mark">✋</div><div><strong>InLSC</strong><span>Asistente en LSC salud</span></div></div>
          {session.active ? (
            <>
              <p className="launcher-eyebrow">ATENCIÓN EN CURSO</p>
              <h2>{session.path?.name ?? "Nueva atención"}</h2>
              {!tablet && <p className="launcher-alert">⏸ En pausa: tablet desconectada</p>}
              <button className="launcher-start" onClick={() => setOpen(true)}>Abrir panel →</button>
            </>
          ) : (
            <>
              <p className="launcher-eyebrow">ATENCIÓN INCLUSIVA</p>
              <h2>¿Necesita ayuda?</h2>
              <p>Inicie una atención administrativa en Lengua de Señas Colombiana.</p>
              <button className="launcher-start" onClick={startAttention}>{tablet ? "Iniciar atención →" : "Conectar tablet →"}</button>
              <p className={`launcher-note ${tablet ? "ok" : "off"}`}>{tablet ? "● Tablet conectada" : "○ Tablet desconectada"} · Sesión {code}</p>
            </>
          )}
        </section>
      )}

      {open && (
        <aside className={`dock ${side}`}>
          <header className="dock-header">
            <div className="brand-mark">✋</div>
            <div className="dock-title">
              <strong>InLSC</strong>
              <span>{session.path ? `${session.path.icon} ${session.path.name}` : session.active ? "Nueva atención · Recepción" : "Recepción"}</span>
            </div>
            <span className={`status ${tablet ? "ok" : "off"}`} title="Estado de la tablet">
              {tablet ? "● Tablet conectada" : sync.online ? "○ Sin tablet" : "○ Sin conexión"}
            </span>
            <button className="icon-btn" onClick={() => setSettings(!settings)} aria-label="Configuración">⚙</button>
            <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Minimizar">—</button>
          </header>

          <div className="demo-badge">MODO DEMO · reconocimiento de señas simulado</div>

          {connection}

          {settings && <Settings gender={gender} setGender={setGender} side={side} setSide={setSide} pairing={tablet ? pairing : null} />}

          <div className="dock-body">
            {session.active ? (
              <>
                <AdminSteps labels={stepsOf(session).map((s) => s.label)} current={session.index} color={session.path?.color} />
                <p className="label">PANTALLA DEL SEÑANTE</p>
                <div className="preview-frame">
                  <ScaledPreview width={1180} height={820}>
                    <TabletScreen state={tabletState} stream={null} preview />
                  </ScaledPreview>
                </div>
                {/* fieldset deshabilitado: bloquea todos los botones y campos del paso mientras no hay tablet */}
                <fieldset className="controls-lock" disabled={!tablet}>
                  <StepControls session={session} actions={actions} />
                </fieldset>
              </>
            ) : (
              <div className="dock-idle">
                {session.finished && <div className="done-card"><span>✓</span><strong>Trámite completado</strong></div>}
                <button className="btn primary" onClick={actions.start} disabled={!tablet} title={tablet ? undefined : "Conecte la tablet para iniciar"}>{session.finished ? "Nueva atención" : "Iniciar atención"} →</button>
              </div>
            )}
          </div>

          <footer className="dock-footer">
            {session.active && <button className="btn ghost sm" onClick={actions.replay} disabled={!tablet}>↻ Repetir video</button>}
            {session.active && <button className="btn ghost sm" onClick={actions.cancel}>✕ Cancelar atención</button>}
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
  const title = paused ? "⏸ Atención en pausa: tablet desconectada" : "Tablet desconectada"
  const text = !online
    ? SYNC_MODE === "peer"
      ? "No hay conexión con el servicio de emparejamiento. Revise la conexión a internet del computador."
      : "No hay conexión con el servidor local. Verifique que `npm run dev` siga en ejecución."
    : paused
      ? "No se puede avanzar hasta que la tablet se reconecte. La atención continuará en el mismo paso."
      : "Conecte la tablet para iniciar una atención."
  return (
    <div className="conn-alert" role="alert">
      <strong>{title}</strong>
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
          <span>{i < current ? "✓" : i + 1}</span><small>{l}</small>
        </li>
      ))}
    </ol>
  )
}

function Settings({ gender, setGender, side, setSide, pairing }: { gender: Gender; setGender: (g: Gender) => void; side: Side; setSide: (s: Side) => void; pairing: React.ReactNode }) {
  return (
    <div className="settings">
      <div className="field">
        Intérprete de los videos (según perfil del funcionario)
        <div className="seg">
          <button className={gender === "m" ? "on" : ""} onClick={() => setGender("m")}>Mujer</button>
          <button className={gender === "h" ? "on" : ""} onClick={() => setGender("h")}>Hombre</button>
        </div>
        <small>Si falta el video de hombre, se usa el de mujer.</small>
      </div>
      <div className="field">
        Posición del panel
        <div className="seg">
          <button className={side === "left" ? "on" : ""} onClick={() => setSide("left")}>Izquierda</button>
          <button className={side === "right" ? "on" : ""} onClick={() => setSide("right")}>Derecha</button>
        </div>
      </div>
      {pairing}
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
    if (SYNC_MODE === "peer") { setUrls([tabletUrl(location.origin)]); return }
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
      <strong>📡 Conectar la tablet</strong>
      <div className="pairing-row">
        {qr && <img className="pairing-qr" src={qr} alt="Código QR para abrir la tablet" />}
        <div className="pairing-code">
          <small>Código de sesión</small>
          <b>{code}</b>
          <button className="btn ghost sm" onClick={onNewCode} title="Desconecta las tablets actuales">↻ Nueva sesión</button>
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
        <div className="portal-links"><span>Solicite o consulte sus citas</span><span>Información de servicios</span><span>Canales de atención</span></div>
      </div>
    </div>
  )
}
