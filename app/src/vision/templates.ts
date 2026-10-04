import type { Template, TemplateFile } from "./knn.ts"
import { VISION_BASE } from "./tracker"

let cached: Promise<Template[]> | null = null

/** Plantillas de forma generadas con `npm run dataset`. Si no existen todavía, se usan solo las reglas. */
export function loadNumberTemplates(): Promise<Template[]> {
  cached ??= fetch(`${VISION_BASE}numbers.templates.json`)
    .then((r) => (r.ok ? (r.json() as Promise<TemplateFile>) : null))
    .then((file) => (file?.version === 1 ? file.templates : []))
    .catch(() => [])
  return cached
}
