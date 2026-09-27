import type { IconName } from "./Icon"
import type { VideoId } from "./types"

export type StepKind = "video" | "detect" | "especialidad" | "horario" | "cita" | "valor" | "resultado"

export interface Step {
  kind: StepKind
  /** Nombre en el panel del funcionario. */
  label: string
  /** Etiqueta corta en la barra de progreso de la tablet. */
  short: string
  video?: VideoId
  /** Instrucción para el funcionario. */
  hint: string
  /** Texto del botón para avanzar en pasos de video. */
  action?: string
  variant?: "asignada" | "cancelada"
}

export interface FlowPath { id: "asignacion" | "cancelacion" | "facturacion"; name: string; icon: IconName; color: string; steps: Step[] }

const documento: Step = { kind: "video", label: "Documento", short: "Doc.", video: "documento", hint: "Pida y verifique el documento de identidad.", action: "Documento recibido" }
const ordenMedica: Step = { kind: "video", label: "Orden médica", short: "Orden", video: "orden_medica", hint: "Pida y verifique la orden médica.", action: "Orden verificada" }

/** Pasos comunes antes de conocer el trámite. */
export const INTRO: Step[] = [
  { kind: "video", label: "Saludo", short: "Hola", video: "saludo", hint: "Se reproduce el saludo en LSC.", action: "Continuar" },
  { kind: "video", label: "Solicitud", short: "Solicitud", video: "solicitud", hint: "Se pregunta al señante qué trámite necesita.", action: "Activar cámara" },
  { kind: "detect", label: "Detección de seña", short: "Trámite", hint: "El señante expresa su solicitud en LSC frente a la cámara." },
]

export const PATHS: FlowPath[] = [
  {
    id: "asignacion", name: "Asignación de cita", icon: "event_available", color: "#145da0",
    steps: [
      documento,
      { kind: "especialidad", label: "Especialidad", short: "Espec.", video: "especialidad", hint: "Elija las especialidades y servicios que se mostrarán al señante." },
      ordenMedica,
      { kind: "horario", label: "Disponibilidad", short: "Fecha", hint: "Agregue fechas y horarios disponibles, o indique que no hay disponibilidad." },
      { kind: "resultado", label: "Cita asignada", short: "Listo", video: "despedida", variant: "asignada", hint: "El señante ve el resumen de su cita.", action: "Finalizar atención" },
    ],
  },
  {
    id: "cancelacion", name: "Cancelación de cita", icon: "event_busy", color: "#c53d3d",
    steps: [
      documento,
      { kind: "cita", label: "Cita a cancelar", short: "Cita", hint: "Envíe al señante sus citas registradas para que elija cuál cancelar." },
      { kind: "resultado", label: "Cita cancelada", short: "Hecho", video: "cancelada", variant: "cancelada", hint: "El señante ve la confirmación de la cancelación.", action: "Continuar" },
      { kind: "video", label: "Despedida", short: "Adiós", video: "despedida", hint: "Video de despedida.", action: "Finalizar atención" },
    ],
  },
  {
    id: "facturacion", name: "Facturación de cita", icon: "payments", color: "#2d7a3a",
    steps: [
      documento,
      ordenMedica,
      { kind: "video", label: "Pago en efectivo", short: "Pago", video: "pago_efectivo", hint: "Se informa que solo se recibe efectivo.", action: "Continuar" },
      { kind: "valor", label: "Valor", short: "Valor", video: "valor", hint: "Escriba el valor de la factura y envíelo a la tablet." },
      { kind: "video", label: "Recibo", short: "Recibo", video: "recibo", hint: "Entregue el recibo.", action: "Recibo entregado" },
      { kind: "video", label: "Sala de espera", short: "Sala", video: "espera_sala", hint: "Indique al señante que espere en la sala.", action: "Continuar" },
      { kind: "video", label: "Con gusto", short: "Listo", video: "con_gusto", hint: "Cierre de la atención.", action: "Finalizar atención" },
    ],
  },
]
