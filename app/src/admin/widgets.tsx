import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"

/** Barra de precisión. Si `animating`, sube progresivamente hasta `value`. */
export function ConfidenceBar({ value, animating, label }: { value: number; animating: boolean; label: string }) {
  const [shown, setShown] = useState(animating ? 0 : value)

  useEffect(() => {
    // Con "reducir movimiento" activo en el sistema se muestra el valor final sin animar.
    if (!animating || matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(value); return }
    setShown(0)
    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / 1400)
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, animating])

  const color = shown >= 80 ? "var(--ok)" : shown >= 60 ? "var(--warn)" : "var(--err)"
  const band = animating && shown < value ? "Interpretando seña…" : shown >= 80 ? "Alta confianza" : shown >= 60 ? "Confianza media" : "Confianza baja"

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
