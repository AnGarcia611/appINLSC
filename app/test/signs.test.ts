// Pruebas del generador de datos simulados y del reconocedor de señas con movimiento.   npm test
import { test } from "node:test"
import assert from "node:assert/strict"
import { PACKAGE_FORMAT, PACKAGE_VERSION, decodeFrame, encodeFrame, type CapturePackage, type Take } from "../src/capture/format.ts"
import { WindowPool, buildSignTemplates, signLabel } from "../src/capture/dataset.ts"
import { curlFingers, flexTake, foldOf, makePersona, mirrorFrame, reshapeHand, rng, simulate, varyTake } from "../src/capture/synth.ts"
import { fingerExtension, jointAngles } from "../src/vision/features.ts"
import { NumberRecognizer } from "../src/vision/numbers.ts"
import { INTENT_LABELS, SignRecognizer } from "../src/vision/signs.ts"
import { dtw } from "../src/vision/dtw.ts"
import type { Frame } from "../src/vision/types.ts"
import { SHAPES, frame, hand, sequence } from "./hands.ts"

/** Seña de prueba con movimiento: la mano abierta recorre una trayectoria durante 4 s (20 fps). */
function moving(path: (u: number) => { x: number; y: number }, curl = SHAPES[5], seed = 1): Frame[] {
  const n = 80
  return [
    ...sequence(6, () => null),
    ...sequence(n, (i) => { const p = path(i / n); return hand(curl, { ...p, jitter: 0.002, seed: seed + i }) }, 300),
    ...sequence(12, () => null, 300 + n * 50),
  ]
}
const sideToSide = (u: number) => ({ x: 0.5 + 0.12 * Math.sin(u * Math.PI * 6), y: 0.42 })
const upAndDown = (u: number) => ({ x: 0.5, y: 0.38 + 0.08 * Math.sin(u * Math.PI * 6) })
const circle = (u: number) => ({ x: 0.5 + 0.08 * Math.cos(u * Math.PI * 4), y: 0.4 + 0.06 * Math.sin(u * Math.PI * 4) })

function take(task: string, frames: Frame[], id: string): Take {
  return { id, task, label: signLabel(task) ?? task, variant: false, at: "2026-10-09T00:00:00Z", durationMs: frames[frames.length - 1].t, fps: 20, handRatio: 1, frames: frames.map((f) => encodeFrame(f, 0)) }
}

function pkg(takes: Take[]): CapturePackage {
  return {
    format: PACKAGE_FORMAT, version: PACKAGE_VERSION, id: "p1", createdAt: "x", updatedAt: "x",
    app: { mediapipe: "0.10.35", models: {} }, camera: { width: 1280, height: 720 },
    consent: { version: "v1", acceptedAt: "x", training: true, evaluation: true },
    signer: { code: "S-TEST", profile: {} }, validations: [], takes, trials: [],
  }
}

const training = pkg([
  ...[1, 2, 3].map((s) => take("tramite-asignar", moving(sideToSide, SHAPES[5], s), `a${s}`)),
  ...[1, 2, 3].map((s) => take("tramite-cancelar", moving(upAndDown, SHAPES[5], s), `c${s}`)),
  ...[1, 2, 3].map((s) => take("otra", moving(circle, SHAPES[1], s), `o${s}`)),
])

test("simulación: misma semilla, mismo resultado; las variantes guardan su toma de origen y su grupo", () => {
  const a = [...simulate([training], { personas: 2, seed: 7 })]
  const b = [...simulate([training], { personas: 2, seed: 7 })]
  assert.equal(JSON.stringify(a), JSON.stringify(b))
  assert.equal(a.length, 2)
  for (const p of a) {
    assert.ok(p.synthetic)
    assert.notEqual(p.signer.code, "S-TEST")
    for (const t of p.takes) {
      assert.ok(t.source, t.id)
      const src = training.takes.find((x) => x.id === t.source)
      if (src) assert.equal(foldOf(t, 5), foldOf(src, 5))
    }
  }
  assert.notEqual(JSON.stringify([...simulate([training], { personas: 1, seed: 8 })][0].takes[0]), JSON.stringify(a[0].takes[0]))
})

test("simulación: solo paquetes con permiso para entrenar", () => {
  assert.equal([...simulate([{ ...training, consent: { ...training.consent, training: false } }], { personas: 3, seed: 1 })].length, 0)
})

test("otra mano: cambian los largos de los huesos pero no los ángulos de las articulaciones", () => {
  const p = { ...makePersona(rng(3), "x"), thumb: 0 }
  const pts = hand(SHAPES[3], { rotation: 0.3 })
  const before = jointAngles(pts), after = jointAngles(reshapeHand(pts, p, 16 / 9))
  before.forEach((a, i) => assert.ok(Math.abs(a - after[i]) < 1e-6, `ángulo ${i}`))
  assert.ok(Math.abs(after.length - before.length) === 0)
})

test("espejo dos veces = original", () => {
  const f = frame(0, hand(SHAPES[2], { x: 0.3 }))
  mirrorFrame(mirrorFrame(f)).hands[0].points.forEach((p, i) => assert.ok(Math.abs(p.x - f.hands[0].points[i].x) < 1e-9 && p.y === f.hands[0].points[i].y))
  assert.equal(mirrorFrame(f).hands[0].side, "Left")
})

