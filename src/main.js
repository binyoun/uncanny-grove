import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { HandTracker } from './HandTracker.js'
import { GrowTree } from './GrowTree.js'
import { ParticleSystem } from './ParticleSystem.js'
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

// ── Shared environment ────────────────────────────────────────
const pmrem      = new THREE.PMREMGenerator(renderer)
const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
pmrem.dispose()

// ── AR scene ──────────────────────────────────────────────────
const scene = new THREE.Scene()
scene.environment = envTexture
scene.add(new THREE.AmbientLight(0xffffff, 1.5))
const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(3, 6, 4)
scene.add(sun)

// ── AR camera ─────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.001, 200)
camera.position.set(0, 0, 0)

// ── Intro scene (hair model behind start screen) ──────────────
const introScene  = new THREE.Scene()
introScene.environment = envTexture
const introCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100)
introCamera.position.set(0, 0.1, 3.5)

introScene.add(new THREE.AmbientLight(0xffffff, 0.7))
const introKey = new THREE.DirectionalLight(0xeeddff, 1.6)
introKey.position.set(2, 3, 2)
introScene.add(introKey)
const introFill = new THREE.DirectionalLight(0xddeeff, 0.5)
introFill.position.set(-2, 0, 1)
introScene.add(introFill)

let introModel  = null
let introActive = true
const introClock = new THREE.Clock()

const introLoader = new GLTFLoader()
introLoader.setMeshoptDecoder(MeshoptDecoder)
introLoader.load(
  `${BASE}models/hair_1.glb`,
  (gltf) => {
    const model = gltf.scene
    const box   = new THREE.Box3().setFromObject(model)
    const size  = box.getSize(new THREE.Vector3())
    const max   = Math.max(size.x, size.y, size.z)
    if (max > 0) model.scale.setScalar(2.4 / max)
    const center = box.getCenter(new THREE.Vector3())
    model.position.set(
      -(center.x / max) * 2.4,
      -(center.y / max) * 2.4,
      -(center.z / max) * 2.4
    )
    introScene.add(model)
    introModel = model
  },
  undefined,
  (err) => console.warn('Intro model failed:', err)
)

// ── Element info ──────────────────────────────────────────────
const ELEMENT_INFO = {
  wood:  { label: 'Wood 목',  emoji: '✋', color: '#00cc44' },
  fire:  { label: 'Fire 화',  emoji: '☝️', color: '#ff2200' },
  earth: { label: 'Earth 토', emoji: '✊', color: '#ffcc00' },
  metal: { label: 'Metal 금', emoji: '✌️', color: '#cccccc' },
  water: { label: 'Water 수', emoji: '👌', color: '#0066ff' },
}

// ── Particle gesture canvas ───────────────────────────────────
const gCanvas      = document.getElementById('gesture-canvas')
const gCtx         = gCanvas.getContext('2d')
const gDisplay     = document.getElementById('gesture-display')
const gLabel       = document.getElementById('gesture-label')
const landProgress = document.querySelector('#land-ring .lr-progress')
const instruction  = document.getElementById('instruction')
const LAND_CIRC    = 2 * Math.PI * 30
const HOLD_MS      = 2000

function _ellipse(cx, cy, rx, ry, n) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random())
    pts.push([cx + rx * r * Math.cos(a), cy + ry * r * Math.sin(a)])
  }
  return pts
}
function _rect(x, y, w, h, n) {
  const pts = []
  for (let i = 0; i < n; i++) pts.push([x + Math.random() * w, y + Math.random() * h])
  return pts
}
function _ring(cx, cy, r, spread, n) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const rr = r + (Math.random() - 0.5) * spread * 2
    pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)])
  }
  return pts
}

// Point clouds in 100×120 coordinate space
const RAW = {
  earth: [
    ..._ellipse(50, 82, 32, 28, 60),
    ..._rect(20, 54, 60, 22, 38),
    ..._ellipse(50, 54, 28, 10, 16),
    ..._ellipse(16, 76, 10, 16, 18),
  ],
  fire: [
    ..._ellipse(56, 104, 26, 14, 38),
    ..._rect(46, 18, 16, 84, 40),
    ..._ellipse(54, 16,  9,  7, 12),
    ..._rect(62, 80, 22, 18, 18),
  ],
  wood: [
    ..._ellipse(48, 108, 34, 10, 36),
    ..._rect( 8,  72, 14, 36, 14),
    ..._rect(22,  12, 13, 96, 22),
    ..._rect(36,   6, 13,102, 24),
    ..._rect(50,  10, 13, 98, 22),
    ..._rect(63,  22, 12, 86, 18),
  ],
  metal: [
    ..._ellipse(50, 108, 30, 10, 34),
    ..._rect(38,  84, 38, 18, 22),
    ..._rect(24,  12, 15, 90, 26),
    ..._rect(56,   8, 15, 92, 26),
  ],
  water: [
    ..._ring(34, 82, 22, 5, 42),
    ..._rect(58, 16, 13, 64, 22),
    ..._rect(72, 22, 12, 60, 18),
    ..._rect(84, 30, 11, 52, 14),
    ..._ellipse(62, 106, 22, 10, 26),
  ],
}

