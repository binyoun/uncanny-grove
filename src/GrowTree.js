import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const SEED_SCALE  = 0.004   // tiny at placement
const FULL_SCALE  = 12.0    // large enough to put camera inside
const GROW_MS     = 5000    // total grow duration

// Easing: slow start, fast middle, gentle finish
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export class GrowTree {
  constructor(scene) {
    this._scene = scene
    this._model = null
    this._anchor = new THREE.Group()
    this._growing = false
    this._growStart = null
    this._onGrown = null
    scene.add(this._anchor)
  }

  async load(modelPath) {
    return new Promise((resolve, reject) => {
      new GLTFLoader().load(
        modelPath,
        (gltf) => {
          const model = gltf.scene

          // DoubleSide so the interior surfaces are visible once inside
          model.traverse((n) => {
            if (!n.isMesh) return
            const mats = Array.isArray(n.material) ? n.material : [n.material]
            mats.forEach((m) => {
              m.side = THREE.DoubleSide
              m.depthWrite = true
            })
          })

          // Normalize the model to unit size first, then scale from there
          const box = new THREE.Box3().setFromObject(model)
          const size = box.getSize(new THREE.Vector3())
          const max = Math.max(size.x, size.y, size.z)
          if (max > 0) model.scale.setScalar(1 / max)

          // Center base on origin so it grows upward from placement point
          const center = box.getCenter(new THREE.Vector3())
          model.position.set(-center.x / max, -box.min.y / max, -center.z / max)

          this._model = model
          this._anchor.add(model)
          this._anchor.scale.setScalar(SEED_SCALE)
          this._anchor.visible = false

          resolve()
        },
        undefined,
        reject
      )
    })
  }

  // Place anchor at world position and begin grow sequence
  place(worldPosition) {
    if (!this._model) return
    this._anchor.position.copy(worldPosition)
    this._anchor.visible = true
    this._anchor.scale.setScalar(SEED_SCALE)
    this._growing = true
    this._growStart = performance.now()
  }

  // Returns true once fully grown
  update() {
    if (!this._growing || !this._model) return false

    const elapsed = performance.now() - this._growStart
    const t = Math.min(elapsed / GROW_MS, 1)
    const eased = easeInOutCubic(t)

    const scale = SEED_SCALE + (FULL_SCALE - SEED_SCALE) * eased
    this._anchor.scale.setScalar(scale)

    // Slow rotation during growth reads as living/organic
    this._anchor.rotation.y += 0.003

    if (t >= 1) {
      this._growing = false
      this._anchor.rotation.y = 0
      return true
    }
    return false
  }

  get anchor() { return this._anchor }
}
