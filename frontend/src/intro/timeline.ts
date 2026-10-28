// Timeline of the welcome story, in "scene seconds". The 3D scene and the text overlay both read it,
// so captions land exactly on what is being built.
//
// Story: an empty assembly platform under an overhead crane. Joint by joint, the Franka Research 3 is built: first
// the drive inside (motor, gears, bearing), filmed as close as a watch movement, then the crane lowers the housing
// over it; four assembly stages bring the four features. The finished robot
// then powers up, moves for the first time, and the logo appears.

export const FEATURE_COUNT = 4

export const TIMELINE = {
  featuresStart: 0.6, // assembly stage k runs from featuresStart + k to featuresStart + k + 1
  assembled: 4.6, // the last part is in place
  ignite: 4.9, // status lights and joint rings come on: the robot is alive
  flash: 5.5, // the logo lands
  end: 6.6, // first moves done, camera at rest
} as const

export const featureTime = (k: number, phase: number) => TIMELINE.featuresStart + k + phase

/** The robot's parts in assembly order: names of the nodes in Franka's model (public/models/fr3.glb). */
export const PARTS = ['link0', 'link1', 'link2', 'link3', 'link4', 'link5', 'link6', 'link7', 'hand'] as const
/** Which parts each assembly stage (one per feature) puts on: base and shoulder, arm, forearm and wrist, flange and hand. */
export const STAGES: number[][] = [[0, 1], [2, 3], [4, 5], [6, 7, 8]]

/** Scene seconds given to part p: its drive is built first, then its housing is lowered over it. */
function partSlot(p: number): [number, number] {
  const k = STAGES.findIndex((stage) => stage.includes(p))
  const stage = STAGES[k]
  const slot = 0.84 / stage.length
  return [featureTime(k, 0.02 + stage.indexOf(p) * slot), slot]
}

/** Scene seconds in which the drive inside joint p (motor, gears, bearing) is put together, close up. */
export function driveWindow(p: number): [number, number] {
  const [start, slot] = partSlot(p)
  return [start, start + slot * 0.4]
}

/** Scene seconds in which part p's housing is lowered by the crane: [hooked on, seated]. */
export function partWindow(p: number): [number, number] {
  const [start, slot] = partSlot(p)
  return [start + slot * 0.5, start + slot * 0.9]
}

/** After a part seats: sparks and a ring of light at the joint for this long. */
export const SEAT_GLOW = 0.3

/** Scene time at which the PEARL logo and wordmark appear: the intro's one sound plays here. */
export const LOGO_AT = TIMELINE.ignite + 0.2

/** True when the story passes the logo moment going forward (scrolling back stays silent). */
export const logoReached = (from: number, to: number) => from < LOGO_AT && LOGO_AT <= to

// --- Scroll progress p (0..1 across the pinned section) -> scene time, and the text beats ---

// [progress, scene seconds] keyframes; linear in between. Most of the scroll belongs to the four assembly stages.
export const SCENE_KEYS: [number, number][] = [
  [0.0, 0],
  [0.05, TIMELINE.featuresStart], // short opening: the empty platform
  [0.84, TIMELINE.assembled], // the four stages, about 0.2 of the scroll each
  [1.0, TIMELINE.end], // the robot comes alive, logo
]

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

export function sceneTimeAt(p: number) {
  for (let i = 1; i < SCENE_KEYS.length; i++) {
    const [p0, t0] = SCENE_KEYS[i - 1]
    const [p1, t1] = SCENE_KEYS[i]
    if (p <= p1) return t0 + (t1 - t0) * clamp01((p - p0) / (p1 - p0))
  }
  return SCENE_KEYS[SCENE_KEYS.length - 1][1]
}

/** Inverse of sceneTimeAt. */
export function progressAt(t: number) {
  for (let i = 1; i < SCENE_KEYS.length; i++) {
    const [p0, t0] = SCENE_KEYS[i - 1]
    const [p1, t1] = SCENE_KEYS[i]
    if (t <= t1) return p0 + (p1 - p0) * clamp01((t - t0) / (t1 - t0))
  }
  return 1
}

// Text beats: [from, to] in progress. Each fades in/out over FADE at its edges.
// A feature caption shows while its stage's parts are being put on: from just after the stage's first part is
// hooked on until its last part has seated.
export const FADE = 0.03
const caption = (k: number) => [progressAt(featureTime(k, 0.06)), progressAt(featureTime(k, 0.99))] as const

export const BEATS = {
  hero: [0, progressAt(TIMELINE.featuresStart - 0.05)],
  f1: caption(0),
  f2: caption(1),
  f3: caption(2),
  f4: caption(3),
  lockup: [progressAt(LOGO_AT), progressAt(6.1)],
  cta: [progressAt(6.1), 1.01],
} as const
export type Beat = keyof typeof BEATS

/** 0 outside the beat, 1 inside it, linear ramps of width FADE at both ends. */
export function beatOpacity(p: number, [from, to]: readonly [number, number]) {
  const fadeIn = from <= 0 ? 1 : clamp01((p - from) / FADE)
  const fadeOut = to >= 1 ? 1 : clamp01((to - p) / FADE)
  return Math.min(fadeIn, fadeOut)
}
