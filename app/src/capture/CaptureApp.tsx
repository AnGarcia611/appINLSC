import { useEffect, useState } from "react"
import Icon from "../shared/Icon"
import { CAPTURE_EMAIL } from "../shared/config"
import { cameraBlockedReason } from "../shared/camera"
import { MEDIAPIPE_VERSION, MODELS } from "../vision/tracker"
import { CONSENT_REVIEWED, CONSENT_TEXT, CONSENT_VERSION, CONSENT_VIDEO } from "./consent"
import { canShareFile, canUpload, download, mailtoUrl, packageFile, shareFile, uploadFile } from "./exporter"
import { PACKAGE_FORMAT, PACKAGE_VERSION, type CapturePackage, type Profile, type Take, type Trial } from "./format"
import { deleteDraft, loadDraft, saveDraft } from "./store"
import { GROUPS, TASKS, taskById, type SignTask } from "./tasks"
import Recorder from "./Recorder"
import TestPanel from "./TestPanel"
import "./capture.css"

type Screen =
  | { kind: "cargando" }
  | { kind: "inicio" }
  | { kind: "consentimiento" }
  | { kind: "perfil" }
  | { kind: "menu" }
  | { kind: "tarea"; task: string }
  | { kind: "prueba" }
  | { kind: "enviar" }

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const signerCode = () => `S-${Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => ALPHABET[n % ALPHABET.length]).join("")}`

/**
 * Página para que los señantes graben y validen señas: `/?captura`.
 * No necesita sesión ni panel del funcionario. Guarda solo puntos de referencia y los envía por correo.
 */
export default function CaptureApp() {
  const [screen, setScreen] = useState<Screen>({ kind: "cargando" })
  const [pkg, setPkg] = useState<CapturePackage | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [saved, setSaved] = useState(true)

  useEffect(() => {
    loadDraft().then((draft) => {
      if (draft?.format === PACKAGE_FORMAT) setPkg(draft)
      setScreen({ kind: "inicio" })
    })
  }, [])

  /** Cambia el paquete y lo guarda en la tablet al instante. */
  const mutate = (fn: (p: CapturePackage) => CapturePackage) => {
    setPkg((prev) => {
      if (!prev) return prev
      const next = { ...fn(prev), updatedAt: new Date().toISOString() }
      saveDraft(next).then(setSaved)
      return next
    })
  }

  async function startCamera() {
    if (stream) return true
    const blocked = cameraBlockedReason()
    if (blocked) { setCameraError(blocked); return false }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false })
      setStream(s)
      setCameraError(null)
      const st = s.getVideoTracks()[0]?.getSettings()
      if (st?.width && st.height) mutate((p) => ({ ...p, camera: { width: st.width!, height: st.height! } }))
      return true
    } catch {
      setCameraError("No se pudo abrir la cámara. Revise el permiso de cámara del navegador.")
      return false
    }
  }

  const newPackage = (consent: CapturePackage["consent"]): CapturePackage => {
    const now = new Date().toISOString()
    return {
      format: PACKAGE_FORMAT, version: PACKAGE_VERSION, id: crypto.randomUUID(), createdAt: now, updatedAt: now,
      app: { mediapipe: MEDIAPIPE_VERSION, models: MODELS }, camera: null, consent,
      signer: { code: signerCode(), profile: {} }, validations: [], takes: [], trials: [],
    }
  }

  const go = (s: Screen) => { setScreen(s); window.scrollTo(0, 0) }

  return (
    <div className="cap">
      <header className="cap-header">
        <div className="cap-brand"><Icon name="front_hand" fill /> InLSC · Captura de señas</div>
        {pkg && screen.kind !== "inicio" && (
          <div className="cap-who">
            <span>Señante <b>{pkg.signer.code}</b></span>
            <span className={saved ? "ok" : "warn"}>{saved ? "Guardado en esta tablet" : "No se pudo guardar"}</span>
          </div>
        )}
      </header>

      <main className="cap-main">
        {screen.kind === "cargando" && <p className="cap-muted">Cargando…</p>}

        {screen.kind === "inicio" && (
          <Welcome
            draft={pkg}
            onContinue={() => go({ kind: "menu" })}
            onNew={async () => {
              if (pkg && pkg.takes.length && !confirm(`Hay ${pkg.takes.length} tomas de ${pkg.signer.code} sin confirmar su envío. ¿Borrarlas y empezar con otra persona?`)) return
              await deleteDraft()
              setPkg(null)
              go({ kind: "consentimiento" })
            }}
          />
        )}

        {screen.kind === "consentimiento" && (
          <ConsentScreen onAccept={(consent) => {
            const p = newPackage(consent)
            setPkg(p)
            saveDraft(p).then(setSaved)
            go({ kind: "perfil" })
          }} />
        )}

        {screen.kind === "perfil" && pkg && (
          <ProfileScreen
            code={pkg.signer.code}
            initial={pkg.signer.profile}
            cameraError={cameraError}
            onSave={async (profile) => {
              mutate((p) => ({ ...p, signer: { ...p.signer, profile } }))
              // Sin cámara también se pasa a la lista: allí se ve el aviso y se puede enviar lo ya grabado.
              await startCamera()
              go({ kind: "menu" })
            }}
          />
        )}

        {screen.kind === "menu" && pkg && (
          <Menu
            pkg={pkg}
            onTask={async (id) => { if (await startCamera()) go({ kind: "tarea", task: id }) }}
            onTest={async () => { if (await startCamera()) go({ kind: "prueba" }) }}
            onSend={() => go({ kind: "enviar" })}
            onProfile={() => go({ kind: "perfil" })}
            cameraError={cameraError}
          />
        )}

        {screen.kind === "tarea" && pkg && stream && (
          <TaskScreen
            task={taskById(screen.task)!}
            pkg={pkg}
            stream={stream}
            onBack={() => go({ kind: "menu" })}
            onValidate={(matches, comment) => mutate((p) => ({
              ...p,
              validations: [...p.validations.filter((v) => v.task !== screen.task), { task: screen.task, matches, comment: comment || undefined, at: new Date().toISOString() }],
            }))}
            onSave={(take) => mutate((p) => ({ ...p, takes: [...p.takes, take] }))}
            onDeleteLast={() => mutate((p) => {
              const i = p.takes.map((t) => t.task).lastIndexOf(screen.task)
              return i < 0 ? p : { ...p, takes: p.takes.filter((_, j) => j !== i) }
            })}
          />
        )}

        {screen.kind === "prueba" && pkg && stream && (
          <TestPanel stream={stream} trials={pkg.trials} onTrial={(t: Trial) => mutate((p) => ({ ...p, trials: [...p.trials, t] }))} onBack={() => go({ kind: "menu" })} />
        )}

        {screen.kind === "enviar" && pkg && (
          <SendScreen pkg={pkg} onBack={() => go({ kind: "menu" })} onCleared={() => { setPkg(null); go({ kind: "inicio" }) }} />
        )}
      </main>
    </div>
  )
}

