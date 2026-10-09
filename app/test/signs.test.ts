// Pruebas del generador de datos simulados y del reconocedor de señas con movimiento.   npm test
import { test } from "node:test"
import assert from "node:assert/strict"
import { PACKAGE_FORMAT, PACKAGE_VERSION, decodeFrame, encodeFrame, type CapturePackage, type Take } from "../src/capture/format.ts"
import { WindowPool, buildSignTemplates, signLabel } from "../src/capture/dataset.ts"
import { foldOf, makePersona, mirrorFrame, reshapeHand, rng, simulate, varyTake } from "../src/capture/synth.ts"
import { jointAngles } from "../src/vision/features.ts"
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
