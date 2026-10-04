// Tipos del motor de visión. Sin dependencias: lo usan el navegador, los scripts de Node y las pruebas.

/** Punto de referencia en coordenadas de imagen normalizadas (x, y en 0..1; z relativa, escala aprox. de x). */
export interface Point { x: number; y: number; z: number; v?: number }

export interface HandObs {
  /** "Left" | "Right" según MediaPipe (supone imagen espejada: con la cámara frontal sin espejar va invertida). */
  side: string
  score: number
  /** 21 puntos (muñeca, pulgar ×4, índice ×4, medio ×4, anular ×4, meñique ×4). */
  points: Point[]
}

/** Un fotograma procesado: manos y cuerpo (puntos 0–24 de MediaPipe Pose: cara gruesa, brazos y cadera). */
export interface Frame {
  /** Milisegundos (reloj del video o performance.now()). */
  t: number
  hands: HandObs[]
  pose: Point[] | null
}

/** Índices de MediaPipe Pose usados en el motor. */
export const POSE = {
  nose: 0, leftEye: 2, rightEye: 5, leftShoulder: 11, rightShoulder: 12,
  leftElbow: 13, rightElbow: 14, leftWrist: 15, rightWrist: 16, leftHip: 23, rightHip: 24,
} as const

/** Solo se guardan y procesan los puntos 0–24 del cuerpo (sin piernas). */
export const POSE_KEEP = 25