function Welcome({ draft, onContinue, onNew }: { draft: CapturePackage | null; onContinue: () => void; onNew: () => void }) {
  return (
    <section className="cap-card cap-welcome">
      <h1>Ayúdenos a enseñarle LSC a InLSC</h1>
      <p>Esta página graba algunas señas de la Lengua de Señas Colombiana para entrenar el reconocimiento de InLSC. <b>No se graba video</b>: solo puntos de la posición de las manos, los brazos y la cabeza.</p>
      <p className="cap-muted">Toma unos 15 minutos. Puede hacerlo por partes: el avance queda guardado en esta tablet.</p>
      {draft ? (
        <div className="cap-col">
          <button className="cap-btn primary" onClick={onContinue}><Icon name="play_arrow" fill /> Continuar con {draft.signer.code} ({draft.takes.length} tomas)</button>
          <button className="cap-btn ghost" onClick={onNew}>Empezar con otra persona</button>
        </div>
      ) : (
        <button className="cap-btn primary" onClick={onNew}>Empezar <Icon name="arrow_forward" /></button>
      )}
    </section>
  )
}

function ConsentScreen({ onAccept }: { onAccept: (c: CapturePackage["consent"]) => void }) {
  const [participate, setParticipate] = useState(false)
  const [training, setTraining] = useState(true)
  const [evaluation, setEvaluation] = useState(true)
  // Menores de edad: la Ley 1581 exige la autorización de su representante legal, y este flujo no la recoge.
  const [adult, setAdult] = useState(false)
  const ok = participate && adult && (training || evaluation)
  return (
    <section className="cap-card">
      <h1>Autorización de uso de datos</h1>
      {!CONSENT_REVIEWED && <p className="cap-draft">Borrador pendiente de revisión legal ({CONSENT_VERSION}). No usar con participantes reales hasta aprobarlo.</p>}
      {CONSENT_VIDEO
        ? <video className="cap-consent-video" src={CONSENT_VIDEO} controls playsInline />
        : <p className="cap-notice"><Icon name="record_voice_over" /> El video de esta autorización en LSC todavía no está disponible. Si prefiere, pida a un intérprete que se la explique antes de continuar.</p>}
      <dl className="cap-consent">
        {CONSENT_TEXT.map((c) => <div key={c.title}><dt>{c.title}</dt><dd>{c.text}</dd></div>)}
      </dl>
      <fieldset className="cap-checks">
        <legend>Marque lo que autoriza</legend>
        <label><input type="checkbox" checked={participate} onChange={(e) => setParticipate(e.target.checked)} /> Leí (o me explicaron) esta información y quiero participar.</label>
        <label><input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} /> Tengo <b>18 años o más</b>.</label>
        <label><input type="checkbox" checked={training} onChange={(e) => setTraining(e.target.checked)} /> Autorizo usar mis tomas para <b>entrenar</b> el reconocimiento de señas.</label>
        <label><input type="checkbox" checked={evaluation} onChange={(e) => setEvaluation(e.target.checked)} /> Autorizo usar mis tomas para <b>medir</b> qué tan bien funciona el reconocimiento.</label>
      </fieldset>
      <button className="cap-btn primary" disabled={!ok} onClick={() => onAccept({ version: CONSENT_VERSION, acceptedAt: new Date().toISOString(), training, evaluation })}>
        Acepto y continúo <Icon name="arrow_forward" />
      </button>
      {!ok && <p className="cap-muted">Para continuar marque las dos primeras casillas y al menos un uso. Por ahora no pueden participar menores de edad.</p>}
    </section>
  )
}

