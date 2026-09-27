// Catálogo tomado de servicios_especialidades/especialidades_tarjetas.pdf
export interface Specialty { name: string; icon: string; color: string; services: string[] }

export const SPECIALTIES: Specialty[] = [
  { name: "Medicina general", icon: "🩺", color: "#2f7fd8", services: ["Consulta medicina general", "Consulta prioritaria", "Teleconsulta medicina general"] },
  { name: "Odontología general", icon: "🦷", color: "#3aa55c", services: ["Consulta odontología general", "Higiene oral", "Urgencias por odontología general"] },
  { name: "Pediatría", icon: "🧸", color: "#5b8a3c", services: ["Consulta pediátrica", "Control de crecimiento y desarrollo", "Valoración del niño"] },
  { name: "Ginecología", icon: "♀️", color: "#e07f3c", services: ["Consulta ginecológica", "Control ginecológico", "Planificación familiar"] },
  { name: "Obstetricia", icon: "🤰", color: "#d6558c", services: ["Control prenatal", "Consulta obstétrica", "Valoración materno-fetal"] },
  { name: "Medicina interna", icon: "🫀", color: "#7a5cc4", services: ["Consulta de medicina interna", "Control de enfermedades crónicas", "Valoración integral"] },
  { name: "Medicina familiar", icon: "🏠", color: "#d4485c", services: ["Consulta de medicina familiar", "Control de salud familiar", "Valoración integral"] },
  { name: "Anestesiología", icon: "💉", color: "#3b82d6", services: ["Consulta preanestésica", "Manejo del dolor", "Valoración anestésica"] },
  { name: "Cirugía general", icon: "🔪", color: "#3aa55c", services: ["Cirugía abdominal", "Consulta de cirugía general", "Valoración prequirúrgica"] },
  { name: "Dermatología", icon: "🔍", color: "#7fb944", services: ["Consulta dermatológica", "Control de enfermedades de la piel", "Valoración de lesiones cutáneas"] },
  { name: "Gastroenterología", icon: "🫃", color: "#c9a22b", services: ["Colonoscopia", "Consulta gastroenterológica", "Endoscopia digestiva"] },
  { name: "Medicina física y rehabilitación", icon: "🦽", color: "#1aa39c", services: ["Consulta de rehabilitación", "Valoración funcional", "Plan de rehabilitación"] },
  { name: "Ortopedia", icon: "🦴", color: "#4a6fa8", services: ["Consulta de ortopedia", "Valoración de columna", "Valoración de hombro, rodilla y mano"] },
  { name: "Otorrinolaringología", icon: "👂", color: "#8a6c3c", services: ["Consulta otorrinolaringológica", "Evaluación de oído", "Evaluación de nariz y garganta"] },
  { name: "Psiquiatría", icon: "🧠", color: "#c9742b", services: ["Consulta psiquiátrica", "Control psiquiátrico", "Valoración de salud mental"] },
  { name: "Ortodoncia", icon: "😁", color: "#7fb944", services: ["Consulta de ortodoncia", "Control de ortodoncia", "Valoración ortodóntica"] },
  { name: "Rehabilitación oral", icon: "🦷", color: "#c9a22b", services: ["Consulta de rehabilitación oral", "Diseño de rehabilitación oral", "Valoración odontológica"] },
  { name: "Ecografía", icon: "📡", color: "#e07f3c", services: ["Ecografía convencional", "Ecografía obstétrica", "Ecografía Doppler placentaria"] },
  { name: "Mamografía", icon: "🎗️", color: "#d4485c", services: ["Mamografía", "Tamizaje mamario", "Control mamográfico"] },
  { name: "Radiología", icon: "🩻", color: "#1aa39c", services: ["Radiología convencional", "Radiografía diagnóstica", "Estudio radiológico"] },
  { name: "Fisioterapia", icon: "🏃", color: "#7a5cc4", services: ["Consulta de fisioterapia", "Rehabilitación física", "Terapia física"] },
  { name: "Fonoaudiología", icon: "🗣️", color: "#d6558c", services: ["Consulta de fonoaudiología", "Terapia de lenguaje", "Valoración del habla y lenguaje"] },
  { name: "Nutrición y dietética", icon: "🍎", color: "#4a6fa8", services: ["Consulta de nutrición", "Educación nutricional", "Valoración nutricional"] },
  { name: "Psicología", icon: "💬", color: "#8a6c3c", services: ["Consulta de psicología", "Orientación psicológica", "Valoración psicológica"] },
  { name: "Terapia ocupacional", icon: "✋", color: "#5b8a3c", services: ["Consulta de terapia ocupacional", "Rehabilitación ocupacional", "Terapia ocupacional"] },
  { name: "Terapia respiratoria", icon: "🫁", color: "#c9742b", services: ["Consulta de terapia respiratoria", "Rehabilitación pulmonar", "Terapia respiratoria"] },
]

/** Citas simuladas del paciente para el flujo de cancelación. */
export const MOCK_CITAS = [
  { specialty: "Medicina general", service: "Consulta medicina general", date: "2026-10-01", time: "09:30", doctor: "Dr. Rojas" },
  { specialty: "Odontología general", service: "Higiene oral", date: "2026-10-08", time: "14:00", doctor: "Dra. Moreno" },
  { specialty: "Nutrición y dietética", service: "Consulta de nutrición", date: "2026-10-15", time: "10:00", doctor: "Dr. Castillo" },
]

export const specialtyByName = (name: string) => SPECIALTIES.find((s) => s.name === name)

const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

export function parseDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  return { day: d, weekday: WEEKDAYS[date.getDay()], month: MONTHS[m - 1], year: y }
}

export function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number)
  const suffix = h < 12 ? "a. m." : "p. m."
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`
}

export function formatDate(iso: string) {
  const d = parseDate(iso)
  return `${d.weekday} ${d.day} de ${d.month.toLowerCase()}`
}

export const formatCOP = (n: number) => `$ ${n.toLocaleString("es-CO")}`
