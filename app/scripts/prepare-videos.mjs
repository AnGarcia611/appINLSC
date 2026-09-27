// Copia los videos LSC desde ../Videos_señantes a public/videos con nombres normalizados.
// Los originales no se modifican. Ejecutar: npm run videos
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(root, "../../Videos_señantes")
const DEST = path.resolve(root, "../public/videos")

const A = "01_Asignacion_de_citas/01videos_para _usuario _señante"
const C = "02_Cancelacion_de_citas/02videos_para_usuarios_señantes"
const F = "03_Facturacion_de_citas/03videos_para_usuarios_señantes"

// id -> { h: intérprete hombre, m: intérprete mujer, raw: grabación original (respaldo) }
const MANIFEST = {
  saludo: { h: `${A}/01INT01_saludo/Video_h_buen dia.mp4`, m: `${A}/01INT01_saludo/video_m_buen dia.mp4` },
  solicitud: { h: `${A}/01INT02_preg_solicitud/Video _h_preg_solicitud.mp4`, m: `${A}/01INT02_preg_solicitud/Video_m_preg_solicitud.mp4` },
  documento: { h: `${A}/01INT03_solicitar_documento/video_h_solicitar_documento.mp4`, m: `${A}/01INT03_solicitar_documento/video_m_solicitar_documento.mp4` },
  especialidad: { h: `${A}/01INT04_preg_especialidad/Video_h__preg_especialidad.mp4`, m: `${A}/01INT04_preg_especialidad/video_m__preg_especialidad.mp4` },
  seleccion: { h: `${A}/01INTO05_selección_cita.mp4/Video_h_selección_cita.mp4`, m: `${A}/01INTO05_selección_cita.mp4/Video_m_selección_cita.mp4` },
  negacion: { m: `${A}/01INTO_negación/Video_m_negación.mp4` },
  despedida: { h: `${A}/01INTO10_deseo_ buen dia.mp4/video_h_deseo_buen dia.mp4`, m: `${A}/01INTO10_deseo_ buen dia.mp4/video_m_deseo_buen dia.mp4` },
  cancelada: { h: `${C}/02INTO03_ha sido cancelada/Video_h_ha sido cancelada.mp4`, m: `${C}/02INTO03_ha sido cancelada/Video_m_ha sido cancelada.mp4` },
  orden_medica: { m: `${F}/03INT01_orden_medica/video_m_orden_medica.mp4` },
  pago_efectivo: { m: `${F}/03INT02_pago_ en_efectivo/Video_m_pago_ en_efectivo.mp4` },
  valor: { raw: `${F}/03INT03_valor/Video Project 23.mp4` },
  recibo: { m: `${F}/03INT04_su_recibo/video_m_su_recibo.mp4` },
  espera_sala: { m: `${F}/03INT05_espera_sala/Video_m_espere_en_sala.mp4` },
  con_gusto: { m: `${F}/03INT06_con_gusto/video_m_con_gusto.mp4` },
}

// macOS puede guardar nombres con tildes en forma NFD; se compara en NFC.
function resolveNormalized(rel) {
  let current = SRC
  for (const part of rel.split("/")) {
    const want = part.normalize("NFC")
    const hit = fs.readdirSync(current).find((n) => n.normalize("NFC") === want)
    if (!hit) return null
    current = path.join(current, hit)
  }
  return current
}

fs.mkdirSync(DEST, { recursive: true })
const available = {}
let missing = 0
for (const [id, variants] of Object.entries(MANIFEST)) {
  available[id] = []
  for (const [variant, rel] of Object.entries(variants)) {
    const file = resolveNormalized(rel)
    if (!file) { console.warn(`✗ no encontrado: ${rel}`); missing++; continue }
    fs.copyFileSync(file, path.join(DEST, `${id}_${variant}.mp4`))
    available[id].push(variant)
    console.log(`✓ ${id}_${variant}.mp4`)
  }
}
fs.writeFileSync(path.join(DEST, "manifest.json"), JSON.stringify(available, null, 2))
console.log(missing ? `\n${missing} video(s) no encontrados.` : "\nTodos los videos copiados.")
