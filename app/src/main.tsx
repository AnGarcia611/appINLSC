import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import AdminApp from "./admin/AdminApp"
import TabletApp from "./tablet/TabletApp"
import "./styles.css"

// La misma app sirve las dos pantallas: /?tablet para el señante, / para el funcionario.
const isTablet = new URLSearchParams(location.search).has("tablet")

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isTablet ? <TabletApp /> : <AdminApp />}</StrictMode>,
)
