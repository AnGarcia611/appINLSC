import { StrictMode, Suspense, lazy } from "react"
import { createRoot } from "react-dom/client"
import AdminApp from "./admin/AdminApp"
import TabletApp from "./tablet/TabletApp"
import "./styles.css"

// Páginas aparte, cargadas solo si se abren: captura de señas para los señantes y laboratorio de visión.
const CaptureApp = lazy(() => import("./capture/CaptureApp"))
const VisionLab = lazy(() => import("./vision/VisionLab"))

// La misma app sirve todas las pantallas: /?tablet para el señante, /?captura para grabar señas,
// /?lab para diagnosticar el reconocimiento, / para el funcionario.
const q = new URLSearchParams(location.search)
const page = q.has("tablet") ? <TabletApp /> : q.has("captura") ? <CaptureApp /> : q.has("lab") ? <VisionLab /> : <AdminApp />

createRoot(document.getElementById("root")!).render(
  <StrictMode><Suspense fallback={null}>{page}</Suspense></StrictMode>,
)
