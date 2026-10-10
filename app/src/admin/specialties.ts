// Lista de especialidades que se muestra apenas la tablet pregunta "¿qué especialidad necesita?": la última que envió
// este funcionario (guardada en su navegador) o, la primera vez, la de ejemplo.
import { specialtyByName } from "../shared/catalog"
import type { MenuOption } from "../shared/types"
import { exampleSpecialties } from "./pickers"

const KEY = "inlsc.especialidades"

/** Rehace cada opción desde el catálogo: una lista guardada vieja (o dañada) no puede meter íconos o servicios que ya no existen. */
function fromCatalog(items: unknown): MenuOption[] {
  if (!Array.isArray(items)) return []
  return items.flatMap((it) => {
    const { tab, text } = (it ?? {}) as { tab?: unknown; text?: unknown }
    const sp = typeof tab === "string" ? specialtyByName(tab) : undefined
    return sp && typeof text === "string" && sp.services.includes(text) ? [{ tab: sp.name, text, icon: sp.icon, color: sp.color }] : []
  }).slice(0, 8)
}

export function loadSpecialties(): MenuOption[] {
  try {
    const saved = fromCatalog(JSON.parse(localStorage.getItem(KEY) ?? "null"))
    return saved.length ? saved : exampleSpecialties()
  } catch {
    return exampleSpecialties()
  }
}

export function saveSpecialties(options: MenuOption[]) {
  try { localStorage.setItem(KEY, JSON.stringify(options.map(({ tab, text }) => ({ tab, text })))) } catch { /* sin almacenamiento */ }
}