const PARTICLES = {}
Object.entries(RAW).forEach(([el, pts]) => {
  PARTICLES[el] = pts.map(([x, y]) => ({
    x, y,
    phase: Math.random() * Math.PI * 2,
    amp:   0.4 + Math.random() * 1.1,
    speed: 0.28 + Math.random() * 0.44,
  }))
})

let driftRAF      = null
let activeElement = null

function drawParticles(element, t) {
  gCtx.clearRect(0, 0, gCanvas.width, gCanvas.height)
  const color = ELEMENT_INFO[element].color
  gCtx.shadowBlur  = 10
  gCtx.shadowColor = color
  gCtx.fillStyle   = color
  for (const p of PARTICLES[element]) {
    const px = p.x + p.amp * Math.sin(t * p.speed + p.phase)
    const py = p.y + p.amp * Math.cos(t * p.speed * 0.7 + p.phase + 0.5)
    gCtx.beginPath()
    gCtx.arc(px, py, 1.3, 0, Math.PI * 2)
    gCtx.fill()
  }
}

function startDrift(element) {
  activeElement = element
  const tick = () => {
    drawParticles(element, performance.now() * 0.001)
    driftRAF = requestAnimationFrame(tick)
  }
  driftRAF = requestAnimationFrame(tick)
}

function stopDrift() {
  cancelAnimationFrame(driftRAF)
  driftRAF = null
  gCtx.clearRect(0, 0, gCanvas.width, gCanvas.height)
}

// ── Orb click → show gesture ──────────────────────────────────
document.querySelectorAll('.el-circle').forEach((el) => {
  el.addEventListener('click', () => {
    const element = el.dataset.element

    document.querySelectorAll('.el-circle').forEach(c => {
      c.classList.remove('active')
      c.classList.add('dimmed')
    })
    el.classList.remove('dimmed')
    el.classList.add('active')

    instruction.classList.add('hidden')
    cancelHold()
    stopDrift()

    gLabel.textContent = ELEMENT_INFO[element].label
    landProgress.style.stroke = ELEMENT_INFO[element].color
    landProgress.style.strokeDashoffset = LAND_CIRC

    gDisplay.classList.add('visible')
    startDrift(element)
  })
})

// ── Hold-to-enter ─────────────────────────────────────────────
const holdZone = document.getElementById('hold-zone')
let holdStart  = null
let holdRAF    = null
let arStarted  = false

function cancelHold() {
  if (holdStart === null) return
  holdStart = null
  cancelAnimationFrame(holdRAF)
  holdRAF = null
  landProgress.style.strokeDashoffset = LAND_CIRC
}

function tickHold() {
  const progress = Math.min((performance.now() - holdStart) / HOLD_MS, 1)
  landProgress.style.strokeDashoffset = LAND_CIRC * (1 - progress)
  if (progress < 1) {
    holdRAF = requestAnimationFrame(tickHold)
  } else {
    holdStart = null
    if (!arStarted) { arStarted = true; startAR() }
  }
}

holdZone.addEventListener('pointerdown',   (e) => { e.preventDefault(); if (!arStarted && activeElement) { holdStart = performance.now(); holdRAF = requestAnimationFrame(tickHold) } })
holdZone.addEventListener('pointerup',     cancelHold)
holdZone.addEventListener('pointerleave',  cancelHold)
holdZone.addEventListener('pointercancel', cancelHold)

// ── AR modules ────────────────────────────────────────────────
const tracker   = new HandTracker()
const tree      = new GrowTree(scene)
const particles = new ParticleSystem(scene)
const sound     = new SoundEngine()

// ── Camera feed ───────────────────────────────────────────────
const video = document.getElementById('camera-feed')

// ── HUD elements ──────────────────────────────────────────────
const hud         = document.getElementById('hud')
const hint        = document.getElementById('hint')
const statusEl    = document.getElementById('status')
const palmRing    = document.getElementById('palm-ring')
const progressArc = palmRing.querySelector('circle.progress')
const CIRCUMFERENCE = 2 * Math.PI * 35

const ELEMENT_LABELS = {
  wood:  'Wood 목',
  fire:  'Fire 화',
  earth: 'Earth 토',
  metal: 'Metal 금',
  water: 'Water 수',
}

const ELEMENT_RING_COLORS = {
  wood:  '#00cc44',
  fire:  '#ff2200',
  earth: '#ffcc00',
  metal: '#ffffff',
  water: '#0066ff',
}

function setHint(msg)   { hint.textContent = msg }
function setStatus(msg) { statusEl.textContent = msg }

