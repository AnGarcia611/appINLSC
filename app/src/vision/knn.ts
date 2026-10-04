// k vecinos más cercanos sobre vectores de forma de la mano. Funciona con pocos ejemplos por clase.

export interface Template { label: number; v: number[] }

/** Archivo `public/vision/numbers.templates.json`, generado por `npm run dataset`. */
export interface TemplateFile { version: 1; created: string; signers: number; templates: Template[] }

function sqDist(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d }
  return s
}

/**
 * Puntaje 0..1 por etiqueta: peso de cada etiqueta entre los k vecinos más cercanos (pesados por 1/distancia).
 * Si no hay plantillas devuelve un mapa vacío.
 */
export function knnScores(v: number[], templates: Template[], k = 5): Map<number, number> {
  const scores = new Map<number, number>()
  if (!templates.length) return scores
  const nearest = templates
    .map((t) => ({ label: t.label, d: Math.sqrt(sqDist(v, t.v)) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
  let total = 0
  for (const n of nearest) {
    const w = 1 / (n.d + 0.05)
    total += w
    scores.set(n.label, (scores.get(n.label) ?? 0) + w)
  }
  for (const [label, w] of scores) scores.set(label, w / total)
  return scores
}
