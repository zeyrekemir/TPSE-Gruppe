// Welcome story scene: a Franka Research 3 (Franka's own CAD model and kinematics) picks feature modules
// off a conveyor belt, presents each to the camera and sets it on a display pedestal; then the stage lights
// up and the camera pushes in. Lit by a real photographed studio (HDRI), like a product shot.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { FINGER_MAX, FINGER_Z, FLANGE_Z, FR3_JOINTS, HAND_YAW, inverse, originMatrix, READY, TCP_Z } from './fr3'
import { closeUpWeight, FEATURE_COUNT, featureTime, fitLabel, SHOW, TIMELINE } from './timeline'

const MAX_PIXEL_RATIO = 2 // see resize()

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

/**
 * The scene is a timeline (seconds, see TIMELINE). `getTime` says where on it to draw: the welcome page
 * maps the scroll position to it, so scrolling scrubs the animation back and forth.
 * Small idle motions (sway, pulse, dust) run on the wall clock so the arm feels alive even when the page rests.
 * `onStart` fires after the first frame is on screen. `freezeAt` pins the timeline (development only).
 */
export function runIntroScene(
  canvas: HTMLCanvasElement,
  onStart: () => void,
  {
    freezeAt,
    frameBudgetMs = 1000 / 60,
    getTime,
    labels = ['Inventory', 'Live status', 'Booking without clashes', 'Maintenance & logs'],
  }: { freezeAt?: number; frameBudgetMs?: number; getTime?: () => number; labels?: string[] } = {},
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
  scene.fog = new THREE.Fog(0x05060d, 7, 16)

  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTexture
  scene.environmentIntensity = 0.42
  // A photographed studio (Poly Haven, CC0) for soft, real reflections and shading; the synthetic room
  // above lights the first frames until it has loaded.
  let studioTexture: THREE.Texture | null = null
  new RGBELoader().load(`${import.meta.env.BASE_URL}models/studio_small_09_1k.hdr`, (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping
    studioTexture = pmrem.fromEquirectangular(hdr).texture
    hdr.dispose()
    scene.environment = studioTexture
    scene.environmentIntensity = 0.55
  })

  // Near plane as far out as the closest shot allows: more depth precision for fine, flush details.
  const camera = new THREE.PerspectiveCamera(36, 1, 0.4, 40)

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
  // Brushed, anodised dark metal for the joint drives and the hand.
  const metal = new THREE.MeshPhysicalMaterial({
    color: 0x2b2e3a,
    metalness: 0.9,
    roughness: 0.36,
    roughnessMap: grain,
    anisotropy: 0.65,
    clearcoat: 0.2,
  })
  const trim = new THREE.MeshPhysicalMaterial({ color: 0x14151c, metalness: 0.6, roughness: 0.45 })
  // Satin dark grey of the FR3's joint covers and grip pads.
  const satin = new THREE.MeshPhysicalMaterial({ color: 0x24262d, metalness: 0.15, roughness: 0.5, roughnessMap: grain })
  const violet = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x8b5cf6, emissiveIntensity: 0 })
  const glowMaterials = [violet]

  const SEG = 160 // radial segments: smooth silhouettes even at 4K
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const m = new THREE.Mesh(geometry, material)
    m.castShadow = true
    m.receiveShadow = true
    return m
  }
  // --- Arm: Franka Research 3. Joint chain from fr3.ts, meshes from Franka's CAD (public/models/fr3.glb) ---
  // Enlarged to the stage: its shoulder stands about as high as the belt is long from the base.
  const ROBOT_SCALE = 3.6
  // The URDF is z-up, the scene y-up.
  const robotBase = new THREE.Matrix4().makeRotationX(-Math.PI / 2).scale(new THREE.Vector3(ROBOT_SCALE, ROBOT_SCALE, ROBOT_SCALE))
  const arm = new THREE.Group()
  robotBase.decompose(arm.position, arm.quaternion, arm.scale)
  scene.add(arm)
  // Joint i turns jointTurns[i] about its z axis; link i's mesh rides on it (link0 on the base).
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
  // Fingers slide along the hand's y axis; the right one is the left one turned half round.
  const fingerL = new THREE.Group()
  fingerL.position.z = FINGER_Z
  hand.add(fingerL)
  const fingerR = new THREE.Group()
  fingerR.position.z = FINGER_Z
  fingerR.rotation.z = Math.PI
  hand.add(fingerR)
  // Tool centre point, between the fingertips: a held module's centre.
  const tcp = new THREE.Object3D()
  tcp.position.z = TCP_Z
  hand.add(tcp)

  // The meshes arrive asynchronously (9 MB); the story starts once they are in place.
  let robotReady = false
  // The FRANKA EMIKA lettering on the base: the opening shot starts close on it.
  let brandMark: THREE.Mesh | null = null
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
  const black = new THREE.MeshPhysicalMaterial({ color: 0x0f1013, metalness: 0.1, roughness: 0.42 })
  const connector = new THREE.MeshPhysicalMaterial({ color: 0xff5a1f, roughness: 0.45 })
  // The FR3's own status lights: blue light strips on the base and the pilot; they light up for the finale.
  const statusLight = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x1aa3ff, emissiveIntensity: 0 })
  const led = (color: number) =>
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 1.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 })
  glowMaterials.push(statusLight)
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
  new GLTFLoader().load(
    `${import.meta.env.BASE_URL}models/fr3.glb`,
    (gltf) => {
      const mounts: Record<string, THREE.Object3D[]> = { hand: [hand], finger: [fingerL, fingerR] }
      linkMounts.forEach((m, i) => (mounts[`link${i}`] = [m]))
      for (const node of gltf.scene.children) {
        for (const target of mounts[node.name] ?? []) {
          for (const part of node.children) {
            if (!(part instanceof THREE.Mesh)) continue
            const kind = part.name.slice(node.name.length + 1)
            const m = mesh(part.geometry, (node.name === 'hand' ? handLooks[kind] : undefined) ?? looks[kind] ?? shell)
            target.add(m)
            if (node.name === 'link0' && kind === 'c255_255_255') brandMark = m
          }
        }
      }
      robotReady = true
      shadowTime = NaN // the robot just appeared: draw its shadow
    },
    undefined,
    () => (robotReady = true), // without the model the stage still plays, rather than staying blank
  )
  // A light ring on the floor around the robot's foot, lit for the finale.
  const footRing = mesh(new THREE.TorusGeometry(0.62, 0.012, 16, SEG * 2), violet)
  footRing.castShadow = false
  footRing.rotation.x = Math.PI / 2
  footRing.position.y = 0.012
  scene.add(footRing)

  // --- Showcase: conveyor belt, one module per feature, display pedestals ---
  const FEATURE_COLORS = [0x22d3ee, 0x8b5cf6, 0xec4899, 0xfbbf24]
  const BELT_Z = 1.15 // belt runs along x, in front of the arm
  const BELT_TOP = 0.45
  const BELT_LEFT = -3.25
  const BELT_RIGHT = 0.55
  const BELT_SPEED = 1.5 // metres per scene second
  // Modules are held by a grip handle on top (the FR3's fingers span only 8 cm), so they can be large enough
  // for their names to read well.
  const MODULE = 0.32
  const HANDLE = 0.11 // handle width, what the fingers close on
  const HANDLE_H = 0.075
  // From the tool centre point (between the fingertips, on the handle) down to the module's centre.
  const GRIP_OFFSET = MODULE / 2 + HANDLE_H / 2
  // Turn of the bottom face's label so it reads upright while the arm presents the module.
  // (The hand holds it with the tool axis towards the camera and the fingers closing sideways, hence 90 degrees.)
  const BOTTOM_TURN = Math.PI / 2
  // Display table: one straight table in front of the robot, its four places in a row, square to the finale
  // camera (which looks back at the robot along DISPLAY_DIR), in reading order from left to right.
  const DISPLAY_DIR = THREE.MathUtils.degToRad(105) // from the robot to the table's centre
  const TABLE_DIST = 1.45
  const SLOT_TOP = 0.55 // table top
  const SLOT_SPACING = 0.52
  const FINALE_DIST = 4.4 // finale camera, from the robot (typical; it adapts to the screen's width)
  const tableAlong = new THREE.Vector3(Math.cos(DISPLAY_DIR), 0, -Math.sin(DISPLAY_DIR)) // left to right on screen
  const tableCentre = new THREE.Vector3(Math.sin(DISPLAY_DIR), 0, Math.cos(DISPLAY_DIR)).multiplyScalar(TABLE_DIST)
  const SLOTS = [-1.5, -0.5, 0.5, 1.5].map((i) => tableCentre.clone().addScaledVector(tableAlong, i * SLOT_SPACING))
  const finaleCam = new THREE.Vector3(Math.sin(DISPLAY_DIR), 0, Math.cos(DISPLAY_DIR)).multiplyScalar(FINALE_DIST)
  // Each module is set down with one face turned straight at the finale camera.
  const SLOT_FACING = SLOTS.map((s) => Math.atan2(finaleCam.x - s.x, finaleCam.z - s.z))

  const beltLength = BELT_RIGHT - BELT_LEFT
  const beltMid = (BELT_LEFT + BELT_RIGHT) / 2
  const BELT_REPEAT = 8
  const beltTexture = (() => {
    const c = document.createElement('canvas')
    c.width = 1024 // 4x the drawing units, for a crisp belt at 4K
    c.height = 512
    const g = c.getContext('2d')!
    g.scale(4, 4)
    g.fillStyle = '#15161d'
    g.fillRect(0, 0, 256, 128)
    g.fillStyle = '#242733'
    for (let x = 0; x < 256; x += 64) {
      g.beginPath()
      g.moveTo(x + 8, 16)
      g.lineTo(x + 40, 64)
      g.lineTo(x + 8, 112)
      g.lineTo(x + 22, 112)
      g.lineTo(x + 54, 64)
      g.lineTo(x + 22, 16)
      g.fill()
    }
    const texture = new THREE.CanvasTexture(c)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.repeat.set(BELT_REPEAT, 1)
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
    return texture
  })()

  /** Adds obj to parent at (x, y, z) and returns obj (Object3D.add returns the parent). */
  const put = <T extends THREE.Object3D>(parent: THREE.Object3D, obj: T, x: number, y: number, z: number) => {
    obj.position.set(x, y, z)
    parent.add(obj)
    return obj
  }

  const belt = new THREE.Group()
  put(belt, mesh(new RoundedBoxGeometry(beltLength + 0.1, 0.12, 0.58, 4, 0.04), metal), beltMid, BELT_TOP - 0.07, BELT_Z)
  const beltSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(beltLength, 0.5),
    new THREE.MeshStandardMaterial({ map: beltTexture, roughness: 0.85, metalness: 0 }),
  )
  beltSurface.rotation.x = -Math.PI / 2
  beltSurface.position.set(beltMid, BELT_TOP + 0.001, BELT_Z)
  beltSurface.receiveShadow = true
  belt.add(beltSurface)
  for (const x of [BELT_LEFT, BELT_RIGHT]) {
    const roller = mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.54, 48), trim)
    roller.rotation.x = Math.PI / 2
    roller.position.set(x, BELT_TOP - 0.06, BELT_Z)
    belt.add(roller)
  }
  for (const z of [-0.28, 0.28]) {
    put(belt, mesh(new RoundedBoxGeometry(beltLength + 0.1, 0.05, 0.03, 2, 0.012), shell), beltMid, BELT_TOP + 0.02, BELT_Z + z)
  }
  for (const x of [BELT_LEFT + 0.2, BELT_RIGHT - 0.2]) {
    for (const z of [-0.2, 0.2]) {
      put(belt, mesh(new RoundedBoxGeometry(0.06, BELT_TOP - 0.12, 0.06, 2, 0.015), metal), x, (BELT_TOP - 0.12) / 2, BELT_Z + z)
    }
  }
  // Stopper: modules wait here to be picked up.
  put(belt, mesh(new RoundedBoxGeometry(0.04, 0.08, 0.48, 2, 0.012), trim), MODULE * 0.62, BELT_TOP + 0.04, BELT_Z)
  scene.add(belt)

  /** Module face: a small icon above the feature's name in big letters, on a dark tile with a coloured rim. */
  function labelTexture(k: number, color: number, label: string) {
    const S = 512 // drawing units; the canvas is 4x (2048 px) so the letters stay sharp at 5K and in close-up
    const c = document.createElement('canvas')
    c.width = c.height = S * 4
    const g = c.getContext('2d')!
    const base = new THREE.Color(color)
    const tone = (towards: number, amount: number) => `#${base.clone().lerp(new THREE.Color(towards), amount).getHexString()}`
    // Black letters in the site's display font (Orbitron), on a bright tile so they always stand out.
    const ink = '#0b0c14'
    const font = (px: number) => `900 ${px}px "Orbitron", "Plus Jakarta Sans", system-ui, sans-serif`

    function draw() {
      g.setTransform(4, 0, 0, 4, 0, 0)
      // The whole face is coloured (no transparent corners, which render black): a diagonal gradient from a light
      // tint of the feature colour to the colour itself, kept bright so the black letters read well.
      const fill = g.createLinearGradient(0, 0, S, S)
      fill.addColorStop(0, tone(0xffffff, 0.4))
      fill.addColorStop(0.55, tone(0xffffff, 0.12))
      fill.addColorStop(1, tone(0x000000, 0.08))
      g.fillStyle = fill
      g.fillRect(0, 0, S, S)
      // Soft glossy sheen over the top half, like a printed acrylic tile.
      const sheen = g.createLinearGradient(0, 0, 0, S * 0.55)
      sheen.addColorStop(0, 'rgba(255,255,255,0.28)')
      sheen.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = sheen
      g.fillRect(0, 0, S, S * 0.55)
      // Fine inner frame.
      g.strokeStyle = 'rgba(11,12,20,0.3)'
      g.lineWidth = 6
      g.beginPath()
      g.roundRect(22, 22, S - 44, S - 44, 48)
      g.stroke()

      // Icon badge: well inside the frame (the frame runs at 22, the badge from 56 to 184).
      const badge = { x: S / 2, y: 120, r: 64 }
      g.fillStyle = 'rgba(255,255,255,0.6)'
      g.beginPath()
      g.arc(badge.x, badge.y, badge.r, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = 'rgba(11,12,20,0.14)'
      g.lineWidth = 3
      g.stroke()
      // Icons on a 100-unit grid, all with the same stroke, drawn 0.8 x 100 = 80 units wide in the badge.
      g.save()
      g.translate(badge.x - 40, badge.y - 40)
      g.scale(0.8, 0.8)
      g.strokeStyle = g.fillStyle = ink
      g.lineWidth = 8
      g.lineCap = g.lineJoin = 'round'
      // Filled dots are collected and drawn after the strokes (a new path for each would drop the lines).
      const dots: [number, number, number][] = []
      const dot = (x: number, y: number, s: number) => dots.push([x, y, s])
      g.beginPath()
      if (k === 0) {
        // Inventory: a list.
        for (const y of [24, 50, 76]) {
          dot(18, y, 12)
          g.moveTo(38, y)
          g.lineTo(86, y)
        }
      } else if (k === 1) {
        // Live status: a heartbeat line with the live dot at its end.
        g.moveTo(6, 54)
        g.lineTo(28, 54)
        g.lineTo(40, 24)
        g.lineTo(56, 80)
        g.lineTo(68, 54)
        g.lineTo(82, 54)
        dot(90, 54, 12)
      } else if (k === 2) {
        // Booking: a calendar sheet with rings and a grid of days.
        g.roundRect(10, 18, 80, 72, 12)
        g.moveTo(10, 40)
        g.lineTo(90, 40)
        g.moveTo(32, 8)
        g.lineTo(32, 26)
        g.moveTo(68, 8)
        g.lineTo(68, 26)
        for (const y of [56, 74]) for (const x of [30, 50, 70]) dot(x, y, 9)
      } else {
        // Maintenance: a wrench.
        g.arc(64, 36, 22, Math.PI * 0.05, Math.PI * 1.45)
        g.moveTo(49, 52)
        g.lineTo(16, 85)
      }
      g.stroke()
      g.beginPath()
      for (const [x, y, s] of dots) g.roundRect(x - s / 2, y - s / 2, s, s, s / 3)
      g.fill()
      g.restore()

      // Name: as large as fits the area below the badge (200..470), on one, two or three lines.
      // (Narrower than the area, to leave room for the thickening outline below.)
      const { lines, size } = fitLabel(label, S - 116, 240, (text, px) => {
        g.font = font(px)
        return g.measureText(text).width
      })
      g.font = font(size)
      g.fillStyle = ink
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      // A faint light edge under the letters, like embossed print.
      g.shadowColor = 'rgba(255,255,255,0.5)'
      g.shadowBlur = 0
      g.shadowOffsetY = 2.5
      const lineHeight = size * 1.12
      const centre = 336
      // Heavy letters like the site's headings: an outline in the ink thickens Orbitron's strokes.
      g.strokeStyle = ink
      g.lineWidth = size * 0.1
      g.lineJoin = 'round'
      lines.forEach((line, i) => {
        const y = centre + (i - (lines.length - 1) / 2) * lineHeight
        g.strokeText(line, S / 2, y)
        g.fillText(line, S / 2, y)
      })
      g.shadowColor = 'transparent'
    }

    draw()
    const texture = new THREE.CanvasTexture(c)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
    // The web font may still be loading the first time: redraw with it once it is there.
    document.fonts?.load('900 80px "Orbitron"').then(() => {
      draw()
      texture.needsUpdate = true
    })
    return texture
  }

  const iconTextures: THREE.Texture[] = []
  const modules = FEATURE_COLORS.map((color, k) => {
    const g = new THREE.Group()
    g.add(mesh(new RoundedBoxGeometry(MODULE * 1.1, MODULE, MODULE * 1.1, 5, 0.03), shell))
    const texture = labelTexture(k, color, labels[k])
    iconTextures.push(texture)
    const face = new THREE.MeshStandardMaterial({
      map: texture,
      emissive: 0xffffff,
      emissiveMap: texture,
      emissiveIntensity: 0.6, // self-lit enough to read in the shade, low enough to keep the colours saturated
      roughness: 0.5,
    })
    // The name is on the four sides and the bottom: readable on the belt, in the hand and on display.
    const half = (MODULE * 1.1) / 2 + 0.002
    const facePlane = () => new THREE.Mesh(new THREE.PlaneGeometry(MODULE * 0.9, MODULE * 0.9), face)
    // Grip handle on top: a satin black block on a short neck, what the robot's fingers close on.
    put(g, mesh(new RoundedBoxGeometry(HANDLE * 0.6, 0.02, HANDLE * 0.6, 2, 0.006), black), 0, MODULE / 2 + 0.01, 0)
    put(g, mesh(new RoundedBoxGeometry(HANDLE, HANDLE_H - 0.02, HANDLE, 4, 0.014), satin), 0, MODULE / 2 + 0.02 + (HANDLE_H - 0.02) / 2, 0)
    // The bottom face is what the camera sees while the arm presents the module: turned upright for that view.
    const bottom = facePlane()
    bottom.rotation.set(Math.PI / 2, 0, BOTTOM_TURN)
    bottom.position.y = -(MODULE / 2 + 0.002)
    g.add(bottom)
    for (const turn of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const side = facePlane()
      side.rotation.y = turn
      side.position.set(Math.sin(turn) * half, 0, Math.cos(turn) * half)
      g.add(side)
    }
    scene.add(g)
    return g
  })

  // The table: a light laminate top with a rounded edge on a brushed aluminium frame, like a lab bench.
  const table = new THREE.Group()
  table.position.copy(tableCentre)
  table.rotation.y = DISPLAY_DIR // local x runs along the row
  scene.add(table)
  const TABLE_LENGTH = SLOT_SPACING * 4 + 0.25
  const TABLE_DEPTH = 0.62
  const TOP_THICK = 0.045
  const laminate = new THREE.MeshPhysicalMaterial({ color: 0xe4e1da, roughness: 0.55, roughnessMap: grain, clearcoat: 0.15, clearcoatRoughness: 0.6 })
  const aluminium = new THREE.MeshPhysicalMaterial({ color: 0xc3c7cf, metalness: 1, roughness: 0.32, roughnessMap: grain, anisotropy: 0.6 })
  put(table, mesh(new RoundedBoxGeometry(TABLE_LENGTH, TOP_THICK, TABLE_DEPTH, 6, 0.018), laminate), 0, SLOT_TOP - TOP_THICK / 2, 0)
  // Frame under the top, four legs with levelling feet, a stretcher low between them.
  const LEG = 0.04
  const legHeight = SLOT_TOP - TOP_THICK
  put(table, mesh(new RoundedBoxGeometry(TABLE_LENGTH - 0.12, 0.05, TABLE_DEPTH - 0.12, 2, 0.008), aluminium), 0, legHeight - 0.025, 0)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (TABLE_LENGTH / 2 - 0.08)
      const z = sz * (TABLE_DEPTH / 2 - 0.08)
      put(table, mesh(new RoundedBoxGeometry(LEG, legHeight - 0.02, LEG, 2, 0.006), aluminium), x, (legHeight - 0.02) / 2 + 0.02, z)
      put(table, mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.02, 32), black), x, 0.01, z)
    }
    put(table, mesh(new RoundedBoxGeometry(0.03, 0.03, TABLE_DEPTH - 0.16, 2, 0.006), aluminium), sx * (TABLE_LENGTH / 2 - 0.08), 0.12, 0)
  }
  put(table, mesh(new RoundedBoxGeometry(TABLE_LENGTH - 0.16, 0.03, 0.03, 2, 0.006), aluminium), 0, 0.12, -(TABLE_DEPTH / 2 - 0.08))
  // Each place: a dark felt pad with a light edge that comes on when its module is set down.
  const pedestals = SLOTS.map((slot, k) => {
    const pad = new THREE.Group()
    pad.position.set(slot.x, SLOT_TOP, slot.z)
    pad.rotation.y = DISPLAY_DIR
    scene.add(pad)
    const led = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: FEATURE_COLORS[k], emissiveIntensity: 0 })
    // The lit plate is a little larger than the felt on it, so only its edge shows.
    put(pad, new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.006, 0.44, 3, 0.006), led), 0, 0.003, 0)
    put(pad, mesh(new RoundedBoxGeometry(0.42, 0.008, 0.42, 3, 0.004), black), 0, 0.007, 0)
    return led
  })

  // --- Poses: where the module centre (between the fingertips) goes, and which way the tool points ---
  interface Pose {
    q: number[] // the seven joint angles
    grip: number // each finger's opening (m)
  }
  const OPEN = FINGER_MAX
  const CLOSED = HANDLE / 2 / ROBOT_SCALE // fingers touch the handle's sides

  let seed = [...READY]
  const toolBasis = new THREE.Matrix4()
  /**
   * Joint angles that put the module centre at horizontal distance d and height h in direction psi
   * (radians from +z towards +x), with the tool pointing at angle alpha (0 up, PI/2 outwards, PI down) and
   * the fingers closing horizontally. Each pose is solved from the previous one, so the arm moves smoothly.
   */
  function solve(psi: number, d: number, h: number, alpha: number, grip = OPEN, facing = psi): Pose {
    const radial = new THREE.Vector3(Math.sin(psi), 0, Math.cos(psi))
    const z = new THREE.Vector3(0, Math.cos(alpha), 0).addScaledVector(radial, Math.sin(alpha)).normalize()
    // Fingers close across `facing` (an azimuth): with the tool down, the held module's side face then looks that way.
    const y = new THREE.Vector3(Math.cos(facing), 0, -Math.sin(facing))
    const x = new THREE.Vector3().crossVectors(y, z)
    const rotation = new THREE.Quaternion().setFromRotationMatrix(toolBasis.makeBasis(x, y, z))
    // (d, h) is where the module's centre goes; the tool centre point sits on its handle, GRIP_OFFSET back along the tool.
    const target = radial.clone().multiplyScalar(d).setY(h).addScaledVector(z, -GRIP_OFFSET)
    const opts = { base: robotBase, scale: ROBOT_SCALE }
    let best = inverse(target, rotation, seed, opts)
    if (best.positionError > 0.005 || best.angleError > 0.005) {
      // Stuck near a limit: start over from the ready pose, turned towards the target.
      const fresh = inverse(target, rotation, [psi - Math.PI / 2, ...READY.slice(1)], opts)
      if (fresh.positionError + fresh.angleError < best.positionError + best.angleError) best = fresh
    }
    seed = best.q
    return { q: best.q, grip }
  }

  function applyPose(p: Pose) {
    jointTurns.forEach((turn, i) => (turn.rotation.z = p.q[i]))
    fingerL.position.y = p.grip
    fingerR.position.y = p.grip
  }

  const deg = THREE.MathUtils.degToRad
  const orbitAt = (t: number) => 0.78 - t * 0.05
  const PICK_H = BELT_TOP + MODULE / 2 + 0.002
  // Rest: Franka's own ready pose (elbow up, hand down), turned towards the belt.
  const HOME: Pose = { q: [deg(-60), ...READY.slice(1)], grip: OPEN }
  seed = HOME.q
  const OVER_BELT = solve(0, 1.15, PICK_H + 0.28, Math.PI)
  const PICK = solve(0, 1.15, PICK_H, Math.PI)
  const PICK_CLOSED = { ...PICK, grip: CLOSED }
  const LIFT = solve(0.35, 1.05, 1.15, Math.PI, CLOSED)
  const slotAt = (k: number, lift: number, grip: number) =>
    solve(Math.atan2(SLOTS[k].x, SLOTS[k].z), Math.hypot(SLOTS[k].x, SLOTS[k].z), SLOT_TOP + MODULE / 2 + lift, Math.PI, grip, SLOT_FACING[k])
  const overSlot = (k: number, grip: number) => slotAt(k, 0.26, grip)
  const onSlot = (k: number, grip: number) => slotAt(k, 0.01, grip)

  // Keyframes of the whole show, solved in order; joint angles are eased between them.
  const keys: [number, Pose][] = [[0, HOME]]
  const presentPoses: Pose[] = []
  const placedPoses: Pose[] = []
  for (let k = 0; k < FEATURE_COUNT; k++) {
    const at = (phase: number) => featureTime(k, phase)
    keys.push([at(0.12), OVER_BELT], [at(SHOW.pick), PICK], [at(SHOW.grab), PICK_CLOSED], [at(SHOW.lift), LIFT])
    // Reach out towards the camera with the module.
    const present = solve(orbitAt(featureTime(k, SHOW.present)) - 0.06, 1.3, 1.45, Math.PI / 2, CLOSED)
    presentPoses.push(present)
    keys.push([at(SHOW.present), present], [at(SHOW.presentHold), present], [at(0.79), overSlot(k, CLOSED)])
    const placed = onSlot(k, CLOSED)
    placedPoses.push({ ...placed, grip: OPEN })
    keys.push([at(SHOW.place), placed], [at(SHOW.release), { ...placed, grip: OPEN }], [at(0.94), overSlot(k, OPEN)])
  }
  // Finale: the arm steps back into its ready pose, turned away towards the belt, so nothing covers the modules.
  const FINALE: Pose = { q: [deg(-110), ...READY.slice(1)], grip: OPEN }
  keys.push([featureTime(FEATURE_COUNT, 0), HOME], [TIMELINE.flash, FINALE], [TIMELINE.end, FINALE])

  const smooth = (x: number) => x * x * (3 - 2 * x)
  const current: Pose = { q: [...READY], grip: OPEN }
  function poseAt(t: number): Pose {
    if (t <= keys[0][0]) return keys[0][1]
    for (let i = 1; i < keys.length; i++) {
      const [t1, p1] = keys[i]
      if (t <= t1) {
        const [t0, p0] = keys[i - 1]
        const s = smooth(clamp01((t - t0) / Math.max(1e-6, t1 - t0)))
        for (let j = 0; j < 7; j++) current.q[j] = THREE.MathUtils.lerp(p0.q[j], p1.q[j], s)
        current.grip = THREE.MathUtils.lerp(p0.grip, p1.grip, s)
        return current
      }
    }
    return keys[keys.length - 1][1]
  }

  // Where a held module sits: its handle between the fingertips, its top towards the hand. (The tool frame is
  // in the robot's units, hence the division by its scale.)
  const graspOffset = new THREE.Matrix4()
    .makeTranslation(0, 0, GRIP_OFFSET / ROBOT_SCALE)
    .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
  const held = new THREE.Matrix4()
  const unitScale = new THREE.Vector3()
  function heldTransform(pose: Pose, position: THREE.Vector3, quaternion: THREE.Quaternion) {
    applyPose(pose)
    arm.updateMatrixWorld(true)
    held.multiplyMatrices(tcp.matrixWorld, graspOffset).decompose(position, quaternion, unitScale)
  }
  // Precomputed from the same kinematics, so pick-up and set-down happen without any jump.
  const pickPos = new THREE.Vector3()
  const pickQuat = new THREE.Quaternion()
  heldTransform(PICK, pickPos, pickQuat)
  const slotPos = SLOTS.map(() => new THREE.Vector3())
  const slotQuat = SLOTS.map(() => new THREE.Quaternion())
  placedPoses.forEach((pose, k) => heldTransform(pose, slotPos[k], slotQuat[k]))
  // Where each module is while the arm holds it up to the camera: the close-up looks at this point.
  const presentPos = SLOTS.map(() => new THREE.Vector3())
  presentPoses.forEach((pose, k) => heldTransform(pose, presentPos[k], new THREE.Quaternion()))

  // --- Stage ---
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
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
    return texture
  })()
  const floorGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 6),
    new THREE.MeshBasicMaterial({ map: glowTexture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  floorGlow.rotation.x = -Math.PI / 2
  floorGlow.position.y = -0.004 // below the base, so the two never fight for the same depth
  scene.add(floorGlow)

  const gridRings = new THREE.Group()
  for (let i = 1; i <= 5; i++) {
    const r = new THREE.Mesh(
      new THREE.RingGeometry(i * 0.55, i * 0.55 + 0.006, 512),
      new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.0 }),
    )
    r.rotation.x = -Math.PI / 2
    r.position.y = 0.002
    gridRings.add(r)
  }
  scene.add(gridRings)

  // Soft round sprite, so dust specks stay round instead of square at high resolution.
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
    const count = 1600
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const radius = 2 + Math.random() * 7
      const theta = Math.random() * Math.PI * 2
      positions.set([Math.cos(theta) * radius, Math.random() * 6 - 0.5, Math.sin(theta) * radius], i * 3)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xb4a5ff,
        size: 0.05,
        map: dotTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
  })()
  scene.add(dust)

  const key = new THREE.SpotLight(0xffffff, 8, 20, Math.PI / 5, 0.85)
  key.position.set(3, 6, 4)
  key.castShadow = true
  key.shadow.mapSize.set(4096, 4096)
  key.shadow.camera.near = 2
  key.shadow.camera.far = 14
  key.shadow.bias = -0.0002
  key.shadow.normalBias = 0.02
  key.shadow.radius = 6
  scene.add(key)
  // Invisible floor that only shows the arm's shadow, so it stands on the stage instead of floating.
  const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.ShadowMaterial({ opacity: 0.45 }))
  shadowFloor.rotation.x = -Math.PI / 2
  shadowFloor.position.y = -0.002
  shadowFloor.receiveShadow = true
  scene.add(shadowFloor)
  // Soft fill from the front so the white shell reads as a volume, not a silhouette.
  const fill = new THREE.DirectionalLight(0xdfe4ff, 0.6)
  fill.position.set(-2, 3, 5)
  scene.add(fill)
  const rimViolet = new THREE.PointLight(0x8b5cf6, 25, 10)
  rimViolet.position.set(-3, 2.5, -2)
  scene.add(rimViolet)
  const rimPink = new THREE.PointLight(0xec4899, 18, 10)
  rimPink.position.set(3, 1.5, -3)
  scene.add(rimPink)

  // No post-processing: the scene renders straight to the canvas (antialiased by the browser, tone-mapped in the
  // materials). Measured on an Intel Arc iGPU at 2530x1440: about 1-1.6 ms a frame this way, against 13 ms with
  // an effect chain and ambient occlusion, which alone cost more than a whole 120 Hz frame.

  // Render at the screen's own resolution (a 4K screen gets 4K), antialiased by the canvas's MSAA; rendering
  // above it costs frame rate for detail the screen cannot show. 1 = native; lowered if the GPU can't keep up.
  let quality = 1
  // Phones in portrait: pull back and centre so the belt and the pedestals both stay in frame.
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
    // Keep the whole arm in frame on portrait screens.
    portrait = w / h < 0.8
    camera.fov = portrait ? 52 : 36
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)
  // Development only: handles for profiling from the browser console.
  if (import.meta.env.DEV) {
    Object.assign(window, {
      __intro: { renderer, scene, camera, setQuality: (q: number) => ((quality = q), resize()) },
    })
  }

  // --- Animation ---
  const camPos = new THREE.Vector3()
  const closePos = new THREE.Vector3()
  const closeDir = new THREE.Vector3()
  const brandCentre = new THREE.Vector3()
  const brandDir = new THREE.Vector3()
  let brandSet = false
  const camLook = new THREE.Vector3()
  const finalePos = new THREE.Vector3()
  const finaleLook = new THREE.Vector3()
  // The clock starts at the first drawn frame, not at load, so shader compilation doesn't eat into the timeline.
  let startTime = performance.now()
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

  function tick(now: number) {
    if (!started) startTime = now
    adaptQuality(now)
    const wall = (now - startTime) / 1000
    const t = freezeAt ?? (getTime ? getTime() : wall)
    if (t !== shadowTime) {
      renderer.shadowMap.needsUpdate = true
      shadowTime = t
    }

    // Arm: eased between the show's keyframes (scroll-driven, so scrolling back rewinds it).
    applyPose(poseAt(t))
    arm.updateMatrixWorld(true)

    // Belt runs with the story; each module waits at the stopper, travels in the hand, then stays on display.
    beltTexture.offset.x = -(t * BELT_SPEED) / (beltLength / BELT_REPEAT)
    modules.forEach((m, k) => {
      const grabbed = featureTime(k, SHOW.grab)
      const released = featureTime(k, SHOW.release)
      if (t < grabbed) {
        const x = Math.min(0, (t - featureTime(k, SHOW.pick)) * BELT_SPEED)
        m.visible = x > BELT_LEFT + 0.12
        m.position.set(x, pickPos.y, pickPos.z)
        m.quaternion.copy(pickQuat)
      } else if (t < released) {
        m.visible = true
        held.multiplyMatrices(tcp.matrixWorld, graspOffset).decompose(m.position, m.quaternion, unitScale)
      } else {
        m.visible = true
        m.position.copy(slotPos[k])
        m.quaternion.copy(slotQuat[k])
      }
      pedestals[k].emissiveIntensity = clamp01((t - released) / 0.15) * 1.4
    })

    // Joint rings glow softly during the show, light up fully for the finale, then breathe.
    const ignite = clamp01((t - TIMELINE.ignite) / 0.5)
    const pulse = 1 + Math.sin(wall * 3) * 0.15
    // Coloured, never glowing: no bloom, and intensity stays low enough not to bleach the rings.
    for (const m of glowMaterials) m.emissiveIntensity = (0.45 + ignite * 0.65) * pulse

    const fadeIn = clamp01(t / 0.8 + 0.3)
    ;(dust.material as THREE.PointsMaterial).opacity = fadeIn * 0.7
    dust.rotation.y = wall * 0.04
    gridRings.children.forEach((r, i) => {
      const m = (r as THREE.Mesh).material as THREE.MeshBasicMaterial
      m.opacity = clamp01(t * 2 + 0.4 - i * 0.12) * (0.3 - i * 0.045)
    })
    // Kept low: the chain is HDR, and a bright additive floor washes the arm out.
    floorGlow.material.opacity = 0.18 + ignite * 0.22

    // Slow orbit and push-in, framing the belt (left) and the display pedestals (right).
    const orbit = orbitAt(t)
    const dist = (6.9 - easeInOut(clamp01(t / TIMELINE.end)) * 1.3) * (portrait ? 1.38 : 1)
    camPos.set(Math.sin(orbit) * dist, 2.3 - t * 0.04, Math.cos(orbit) * dist)
    camLook.set(portrait ? 0.4 : -0.35, 0.95, 0.3)
    // Opening shot: close on the FRANKA EMIKA lettering on the base, pulling back to the stage as the page scrolls.
    const opening = 1 - easeInOut(clamp01(t / 0.9))
    if (opening > 0 && brandMark) {
      if (!brandSet) {
        // The base carries the emblem plus FRANKA EMIKA twice, on either side; aim at the copy on the belt side
        // (around 270 degrees in the base's own frame), not at the middle of all three.
        const p = brandMark.geometry.attributes.position
        let n = 0
        brandCentre.set(0, 0, 0)
        for (let i = 0; i < p.count; i++) {
          const a = THREE.MathUtils.radToDeg(Math.atan2(p.getY(i), p.getX(i)))
          if (Math.abs((((a - 270) % 360) + 540) % 360 - 180) < 45) {
            brandCentre.x += p.getX(i)
            brandCentre.y += p.getY(i)
            brandCentre.z += p.getZ(i)
            n++
          }
        }
        brandMark.localToWorld(brandCentre.divideScalar(Math.max(1, n)))
        brandDir.copy(brandCentre).setY(0).normalize()
        brandSet = true
      }
      closePos.copy(brandCentre).addScaledVector(brandDir, portrait ? 1.5 : 1.05)
      closePos.y += 0.12
      camPos.lerp(closePos, opening)
      camLook.lerp(brandCentre, opening)
    }
    // While the arm holds a module up, the camera moves in close so its name fills the view.
    for (let k = 0; k < FEATURE_COUNT; k++) {
      const w = closeUpWeight(k, t)
      if (w <= 0) continue
      closeDir.copy(camPos).sub(presentPos[k]).setY(0).normalize()
      closePos.copy(presentPos[k]).addScaledVector(closeDir, portrait ? 2.6 : 1.8)
      closePos.y += 0.12
      camPos.lerp(closePos, w)
      camLook.lerp(presentPos[k], w)
    }
    // Finale: come round in front of the display so all four modules face the camera, readable.
    const toFinale = easeInOut(clamp01((t - featureTime(FEATURE_COUNT, 0)) / 1.0))
    if (toFinale > 0) {
      // Framed on the four modules, which sit just above the middle (clear of the logo below them); the robot
      // stands behind them.
      // As close as the screen's width allows with the whole row of modules (about 2.2 wide) in view:
      // wide screens get a closer, larger view of the labels.
      const halfWidthAngle = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect)
      const far = TABLE_DIST + Math.max(2.2, 1.1 / Math.tan(halfWidthAngle))
      camPos.lerp(finalePos.set(Math.sin(DISPLAY_DIR) * far, 0.42 + 0.42 * (far - 0.9), Math.cos(DISPLAY_DIR) * far), toFinale)
      camLook.lerp(finaleLook.set(Math.sin(DISPLAY_DIR) * 0.9, 0.42, Math.cos(DISPLAY_DIR) * 0.9), toFinale)
    }
    camera.position.copy(camPos)
    camera.lookAt(camLook)

    renderer.render(scene, camera)
    if (!active) {
      frame = 0
      return
    }
    // Reveal the stage only once the robot is on it.
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
    beltTexture.dispose()
    iconTextures.forEach((t) => t.dispose())
    grain.dispose()
    dotTexture.dispose()
    envTexture.dispose()
    studioTexture?.dispose()
    pmrem.dispose()
    renderer.dispose()
  }

  return { stop, setActive }
}
