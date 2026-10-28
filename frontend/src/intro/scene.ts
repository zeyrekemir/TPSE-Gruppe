// Welcome story scene: a Franka Research 3 (Franka's own CAD model and kinematics) is assembled on a platform.
// Joint by joint: the drive inside is put together first (motor coils, a planetary gear set, bearing, output flange),
// filmed as close as a watch movement, then an overhead crane lowers the housing over it; sparks and a ring of light
// mark every part seating. Once complete, the robot powers up and makes its first moves. Lit by a real
// photographed studio (HDRI), like a product shot.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { FINGER_MAX, FINGER_Z, FLANGE_Z, FR3_JOINTS, HAND_YAW, originMatrix, READY } from './fr3'
import { driveWindow, featureTime, logoReached, PARTS, partWindow, SEAT_GLOW, TIMELINE } from './timeline'

const MAX_PIXEL_RATIO = 2 // see resize()

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const smooth = (x: number) => x * x * (3 - 2 * x)

/**
 * The scene is a timeline (seconds, see TIMELINE). `getTime` says where on it to draw: the welcome page
 * maps the scroll position to it, so scrolling scrubs the animation back and forth.
 * Small idle motions (pulse, dust) run on the wall clock so the stage feels alive even when the page rests.
 * `onStart` fires after the first frame is on screen. `freezeAt` pins the timeline (development only).
 */
