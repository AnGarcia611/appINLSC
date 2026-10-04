// Prepara los archivos del reconocimiento de señas para servirlos desde la propia app (sin CDN ni internet en uso):
//   public/vision/wasm/    ← copia de node_modules/@mediapipe/tasks-vision/wasm (no se versiona; se copia en cada dev/build)
//   public/vision/models/  ← modelos .task de MediaPipe (se versionan; solo se descargan si faltan)
// Ejecutar: npm run vision (también corre solo antes de dev, build y start).
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const WASM_SRC = path.join(root, "node_modules/@mediapipe/tasks-vision/wasm")
const WASM_DEST = path.join(root, "public/vision/wasm")
const MODELS_DEST = path.join(root, "public/vision/models")

// Versión fija del modelo (no "latest") para que el entrenamiento y la app usen exactamente el mismo.
const MODELS = {
  "hand_landmarker.task": "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  "pose_landmarker_lite.task": "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
}

// El cargador de MediaPipe elige en tiempo de ejecución la variante con o sin SIMD; la variante "module" no se usa.
const WASM_FILES = ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]

fs.mkdirSync(WASM_DEST, { recursive: true })
for (const f of WASM_FILES) {
  const src = path.join(WASM_SRC, f)
  const dest = path.join(WASM_DEST, f)
  if (!fs.existsSync(src)) { console.error(`✗ Falta ${src}. Ejecute npm install.`); process.exit(1) }
  if (fs.existsSync(dest) && fs.statSync(dest).size === fs.statSync(src).size) continue
  fs.copyFileSync(src, dest)
  console.log(`✓ wasm/${f}`)
}

fs.mkdirSync(MODELS_DEST, { recursive: true })
for (const [name, url] of Object.entries(MODELS)) {
  const dest = path.join(MODELS_DEST, name)
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) continue
  console.log(`↓ ${name}`)
  const res = await fetch(url)
  if (!res.ok) { console.error(`✗ No se pudo descargar ${url} (HTTP ${res.status})`); process.exit(1) }
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  console.log(`✓ models/${name} (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`)
}
