import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

// Palm landmarks used to compute center (wrist + base of each finger)
const PALM_INDICES = [0, 5, 9, 13, 17]

// How long the palm must stay still before placement confirms (ms)
const CONFIRM_DURATION = 1500

// Max normalized movement allowed while holding (0–1 coords)
const STABILITY_THRESHOLD = 0.04

export class HandTracker extends EventTarget {
  constructor() {
    super()
    this._landmarker = null
    this._running = false

    // Confirmation state
    this._holdStart = null
    this._lastPalm = null
  }

  async init() {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
    )

    this._landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
    })
  }

  // Call every frame with the video element and current timestamp (ms)
  detect(video, nowMs) {
    if (!this._landmarker || !this._running) return

    const result = this._landmarker.detectForVideo(video, nowMs)
    if (!result.landmarks || result.landmarks.length === 0) {
      this._holdStart = null
      this._lastPalm = null
      this.dispatchEvent(new CustomEvent('hand-lost'))
      return
    }

    const palm = this._palmCenter(result.landmarks[0])
    this.dispatchEvent(new CustomEvent('hand-detected', { detail: palm }))

    // Stability check for placement confirmation
    if (this._lastPalm && this._isStable(palm, this._lastPalm)) {
      if (!this._holdStart) this._holdStart = performance.now()
      const elapsed = performance.now() - this._holdStart
      const progress = Math.min(elapsed / CONFIRM_DURATION, 1)
      this.dispatchEvent(new CustomEvent('hold-progress', { detail: { progress, palm } }))

      if (elapsed >= CONFIRM_DURATION) {
        this._running = false   // stop tracking after placement
        this.dispatchEvent(new CustomEvent('placement-confirmed', { detail: palm }))
      }
    } else {
      this._holdStart = null
    }

    this._lastPalm = palm
  }

  start() { this._running = true }
  stop()  { this._running = false }

  _palmCenter(landmarks) {
    let x = 0, y = 0, z = 0
    for (const i of PALM_INDICES) {
      x += landmarks[i].x
      y += landmarks[i].y
      z += landmarks[i].z
    }
    const n = PALM_INDICES.length
    // MediaPipe gives 0–1 normalized coords, x flipped for front camera
    return { x: x / n, y: y / n, z: z / n }
  }

  _isStable(a, b) {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return Math.sqrt(dx * dx + dy * dy) < STABILITY_THRESHOLD
  }
}
