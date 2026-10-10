// Pruebas de la grabación de puntos de un video (fuente YouTube del laboratorio).   npm test
import { test } from "node:test"
import assert from "node:assert/strict"
import { validatePackage } from "../src/capture/format.ts"
import { foldOf } from "../src/capture/synth.ts"
import { PointsRecorder, recordedPackage } from "../src/vision/pointsRecorder.ts"
import { SHAPES, frame, hand } from "./hands.ts"

const ORIGIN = { dataset: "YouTube · Prueba", license: "CC BY 3.0", citation: "Prueba. Video [Video]. YouTube", url: "https://www.youtube.com/watch?v=abcdefghijk" }

test("grabación de puntos: tiempos del video (a 0.5×), tomas de 4 s y ~15 fotogramas por segundo", () => {
  const r = new PointsRecorder({ label: "otra", signer: "UMNG-01", chunkS: 4, source: "abcdefghijk" })
  // 20 s de reloj a 0.5× = 10 s de video, empezando en el segundo 10 del video; un fotograma cada 25 ms de reloj.
  r.start(1000, 10, 0.5)
  for (let t = 1000; t <= 21000; t += 25) r.push(frame(t, hand(SHAPES[5])))
  r.stop()
  assert.deepEqual(r.takes.map((t) => t.id), ["abcdefghijk~10.0", "abcdefghijk~14.0", "abcdefghijk~18.0"])
  for (const t of r.takes) {
    assert.equal(t.task, "otra")
    assert.equal(t.label, "otra")
    assert.equal(t.group, "UMNG-01")
    assert.ok(t.durationMs <= 4000, `toma de ${t.durationMs} ms`)
    assert.ok(t.fps >= 12 && t.fps <= 16, `fps ${t.fps}`)
    assert.equal(t.handRatio, 1)
    for (let i = 1; i < t.frames.length; i++) assert.ok(t.frames[i].t - t.frames[i - 1].t >= 66)
  }
  assert.equal(new Set(r.takes.map((t) => foldOf(t, 5))).size, 1, "las tomas de una persona van al mismo grupo")
})

test("grabación de puntos: pausar cierra la toma y reanudar abre otra; tomas muy cortas se descartan", () => {
  const r = new PointsRecorder({ label: "7", signer: "P-01", chunkS: 0, source: "v" })
  r.start(0, 0, 1)
  for (let t = 0; t <= 2000; t += 70) r.push(frame(t, hand(SHAPES[2])))
  r.stop()
  r.start(5000, 30, 1)
  for (let t = 5000; t <= 5100; t += 70) r.push(frame(t, hand(SHAPES[2])))
  r.stop()
  assert.equal(r.takes.length, 1)
  assert.equal(r.takes[0].task, "num-7")
  assert.equal(r.takes[0].label, "7")
})

test("paquete grabado: formato de captura válido, con la fuente citada", () => {
  const r = new PointsRecorder({ label: "otra", signer: "UMNG-01", chunkS: 4, source: "abcdefghijk" })
  r.start(0, 0, 1)
  for (let t = 0; t <= 6000; t += 70) r.push(frame(t, hand(SHAPES[1])))
  r.stop()
  const pkg = recordedPackage({ signer: "UMNG-01", origin: ORIGIN, takes: r.takes, camera: { width: 1280, height: 720 }, app: { mediapipe: "prueba", models: {} } })
  assert.deepEqual(validatePackage(pkg), [])
  assert.equal(pkg.origin?.license, "CC BY 3.0")
  assert.equal(pkg.signer.code, "UMNG-01")
  assert.ok(pkg.consent.evaluation && pkg.consent.training)
})
