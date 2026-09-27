import { useState } from "react"
import { isValidCode, normalizeCode, useTabletSync, type TabletStatus } from "../shared/sync"
import type { TabletState } from "../shared/types"
import TabletScreen from "./TabletScreen"

const INITIAL: TabletState = { seq: 0, view: { kind: "idle" }, camera: false }
const CODE_KEY = "inlsc.tabletSession"

/** Código de sesión: primero el de la URL (?s=, viene del QR), luego el último usado en esta tablet. */
function initialCode(): string | null {
  const fromUrl = normalizeCode(new URLSearchParams(location.search).get("s") ?? "")
  try {
    if (isValidCode(fromUrl)) { localStorage.setItem(CODE_KEY, fromUrl); return fromUrl }
    const stored = localStorage.getItem(CODE_KEY)
    return stored && isValidCode(stored) ? stored : null
  } catch { return isValidCode(fromUrl) ? fromUrl : null }
}

/** App de la tablet del señante: recibe el estado del funcionario y reporta selecciones táctiles. */
export default function TabletApp() {
  const [code, setCodeState] = useState<string | null>(initialCode)
  const [state, setState] = useState<TabletState>(INITIAL)
  const [started, setStarted] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const setCode = (next: string | null) => {
    setCodeState(next)
    setState(INITIAL)
    try { if (next) localStorage.setItem(CODE_KEY, next); else localStorage.removeItem(CODE_KEY) } catch { /* sin almacenamiento */ }
    // Quita ?s= de la barra de direcciones para que un código anterior no vuelva al recargar.
    const url = new URL(location.href)
    url.searchParams.delete("s")
    history.replaceState(null, "", url)
  }

  const { status, send, retry } = useTabletSync(code, setState)

  // Un toque inicial es necesario en iPad/Android para pedir la cámara, pantalla completa y mantenerla encendida.
  async function start() {
    setStarted(true)
    document.documentElement.requestFullscreen?.().catch(() => undefined)
    ;(navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<unknown> } }).wakeLock?.request("screen").catch(() => undefined)
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("La cámara requiere HTTPS")
      return
    }
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false }))
    } catch {
      setCameraError("No se pudo acceder a la cámara")
    }
  }

  if (!code) return <CodeEntry onSubmit={setCode} />

  return (
    <div className="tablet-root">
      <TabletScreen
        state={state}
        stream={state.camera ? stream : null}
        cameraError={cameraError}
        onSelect={(index) => { if (status === "connected") send({ type: "select", index }) }}
      />
      <ConnectionBadge status={status} code={code} />
      {status !== "connected" && <ConnectionOverlay status={status} code={code} onRetry={retry} onChangeCode={() => setCode(null)} />}
      {!started && (
        <button className="tablet-start" onClick={start}>
          <span>✋</span>
          <strong>InLSC</strong>
          Toque la pantalla para activar la tablet
        </button>
      )}
    </div>
  )
}

function ConnectionBadge({ status, code }: { status: TabletStatus; code: string }) {
  const ok = status === "connected"
  return (
    <div className={`conn-badge ${ok ? "ok" : "off"}`} role="status">
      {ok ? "● Conectada a recepción" : "○ Sin conexión"} · {code}
    </div>
  )
}

const OVERLAY_TEXT: Record<Exclude<TabletStatus, "connected">, { icon: string; title: string; text: string }> = {
  connecting: {
    icon: "◌",
    title: "Conectando con recepción…",
    text: "Asegúrese de que el panel InLSC esté abierto en el computador del funcionario.",
  },
  lost: {
    icon: "⚠",
    title: "Se perdió la conexión con recepción",
    text: "Reconectando automáticamente. La atención continuará en el mismo punto.",
  },
  rejected: {
    icon: "⛔",
    title: "Esta sesión ya tiene una tablet conectada",
    text: "Solo una tablet puede estar conectada a cada computador. Desconecte la otra tablet o use otro código.",
  },
}

/** Aviso a pantalla completa mientras la tablet no está conectada; bloquea los toques sobre la pantalla. */
function ConnectionOverlay({ status, code, onRetry, onChangeCode }: {
  status: Exclude<TabletStatus, "connected">; code: string; onRetry: () => void; onChangeCode: () => void
}) {
  const { icon, title, text } = OVERLAY_TEXT[status]
  return (
    <div className={`conn-overlay ${status}`} role="alert">
      <div className="conn-card">
        <span className={status === "rejected" ? "" : "conn-spin"}>{icon}</span>
        <strong>{title}</strong>
        <p>{text}</p>
        <small>Sesión {code}</small>
        <div className="conn-actions">
          {status === "rejected" && <button onClick={onRetry}>Reintentar</button>}
          <button onClick={onChangeCode}>Cambiar código</button>
        </div>
      </div>
    </div>
  )
}

function CodeEntry({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [value, setValue] = useState("")
  const valid = isValidCode(value)
  return (
    <form className="tablet-code" onSubmit={(e) => { e.preventDefault(); if (valid) onSubmit(value) }}>
      <span>✋</span>
      <strong>InLSC</strong>
      <label htmlFor="code">Escriba el código de sesión que aparece en el panel del funcionario</label>
      <input
        id="code"
        value={value}
        onChange={(e) => setValue(normalizeCode(e.target.value))}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="ABC123"
        autoFocus
      />
      <button type="submit" disabled={!valid}>Conectar</button>
    </form>
  )
}