function updatePalmRing(palm, progress, element) {
  const x = (1 - palm.x) * window.innerWidth
  const y = palm.y * window.innerHeight
  palmRing.style.left    = `${x}px`
  palmRing.style.top     = `${y}px`
  palmRing.style.display = 'block'
  const offset = CIRCUMFERENCE * (1 - progress)
  progressArc.style.strokeDashoffset = offset
  progressArc.style.stroke = element ? ELEMENT_RING_COLORS[element] : '#fff'
}

function hidePalmRing() { palmRing.style.display = 'none' }

// ── Project 2D palm center to 3D world position ───────────────
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
  const { element } = e.detail
  setHint(element ? `${ELEMENT_LABELS[element]} — hold still` : 'Show a gesture')
})

tracker.addEventListener('hand-lost', () => {
  hidePalmRing()
  setHint('Show a gesture')
})

tracker.addEventListener('hold-progress', (e) => {
  const { progress, palm, element } = e.detail
  updatePalmRing(palm, progress, element)
})

tracker.addEventListener('gesture-confirmed', (e) => {
  const { element, palm } = e.detail
  hidePalmRing()
  setHint(`${ELEMENT_LABELS[element]} awakens...`)
  setStatus('')
  const worldPos = palmToWorld(palm)
  tree.place(worldPos, element)
  particles.start(element, worldPos)
  sound.triggerPlacement()
  tracker.stop()
  treeGrown      = false
  exploreStarted = false
})

// ── Explore mode ──────────────────────────────────────────────
let listenersAdded = false

function startExploreMode() {
  setHint('Drag to explore')
  if (listenersAdded) return
  listenersAdded = true

  let prevX = 0, prevY = 0

  renderer.domElement.addEventListener('touchstart', (e) => {
    prevX = e.touches[0].clientX
    prevY = e.touches[0].clientY
  }, { passive: true })

  renderer.domElement.addEventListener('touchmove', (e) => {
    const dx = e.touches[0].clientX - prevX
    const dy = e.touches[0].clientY - prevY
    tree.anchor.rotation.y += dx * 0.007
    tree.anchor.position.y -= dy * 0.004
    prevX = e.touches[0].clientX
    prevY = e.touches[0].clientY
  }, { passive: true })

  let mouseDown = false
  renderer.domElement.addEventListener('mousedown', (e) => {
    mouseDown = true; prevX = e.clientX; prevY = e.clientY
  })
  renderer.domElement.addEventListener('mouseup', () => { mouseDown = false })
  renderer.domElement.addEventListener('mousemove', (e) => {
    if (!mouseDown) return
    tree.anchor.rotation.y += (e.clientX - prevX) * 0.007
    tree.anchor.position.y -= (e.clientY - prevY) * 0.004
    prevX = e.clientX
    prevY = e.clientY
  })
}

// ── State ─────────────────────────────────────────────────────
let started        = false
let treeGrown      = false
let exploreStarted = false

// ── Start AR ──────────────────────────────────────────────────
async function startAR() {
  stopDrift()
  introActive = false
  document.getElementById('start-screen').style.display = 'none'
  hud.style.display = 'block'
  setStatus('Initializing...')

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

  await sound.init()

  setStatus('Loading...')
  try {
    await tree.load({
      wood:  `${BASE}models/tree.glb`,
      fire:  `${BASE}models/fire.glb`,
      earth: `${BASE}models/earth.glb`,
      metal: `${BASE}models/metal.glb`,
      water: `${BASE}models/water.glb`,
    })
  } catch (err) {
    console.error('GLB failed:', err)
    setStatus('Models missing — add GLBs to public/models/')
    return
  }

  setStatus('')
  await tracker.init()
  tracker.start()

  started = true
  setHint('Show a gesture')
}

// ── Render loop ───────────────────────────────────────────────
const clock = new THREE.Clock()

renderer.setAnimationLoop(() => {
  // Intro: render floating hair model behind start screen
  if (introActive) {
    if (introModel) {
      const t = introClock.getElapsedTime()
      introModel.rotation.y  = t * 0.22
      introModel.rotation.x  = Math.sin(t * 0.28) * 0.12
      introModel.position.y += Math.sin(t * 0.55) * 0.0008
    }
    renderer.render(introScene, introCamera)
    return
  }

  if (!started) return

  const delta = clock.getDelta()

  if (video.readyState >= 2) {
    tracker.detect(video, performance.now())
  }

  if (tree.anchor.visible) {
    const progress = tree.update()
    particles.update(progress, delta)

    if (progress >= 0.5 && !exploreStarted) {
      exploreStarted = true
      startExploreMode()
    }

    if (progress >= 1 && !treeGrown) {
      treeGrown = true
      sound.triggerFullGrown()
      particles.stop()
      setHint('Drag to explore · Show gesture for new element')
      tracker.start()
    }

    sound.setGrowthProgress(progress)
  }

  renderer.render(scene, camera)
})

// ── Resize ────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight
  camera.aspect = introCamera.aspect = w / h
  camera.updateProjectionMatrix()
  introCamera.updateProjectionMatrix()
  renderer.setSize(w, h)
})
