// Señas que se piden en la página de captura. Agregar una seña nueva = agregar una entrada aquí.
// Las descripciones de referencia resumen el Diccionario Básico de la LSC (INSOR / Instituto Caro y Cuervo).
// Hay variantes regionales: por eso cada seña con referencia pregunta "¿Así la hace usted?".

export interface SignTask {
  id: string
  /** Etiqueta para entrenar. Varias tareas pueden compartirla (p. ej. dos variantes de "sí"). */
  label: string
  title: string
  group: "Números" | "Sí y no" | "Trámites" | "Sin seña"
  /** Cómo se hace según la referencia. Sin referencia: la seña es libre (se graba como la haga el señante). */
  reference?: string
  /** Instrucción para la toma. */
  instruction: string
  takes: number
  /**
   * "seña": la grabación empieza al levantar la mano y termina al bajarla.
   * "fija": dura `durationMs` (gestos de cabeza o ejemplos sin seña, donde la mano puede no levantarse).
   */
  mode: "seña" | "fija"
  durationMs?: number
}

const n = (value: number, reference: string): SignTask => ({
  id: `num-${value}`, label: String(value), title: `Número ${value}`, group: "Números", reference,
  instruction: `Haga la seña del número ${value} y baje la mano al terminar.`, takes: 5, mode: "seña",
})

export const TASKS: SignTask[] = [
  n(1, "Mano levantada con el dedo índice extendido; los demás dedos doblados."),
  n(2, "Índice y medio extendidos; los demás dedos doblados."),
  n(3, "Índice, medio y anular extendidos; pulgar y meñique doblados."),
  n(4, "Los cuatro dedos extendidos; el pulgar doblado sobre la palma."),
  n(5, "Mano abierta con los cinco dedos extendidos y separados."),
  n(6, "Forma del 1 con la palma al frente; el índice se dobla y se estira varias veces."),
  n(7, "Forma del 2 con la palma al frente; índice y medio se doblan y se estiran varias veces."),
  n(8, "Forma del 3 con la palma al frente; los tres dedos se doblan y se estiran varias veces."),
  n(9, "Forma del 4 con la palma al frente; los cuatro dedos se doblan y se estiran varias veces."),

  { id: "si-cabeza", label: "sí", title: "Sí (con la cabeza)", group: "Sí y no", reference: "Asentir con la cabeza varias veces.", instruction: "Mire a la cámara y asienta con la cabeza.", takes: 5, mode: "fija", durationMs: 3000 },
  { id: "si-mano", label: "sí", title: "Sí (con la mano)", group: "Sí y no", reference: "Puño con la palma al frente; la muñeca se dobla hacia abajo varias veces.", instruction: "Haga la seña de SÍ con la mano.", takes: 5, mode: "seña" },
  { id: "no-cabeza", label: "no", title: "No (con la cabeza)", group: "Sí y no", reference: "Negar con la cabeza de lado a lado varias veces.", instruction: "Mire a la cámara y niegue con la cabeza.", takes: 5, mode: "fija", durationMs: 3000 },
  { id: "no-indice", label: "no", title: "No (con el índice)", group: "Sí y no", reference: "Dedo índice extendido que se mueve de lado a lado.", instruction: "Haga la seña de NO con el dedo índice.", takes: 5, mode: "seña" },

  { id: "tramite-asignar", label: "asignar", title: "Pedir una cita", group: "Trámites", instruction: "Pida una cita médica como lo haría en la recepción.", takes: 5, mode: "seña" },
  { id: "tramite-cancelar", label: "cancelar", title: "Cancelar una cita", group: "Trámites", instruction: "Diga que quiere cancelar su cita, como lo haría en la recepción.", takes: 5, mode: "seña" },
  { id: "tramite-facturar", label: "facturar", title: "Pagar o facturar una cita", group: "Trámites", instruction: "Diga que quiere pagar o facturar su cita, como lo haría en la recepción.", takes: 5, mode: "seña" },

  { id: "nada", label: "nada", title: "Sin hacer señas", group: "Sin seña", instruction: "Quédese natural frente a la cámara: mire alrededor, acomódese o rásquese, sin hacer señas.", takes: 3, mode: "fija", durationMs: 4000 },
  { id: "otra", label: "otra", title: "Otra seña cualquiera", group: "Sin seña", instruction: "Haga cualquier seña que no esté en esta lista (por ejemplo, su nombre o un saludo).", takes: 3, mode: "seña" },
]

export const taskById = (id: string) => TASKS.find((t) => t.id === id)
export const GROUPS = [...new Set(TASKS.map((t) => t.group))]
