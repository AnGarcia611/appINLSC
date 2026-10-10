import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

/** Barra de precisión de un reconocimiento (0–100 %). */
export function ConfidenceBar({ value, label }: { value: number; label: string }) {
  const shown = value
  const color = shown >= 80 ? "var(--ok)" : shown >= 60 ? "var(--warn)" : "var(--err)"
  const band = shown >= 80 ? "Alta confianza" : shown >= 60 ? "Confianza media" : "Confianza baja"

  return (
    <div className="conf">
      <div className="conf-head"><span>{label}</span><strong style={{ color }}>{shown} %</strong></div>
      <div className="conf-track" role="progressbar" aria-label={label} aria-valuenow={shown} aria-valuemin={0} aria-valuemax={100}><div className="conf-fill" style={{ width: `${shown}%`, background: color }} /></div>
      <div className="conf-band" style={{ color }}>{band}</div>
    </div>
  )
}

/** Muestra un contenido de tamaño fijo (la pantalla de la tablet) escalado al ancho disponible. */
export function ScaledPreview({ width, height, children }: { width: number; height: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.3)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(el.clientWidth / width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [width])

  return (
    <div ref={ref} className="scaled" style={{ height: height * scale }}>
      <div style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}>{children}</div>
    </div>
  )
}

export function Msg({ tag, children, tone }: { tag: string; children: ReactNode; tone?: "warn" | "ok" }) {
  return <div className={`msg ${tone ?? ""}`}><small>{tag}</small>{children}</div>
}
