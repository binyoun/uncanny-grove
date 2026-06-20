import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { HandTracker } from './HandTracker.js'
import { GrowTree } from './GrowTree.js'
import { SoundEngine } from './SoundEngine.js'

const BASE = import.meta.env.BASE_URL

// ── Renderer ──────────────────────────────────────────────────
const canvas = document.getElementById('canvas')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.1
renderer.setClearColor(0x000000, 0)

// ── Scene ─────────────────────────────────────────────────────
const scene = new THREE.Scene()
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
pmrem.dispose()

scene.add(new THREE.AmbientLight(0xffffff, 1.5))
const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(3, 6, 4)
scene.add(sun)

// ── Camera ────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.001, 200)
camera.position.set(0, 0, 0)

// ── Modules ───────────────────────────────────────────────────
const tracker = new HandTracker()
const tree    = new GrowTree(scene)
const sound   = new SoundEngine()

// ── Camera feed ───────────────────────────────────────────────
const video = document.getElementById('camera-feed')

// ── UI elements ───────────────────────────────────────────────
const hud        = document.getElementById('hud')
const hint       = document.getElementById('hint')
const statusEl   = document.getElementById('status')
const palmRing   = document.getElementById('palm-ring')
const progressArc = palmRing.querySelector('circle.progress')
const CIRCUMFERENCE = 2 * Math.PI * 35  // matches r="35" in SVG

function setHint(msg) { hint.textContent = msg }
function setStatus(msg) { statusEl.textContent = msg }

// Palm ring: position ring over detected palm (MediaPipe 0–1 coords)
function updatePalmRing(palm, progress) {
  const x = (1 - palm.x) * window.innerWidth    // MediaPipe x is mirrored on rear cam
  const y = palm.y * window.innerHeight
  palmRing.style.left = `${x}px`
  palmRing.style.top  = `${y}px`
  palmRing.style.display = 'block'

  // SVG arc fill: 0 = empty, 1 = full circle
  const offset = CIRCUMFERENCE * (1 - progress)
  progressArc.style.strokeDashoffset = offset
}

function hidePalmRing() {
  palmRing.style.display = 'none'
}

// ── Project 2D palm center to 3D world position ───────────────
// Places the anchor at a fixed 1.5 m depth from the camera.
function palmToWorld(palm) {
  const ndc = new THREE.Vector3(
    (1 - palm.x) * 2 - 1,
    -palm.y * 2 + 1,
    0.5
  )
  ndc.unproject(camera)
  const dir = ndc.sub(camera.position).normalize()
  return camera.position.clone().add(dir.multiplyScalar(1.5))
}

// ── Hand tracker events ───────────────────────────────────────
tracker.addEventListener('hand-detected', (e) => {
  if (tree.placed) return
  setHint('Hold still to plant...')
})

tracker.addEventListener('hand-lost', () => {
  if (tree.placed) return
  hidePalmRing()
  setHint('Show your open palm')
})

tracker.addEventListener('hold-progress', (e) => {
  if (tree.placed) return
  const { progress, palm } = e.detail
  updatePalmRing(palm, progress)
})

tracker.addEventListener('placement-confirmed', (e) => {
  const palm = e.detail
  hidePalmRing()
  setHint('The grove awakens...')
  setStatus('')

  const worldPos = palmToWorld(palm)
  tree.place(worldPos)
  sound.triggerPlacement()
})

// ── State ─────────────────────────────────────────────────────
let started = false
let treePlaced = false
let treeGrown = false

// ── Start button ──────────────────────────────────────────────
document.getElementById('start-btn').addEventListener('click', async () => {
  document.getElementById('start-screen').style.display = 'none'
  hud.style.display = 'block'
  setStatus('Initializing...')

  // Camera
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      audio: false,
    })
    video.srcObject = stream
    await video.play()
  } catch (err) {
    console.warn('Camera denied:', err)
  }

  // Audio (must init inside gesture)
  await sound.init()

  // Load GLB
  setStatus('Loading...')
  try {
    await tree.load(`${BASE}models/tree.glb`)
  } catch (err) {
    console.error('GLB failed:', err)
    setStatus('Model missing — add public/models/tree.glb')
    return
  }

  // Hand tracker
  setStatus('Searching for hand...')
  await tracker.init()
  tracker.start()

  started = true
  setStatus('Searching for hand...')
  setHint('Show your open palm')
}, { once: true })

// ── Render loop ───────────────────────────────────────────────
const clock = new THREE.Clock()

renderer.setAnimationLoop(() => {
  if (!started) return

  // Feed video frames to hand tracker
  if (video.readyState >= 2 && !treePlaced) {
    tracker.detect(video, performance.now())
  }

  // Update tree growth
  if (tree.anchor.visible) {
    const grown = tree.update()
    if (grown && !treeGrown) {
      treeGrown = true
      setHint('Step into the grove')
      sound.triggerFullGrown()
    }

    // Drive layer B volume with growth progress
    if (!treeGrown) {
      const t = clock.getElapsedTime()
      sound.setGrowthProgress(Math.min(t / 5, 1))
    }
  }

  renderer.render(scene, camera)
})

// ── Resize ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
