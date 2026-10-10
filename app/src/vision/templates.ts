import type { Template, TemplateFile } from "./knn.ts"
import type { SeqTemplateFile } from "./signs.ts"
import { VISION_BASE } from "./tracker"

let cached: Promise<Template[]> | null = null
let signs: Promise<SeqTemplateFile | null> | null = null

/** Plantillas de forma generadas con `npm run dataset`. Si no existen todavía, se usan solo las reglas. */
export function loadNumberTemplates(): Promise<Template[]> {
  cached ??= fetch(`${VISION_BASE}numbers.templates.json`)
    .then((r) => (r.ok ? (r.json() as Promise<TemplateFile>) : null))
    .then((file) => (file?.version === 1 ? file.templates : []))
    .catch(() => [])
  return cached
}

/** Prototipos de trámites y sí/no con la mano (`npm run dataset`). Sin ellos no hay reconocimiento de trámites. */
export function loadSignTemplates(): Promise<SeqTemplateFile | null> {
  signs ??= fetch(`${VISION_BASE}signs.templates.json`)
    .then((r) => (r.ok ? (r.json() as Promise<SeqTemplateFile>) : null))
    .then((file) => (file?.version === 1 && file.prototypes.length ? file : null))
    .catch(() => null)
  return signs
}
