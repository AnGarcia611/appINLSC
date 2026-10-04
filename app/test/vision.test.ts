// Pruebas del motor de visión con manos sintéticas.   npm test
import { test } from "node:test"
import assert from "node:assert/strict"
import { fingerExtension } from "../src/vision/features.ts"
import { NumberRecognizer, ruleScores, type NumberResult } from "../src/vision/numbers.ts"
import { HeadGestureDetector } from "../src/vision/head.ts"
import { Segmenter } from "../src/vision/segmenter.ts"
import { POSE, type Frame, type Point } from "../src/vision/types.ts"
import { POSE_UP, SHAPES, frame, hand, mix, sequence, type Curl } from "./hands.ts"

const PLACEMENTS = [
  {},
  { rotation: 0.35, scale: 0.09 },
  { rotation: -0.4, scale: 0.15, mirror: true },
  { x: 0.3, y: 0.4, jitter: 0.002, seed: 7 },
]

function run(frames: Frame[], max = 9): NumberResult[] {
  const r = new NumberRecognizer({ max })
  return frames.map((f) => r.push(f)).filter((x): x is NumberResult => !!x)
}

/** Seña completa: entra la mano cerrada, muestra la forma, (flexiona) y baja. */
function sign(base: number, flex: number, place = {}): Frame[] {
  const shape = SHAPES[base]
  const fist = SHAPES[0]
  const seq: (Point[] | null)[] = []
  for (let i = 0; i < 6; i++) seq.push(null)
  for (let i = 0; i < 4; i++) seq.push(hand(mix(fist, shape, i / 3), place))
  if (flex) {
    // Cada ciclo: los dedos extendidos se doblan y vuelven (≈ 0.5 s).
    const bent = shape.map((v, i) => (i > 0 && v === 0 ? 0.85 : v)) as Curl
    for (let c = 0; c < flex; c++) for (let i = 0; i < 10; i++) seq.push(hand(mix(shape, bent, Math.sin((i / 10) * Math.PI)), place))
    for (let i = 0; i < 3; i++) seq.push(hand(shape, place))
  } else {
    for (let i = 0; i < 20; i++) seq.push(hand(shape, place))
  }
  for (let i = 0; i < 12; i++) seq.push(null)
  return sequence(seq.length, (i) => seq[i])
}

test("extensión de los dedos: extendido ≈ 1, doblado ≈ 0", () => {
  for (const place of PLACEMENTS) {
    const open = fingerExtension(hand(SHAPES[5], place))
    const fist = fingerExtension(hand(SHAPES[0], place))
    open.forEach((e, i) => assert.ok(e > 0.75, `dedo ${i} abierto = ${e.toFixed(2)}`))
    fist.forEach((e, i) => assert.ok(e < 0.3, `dedo ${i} cerrado = ${e.toFixed(2)}`))
  }
})

test("forma estática: cada base 1–5 gana con margen en cualquier posición, escala, rotación o espejo", () => {
  for (const place of PLACEMENTS) {
    for (const base of [1, 2, 3, 4, 5]) {
      const scores = ruleScores(fingerExtension(hand(SHAPES[base], place)))
      const best = scores.indexOf(Math.max(...scores)) + 1
      assert.equal(best, base, `base ${base} con ${JSON.stringify(place)}: ${scores.map((s) => s.toFixed(2))}`)
    }
  }
})

test("números estáticos 1–5: se reconocen una sola vez por seña", () => {
  for (const place of PLACEMENTS) {
    for (const n of [1, 2, 3, 4, 5]) {
      const out = run(sign(n, 0, place))
      assert.equal(out.length, 1, `número ${n}: ${JSON.stringify(out)}`)
      assert.equal(out[0].value, n)
      assert.equal(out[0].kind, "estático")
      assert.ok(out[0].confidence >= 75, `confianza ${out[0].confidence}`)
    }
  }
})

test("números con movimiento 6–9: la flexión repetida suma 5", () => {
  for (const place of PLACEMENTS) {
    for (const base of [1, 2, 3, 4]) {
      const out = run(sign(base, 3, place))
      const last = out[out.length - 1]
      assert.ok(last, `sin resultado para ${base + 5}`)
      assert.equal(last.value, base + 5, `esperado ${base + 5}: ${JSON.stringify(out)}`)
      assert.equal(last.kind, "movimiento")
    }
  }
})

test("un solo ciclo de flexión cuenta como movimiento al bajar la mano", () => {
  const out = run(sign(2, 1))
  assert.equal(out[out.length - 1]?.value, 7, JSON.stringify(out))
})

test("solo se emiten números de 1 a max", () => {
  const out = run(sign(4, 3), 6)
  for (const r of out) assert.ok(r.value <= 6, JSON.stringify(out))
})

test("sin señas no hay resultados: puño levantado, manos en reposo, mano que solo aparece", () => {
  assert.equal(run(sequence(60, () => hand(SHAPES[0]))).length, 0, "puño")
  // Mano abierta pero apoyada abajo (por debajo de los codos): reposo.
  assert.equal(run(sequence(60, () => hand(SHAPES[5], { y: 0.92 }))).length, 0, "reposo")
  // Parpadeo del detector: mano visible 3 fotogramas.
  assert.equal(run(sequence(20, (i) => (i < 3 ? hand(SHAPES[3]) : null))).length, 0, "parpadeo")
})

test("cambiar de forma sin bajar la mano reconoce el número nuevo", () => {
  const seq = [...Array(20).fill(SHAPES[2]), ...Array(20).fill(SHAPES[3])] as Curl[]
  const out = run(sequence(seq.length, (i) => hand(seq[i])))
  assert.deepEqual(out.map((r) => r.value), [2, 3])
})

test("segmentador: inicio y fin con histéresis", () => {
  const seg = new Segmenter()
  const events = sequence(40, (i) => (i >= 5 && i < 25 && i !== 12 ? hand(SHAPES[5]) : null))
    .map((f) => seg.push(f).event)
    .filter(Boolean)
  assert.deepEqual(events.map((e) => e!.type), ["start", "end"], "un hueco de 1 fotograma no corta la seña")
})

function headFrames(axis: "x" | "y", amp: number): Frame[] {
  return Array.from({ length: 40 }, (_, i) => {
    const pose = POSE_UP.map((p) => ({ ...p }))
    const d = amp * Math.sin((i / 40) * Math.PI * 2 * 3) // 3 oscilaciones en 2 s
    pose[POSE.nose] = { ...pose[POSE.nose], [axis]: pose[POSE.nose][axis] + d }
    return frame(i * 50, null, pose)
  })
}

test("cabeza: asentir = sí, negar = no, quieto = nada", () => {
  const detect = (frames: Frame[]) => { const d = new HeadGestureDetector(); return frames.map((f) => d.push(f)).find(Boolean) ?? null }
  assert.equal(detect(headFrames("y", 0.02))?.value, "sí")
  assert.equal(detect(headFrames("x", 0.025))?.value, "no")
  assert.equal(detect(headFrames("x", 0.002)), null)
})