export function runIntroScene(
  canvas: HTMLCanvasElement,
  onStart: () => void,
  {
    freezeAt,
    frameBudgetMs = 1000 / 60,
    getTime,
    onLogo,
  }: {
    freezeAt?: number
    frameBudgetMs?: number
    getTime?: () => number
    /** The story reached the logo moment while moving forward (the intro's sound). */
    onLogo?: () => void
  } = {},
): { stop: () => void; setActive: (active: boolean) => void } {
  // Transparent canvas (page background shows through): an opaque full-screen WebGL canvas can be promoted
  // to a separate overlay plane in Chrome and hide the HTML text layered on top of it.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  // Shadows only change when the story moves (the light is fixed): redrawn then, not every frame.
  renderer.shadowMap.autoUpdate = false
  let shadowTime = NaN

  const scene = new THREE.Scene()
  scene.background = null
  scene.fog = new THREE.Fog(0x05060d, 9, 20)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTexture
  scene.environmentIntensity = 0.42
  // A photographed studio (Poly Haven, CC0) for soft, real reflections and shading; the synthetic room
  // above lights the first frames until it has loaded.
  let studioTexture: THREE.Texture | null = null
  // The story starts once both the model and this light are in: the light arriving later would make every material
  // recompile its shader in the middle of the story (a visible stall).
  let modelLoaded = false
  let lightLoaded = false
  new RGBELoader().load(
    `${import.meta.env.BASE_URL}models/studio_small_09_1k.hdr`,
    (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping
      studioTexture = pmrem.fromEquirectangular(hdr).texture
      hdr.dispose()
      scene.environment = studioTexture
      scene.environmentIntensity = 0.55
      lightLoaded = true
      whenLoaded()
    },
    undefined,
    () => ((lightLoaded = true), whenLoaded()),
  )

  // Near plane as far out as the closest shot allows: more depth precision for fine, flush details.
  const camera = new THREE.PerspectiveCamera(36, 1, 0.3, 45)

  // --- Materials ---
  // Fine noise breaks up perfectly uniform reflections, which is what makes plastic look "rendered".
  const grain = (() => {
    const size = 512
    const c = document.createElement('canvas')
    c.width = c.height = size
    const g = c.getContext('2d')!
    const img = g.createImageData(size, size)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 215 + Math.random() * 40
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    g.putImageData(img, 0, 0)
    const texture = new THREE.CanvasTexture(c)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(3, 3)
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
    return texture
  })()
  // Matte, slightly warm white plastic (like a research arm's housing): no clear coat, so no glare;
  // a fine bump texture gives it the grain of real injection-moulded plastic.
  const shell = new THREE.MeshPhysicalMaterial({
    color: 0xeceae6,
    roughness: 0.66,
    roughnessMap: grain,
    bumpMap: grain,
    bumpScale: 0.0015,
    metalness: 0,
    sheen: 0.15,
    sheenRoughness: 0.8,
  })
  // Brushed, anodised dark metal.
  const metal = new THREE.MeshPhysicalMaterial({
    color: 0x2b2e3a,
    metalness: 0.9,
    roughness: 0.36,
    roughnessMap: grain,
    anisotropy: 0.65,
    clearcoat: 0.2,
  })
  // Satin dark grey of the FR3's joint covers and grip pads.
  const satin = new THREE.MeshPhysicalMaterial({ color: 0x24262d, metalness: 0.15, roughness: 0.5, roughnessMap: grain })
  const black = new THREE.MeshPhysicalMaterial({ color: 0x0f1013, metalness: 0.1, roughness: 0.42 })
  // Industrial crane paint: the safety amber of real gantries, a little worn (rough, not glossy).
  const cranePaint = new THREE.MeshPhysicalMaterial({ color: 0xd9971f, roughness: 0.55, metalness: 0.2, roughnessMap: grain })
  const steel = new THREE.MeshPhysicalMaterial({ color: 0x8d93a0, metalness: 1, roughness: 0.3, roughnessMap: grain })
  const violet = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x8b5cf6, emissiveIntensity: 0 })
  const RING_COLOURS = [0x8b5cf6, 0xec4899, 0x22d3ee].map((c) => new THREE.Color(c))

  const SEG = 128
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, shadows = true) => {
    const m = new THREE.Mesh(geometry, material)
    m.castShadow = shadows
    m.receiveShadow = true
    return m
  }
  /** Adds obj to parent at (x, y, z) and returns obj (Object3D.add returns the parent). */
  const put = <T extends THREE.Object3D>(parent: THREE.Object3D, obj: T, x: number, y: number, z: number) => {
    obj.position.set(x, y, z)
    parent.add(obj)
    return obj
  }

  // --- Robot: Franka Research 3. Joint chain from fr3.ts, meshes from Franka's CAD (public/models/fr3.glb) ---
  const ROBOT_SCALE = 3.6 // the lab arm, enlarged to the stage
  // The URDF is z-up, the scene y-up.
  const robotBase = new THREE.Matrix4().makeRotationX(-Math.PI / 2).scale(new THREE.Vector3(ROBOT_SCALE, ROBOT_SCALE, ROBOT_SCALE))
  const arm = new THREE.Group()
  robotBase.decompose(arm.position, arm.quaternion, arm.scale)
  put(scene, arm, 0, PLATE_TOP, 0)
  // Joint i turns jointTurns[i] about its z axis; link i rides on it (link0 on the base).
  const jointTurns: THREE.Group[] = []
  const linkMounts: THREE.Object3D[] = [arm]
  let chainEnd: THREE.Object3D = arm
  for (const j of FR3_JOINTS) {
    const frame = new THREE.Group()
    originMatrix(j.xyz, j.rpy).decompose(frame.position, frame.quaternion, frame.scale)
    chainEnd.add(frame)
    const turn = new THREE.Group()
    frame.add(turn)
    jointTurns.push(turn)
    linkMounts.push(turn)
    chainEnd = turn
  }
  const hand = new THREE.Group()
  hand.position.z = FLANGE_Z
  hand.rotation.z = HAND_YAW
  chainEnd.add(hand)
  // Each part sits in a carrier inside its mount: the carrier is what the crane lowers into place.
  const carriers = PARTS.map((_, p) => {
    const c = new THREE.Group()
    ;(p < 8 ? linkMounts[p] : hand).add(c)
    return c
  })
  // --- Drives: what is inside each joint, built before its housing goes on ---
  // Modelled on a real cobot joint actuator (as in the FR3): a frameless brushless motor with a spring-applied brake
  // and an optical encoder on its PCB, a strain-wave gear (Harmonic Drive: elliptical wave generator, a thin
  // flexspline that flexes as it turns, the rigid circular spline), a cross-roller output bearing, a torque sensor and
  // the output flange. Each is put together beside its joint, on the audience's side where nothing else is (the crane
  // works straight above the joint), then slides into place before the housing comes down.
  const canvasTexture = (size: number, draw: (g: CanvasRenderingContext2D, size: number) => void, srgb = true) => {
    const c = document.createElement('canvas')
    c.width = c.height = size
    draw(c.getContext('2d')!, size)
    const texture = new THREE.CanvasTexture(c)
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    return texture
  }
  // Enamelled copper wire, wound turn by turn.
  const wireTexture = canvasTexture(256, (g, n) => {
    for (let y = 0; y < n; y += 8) {
      const grad = g.createLinearGradient(0, y, 0, y + 8)
      grad.addColorStop(0, '#5a2a10')
      grad.addColorStop(0.5, '#f0a46a')
      grad.addColorStop(1, '#5a2a10')
      g.fillStyle = grad
      g.fillRect(0, y, n, 8)
    }
  })
  wireTexture.repeat.set(1, 3)
  // Stacked electrical-steel laminations of the stator.
  const laminationTexture = canvasTexture(256, (g, n) => {
    for (let y = 0; y < n; y += 4) {
      g.fillStyle = y % 8 ? '#4a4f5a' : '#7b818e'
      g.fillRect(0, y, n, 4)
    }
  })
  // The optical encoder disk: two tracks of fine radial slits.
  const encoderTexture = canvasTexture(1024, (g, size) => {
    g.translate(size / 2, size / 2)
    g.fillStyle = '#1b1e26'
    g.beginPath()
    g.arc(0, 0, size / 2, 0, Math.PI * 2)
    g.fill()
    for (const [r0, r1, n] of [
      [0.6, 0.76, 512],
      [0.8, 0.95, 64],
    ]) {
      g.strokeStyle = '#eef1f8'
      g.lineWidth = (Math.PI * size * r1) / n / 2.4
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        g.beginPath()
        g.moveTo((Math.cos(a) * r0 * size) / 2, (Math.sin(a) * r0 * size) / 2)
        g.lineTo((Math.cos(a) * r1 * size) / 2, (Math.sin(a) * r1 * size) / 2)
        g.stroke()
      }
    }
  })
  // The encoder PCB: green solder mask, gold traces and pads, white silkscreen.
  const pcbTexture = canvasTexture(1024, (g, size) => {
    g.fillStyle = '#0d5136'
    g.fillRect(0, 0, size, size)
    let seed = 7
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    g.strokeStyle = '#d9b45a'
    g.lineWidth = 3
    for (let i = 0; i < 120; i++) {
      let x = rand() * size
      let y = rand() * size
      g.beginPath()
      g.moveTo(x, y)
      for (let k = 0; k < 4; k++) {
        if (k % 2) x += (rand() - 0.5) * 220
        else y += (rand() - 0.5) * 220
        g.lineTo(x, y)
      }
      g.stroke()
      g.fillStyle = '#e8c56b'
      g.beginPath()
      g.arc(x, y, 6, 0, Math.PI * 2)
      g.fill()
    }
    g.strokeStyle = 'rgba(255,255,255,0.8)'
    g.lineWidth = 2
    for (let i = 0; i < 14; i++) g.strokeRect(rand() * size, rand() * size, 40 + rand() * 50, 24 + rand() * 30)
  })
  const copper = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: wireTexture, bumpMap: wireTexture, bumpScale: 0.0004, metalness: 1, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 })
  const laminations = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: laminationTexture, bumpMap: laminationTexture, bumpScale: 0.0002, metalness: 0.9, roughness: 0.4 })
  const steelBright = new THREE.MeshPhysicalMaterial({ color: 0xd2d6de, metalness: 1, roughness: 0.16, anisotropy: 0.6 })
  const springSteel = new THREE.MeshPhysicalMaterial({ color: 0x9aa0ab, metalness: 1, roughness: 0.24 })
  const aluminium = new THREE.MeshPhysicalMaterial({ color: 0xd9dce2, metalness: 1, roughness: 0.38, roughnessMap: grain })
  const blackOxide = new THREE.MeshPhysicalMaterial({ color: 0x1b1c20, metalness: 0.8, roughness: 0.35 })
  const magnet = new THREE.MeshPhysicalMaterial({ color: 0x6a6f7c, metalness: 0.95, roughness: 0.28 })
  const friction = new THREE.MeshPhysicalMaterial({ color: 0x3b2a22, metalness: 0, roughness: 0.9 })
  const gauge = new THREE.MeshPhysicalMaterial({ color: 0xd08c2a, metalness: 0.4, roughness: 0.3, clearcoat: 1 })
  const pcb = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: pcbTexture, roughness: 0.45, clearcoat: 0.6 })
  const chip = new THREE.MeshPhysicalMaterial({ color: 0x15161a, roughness: 0.55 })
  const encoderMat = new THREE.MeshPhysicalMaterial({ map: encoderTexture, metalness: 0.5, roughness: 0.15, clearcoat: 1, side: THREE.DoubleSide })

  /** A spur gear (or, `inner`, a ring gear with its teeth pointing inwards), extruded along z and centred on z = 0. */
  const gear = (teeth: number, root: number, tip: number, depth: number, { hole = 0, inner = false } = {}) => {
    const toothPath = (path: THREE.Path, a: number, b: number) => {
      const step = (Math.PI * 2) / teeth
      for (let i = 0; i < teeth; i++) {
        const a0 = i * step
        // Involute-like flanks: the tooth narrows towards its tip.
        const pts: [number, number][] = [
          [a0, a],
          [a0 + step * 0.12, (a * 2 + b) / 3],
          [a0 + step * 0.2, b],
          [a0 + step * 0.42, b],
          [a0 + step * 0.5, (a * 2 + b) / 3],
          [a0 + step * 0.62, a],
        ]
        pts.forEach(([ang, r], j) => {
          if (i === 0 && j === 0) path.moveTo(Math.cos(ang) * r, Math.sin(ang) * r)
          else path.lineTo(Math.cos(ang) * r, Math.sin(ang) * r)
        })
      }
      path.closePath()
    }
    const shape = new THREE.Shape()
    if (inner) {
      shape.absarc(0, 0, hole, 0, Math.PI * 2, false)
      const h = new THREE.Path()
      toothPath(h, root, tip)
      shape.holes.push(h)
    } else {
      toothPath(shape, root, tip)
      if (hole > 0) shape.holes.push(new THREE.Path().absarc(0, 0, hole, 0, Math.PI * 2, true))
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 32 })
    geometry.translate(0, 0, -depth / 2)
    return geometry
  }
  /** A flat ring (or disk, inner = 0) of the given thickness along z, centred on z = 0, with planar UVs. */
  const plate = (outer: number, inner: number, depth: number, cutouts: THREE.Path[] = []) => {
    const shape = new THREE.Shape().absarc(0, 0, outer, 0, Math.PI * 2, false)
    if (inner > 0) shape.holes.push(new THREE.Path().absarc(0, 0, inner, 0, Math.PI * 2, true))
    shape.holes.push(...cutouts)
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.12, bevelSize: depth * 0.12, bevelSegments: 2, curveSegments: 64 })
    const uv = geometry.attributes.uv as THREE.BufferAttribute
    const pos = geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / (outer * 2) + 0.5, pos.getY(i) / (outer * 2) + 0.5)
    geometry.translate(0, 0, -depth / 2)
    return geometry
  }
  // Every joint gets its own drive, sized for its load (the shoulder's large, the wrist's compact), each with one of
  // the transmissions real robot joints use: a strain-wave gear (Harmonic Drive), a planetary gear, a cycloidal
  // reducer, and for the hand a rack-and-pinion gripper mechanism. Slot and pole counts, spokes, bolt circles and
  // finishes differ from joint to joint too.
  type DriveSpec =
    | { kind: 'harmonic'; teeth: number }
    | { kind: 'planetary'; sun: number; planet: number; planets: number }
    | { kind: 'cycloid'; pins: number }
    | { kind: 'gripper' }
  type Design = DriveSpec & { scale: number; slots: number; poles: number; spokes: number; bolts: number; alu: boolean }
  const DESIGNS: Design[] = [
    { kind: 'planetary', sun: 12, planet: 18, planets: 4, scale: 1.15, slots: 9, poles: 6, spokes: 0, bolts: 12, alu: true },
    { kind: 'harmonic', teeth: 160, scale: 1.15, slots: 18, poles: 14, spokes: 6, bolts: 12, alu: false },
    { kind: 'harmonic', teeth: 120, scale: 1.1, slots: 15, poles: 10, spokes: 4, bolts: 10, alu: true },
    { kind: 'cycloid', pins: 12, scale: 1, slots: 12, poles: 8, spokes: 0, bolts: 8, alu: false },
    { kind: 'harmonic', teeth: 100, scale: 0.95, slots: 12, poles: 8, spokes: 4, bolts: 8, alu: true },
    { kind: 'planetary', sun: 10, planet: 14, planets: 3, scale: 0.82, slots: 9, poles: 6, spokes: 3, bolts: 6, alu: false },
    { kind: 'cycloid', pins: 10, scale: 0.78, slots: 9, poles: 6, spokes: 0, bolts: 6, alu: true },
    { kind: 'harmonic', teeth: 80, scale: 0.72, slots: 9, poles: 6, spokes: 3, bolts: 6, alu: false },
    { kind: 'gripper', scale: 0.75, slots: 6, poles: 4, spokes: 0, bolts: 6, alu: true },
  ]
  // In a drive's own units (before its scale): it spans z = -DRIVE_BACK .. DRIVE_FRONT.
  const DRIVE_BACK = 0.058
  const DRIVE_FRONT = 0.022
  const DRIVE_RADIUS = 0.0375 // outermost radius (bearing race, stator)
  const FLEX_E = 0.0007 // how far a wave generator pushes its flexspline out at the long axis
  const coilGeo = new RoundedBoxGeometry(0.0085, 0.0065, 0.02, 2, 0.002)
  const statorGeo = new THREE.CylinderGeometry(0.037, 0.037, 0.022, 96, 1, true)
  const statorRingGeo = plate(0.037, 0.0335, 0.022)
  const yokeGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.02, 48)
  const shaftGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.05, 32, 1, true)
  const brakeDiscGeo = plate(0.026, 0.0065, 0.0022)
  const brakePadGeo = plate(0.025, 0.017, 0.0026)
  const encoderGeo = new THREE.CircleGeometry(0.022, 128)
  const pcbGeo = plate(0.034, 0.008, 0.0016)
  const icGeo = new RoundedBoxGeometry(0.007, 0.007, 0.0012, 1, 0.0003)
  const headGeo = new RoundedBoxGeometry(0.0034, 0.0022, 0.0012, 1, 0.0003)
  const ballGeo = new THREE.SphereGeometry(0.0021, 16, 12)
  const rollerGeo = new THREE.CylinderGeometry(0.0017, 0.0017, 0.0032, 16)
  const raceOuterGeo = plate(0.0372, 0.0348, 0.008)
  const raceInnerGeo = plate(0.0322, 0.0298, 0.008)
  const screwGeo = new THREE.CylinderGeometry(0.0021, 0.0021, 0.0018, 24)
  const socketGeo = new THREE.CylinderGeometry(0.0011, 0.0011, 0.0004, 6)
  const pinGeo = new THREE.CylinderGeometry(0.0019, 0.0019, 0.009, 20)
  const gaugeGeo = new RoundedBoxGeometry(0.0055, 0.0032, 0.0004, 1, 0.0001)
  const camGeo = new THREE.CylinderGeometry(0.0158, 0.0158, 0.007, 96)
  const flexCupGeo = new THREE.CylinderGeometry(0.0197, 0.0197, 0.016, 128, 8, true)
  flexCupGeo.rotateX(Math.PI / 2)
  flexCupGeo.translate(0, 0, 0.007)
  const flexDiaphragmGeo = plate(0.0197, 0.006, 0.0012)
  const flangeGeo = plate(0.035, 0.012, 0.005)
  const magnetGeos = new Map<number, THREE.BufferGeometry>()
  const magnetGeo = (poles: number) => {
    if (!magnetGeos.has(poles)) magnetGeos.set(poles, new THREE.CylinderGeometry(0.0205, 0.0205, 0.018, 6, 1, false, 0, (Math.PI * 2) / poles - 0.06))
    return magnetGeos.get(poles)!
  }
  /** A hub joined to a rim by `spokes` spokes (the torque sensor's flexure). */
  const spokedGeo = (spokes: number) => {
    const gap = Math.min(0.5, 1.6 / spokes)
    const cutouts = Array.from({ length: spokes }, (_, i) => {
      const a = (i / spokes) * Math.PI * 2 + gap / 2
      const w = (Math.PI * 2) / spokes - gap
      const h = new THREE.Path()
      h.absarc(0, 0, 0.0285, a, a + w, false)
      h.absarc(0, 0, 0.011, a + w, a, true)
      h.closePath()
      return h
    })
    return plate(0.0335, 0.005, 0.004, cutouts)
  }
  /** The disc of a cycloidal reducer with pins - 1 lobes, its output holes and centre bore. */
  const cycloidGeo = (pins: number, R: number, rp: number, e: number) => {
    const shape = new THREE.Shape()
    const n = 720
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2
      const psi = Math.atan2(Math.sin((1 - pins) * t), R / (e * pins) - Math.cos((1 - pins) * t))
      const x = R * Math.cos(t) - rp * Math.cos(t + psi) - e * Math.cos(pins * t)
      const y = -R * Math.sin(t) + rp * Math.sin(t + psi) + e * Math.sin(pins * t)
      if (i === 0) shape.moveTo(x, y)
      else shape.lineTo(x, y)
    }
    shape.holes.push(new THREE.Path().absarc(0, 0, 0.0062, 0, Math.PI * 2, true))
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      shape.holes.push(new THREE.Path().absarc(Math.cos(a) * 0.0125, Math.sin(a) * 0.0125, 0.0023 + e, 0, Math.PI * 2, true))
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.0045, bevelEnabled: true, bevelThickness: 0.0003, bevelSize: 0.0003, bevelSegments: 1, curveSegments: 24 })
    geometry.translate(0, 0, -0.00225)
    return geometry
  }
  /** A gear rack along x, teeth pointing +y. */
  const rackGeo = (length: number, module: number) => {
    const shape = new THREE.Shape()
    const pitchLen = Math.PI * module
    shape.moveTo(-length / 2, -0.004)
    shape.lineTo(-length / 2, 0)
    for (let x = -length / 2; x < length / 2 - pitchLen; x += pitchLen) {
      shape.lineTo(x + pitchLen * 0.15, 0)
      shape.lineTo(x + pitchLen * 0.35, module * 1.8)
      shape.lineTo(x + pitchLen * 0.65, module * 1.8)
      shape.lineTo(x + pitchLen * 0.85, 0)
    }
    shape.lineTo(length / 2, 0)
    shape.lineTo(length / 2, -0.004)
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: false })
    geometry.translate(0, 0, -0.003)
    return geometry
  }

  /** Merges a rigid piece's meshes into one mesh per material (drawn in one call each). */
  const bake = (piece: THREE.Object3D) => {
    piece.updateMatrixWorld(true)
    const toPiece = piece.matrixWorld.clone().invert()
    const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>()
    piece.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      let g = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(toPiece.clone().multiply(o.matrixWorld))
      if (g.index) g = g.toNonIndexed()
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
      const list = byMaterial.get(o.material as THREE.Material) ?? []
      list.push(g)
      byMaterial.set(o.material as THREE.Material, list)
    })
    piece.clear()
    for (const [material, list] of byMaterial) {
      const merged = mergeGeometries(list)
      list.forEach((g) => g.dispose())
      if (merged) piece.add(mesh(merged, material, false))
    }
  }
  type Drive = {
    group: THREE.Group
    pieces: THREE.Object3D[]
    /** Pieces in before the motor runs (it starts once the transmission is in). */
    runAfter: number
    /** Turns everything that moves for this motor angle. */
    run: (motor: number) => void
    design: Design
  }
  const drives: Drive[] = PARTS.map((_, p) => {
    const design = DESIGNS[p]
    const group = new THREE.Group()
    group.scale.setScalar(design.scale)
    ;(p < 8 ? linkMounts[p] : hand).add(group)
    const flangeMat = design.alu ? aluminium : blackOxide
    const turned = <T extends THREE.Object3D>(obj: T) => {
      obj.rotation.x = Math.PI / 2 // cylinders are y-up; the joint axis is z
      return obj
    }
    const screw = (parent: THREE.Object3D, x: number, y: number, z: number) => {
      const head = put(parent, turned(mesh(screwGeo, blackOxide)), x, y, z)
      put(head, mesh(socketGeo, black), 0, 0.0008, 0)
    }
    const ring = (parent: THREE.Object3D, n: number, r: number, z: number, at: (x: number, y: number, a: number) => void) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2
        at(Math.cos(a) * r, Math.sin(a) * r, a)
      }
      void parent
      void z
    }
    // Encoder PCB with its chips and the optical read head.
    const board = put(group, new THREE.Group(), 0, 0, -0.056)
    board.add(mesh(pcbGeo, pcb))
    ;[0.4, 2.3, 4.1].slice(0, design.scale > 0.9 ? 3 : 2).forEach((a, i) => {
      put(board, mesh(icGeo, chip), Math.cos(a) * (0.022 + i * 0.0015), Math.sin(a) * (0.022 + i * 0.0015), 0.0014).rotation.z = a
    })
    put(board, mesh(headGeo, chip), 0, -0.0235, 0.0016)
    // Stator: laminated iron with its wound teeth, and the brake behind it.
    const stator = put(group, new THREE.Group(), 0, 0, -0.03)
    stator.add(turned(mesh(statorGeo, laminations)))
    stator.add(mesh(statorRingGeo, laminations))
    ring(stator, design.slots, 0.0295, 0, (x, y, a) => {
      const coil = put(stator, mesh(coilGeo, copper), x, y, 0)
      coil.rotation.z = a
      coil.scale.x = Math.min(1.2, 12 / design.slots)
    })
    put(stator, mesh(brakePadGeo, friction), 0, 0, -0.0145)
    // Rotor: yoke with its magnet poles, hollow shaft (cables run through it), brake disc and encoder disk.
    const rotor = put(group, new THREE.Group(), 0, 0, -0.03)
    rotor.add(turned(mesh(yokeGeo, blackOxide)))
    for (let i = 0; i < design.poles; i++) turned(put(rotor, mesh(magnetGeo(design.poles), magnet), 0, 0, 0)).rotation.y = (i / design.poles) * Math.PI * 2
    turned(put(rotor, mesh(shaftGeo, steelBright), 0, 0, 0.005))
    put(rotor, mesh(brakeDiscGeo, springSteel), 0, 0, -0.0175)
    put(rotor, mesh(encoderGeo, encoderMat), 0, 0, -0.0235)
    const pieces: THREE.Object3D[] = [board, stator, rotor]
    const turners: ((motor: number) => void)[] = [(m) => (rotor.rotation.z = m)]
    let ratio = 50

    if (design.kind === 'harmonic') {
      // Strain-wave gear: the flexspline has two teeth fewer than the circular spline, so the output turns
      // 2/teeth as fast as the motor.
      const module = 0.042 / design.teeth
      const pitch = (n: number) => (n * module) / 2
      ratio = design.teeth / 2
      const cam = put(group, new THREE.Group(), 0, 0, -0.009)
      const camBody = turned(mesh(camGeo, steelBright))
      camBody.scale.set(1 + FLEX_E / 0.0158, 1, 1 - FLEX_E / 0.0158)
      cam.add(camBody)
      ring(cam, 26, 0.0176, 0, (x, y, a) => {
        const r = 1 + (FLEX_E * Math.cos(2 * a)) / 0.0176
        put(cam, mesh(ballGeo, steelBright), x * r, y * r, 0)
      })
      const flex = put(group, new THREE.Group(), 0, 0, -0.009)
      flex.userData.moving = true // its teeth flex every frame
      const flexGeos = [gear(design.teeth, pitch(design.teeth) - module, pitch(design.teeth) + module * 0.8, 0.008, { hole: 0.0192 }), flexCupGeo.clone()].map((geometry) => ({
        geometry,
        rest: Float32Array.from((geometry.attributes.position as THREE.BufferAttribute).array),
      }))
      flexGeos.forEach(({ geometry }) => flex.add(mesh(geometry, springSteel)))
      put(flex, mesh(flexDiaphragmGeo, springSteel), 0, 0, 0.015)
      const spline = put(group, new THREE.Group(), 0, 0, -0.009)
      spline.add(mesh(gear(design.teeth + 2, pitch(design.teeth + 2) + module, pitch(design.teeth + 2) - module * 0.8, 0.008, { hole: 0.0305, inner: true }), steelBright))
      ring(spline, design.bolts, 0.0272, 0, (x, y) => screw(spline, x, y, 0.0049))
      pieces.push(cam, flex, spline)
      turners.push((m) => {
        cam.rotation.z = m
        const out = -m / ratio
        flex.rotation.z = out
        // Bend the flexspline into the cam's ellipse (long axis at the cam's angle, in the flexspline's frame).
        const phase = m - out
        for (const { geometry, rest } of flexGeos) {
          const pos = geometry.attributes.position as THREE.BufferAttribute
          const arr = pos.array as Float32Array
          for (let i = 0; i < arr.length; i += 3) {
            const x = rest[i]
            const y = rest[i + 1]
            const r = Math.hypot(x, y)
            if (r < 1e-6) continue
            const reach = THREE.MathUtils.clamp(1 - (rest[i + 2] - 0.002) / 0.016, 0.15, 1)
            const k = 1 + (FLEX_E * reach * Math.cos(2 * (Math.atan2(y, x) - phase))) / r
            arr[i] = x * k
            arr[i + 1] = y * k
          }
          pos.needsUpdate = true
        }
      })
    } else if (design.kind === 'planetary') {
      // Planetary gear: sun on the motor shaft, planets on a carrier (the output), ring gear fixed.
      const ringT = design.sun + 2 * design.planet
      const module = 0.046 / ringT
      const pitch = (n: number) => (n * module) / 2
      const orbit = pitch(design.sun) + pitch(design.planet)
      ratio = 1 + ringT / design.sun
      const ringGear = put(group, new THREE.Group(), 0, 0, -0.008)
      ringGear.add(mesh(gear(ringT, pitch(ringT) + module * 1.2, pitch(ringT) - module, 0.009, { hole: 0.0305, inner: true }), steelBright))
      ring(ringGear, design.bolts, 0.0275, 0, (x, y) => screw(ringGear, x, y, 0.0054))
      const sun = put(group, new THREE.Group(), 0, 0, -0.008)
      sun.add(mesh(gear(design.sun, pitch(design.sun) - module * 1.2, pitch(design.sun) + module, 0.009, { hole: 0.0018 }), steelBright))
      const carrier = put(group, new THREE.Group(), 0, 0, -0.008)
      carrier.userData.moving = true // its planets turn on their own
      const planetGeo = gear(design.planet, pitch(design.planet) - module * 1.2, pitch(design.planet) + module, 0.0085, { hole: 0.0017 })
      const planets = Array.from({ length: design.planets }, (_, i) => {
        const a = (i / design.planets) * Math.PI * 2
        const planet = put(carrier, new THREE.Group(), Math.cos(a) * orbit, Math.sin(a) * orbit, 0)
        planet.add(mesh(planetGeo, design.alu ? springSteel : steelBright))
        put(carrier, turned(mesh(pinGeo, blackOxide)), Math.cos(a) * orbit, Math.sin(a) * orbit, 0.002).scale.set(0.6, 1.4, 0.6)
        return planet
      })
      // The carrier: a hub with an arm out to each planet's pin, open so the gears stay in view.
      put(carrier, mesh(plate(0.0075, 0.0025, 0.0018), aluminium), 0, 0, 0.0062)
      for (let i = 0; i < design.planets; i++) {
        const a = (i / design.planets) * Math.PI * 2
        const arm = put(carrier, mesh(new RoundedBoxGeometry(orbit + 0.003, 0.0042, 0.0018, 1, 0.0006), aluminium), (Math.cos(a) * orbit) / 2, (Math.sin(a) * orbit) / 2, 0.0062)
        arm.rotation.z = a
      }
      pieces.push(ringGear, sun, carrier)
      turners.push((m) => {
        sun.rotation.z = m
        const c = m / ratio
        carrier.rotation.z = c
        planets.forEach((pl) => (pl.rotation.z = (-(m - c) * design.sun) / design.planet))
      })
    } else if (design.kind === 'cycloid') {
      // Cycloidal reducer: an eccentric on the motor shaft rolls a lobed disc round a ring of pins; the disc turns
      // one lobe per motor turn, picked up by the output pins through its holes.
      const R = 0.0245
      const rp = 0.0021
      const e = 0.0011
      ratio = design.pins - 1
      const housing = put(group, new THREE.Group(), 0, 0, -0.008)
      housing.add(mesh(plate(0.0305, R + rp * 0.4, 0.009), steelBright))
      ring(housing, design.pins, R, 0, (x, y) => put(housing, turned(mesh(pinGeo, springSteel)), x, y, 0))
      ring(housing, design.bolts, 0.0285, 0, (x, y) => screw(housing, x, y, 0.0054))
      const eccentric = put(group, new THREE.Group(), 0, 0, -0.008)
      put(eccentric, turned(mesh(new THREE.CylinderGeometry(0.0058, 0.0058, 0.0085, 48), steelBright)), e, 0, 0)
      const disc = put(group, new THREE.Group(), 0, 0, -0.008)
      disc.add(mesh(cycloidGeo(design.pins, R, rp, e), springSteel))
      const outPins = put(group, new THREE.Group(), 0, 0, -0.006)
      ring(outPins, 6, 0.0125, 0, (x, y) => put(outPins, turned(mesh(pinGeo, blackOxide)), x, y, 0).scale.set(1.15, 1.6, 1.15))
      pieces.push(housing, eccentric, disc, outPins)
      turners.push((m) => {
        eccentric.rotation.z = m
        const out = -m / ratio
        disc.position.x = e * Math.cos(m)
        disc.position.y = e * Math.sin(m)
        disc.rotation.z = out
        outPins.rotation.z = out
      })
    } else {
      // The hand: the motor's pinion drives two racks in opposite directions, which carry the fingers.
      const module = 0.0008
      const pinionT = 16
      const pr = (pinionT * module) / 2
      const pinion = put(group, new THREE.Group(), 0, 0, -0.006)
      pinion.add(mesh(gear(pinionT, pr - module * 1.2, pr + module, 0.006, { hole: 0.0012 }), steelBright))
      const rackA = put(group, new THREE.Group(), 0, pr + 0.0002, -0.006)
      rackA.add(mesh(rackGeo(0.05, module), steelBright))
      rackA.rotation.z = Math.PI
      const rackB = put(group, new THREE.Group(), 0, -pr - 0.0002, -0.006)
      rackB.add(mesh(rackGeo(0.05, module), steelBright))
      const guide = put(group, new THREE.Group(), 0, 0, 0.002)
      guide.add(mesh(new RoundedBoxGeometry(0.058, 0.03, 0.004, 2, 0.001), aluminium))
      ring(guide, 4, 0.024, 0, (x, y) => screw(guide, x * 1.05, y * 0.5, 0.0029))
      pieces.push(pinion, rackA, rackB, guide)
      turners.push((m) => {
        const a = Math.sin(m * 0.08) * 1.4
        pinion.rotation.z = a
        rackA.position.x = -a * pr
        rackB.position.x = a * pr
      })
      ratio = 1e9
    }
    const runAfter = pieces.length
    // Output bearing (cross-roller), torque sensor and flange; the hand has its own guide instead.
    const output: THREE.Object3D[] = []
    if (design.kind !== 'gripper') {
      const bearing = put(group, new THREE.Group(), 0, 0, 0.005)
      bearing.add(mesh(raceOuterGeo, steelBright))
      bearing.add(mesh(raceInnerGeo, steelBright))
      const up = new THREE.Vector3(0, 1, 0)
      const rollers = Math.round(26 * design.scale)
      ring(bearing, rollers, 0.0335, 0, (x, y, a) => {
        const roller = put(bearing, mesh(rollerGeo, steelBright), x, y, 0)
        const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), roller.id % 2 ? 1 : -1).normalize()
        roller.quaternion.setFromUnitVectors(up, dir)
      })
      pieces.push(bearing)
      if (design.spokes) {
        const torque = put(group, new THREE.Group(), 0, 0, 0.012)
        torque.add(mesh(spokedGeo(design.spokes), aluminium))
        ring(torque, design.spokes, 0.02, 0, (x, y, a) => {
          put(torque, mesh(gaugeGeo, gauge), x, y, 0.0027).rotation.z = a
        })
        pieces.push(torque)
        output.push(torque)
      }
      const flange = put(group, new THREE.Group(), 0, 0, 0.018)
      flange.add(mesh(flangeGeo, flangeMat))
      ring(flange, design.bolts, 0.0285, 0, (x, y) => screw(flange, x, y, 0.0034))
      pieces.push(flange)
      output.push(flange)
    }
    pieces.forEach((piece) => {
      piece.userData.z = piece.position.z
      if (!piece.userData.moving) bake(piece)
    })
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = false
    })
    group.visible = false
    return {
      group,
      pieces,
      runAfter,
      design,
      run: (m) => {
        turners.forEach((turn) => turn(m))
        output.forEach((o) => (o.rotation.z = -m / ratio))
      },
    }
  })

  // Fingers slide along the hand's y axis; the right one is the left one turned half round. They come with the hand.
  const fingerL = put(carriers[8], new THREE.Group(), 0, 0, FINGER_Z)
  const fingerR = put(carriers[8], new THREE.Group(), 0, 0, FINGER_Z)
  fingerR.rotation.z = Math.PI

  // The meshes arrive asynchronously (9 MB); the story starts once they are in place.
  let robotReady = false
  // Every CAD colour of Franka's model (mesh names end in c<r>_<g>_<b>) gets its own material.
  // The white print (the FRANKA lettering, button symbols) lies flush on the dark surfaces: it is drawn just in
  // front of them, otherwise the two fight for the same depth and the letters flicker and blur.
  const print = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.35,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  })
  const connector = new THREE.MeshPhysicalMaterial({ color: 0xff5a1f, roughness: 0.45 })
  // The FR3's own status lights: blue light strips on the base and the pilot. They come on once the
  // electronics are in (stage 2, "live status") and fully when the robot powers up.
  const statusLight = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x1aa3ff, emissiveIntensity: 0 })
  const led = (color: number) =>
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 1.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 })
  const looks: Record<string, THREE.Material> = {
    c202_209_238: shell,
    c210_210_239: shell,
    c202_212_216: shell,
    c255_255_255: print,
    c64_64_64: satin,
    c13_13_13: black,
    c0_0_0: black,
    c192_192_192: metal,
    c255_66_6: connector,
    c0_174_255: statusLight,
    c8_159_255: statusLight,
    c255_0_0: led(0xff2a2a),
    c128_255_128: led(0x6dff8a),
  }
  // The hand's body is the white part there, not print on top of something.
  const handLooks: Record<string, THREE.Material> = { c255_255_255: shell }

  // --- Assembly geometry: where each part seats, and from which way it comes down ---
  // The robot is assembled in a calm, slightly bent pose; it moves for the first time when complete.
  const ASSEMBLY_Q = [0, -0.3, 0, -1.6, 0, 1.35, Math.PI / 4]
  const DROP = 2.6 // world units a part is lowered through
  const upLocal = PARTS.map(() => new THREE.Vector3(0, 1, 0)) // world "up", in each carrier's parent frame
  // Where each drive is put together: beside its joint, towards the audience, clear of the crane's path.
  const hoverWorld = PARTS.map((_, p) => {
    const a = 0.25 + (p % 3) * 0.4
    return new THREE.Vector3(Math.sin(a) * 0.62, 0.28, Math.cos(a) * 0.62)
  })
  const hoverLocal = PARTS.map(() => new THREE.Vector3()) // the same, in the drive's parent frame
  const tmpSide = new THREE.Vector3()
  const seatCentre = PARTS.map(() => new THREE.Vector3()) // part centre when seated (world)
  const seatRadius = PARTS.map(() => 0.4)
  const seatHalfHeight = PARTS.map(() => 0.3)
  const jointWorld = PARTS.map(() => new THREE.Vector3()) // where the part's joint is (sparks, light ring)
  const jointAxis = PARTS.map(() => new THREE.Vector3(0, 1, 0))

  function applyJoints(q: number[], grip: number) {
    jointTurns.forEach((turn, i) => (turn.rotation.z = q[i]))
    fingerL.position.y = grip
    fingerR.position.y = grip
  }

  /** Measure, in the assembly pose, where every part ends up and which way is up for it. */
  function measureParts() {
    carriers.forEach((c) => {
      c.position.set(0, 0, 0)
      c.quaternion.identity()
    })
    applyJoints(ASSEMBLY_Q, FINGER_MAX)
    arm.updateMatrixWorld(true)
    const q = new THREE.Quaternion()
    const box = new THREE.Box3()
    carriers.forEach((c, p) => {
      const parent = c.parent!
      parent.getWorldQuaternion(q)
      upLocal[p].set(0, 1, 0).applyQuaternion(q.clone().invert()).divideScalar(ROBOT_SCALE)
      hoverLocal[p].copy(hoverWorld[p]).applyQuaternion(q.clone().invert()).divideScalar(ROBOT_SCALE)
      parent.getWorldPosition(jointWorld[p])
      jointAxis[p].set(0, 0, 1).applyQuaternion(q)
      // Built with its gear side towards the camera: turned over if the joint's axis points away from the audience.
      const d = drives[p]
      const flipped = jointAxis[p].dot(tmpSide.copy(hoverWorld[p]).setY(0)) < 0
      d.group.rotation.x = flipped ? Math.PI : 0
      d.group.userData.flipped = flipped
      box.setFromObject(c)
      if (!box.isEmpty()) {
        box.getCenter(seatCentre[p])
        const size = box.getSize(new THREE.Vector3())
        seatRadius[p] = Math.max(0.12, size.length() / 2)
        seatHalfHeight[p] = size.y / 2
      } else {
        seatCentre[p].copy(jointWorld[p])
      }
    })
    // Each drive sits inside the housing that comes down over it: on the joint's axis, at the height where the
    // housing's wall surrounds the axis most widely, and no larger than fits there (FR3 links curve, so the middle
    // of a link's bounding box can lie outside its shell). Measured from the housing's own vertices: for every
    // height along the axis, the nearest wall in each of 16 directions round the axis.
    drives.forEach((d, p) => {
      const c = carriers[p]
      c.updateMatrixWorld(true)
      const toJoint = c.matrixWorld.clone().invert()
      const pts: number[] = [] // r, angle sector, z (metres, in the joint's frame)
      const v = new THREE.Vector3()
      const SECTORS = 16
      c.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return
        const m = toJoint.clone().multiply(o.matrixWorld)
        const pos = o.geometry.attributes.position as THREE.BufferAttribute
        for (let i = 0; i < pos.count; i += 2) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m)
          const sector = Math.floor(((Math.atan2(v.y, v.x) + Math.PI) / (Math.PI * 2)) * SECTORS) % SECTORS
          pts.push(Math.hypot(v.x, v.y), sector, v.z)
        }
      })
      let best = { room: 0, z: 0, scale: 0.3 }
      if (pts.length) {
        let zMin = Infinity
        let zMax = -Infinity
        for (let i = 2; i < pts.length; i += 3) {
          zMin = Math.min(zMin, pts[i])
          zMax = Math.max(zMax, pts[i])
        }
        // Along the axis, the housing's flat faces have vertices only at their rims: so the ends are found by
        // casting rays along the axis (and along four lines at the drive's radius) and taking where the housing
        // begins and ends on each.
        const meshes: THREE.Mesh[] = []
        c.traverse((o) => o instanceof THREE.Mesh && meshes.push(o))
        const sides = meshes.map((m) => (m.material as THREE.Material).side)
        meshes.forEach((m) => ((m.material as THREE.Material).side = THREE.DoubleSide))
        const ray = new THREE.Raycaster()
        const span = (x: number, y: number): [number, number] | null => {
          ray.set(new THREE.Vector3(x, y, zMin - 0.05).applyMatrix4(c.matrixWorld), jointAxis[p])
          const hits = ray.intersectObjects(meshes, false)
          if (!hits.length) return null
          const z0 = zMin - 0.05
          return [z0 + hits[0].distance / ROBOT_SCALE, z0 + hits[hits.length - 1].distance / ROBOT_SCALE]
        }
        const ends = (scale: number): [number, number] | null => {
          const r = DRIVE_RADIUS * scale
          let lo = -Infinity
          let hi = Infinity
          for (const [x, y] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
            const e = span(x, y)
            if (!e) return null
            lo = Math.max(lo, e[0])
            hi = Math.min(hi, e[1])
          }
          return [lo, hi]
        }
        // Where along the axis a drive of this scale has the most room, and how much.
        const roomFor = (scale: number) => {
          const height = (DRIVE_BACK + DRIVE_FRONT) * scale
          let found = { room: 0, z: (zMin + zMax) / 2, scale }
          const e = ends(scale)
          if (!e || e[1] - e[0] < height * 1.05) return found
          const [lo, hi] = [e[0] + height * 0.525, e[1] - height * 0.525]
          for (let k = 0; k <= 24; k++) {
            const zc = lo + ((hi - lo) * k) / 24
            const nearest = new Array<number>(SECTORS).fill(Infinity)
            for (let i = 0; i < pts.length; i += 3) {
              if (Math.abs(pts[i + 2] - zc) > height / 2) continue
              if (pts[i] < nearest[pts[i + 1]]) nearest[pts[i + 1]] = pts[i]
            }
            // A direction with no wall at all means the axis leaves the housing there.
            const room = Math.min(...nearest.map((r) => (r === Infinity ? 0 : r)))
            if (room > found.room) found = { room, z: zc, scale }
          }
          return found
        }
        const fits = (f: { room: number; scale: number }) => f.room * 0.9 >= DRIVE_RADIUS * f.scale
        // The design's own size if it fits; otherwise the largest that does (bisection).
        best = roomFor(d.design.scale)
        if (!fits(best)) {
          let lo = 0.3
          let hi = d.design.scale
          best = roomFor(lo)
          for (let i = 0; i < 6; i++) {
            const mid = (lo + hi) / 2
            const f = roomFor(mid)
            if (fits(f)) {
              lo = mid
              best = f
            } else hi = mid
          }
        }
        meshes.forEach((m, i) => ((m.material as THREE.Material).side = sides[i]))
      }
      d.group.scale.setScalar(best.scale)
      const half = ((DRIVE_FRONT - DRIVE_BACK) / 2) * best.scale
      d.group.userData.z = best.z + (d.group.userData.flipped ? half : -half)
      d.group.userData.centre = best.z
      d.group.userData.fit = best
    })
    footRing.position.x = seatCentre[0].x
    footRing.position.z = seatCentre[0].z
    footRing.scale.setScalar(Math.max(1, (seatRadius[0] * 1.15) / 0.62))
    buildCameraKeys()
  }

  new GLTFLoader().load(
    `${import.meta.env.BASE_URL}models/fr3.glb`,
    (gltf) => {
      const mounts: Record<string, THREE.Object3D[]> = { finger: [fingerL, fingerR] }
      PARTS.forEach((name, p) => (mounts[name] = [carriers[p]]))
      for (const node of gltf.scene.children) {
        for (const target of mounts[node.name] ?? []) {
          for (const part of node.children) {
            if (!(part instanceof THREE.Mesh)) continue
            const kind = part.name.slice(node.name.length + 1)
            target.add(mesh(part.geometry, (node.name === 'hand' ? handLooks[kind] : undefined) ?? looks[kind] ?? shell))
          }
        }
      }
      measureParts()
      modelLoaded = true
      whenLoaded()
    },
    undefined,
    () => ((modelLoaded = true), whenLoaded()), // without the model the stage still plays, rather than staying blank
  )

  // --- Stage: assembly platform, gantry crane, floor ---
  const platform = new THREE.Group()
  scene.add(platform)
  // Steel base plate with a ring of bolts and an amber safety edge.
  put(platform, mesh(new THREE.CylinderGeometry(1.5, 1.56, PLATE_TOP, SEG), metal), 0, PLATE_TOP / 2, 0)
  const boltGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    put(platform, mesh(boltGeo, steel), Math.cos(a) * 1.32, PLATE_TOP + 0.012, Math.sin(a) * 1.32)
  }
  const edge = mesh(new THREE.TorusGeometry(1.53, 0.022, 12, SEG), cranePaint, false)
  edge.rotation.x = Math.PI / 2
  put(platform, edge, 0, PLATE_TOP - 0.01, 0)
  // A light ring around the robot's foot, lit when it powers up; centred on the base's footprint once the model is
  // measured (the FR3's base reaches further back than its first joint), its colour drifting through the brand's.
  const footRing = mesh(new THREE.TorusGeometry(0.62, 0.014, 16, SEG * 2), violet, false)
  footRing.rotation.x = Math.PI / 2
  put(platform, footRing, 0, PLATE_TOP + 0.004, 0)

  // Overhead crane, hung from the hall ceiling: two rails, a bridge travelling along x, a trolley along z, a cable
  // and hook.
  const CRANE_Y = 5.6
  const RAIL_Z = 2.4
  const crane = new THREE.Group()
  scene.add(crane)
  for (const z of [-RAIL_Z, RAIL_Z]) {
    put(crane, mesh(new RoundedBoxGeometry(9.9, 0.26, 0.26, 2, 0.03), cranePaint, false), 0, CRANE_Y + 0.13, z)
  }
  const bridge = put(crane, new THREE.Group(), 0, CRANE_Y - 0.05, 0)
  bridge.add(mesh(new RoundedBoxGeometry(0.34, 0.32, RAIL_Z * 2 + 0.3, 2, 0.04), cranePaint, false))
  const trolley = put(bridge, new THREE.Group(), 0, -0.26, 0)
  trolley.add(mesh(new RoundedBoxGeometry(0.62, 0.3, 0.7, 3, 0.05), metal, false))
  put(trolley, mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.5, 24), steel, false), 0, -0.05, 0).rotation.x = Math.PI / 2
  const cable = mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 10), black, false)
  scene.add(cable)
  const hook = new THREE.Group()
  scene.add(hook)
  put(hook, mesh(new RoundedBoxGeometry(0.2, 0.26, 0.16, 2, 0.03), cranePaint, false), 0, 0.13, 0)
  const hookRing = mesh(new THREE.TorusGeometry(0.06, 0.016, 10, 32, Math.PI * 1.5), steel, false)
  hookRing.rotation.z = Math.PI / 4
  put(hook, hookRing, 0, -0.05, 0)

  const glowTexture = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 1024
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(512, 512, 0, 512, 512, 512)
    grad.addColorStop(0, 'rgba(139,92,246,0.9)')
    grad.addColorStop(0.35, 'rgba(236,72,153,0.35)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 1024, 1024)
    const texture = new THREE.CanvasTexture(c)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  })()
  const floorGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 7),
    new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  floorGlow.rotation.x = -Math.PI / 2
  floorGlow.position.y = -0.004
  scene.add(floorGlow)

  const gridRings = new THREE.Group()
  for (let i = 1; i <= 6; i++) {
    const r = new THREE.Mesh(
      new THREE.RingGeometry(i * 0.62, i * 0.62 + 0.006, 512),
      new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0 }),
    )
    r.rotation.x = -Math.PI / 2
    r.position.y = 0.002
    gridRings.add(r)
  }
  scene.add(gridRings)

  // Soft round sprite, so dust and sparks stay round instead of square at high resolution.
  const dotTexture = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.4, 'rgba(255,255,255,0.6)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  })()

  const dust = (() => {
    const count = 1400
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const radius = 2 + Math.random() * 8
      const theta = Math.random() * Math.PI * 2
      positions.set([Math.cos(theta) * radius, Math.random() * 7 - 0.5, Math.sin(theta) * radius], i * 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0xb4a5ff, size: 0.05, map: dotTexture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
  })()
  scene.add(dust)

  // --- Seating effects: a spray of hot sparks, a flash and a ring of light at the joint as each part locks in ---
  // Each spark is a short streak (its last few hundredths of a second of flight): white-hot at the head, cooling to
  // orange along the tail, falling under gravity and bouncing once off the platform.
  const lockGeometry = new THREE.PlaneGeometry(2, 2)
  const lockTexture = (draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas')
    c.width = c.height = 1024
    const g = c.getContext('2d')!
    g.translate(512, 512)
    draw(g)
    const texture = new THREE.CanvasTexture(c)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
    return texture
  }
  // A bright rim fading inwards in the brand's colours: the shock front.
  const shockTexture = lockTexture((g) => {
    const grad = g.createRadialGradient(0, 0, 330, 0, 0, 508)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(0.55, 'rgba(139,92,246,0.25)')
    grad.addColorStop(0.82, 'rgba(236,72,153,0.7)')
    grad.addColorStop(0.93, 'rgba(255,255,255,1)')
    grad.addColorStop(0.97, 'rgba(103,232,249,0.6)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grad
    g.beginPath()
    g.arc(0, 0, 510, 0, Math.PI * 2)
    g.fill()
  })
  // A precision gauge: dashed arcs, fine ticks and four index marks, like a dial locking onto its position.
  const gaugeTexture = lockTexture((g) => {
    g.lineCap = 'round'
    g.strokeStyle = 'rgba(196,181,253,0.95)'
    g.lineWidth = 10
    for (let i = 0; i < 6; i++) {
      g.beginPath()
      g.arc(0, 0, 440, (i / 6) * Math.PI * 2 + 0.12, ((i + 1) / 6) * Math.PI * 2 - 0.12)
      g.stroke()
    }
    g.strokeStyle = 'rgba(103,232,249,0.85)'
    g.lineWidth = 4
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2
      const long = i % 10 === 0
      g.beginPath()
      g.moveTo(Math.cos(a) * 395, Math.sin(a) * 395)
      g.lineTo(Math.cos(a) * (long ? 350 : 375), Math.sin(a) * (long ? 350 : 375))
      g.stroke()
    }
    g.fillStyle = 'rgba(255,255,255,0.95)'
    for (let i = 0; i < 4; i++) {
      g.save()
      g.rotate((i / 4) * Math.PI * 2 + Math.PI / 4)
      g.beginPath()
      g.moveTo(470, 0)
      g.lineTo(500, -16)
      g.lineTo(500, 16)
      g.closePath()
      g.fill()
      g.restore()
    }
  })

  const SPARKS = 70
  const SPARK_TAIL = 0.018 // seconds of flight drawn as the streak
  const SPARK_LIFE = 0.7
  const GRAVITY = -9
  const sparks = PARTS.map((_, p) => {
    // Fixed per part (seeded by index), so scrubbing back and forth replays the same burst.
    let seed = p * 9973 + 17
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const flights = Array.from({ length: SPARKS }, () => {
      const a = rand() * Math.PI * 2
      const up = 0.15 + rand() * 0.9
      const speed = 1.2 + rand() * 2.6
      return { v: new THREE.Vector3(Math.cos(a) * speed, up * speed, Math.sin(a) * speed), life: 0.25 + rand() * 0.45 }
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 6), 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SPARKS * 6), 3))
    const streaks = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    streaks.visible = false
    streaks.frustumCulled = false
    scene.add(streaks)
    // The lock-in mark: a glowing shock ring that sweeps outwards, a dashed gauge that spins and settles, and a soft
    // glow at the joint itself. Flat, in the joint's plane, additive (light, not surface).
    const ring = new THREE.Group()
    const shock = new THREE.Mesh(lockGeometry, new THREE.MeshBasicMaterial({ map: shockTexture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
    const gauge = new THREE.Mesh(lockGeometry, new THREE.MeshBasicMaterial({ map: gaugeTexture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
    const core = new THREE.Mesh(lockGeometry, new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
    ring.add(shock, gauge, core)
    ring.visible = false
    scene.add(ring)
    return { streaks, flights, ring, shock, gauge, core }
  })
  // The weld-like flash that lights the surrounding parts for an instant.
  const flash = new THREE.PointLight(0xffb36b, 0, 3.5, 2)
  scene.add(flash)
  const sparkAt = (origin: THREE.Vector3, v: THREE.Vector3, time: number, out: THREE.Vector3) => {
    out.set(origin.x + v.x * time, origin.y + v.y * time + 0.5 * GRAVITY * time * time, origin.z + v.z * time)
    const floor = PLATE_TOP + 0.01
    if (out.y < floor) out.y = floor + (floor - out.y) * 0.3 // one damped bounce
    return out
  }

  // --- Lights ---
  const key = new THREE.SpotLight(0xffffff, 9, 26, Math.PI / 5, 0.85)
  key.position.set(3.4, 9.5, 4.6)
  key.castShadow = true
  key.shadow.mapSize.set(4096, 4096)
  key.shadow.camera.near = 3
  key.shadow.camera.far = 18
  key.shadow.bias = -0.0002
  key.shadow.normalBias = 0.02
  key.shadow.radius = 6
  scene.add(key)
  // Invisible floor that only shows shadows, so the platform stands on the stage instead of floating.
  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.ShadowMaterial({ opacity: 0.45 }))
  shadowFloor.rotation.x = -Math.PI / 2
  shadowFloor.position.y = -0.002
  shadowFloor.receiveShadow = true
  scene.add(shadowFloor)
  // Soft fill from the front so the white shell reads as a volume, not a silhouette.
  const fill = new THREE.DirectionalLight(0xdfe4ff, 0.6)
  fill.position.set(-2, 3, 5)
  scene.add(fill)
  const rimViolet = new THREE.PointLight(0x8b5cf6, 25, 11)
  rimViolet.position.set(-3, 2.8, -2)
  scene.add(rimViolet)
  const rimPink = new THREE.PointLight(0xec4899, 18, 11)
  rimPink.position.set(3, 1.6, -3)
  scene.add(rimPink)

  // No post-processing: the scene renders straight to the canvas (antialiased by the browser, tone-mapped in the
  // materials). Measured on an Intel Arc iGPU: about 1-1.6 ms a frame this way, against 13 ms with an effect
  // chain and ambient occlusion, which alone cost more than a whole 120 Hz frame.

  // Render at the screen's own resolution (a 4K screen gets 4K), antialiased by the canvas's MSAA; rendering
  // above it costs frame rate for detail the screen cannot show. 1 = native; lowered if the GPU can't keep up.
  let quality = 1
  // Phones in portrait: the camera stands further back so the parts stay in frame.
  let portrait = false

  function resize() {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    // Capped at 2: phones report up to 3-4, and 9-16x the pixels would not look sharper there.
    const ratio = Math.max(0.75, Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO) * quality)
    renderer.setPixelRatio(ratio)
    renderer.setSize(w, h, false)
    canvas.dataset.renderSize = `${canvas.width}x${canvas.height}`
    camera.aspect = w / h
    portrait = w / h < 0.8
    camera.fov = portrait ? 52 : 36
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)
  // Development only: handles for profiling from the browser console.
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __intro: {
        renderer,
        scene,
        camera,
        setQuality: (q: number) => ((quality = q), resize()),
        /** Pins the story at t (null releases it), for frame-by-frame checks. */
        at: (time: number | null) => (probeTime = time),
        /** Draws the story at t right away (without waiting for a frame), then keeps it pinned there. */
        step: (time: number) => {
          probeTime = time
          const wasActive = active
          active = false
          tick(performance.now())
          active = wasActive
        },
        parts: { hook, carriers, drives: drives.map((d) => d.group), partWindow },
      },
    })
  }

  // --- The robot's first moves, once assembled: stretch, test the gripper, wave, then present itself ---
  const HELLO = [0.6, -0.5, 0, -1.9, 0, 2.2, 0]
  const motionKeys: [number, number[], number][] = [
    [TIMELINE.assembled, ASSEMBLY_Q, FINGER_MAX],
    [4.95, READY, FINGER_MAX],
    [5.1, READY, 0.004],
    [5.25, READY, FINGER_MAX],
    [5.6, HELLO, FINGER_MAX],
    [5.85, [0.6, -0.5, 0, -1.9, 0.6, 2.2, 1.4], FINGER_MAX],
    [6.1, [0.6, -0.5, 0, -1.9, -0.4, 2.2, -0.2], FINGER_MAX],
    [6.6, [0.35, -0.15, 0, -1.75, 0, 1.75, Math.PI / 4], FINGER_MAX],
  ]
  const q = [...ASSEMBLY_Q]
  function jointsAt(t: number): number {
    if (t <= motionKeys[0][0]) {
      ASSEMBLY_Q.forEach((v, i) => (q[i] = v))
      return FINGER_MAX
    }
    for (let i = 1; i < motionKeys.length; i++) {
      const [t1, q1, g1] = motionKeys[i]
      if (t <= t1) {
        const [t0, q0, g0] = motionKeys[i - 1]
        const s = smooth(clamp01((t - t0) / (t1 - t0)))
        for (let j = 0; j < 7; j++) q[j] = THREE.MathUtils.lerp(q0[j], q1[j], s)
        return THREE.MathUtils.lerp(g0, g1, s)
      }
    }
    const last = motionKeys[motionKeys.length - 1]
    last[1].forEach((v, i) => (q[i] = v))
    return last[2]
  }

  function whenLoaded() {
    if (!modelLoaded || !lightLoaded || robotReady) return
    warmUp()
    robotReady = true
    shadowTime = NaN // the robot just appeared: draw its shadow
  }

  /**
   * Draws everything once, off screen, before the story starts: every material's shader is compiled and every
   * geometry uploaded now, instead of the first time it appears mid-story (a single frame stalling for 50-100 ms).
   */
  function warmUp() {
    const hidden: THREE.Object3D[] = []
    const culled: THREE.Object3D[] = []
    scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o)
        o.visible = true
      }
      // Draw even what lies outside this view, so its buffers are uploaded too.
      if (o.frustumCulled) {
        culled.push(o)
        o.frustumCulled = false
      }
    })
    flash.intensity = 1 // a light that is on compiles the lit variants
    const target = new THREE.WebGLRenderTarget(64, 64)
    renderer.compile(scene, camera)
    renderer.setRenderTarget(target)
    renderer.shadowMap.needsUpdate = true
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    target.dispose()
    hidden.forEach((o) => (o.visible = false))
    culled.forEach((o) => (o.frustumCulled = true))
    flash.intensity = 0
    shadowTime = NaN
  }

  // --- Camera: an establishing shot, then close on each part as it comes down, then the finished robot ---
  type Shot = { t: number; pos: THREE.Vector3; look: THREE.Vector3 }
  let shots: Shot[] = []
  function buildCameraKeys() {
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
    shots = [
      { t: 0, pos: v(7.4, 5.2, 7.8), look: v(0, 1.6, 0) },
      { t: TIMELINE.featuresStart - 0.04, pos: v(5.6, 3.9, 6.0), look: v(0, 1.1, 0) },
    ]
    PARTS.forEach((_, p) => {
      const [d0] = driveWindow(p)
      const [start, seated] = partWindow(p)
      // Very close on the drive, looking a little along the joint's axis so the gears read as a movement.
      // Always from the audience's side (+z); tilted towards whichever face of the drive looks that way.
      const side = hoverWorld[p].clone().setY(0).normalize()
      // The drive's gear side, which faces the audience (see measureParts).
      const axis = jointAxis[p].clone()
      if (axis.dot(side) < 0) axis.negate()
      const hover = jointWorld[p].clone().addScaledVector(jointAxis[p], drives[p].group.userData.centre * ROBOT_SCALE).add(hoverWorld[p])
      const drivePos = hover.clone().add(side.multiplyScalar(0.8).add(axis.multiplyScalar(0.55)).add(v(0, 0.25, 0)).normalize().multiplyScalar(0.78))
      shots.push({ t: d0 + 0.01, pos: drivePos, look: hover })
      // Pull back a little as it slides into the joint.
      shots.push({ t: start, pos: drivePos.clone().sub(hover).multiplyScalar(1.5).add(hover), look: hover.clone().lerp(jointWorld[p], 0.6) })
      // Each part from its own angle, close enough that it fills a good part of the frame. The base is seen from
      // the front, where its FRANKA EMIKA lettering is.
      const angle = p === 0 ? 0.2 : 0.55 + (p % 2 ? 0.5 : -0.35) + p * 0.1
      const dist = THREE.MathUtils.clamp(seatRadius[p] * 4, 1.9, 3.2)
      const target = seatCentre[p]
      const pos = target.clone().add(v(Math.sin(angle) * dist, dist * 0.32, Math.cos(angle) * dist))
      shots.push({ t: seated + 0.03, pos, look: target.clone() })
    })
    shots.push(
      { t: TIMELINE.assembled + 0.2, pos: v(4.0, 2.6, 4.8), look: v(0.3, 1.4, 0) },
      { t: 5.6, pos: v(5.0, 2.4, 5.6), look: v(0.4, 1.3, 0) },
      { t: TIMELINE.end, pos: v(5.6, 2.3, 6.2), look: v(0.3, 1.05, 0) },
    )
  }
  buildCameraKeys()
  const camPos = new THREE.Vector3()
  const camLook = new THREE.Vector3()
  function cameraAt(t: number) {
    let i = shots.findIndex((s) => s.t >= t)
    if (i <= 0) i = i === 0 ? 1 : shots.length - 1
    const a = shots[i - 1]
    const b = shots[i]
    const s = easeInOut(clamp01((t - a.t) / Math.max(1e-6, b.t - a.t)))
    camLook.copy(a.look).lerp(b.look, s)
    camPos.copy(a.pos).lerp(b.pos, s)
    // Further back on portrait screens.
    if (portrait) camPos.sub(camLook).multiplyScalar(1.35).add(camLook)
  }

  // --- Animation ---
  // The clock starts at the first drawn frame, not at load, so shader compilation doesn't eat into the timeline.
  let startTime = performance.now()
  let probeTime: number | null = null
  let started = false
  let active = true
  let frame = 0
  let last = startTime
  let framesSinceCheck = 0
  let avgFrame = frameBudgetMs
  let sampled = 0

  // Smoothness beats detail: whenever frames miss the display's refresh budget (8.3 ms at 120 Hz), step the
  // render resolution down until they fit.
  function adaptQuality(now: number) {
    const dt = now - last
    last = now
    if (sampled++ < 8) return // ignore warm-up frames (shader compilation)
    // Judge the average over ~half a second, not single frames: a lone hiccup (garbage collection, a tab
    // switch, a scroll burst) must not cost resolution for the rest of the visit.
    if (dt < 250) avgFrame += (dt - avgFrame) * 0.08
    if (++framesSinceCheck < 45) return
    framesSinceCheck = 0
    if (avgFrame <= frameBudgetMs * 1.2) return
    sampled = 4 // let the change settle before judging again
    avgFrame = frameBudgetMs
    if (quality > 0.5) {
      quality *= 0.85
      resize()
    }
  }

  let lastT = 0
  const tmp = new THREE.Vector3()
  const craneAt = new THREE.Vector3(0, 0, 0) // where the trolley is over the floor (x, z)

  function tick(now: number) {
    if (!started) startTime = now
    adaptQuality(now)
    const wall = (now - startTime) / 1000
    const t = probeTime ?? freezeAt ?? (getTime ? getTime() : wall)
    if (t !== shadowTime) {
      renderer.shadowMap.needsUpdate = true
      shadowTime = t
    }

    // Robot joints: still during assembly, its first moves afterwards.
    const grip = jointsAt(t)
    applyJoints(q, grip)

    // Parts: hidden until hooked on, lowered (slowing down for the last centimetres), then seated.
    PARTS.forEach((_, p) => {
      const [start, seated] = partWindow(p)
      const c = carriers[p]
      c.visible = t >= start
      const e = easeOut(clamp01((t - start) / (seated - start)))
      // A short clunk as it seats: the housing settles a few millimetres and springs back.
      const after = t - seated
      const settle = after > 0 ? -0.02 * Math.sin(after * 38) * Math.exp(-after * 14) : 0
      c.position.copy(upLocal[p]).multiplyScalar(DROP * (1 - e) + settle)
      c.quaternion.setFromAxisAngle(tmp.copy(upLocal[p]).normalize(), (1 - e) * 0.5)
    })
    // Drives: each piece slides down its axis into place in turn; once the transmission is in, the motor runs it.
    // The finished drive then slides onto its joint, before the housing comes down over it.
    drives.forEach((d, p) => {
      const [d0, d1] = driveWindow(p)
      const [hooked, seated] = partWindow(p)
      d.group.visible = t >= d0 && t < seated + 0.02
      if (!d.group.visible) return
      const slide = easeInOut(clamp01((t - d1) / (hooked + (seated - hooked) * 0.15 - d1)))
      d.group.position.copy(hoverLocal[p]).multiplyScalar(1 - slide)
      d.group.position.z += d.group.userData.z
      const span = (d1 - d0) / (d.pieces.length + 0.6)
      d.pieces.forEach((piece, i) => {
        const k = easeOut(clamp01((t - d0 - i * span) / (span * 1.6)))
        piece.visible = k > 0
        piece.position.z = piece.userData.z + (1 - k) * 0.07
      })
      const run = clamp01((t - d0 - span * d.runAfter) / (span * 1.5))
      d.run(((t - d0) * 14 + wall * 3) * run)
    })
    arm.updateMatrixWorld(true)

    // Crane: the trolley travels to above the next part's seat, the hook carries the part down, then rises.
    const next = PARTS.findIndex((_, p) => t < partWindow(p)[1] + 0.3)
    const target = next >= 0 ? next : PARTS.length - 1
    const prev = Math.max(0, target - 1)
    const [tStart, tSeated] = partWindow(target)
    const prevSeated = target > 0 ? partWindow(prev)[1] : 0
    const travel = smooth(clamp01((t - prevSeated - 0.15) / Math.max(0.05, tStart - prevSeated - 0.15)))
    craneAt.lerpVectors(target > 0 ? seatCentre[prev] : seatCentre[0], seatCentre[target], target > 0 ? travel : 1)
    bridge.position.x = craneAt.x
    trolley.position.z = craneAt.z
    const parked = CRANE_Y - 1.2
    let hookY = parked
    if (t >= tStart && t <= tSeated) {
      const e = easeOut(clamp01((t - tStart) / (tSeated - tStart)))
      hookY = seatCentre[target].y + seatHalfHeight[target] + 0.1 + DROP * (1 - e)
    } else if (t > tSeated) {
      hookY = THREE.MathUtils.lerp(seatCentre[target].y + seatHalfHeight[target] + 0.1, parked, smooth(clamp01((t - tSeated) / 0.12)))
    } else {
      hookY = THREE.MathUtils.lerp(parked, Math.min(parked, seatCentre[target].y + seatHalfHeight[target] + DROP), smooth(clamp01((t - (tStart - 0.15)) / 0.15)))
    }
    // After the robot is complete the crane withdraws to the side.
    const withdraw = smooth(clamp01((t - TIMELINE.assembled) / 0.5))
    bridge.position.x = THREE.MathUtils.lerp(craneAt.x, -3.2, withdraw)
    hookY = THREE.MathUtils.lerp(hookY, parked + 0.6, withdraw)
    hook.position.set(bridge.position.x, hookY, trolley.position.z)
    const cableTop = CRANE_Y - 0.45
    cable.position.set(hook.position.x, (cableTop + hookY + 0.26) / 2, hook.position.z)
    cable.scale.y = Math.max(0.01, cableTop - hookY - 0.26)

    // Seating effects.
    let flashLevel = 0
    PARTS.forEach((_, p) => {
      const dt = t - partWindow(p)[1]
      const { streaks, flights, ring, shock, gauge, core } = sparks[p]
      const on = dt >= 0 && dt <= SPARK_LIFE
      streaks.visible = on
      ring.visible = on && dt <= SEAT_GLOW
      if (!on) return
      if (dt < 0.15 && 1 - dt / 0.15 > flashLevel) {
        flashLevel = 1 - dt / 0.15
        flash.position.copy(jointWorld[p])
      }
      const pos = streaks.geometry.attributes.position as THREE.BufferAttribute
      const col = streaks.geometry.attributes.color as THREE.BufferAttribute
      flights.forEach(({ v, life }, i) => {
        const heat = clamp01(1 - dt / life)
        sparkAt(jointWorld[p], v, dt, tmp)
        pos.setXYZ(i * 2, tmp.x, tmp.y, tmp.z)
        sparkAt(jointWorld[p], v, Math.max(0, dt - SPARK_TAIL), tmp)
        pos.setXYZ(i * 2 + 1, tmp.x, tmp.y, tmp.z)
        // Head: white-hot, yellowing as it cools; tail: dim orange.
        col.setXYZ(i * 2, heat, heat * (0.55 + heat * 0.4), heat * heat * 0.6)
        col.setXYZ(i * 2 + 1, heat * 0.5, heat * 0.12, 0)
      })
      pos.needsUpdate = true
      col.needsUpdate = true
      // Lock-in: the shock ring sweeps out and fades; the gauge spins in fast, slows and settles as it fades.
      ring.position.copy(jointWorld[p])
      ring.quaternion.setFromUnitVectors(tmp.set(0, 0, 1), jointAxis[p])
      const r = seatRadius[p]
      const u = clamp01(dt / SEAT_GLOW)
      shock.scale.setScalar(r * (0.3 + easeOut(u) * 0.95))
      ;(shock.material as THREE.MeshBasicMaterial).opacity = (1 - u) * (1 - u) * 1.1
      gauge.scale.setScalar(r * (0.82 - easeOut(u) * 0.18))
      gauge.rotation.z = (1 - easeOut(u)) * 2.4
      ;(gauge.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.9
      core.scale.setScalar(r * 0.55 * (1 + u * 0.4))
      ;(core.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.75
    })
    flash.intensity = flashLevel * flashLevel * 40

    if (started && logoReached(lastT, t)) onLogo?.()
    lastT = t

    // Lights: status lights once the electronics are in (end of stage 2), everything glows at power-up.
    const electronics = clamp01((t - featureTime(1, 1)) / 0.3)
    const ignite = clamp01((t - TIMELINE.ignite) / 0.5)
    const pulse = 1 + Math.sin(wall * 3) * 0.15
    statusLight.emissiveIntensity = (electronics * 0.5 + ignite * 0.7) * pulse
    violet.emissiveIntensity = ignite * 1.3 * pulse
    const hue = (wall * 0.25) % RING_COLOURS.length
    violet.emissive.copy(RING_COLOURS[Math.floor(hue)]).lerp(RING_COLOURS[(Math.floor(hue) + 1) % RING_COLOURS.length], smooth(hue % 1))

    const fadeIn = clamp01(t / 0.8 + 0.3)
    ;(dust.material as THREE.PointsMaterial).opacity = fadeIn * 0.6
    dust.rotation.y = wall * 0.04
    gridRings.children.forEach((r, i) => {
      const m = (r as THREE.Mesh).material as THREE.MeshBasicMaterial
      m.opacity = clamp01(t * 2 + 0.4 - i * 0.12) * (0.28 - i * 0.04)
    })
    // Kept low: the chain is HDR, and a bright additive floor washes the robot out.
    floorGlow.material.opacity = 0.14 + ignite * 0.24

    cameraAt(t)
    camera.position.copy(camPos)
    camera.lookAt(camLook)
    // While a feature caption card is up, shift the picture to the other half of the screen so the card never covers
    // the machine (cards alternate left and right; on portrait screens they sit at the bottom).
    let shiftX = 0
    let shiftY = 0
    for (let k = 0; k < 4; k++) {
      const w = smooth(clamp01((t - featureTime(k, 0.0)) / 0.12)) * smooth(clamp01((featureTime(k, 1.04) - t) / 0.12))
      if (portrait) shiftY += w * 0.17
      else shiftX += w * (k % 2 ? 0.2 : -0.2)
    }
    const vw = canvas.clientWidth
    const vh = canvas.clientHeight
    if (shiftX || shiftY) camera.setViewOffset(vw, vh, shiftX * vw, shiftY * vh, vw, vh)
    else if (camera.view?.enabled) camera.clearViewOffset()

    renderer.render(scene, camera)
    if (!active) {
      frame = 0
      return
    }
    // Reveal the stage only once the robot's parts are loaded.
    if (!started && robotReady) {
      started = true
      onStart()
    }
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)

  function setActive(next: boolean) {
    active = next
    if (active && !frame) {
      // Coming back on screen: don't count the pause as one slow frame.
      last = performance.now()
      sampled = 0
      frame = requestAnimationFrame(tick)
    }
  }

  function stop() {
    active = false
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', resize)
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose()
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        mats.forEach((m) => m.dispose())
      }
    })
    glowTexture.dispose()
    shockTexture.dispose()
    gaugeTexture.dispose()
    for (const texture of [wireTexture, laminationTexture, encoderTexture, pcbTexture]) texture.dispose()
    grain.dispose()
    dotTexture.dispose()
    envTexture.dispose()
    studioTexture?.dispose()
    pmrem.dispose()
    renderer.dispose()
  }

  return { stop, setActive }
}

/** Height of the assembly platform the robot stands on. */
const PLATE_TOP = 0.12