const OPTIONS: { key: keyof Profile; label: string; values: string[] }[] = [
  { key: "audicion", label: "Usted es", values: ["sordo", "hipoacúsico", "oyente"] },
  { key: "rol", label: "Uso de la LSC", values: ["usuario LSC", "intérprete", "docente o modelo LSC", "otro"] },
  { key: "mano", label: "Mano con la que más seña", values: ["derecha", "izquierda", "ambas"] },
  { key: "edad", label: "Edad", values: ["18–29", "30–44", "45–59", "60 o más"] },
  { key: "aniosLSC", label: "Años usando LSC", values: ["menos de 2", "2–5", "6–10", "más de 10"] },
]

function ProfileScreen({ code, initial, cameraError, onSave }: { code: string; initial: Profile; cameraError: string | null; onSave: (p: Profile) => void }) {
  const [profile, setProfile] = useState<Profile>(initial)
  const set = (key: keyof Profile, value: string) => setProfile((p) => ({ ...p, [key]: p[key] === value ? undefined : value }))
  return (
    <section className="cap-card">
      <h1>Su código es <span className="cap-code">{code}</span></h1>
      <p>No le pedimos su nombre. Si después quiere borrar sus datos, escriba a {CAPTURE_EMAIL} con este código.</p>
      <p className="cap-muted">Las preguntas son opcionales. Sirven para revisar que el reconocimiento funcione igual para todas las personas.</p>
      {OPTIONS.map((o) => (
        <div key={o.key} className="cap-field">
          <span>{o.label}</span>
          <div className="cap-chips" role="group" aria-label={o.label}>
            {o.values.map((v) => <button key={v} className={profile[o.key] === v ? "on" : ""} aria-pressed={profile[o.key] === v} onClick={() => set(o.key, v)}>{v}</button>)}
          </div>
        </div>
      ))}
      <label className="cap-field">
        <span>Ciudad o región donde aprendió LSC</span>
        <input value={profile.region ?? ""} onChange={(e) => setProfile((p) => ({ ...p, region: e.target.value || undefined }))} placeholder="p. ej. Bogotá" maxLength={60} />
      </label>
      {cameraError && <p className="rec-warn"><Icon name="warning" fill /> {cameraError}</p>}
      <button className="cap-btn primary" onClick={() => onSave(profile)}><Icon name="photo_camera" /> Continuar y activar la cámara</button>
    </section>
  )
}

