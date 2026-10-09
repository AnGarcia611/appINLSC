// Distancia DTW entre dos secuencias de vectores: tolera que la misma seña se haga más rápido o más lento.

/**
 * Costo medio por paso del mejor alineamiento (banda de Sakoe-Chiba del 30 %, mínimo 3 muestras).
 * Normalizado por n + m para poder comparar secuencias de distinto largo.
 */
export function dtw(a: number[][], b: number[][], limit = Infinity): number {
  const n = a.length, m = b.length
  if (!n || !m) return Infinity
  const band = Math.max(3, Math.ceil(0.3 * Math.max(n, m)), Math.abs(n - m) + 1)
  let prev = new Float64Array(m + 1).fill(Infinity)
  let cur = new Float64Array(m + 1).fill(Infinity)
  prev[0] = 0
  const stop = limit * (n + m)
  for (let i = 1; i <= n; i++) {
    cur.fill(Infinity)
    const center = Math.round((i * m) / n)
    const lo = Math.max(1, center - band), hi = Math.min(m, center + band)
    const ai = a[i - 1]
    let rowMin = Infinity
    for (let j = lo; j <= hi; j++) {
      const bj = b[j - 1]
      let s = 0
      for (let k = 0; k < ai.length; k++) { const d = ai[k] - bj[k]; s += d * d }
      const c = Math.sqrt(s) + Math.min(prev[j], cur[j - 1], prev[j - 1])
      cur[j] = c
      if (c < rowMin) rowMin = c
    }
    // Corte temprano: si toda la fila ya supera el límite, el resultado también.
    if (rowMin > stop) return Infinity
    const t = prev; prev = cur; cur = t
  }
  return prev[m] / (n + m)
}
