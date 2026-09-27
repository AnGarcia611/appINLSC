import type { IconName } from "./Icon"

// Catálogo tomado de servicios_especialidades/especialidades_tarjetas.pdf
// Iconos: Material Symbols. Colores ajustados para contraste ≥ 3:1 con el texto blanco de las tarjetas (WCAG 1.4.3, texto grande).
export interface Specialty { name: string; icon: IconName; color: string; services: string[] }

export const SPECIALTIES: Specialty[] = [
  { name: "Medicina general", icon: "stethoscope", color: "#2f7fd8", services: ["Consulta medicina general", "Consulta prioritaria", "Teleconsulta medicina general"] },
  { name: "Odontología general", icon: "dentistry", color: "#3aa55c", services: ["Consulta odontología general", "Higiene oral", "Urgencias por odontología general"] },
  { name: "Pediatría", icon: "pediatrics", color: "#5b8a3c", services: ["Consulta pediátrica", "Control de crecimiento y desarrollo", "Valoración del niño"] },
  { name: "Ginecología", icon: "gynecology", color: "#de762f", services: ["Consulta ginecológica", "Control ginecológico", "Planificación familiar"] },
  { name: "Obstetricia", icon: "pregnant_woman", color: "#d6558c", services: ["Control prenatal", "Consulta obstétrica", "Valoración materno-fetal"] },
  { name: "Medicina interna", icon: "cardiology", color: "#7a5cc4", services: ["Consulta de medicina interna", "Control de enfermedades crónicas", "Valoración integral"] },
  { name: "Medicina familiar", icon: "family_home", color: "#d4485c", services: ["Consulta de medicina familiar", "Control de salud familiar", "Valoración integral"] },
  { name: "Anestesiología", icon: "syringe", color: "#3b82d6", services: ["Consulta preanestésica", "Manejo del dolor", "Valoración anestésica"] },
  { name: "Cirugía general", icon: "surgical", color: "#3aa55c", services: ["Cirugía abdominal", "Consulta de cirugía general", "Valoración prequirúrgica"] },
  { name: "Dermatología", icon: "dermatology", color: "#6d9f3a", services: ["Consulta dermatológica", "Control de enfermedades de la piel", "Valoración de lesiones cutáneas"] },
  { name: "Gastroenterología", icon: "gastroenterology", color: "#b08e26", services: ["Colonoscopia", "Consulta gastroenterológica", "Endoscopia digestiva"] },
  { name: "Medicina física y rehabilitación", icon: "accessible", color: "#1aa39c", services: ["Consulta de rehabilitación", "Valoración funcional", "Plan de rehabilitación"] },
  { name: "Ortopedia", icon: "orthopedics", color: "#4a6fa8", services: ["Consulta de ortopedia", "Valoración de columna", "Valoración de hombro, rodilla y mano"] },
  { name: "Otorrinolaringología", icon: "ent", color: "#8a6c3c", services: ["Consulta otorrinolaringológica", "Evaluación de oído", "Evaluación de nariz y garganta"] },
  { name: "Psiquiatría", icon: "psychiatry", color: "#c9742b", services: ["Consulta psiquiátrica", "Control psiquiátrico", "Valoración de salud mental"] },
  { name: "Ortodoncia", icon: "sentiment_very_satisfied", color: "#6d9f3a", services: ["Consulta de ortodoncia", "Control de ortodoncia", "Valoración ortodóntica"] },
  { name: "Rehabilitación oral", icon: "dentistry", color: "#b08e26", services: ["Consulta de rehabilitación oral", "Diseño de rehabilitación oral", "Valoración odontológica"] },
  { name: "Ecografía", icon: "sensors", color: "#de762f", services: ["Ecografía convencional", "Ecografía obstétrica", "Ecografía Doppler placentaria"] },
  { name: "Mamografía", icon: "oncology", color: "#d4485c", services: ["Mamografía", "Tamizaje mamario", "Control mamográfico"] },
  { name: "Radiología", icon: "radiology", color: "#1aa39c", services: ["Radiología convencional", "Radiografía diagnóstica", "Estudio radiológico"] },
  { name: "Fisioterapia", icon: "physical_therapy", color: "#7a5cc4", services: ["Consulta de fisioterapia", "Rehabilitación física", "Terapia física"] },
  { name: "Fonoaudiología", icon: "record_voice_over", color: "#d6558c", services: ["Consulta de fonoaudiología", "Terapia de lenguaje", "Valoración del habla y lenguaje"] },
  { name: "Nutrición y dietética", icon: "nutrition", color: "#4a6fa8", services: ["Consulta de nutrición", "Educación nutricional", "Valoración nutricional"] },
  { name: "Psicología", icon: "psychology", color: "#8a6c3c", services: ["Consulta de psicología", "Orientación psicológica", "Valoración psicológica"] },
  { name: "Terapia ocupacional", icon: "front_hand", color: "#5b8a3c", services: ["Consulta de terapia ocupacional", "Rehabilitación ocupacional", "Terapia ocupacional"] },
  { name: "Terapia respiratoria", icon: "pulmonology", color: "#c9742b", services: ["Consulta de terapia respiratoria", "Rehabilitación pulmonar", "Terapia respiratoria"] },
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