function Menu({ pkg, onTask, onTest, onSend, onProfile, cameraError }: {
  pkg: CapturePackage; onTask: (id: string) => void; onTest: () => void; onSend: () => void; onProfile: () => void; cameraError: string | null
}) {
  const count = (id: string) => pkg.takes.filter((t) => t.task === id).length
  const total = TASKS.reduce((a, t) => a + t.takes, 0)
  const done = TASKS.reduce((a, t) => a + Math.min(t.takes, count(t.id)), 0)
  return (
    <>
      <section className="cap-card">
        <div className="cap-progress"><div style={{ width: `${(done / total) * 100}%` }} /></div>
        <p><b>{done} de {total}</b> tomas sugeridas. Puede grabar en cualquier orden y enviar cuando quiera.</p>
        {cameraError && <p className="rec-warn"><Icon name="warning" fill /> {cameraError}</p>}
        <div className="cap-row">
          <button className="cap-btn ghost" onClick={onTest}><Icon name="sensors" /> Probar el reconocimiento</button>
          <button className="cap-btn primary" onClick={onSend} disabled={!pkg.takes.length && !pkg.trials.length}><Icon name="arrow_forward" /> Enviar datos</button>
          <button className="cap-btn ghost" onClick={onProfile}><Icon name="edit" /> Perfil</button>
        </div>
      </section>
      {GROUPS.map((g) => (
        <section key={g} className="cap-group">
          <h2>{g}</h2>
          <div className="cap-tasks">
            {TASKS.filter((t) => t.group === g).map((t) => {
              const c = count(t.id)
              const v = pkg.validations.find((x) => x.task === t.id)
              return (
                <button key={t.id} className={`cap-task ${c >= t.takes ? "done" : ""}`} onClick={() => onTask(t.id)}>
                  <strong>{t.title}</strong>
                  <span>{c}/{t.takes} tomas{v && !v.matches ? " · variante propia" : ""}</span>
                  {c >= t.takes && <Icon name="check_circle" fill label="Completa" />}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </>
  )
}

function TaskScreen({ task, pkg, stream, onBack, onValidate, onSave, onDeleteLast }: {
  task: SignTask; pkg: CapturePackage; stream: MediaStream; onBack: () => void
  onValidate: (matches: boolean, comment: string) => void; onSave: (t: Take) => void; onDeleteLast: () => void
}) {
  const validation = pkg.validations.find((v) => v.task === task.id)
  const done = pkg.takes.filter((t) => t.task === task.id).length
  const [comment, setComment] = useState("")
  const [asking, setAsking] = useState(!!task.reference && !validation)
  return (
    <div>
      <div className="cap-task-head">
        <button className="cap-btn ghost sm" onClick={onBack}>← Lista de señas</button>
        <h1>{task.title}</h1>
      </div>

      {task.reference && (
        <section className={`cap-card cap-reference ${asking ? "asking" : ""}`}>
          <p><b>Referencia:</b> {task.reference}</p>
          {asking ? (
            <>
              <p className="cap-question">¿Usted hace esta seña así?</p>
              <label className="cap-field"><span>Comentario (opcional)</span><input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="p. ej. en mi región se hace con la palma hacia adentro" maxLength={200} /></label>
              <div className="cap-row">
                <button className="cap-btn primary" onClick={() => { onValidate(true, comment); setAsking(false) }}><Icon name="check" /> Sí, así la hago</button>
                <button className="cap-btn ghost" onClick={() => { onValidate(false, comment); setAsking(false) }}>La hago distinto</button>
              </div>
              <p className="cap-muted">Si la hace distinto, grábela como usted la hace: también nos sirve.</p>
            </>
          ) : (
            <p className="cap-muted">
              {validation?.matches === false ? "Usted indicó que la hace distinto: grábela a su manera." : "Usted indicó que la hace así."}{" "}
              <button className="link-btn" onClick={() => setAsking(true)}>Cambiar respuesta</button>
            </p>
          )}
        </section>
      )}

      {!asking && (
        <Recorder key={task.id} task={task} stream={stream} variant={validation?.matches === false} done={done} onSave={onSave} />
      )}

      {done > 0 && (
        <div className="cap-row cap-task-foot">
          <button className="cap-btn ghost sm" onClick={() => { if (confirm("¿Borrar la última toma de esta seña?")) onDeleteLast() }}>Borrar la última toma</button>
        </div>
      )}
    </div>
  )
}

function SendScreen({ pkg, onBack, onCleared }: { pkg: CapturePackage; onBack: () => void; onCleared: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  // automático: envío directo por el servicio. compartido/manual: respaldo (menú Compartir o descarga + correo).
  const [state, setState] = useState<"listo" | "enviando" | "enviado" | "compartido" | "manual">("listo")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { packageFile(pkg).then(setFile) }, [pkg])
  const shareable = file ? canShareFile(file) : false
  const auto = canUpload()

  const sendAuto = async () => {
    if (!file) return
    setState("enviando")
    setError(null)
    const problem = await uploadFile(pkg, file)
    if (!problem) { setState("enviado"); return }
    setError(problem)
    setState("listo")
  }
  const sendManual = async () => {
    if (!file) return
    if (shareable && await shareFile(pkg, file)) { setState("compartido"); return }
    setState("manual")
  }
  const clear = async (askFirst: boolean) => {
    if (askFirst && !confirm(`¿Ya llegó el correo con el archivo? Se borrarán de esta tablet las ${pkg.takes.length} tomas de ${pkg.signer.code}.`)) return
    await deleteDraft()
    onCleared()
  }

  return (
    <section className="cap-card">
      <button className="cap-btn ghost sm" onClick={onBack}>← Volver</button>
      <h1>Enviar datos</h1>
      <ul className="cap-summary">
        <li><b>{pkg.takes.length}</b> tomas de {new Set(pkg.takes.map((t) => t.task)).size} señas</li>
        <li><b>{pkg.validations.length}</b> respuestas de vocabulario · <b>{pkg.trials.length}</b> pruebas del reconocimiento</li>
        <li>Archivo: {file ? `${file.name} (${(file.size / 1024).toFixed(0)} KB)` : "preparando…"}</li>
      </ul>
      <p>Los datos llegan por correo a <b>{CAPTURE_EMAIL}</b>. Contienen solo puntos de referencia, sin video.</p>

      {state === "enviado" ? (
        <div className="cap-notice ok" role="status">
          <p><Icon name="check_circle" fill /> <b>¡Enviado! Gracias.</b> El archivo va en camino a {CAPTURE_EMAIL}.</p>
          <div className="cap-row">
            <button className="cap-btn primary" onClick={() => clear(false)}>Terminar y borrar de la tablet</button>
            <button className="cap-btn ghost" onClick={onBack}>Seguir grabando</button>
          </div>
        </div>
      ) : (
        <>
          {auto && (
            <button className="cap-btn primary" disabled={!file || state === "enviando"} onClick={sendAuto}>
              <Icon name="arrow_forward" /> {state === "enviando" ? "Enviando…" : "Enviar"}
            </button>
          )}
          {error && <p className="rec-warn" role="alert"><Icon name="warning" fill /> {error} Puede intentarlo de nuevo o enviarlo por correo a mano.</p>}

          {(!auto || error) && state !== "compartido" && state !== "manual" && (
            <button className={`cap-btn ${auto ? "ghost" : "primary"}`} disabled={!file} onClick={sendManual}>
              <Icon name="arrow_forward" /> {shareable ? "Enviar por correo (menú Compartir)" : "Preparar el correo"}
            </button>
          )}

          {state === "compartido" && (
            <div className="cap-notice ok">
              <p>Si eligió Correo y lo envió a {CAPTURE_EMAIL}, ¡gracias! Cuando confirmemos que llegó puede borrar los datos de esta tablet.</p>
              <div className="cap-row">
                <button className="cap-btn ghost" onClick={sendManual}>Enviar de nuevo</button>
                <button className="cap-btn danger" onClick={() => clear(true)}>Ya se envió: borrar de la tablet</button>
              </div>
            </div>
          )}

          {state === "manual" && file && (
            <div className="cap-notice">
              <p>Este navegador no puede adjuntar el archivo solo. Hágalo en dos pasos:</p>
              <ol>
                <li><button className="cap-btn ghost sm" onClick={() => download(file)}>1. Descargar el archivo</button></li>
                <li><a className="cap-btn ghost sm" href={mailtoUrl(pkg)}>2. Abrir el correo</a> y adjunte el archivo descargado ({file.name}).</li>
              </ol>
              <button className="cap-btn danger" onClick={() => clear(true)}>Ya se envió: borrar de la tablet</button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