test("variante simulada: formato válido, otra duración y con la mano todavía visible", () => {
  const src = training.takes[0]
  const v = varyTake(src, makePersona(rng(1), "SIM-1"), rng(2), 16 / 9)
  assert.equal(v.source, src.id)
  assert.ok(v.frames.length > 20)
  assert.ok(v.frames.every((f) => f.h.every((h) => h.p.length === 63)))
  assert.ok(v.handRatio > 0.5)
  assert.ok(decodeFrame(v.frames[0]).t === 0)
})

test("DTW: tolera la misma secuencia más lenta y separa trayectorias distintas", () => {
  const a = Array.from({ length: 20 }, (_, i) => [Math.sin(i / 3), 0])
  const slow = Array.from({ length: 30 }, (_, i) => [Math.sin(i / 4.5), 0])
  const other = Array.from({ length: 20 }, (_, i) => [0, Math.sin(i / 3)])
  assert.ok(dtw(a, slow) < dtw(a, other) / 3)
})

test("reconocedor de trámites: reconoce las señas entrenadas (variantes nuevas) y no emite con otra seña", () => {
  const pool = new WindowPool(1), cal = new WindowPool(2)
  pool.addPackage(training)
  for (const p of simulate([training], { personas: 4, seed: 1 })) pool.addPackage(p)
  for (const p of simulate([training], { personas: 2, seed: 99 })) cal.addPackage(p)
  const file = buildSignTemplates(pool, cal)
  assert.ok(file.prototypes.length > 10)
  assert.ok(file.near > 0 && file.far > file.near)
  assert.ok(!JSON.stringify(file).includes("S-TEST"))

  const run = (frames: Frame[]) => {
    const r = new SignRecognizer({ accept: INTENT_LABELS, templates: file })
    return frames.map((f) => r.push(f)).filter(Boolean)
  }
  const a = run(moving(sideToSide, SHAPES[5], 50))
  assert.equal(a.length, 1, JSON.stringify(a))
  assert.equal(a[0]!.value, "asignar")
  const c = run(moving(upAndDown, SHAPES[5], 60))
  assert.equal(c[0]?.value, "cancelar", JSON.stringify(c))
  assert.equal(run(moving(circle, SHAPES[1], 70)).length, 0, "otra seña")
  assert.equal(run(sequence(80, () => null)).length, 0, "sin manos")
})

/** Toma de un número quieto: entra la mano, sostiene la forma 1.5 s y baja (20 fps). */
function staticNumber(n: number, seed = 1): Take {
  const frames = [
    ...sequence(4, () => null),
    ...sequence(30, () => hand(SHAPES[n], { jitter: 0.001, seed }), 200),
    ...sequence(8, () => null, 1700),
  ]
  return { ...take(`num-${n}`, frames, `num-${n}-${seed}`), label: String(n) }
}

function lastNumber(t: Take): number | undefined {
  const r = new NumberRecognizer()
  const out = t.frames.map(decodeFrame).map((f) => r.push(f)).filter((x) => !!x)
  return out[out.length - 1]?.value
}

test("doblar los dedos: solo los de la base, hacia la palma, sin cambiar el largo de los huesos", () => {
  const p = hand(SHAPES[2])
  const bent = curlFingers(p, [1, 2], 0.8, 16 / 9)
  const before = fingerExtension(p), after = fingerExtension(bent)
  assert.ok(after[1] < 0.35 && after[2] < 0.35, `índice y medio doblados: ${after.map((x) => x.toFixed(2))}`)
  for (const i of [0, 3, 4]) assert.ok(Math.abs(after[i] - before[i]) < 0.02, `dedo ${i} sin cambios`)
  const len = (q: typeof p, a: number, b: number) => Math.hypot((q[a].x - q[b].x) * 16 / 9, q[a].y - q[b].y, (q[a].z - q[b].z) * 16 / 9)
  for (const [a, b] of [[5, 6], [6, 7], [7, 8], [9, 10]]) assert.ok(Math.abs(len(bent, a, b) - len(p, a, b)) < 1e-9)
})

test("6–9 fabricados desde 1–4: se reconocen como el número con movimiento y guardan su toma de origen", () => {
  for (const n of [1, 2, 3, 4]) {
    const src = staticNumber(n)
    assert.equal(lastNumber(src), n)
    for (const depth of [1, 0.5]) {
      const f = flexTake(src, { cycles: 3, hz: 2, depth, lead: 0.1 }, 16 / 9)
      assert.ok(f, `sin tramo para ${n}`)
      assert.equal(f.label, String(n + 5))
      assert.equal(f.task, `num-${n + 5}`)
      assert.equal(f.source, src.id)
      assert.equal(lastNumber(f), n + 5, `profundidad ${depth}`)
    }
  }
  // El 5 no tiene versión con movimiento.
  assert.equal(flexTake(staticNumber(5), { cycles: 2, hz: 2, depth: 1, lead: 0 }, 16 / 9), null)
})

test("simulación: incluye 6–9 fabricados desde 1–4, en el grupo de su toma de origen", () => {
  const src = staticNumber(2)
  const sims = [...simulate([pkg([src])], { personas: 6, seed: 3 })]
  const fab = sims.flatMap((s) => s.takes).filter((t) => t.label === "7")
  assert.ok(fab.length > 0, "ninguna variante fabricada")
  for (const t of fab) assert.equal(foldOf(t, 5), foldOf(src, 5))
})
