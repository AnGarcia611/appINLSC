import { CAPTURE_EMAIL } from "../shared/config"

// ⚠️ BORRADOR. Debe revisarlo quien maneje la protección de datos (Ley 1581 de 2012) en la IPS o el proyecto
// antes de grabar a personas reales. Al aprobarlo: poner REVIEWED = true y cambiar VERSION.
export const CONSENT_VERSION = "borrador-2026-10-03"
export const CONSENT_REVIEWED = false

/** Video del consentimiento en LSC (ruta bajo public/). null mientras no exista: se pide apoyo de un intérprete. */
export const CONSENT_VIDEO: string | null = null

export const CONSENT_TEXT: { title: string; text: string }[] = [
  {
    title: "¿Para qué es?",
    text: "Queremos enseñarle a InLSC a reconocer señas de la Lengua de Señas Colombiana, para que las personas sordas puedan hacer trámites en la recepción de la IPS. Usted nos ayuda haciendo algunas señas frente a la cámara.",
  },
  {
    title: "¿Qué se guarda?",
    text: "No se graba video ni fotos. La tablet guarda solo puntos de la posición de sus manos, brazos y cabeza (un esqueleto). Aun así, estos datos pueden considerarse datos biométricos: por eso le pedimos permiso.",
  },
  {
    title: "¿Quién los recibe?",
    text: `Los datos se envían por correo a ${CAPTURE_EMAIL}, responsable del proyecto InLSC, y se guardan en un lugar privado. No se publican con su nombre: usted aparece con un código anónimo.`,
  },
  {
    title: "Es voluntario",
    text: "Participar es opcional. Puede parar cuando quiera y puede pedir que se borren sus datos escribiendo al mismo correo con su código de señante. Las preguntas de perfil también son opcionales.",
  },
  {
    title: "¿Por cuánto tiempo?",
    text: "Los datos se conservan mientras dure el proyecto de investigación y desarrollo de InLSC, o hasta que usted pida borrarlos.",
  },
]
