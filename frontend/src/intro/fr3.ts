// Kinematics of the Franka Research 3 (FR3), from Franka's official description (franka_description,
// robots/fr3/kinematics.yaml and end_effectors/common/franka_hand.xacro, Apache-2.0). Lengths in metres,
// in the robot's own frame (z up, as in the URDF). The scene places and scales the robot with a base matrix.
import * as THREE from 'three'

/** Fixed transform from the previous link to each joint (URDF origin xyz / rpy), joint1..joint7. */
export const FR3_JOINTS: { xyz: [number, number, number]; rpy: [number, number, number] }[] = [
  { xyz: [0, 0, 0.333], rpy: [0, 0, 0] },
  { xyz: [0, 0, 0], rpy: [-Math.PI / 2, 0, 0] },
  { xyz: [0, -0.316, 0], rpy: [Math.PI / 2, 0, 0] },
  { xyz: [0.0825, 0, 0], rpy: [Math.PI / 2, 0, 0] },
  { xyz: [-0.0825, 0.384, 0], rpy: [-Math.PI / 2, 0, 0] },
  { xyz: [0, 0, 0], rpy: [Math.PI / 2, 0, 0] },
  { xyz: [0.088, 0, 0], rpy: [Math.PI / 2, 0, 0] },
]
/** Joint limits (rad), from robots/fr3/joint_limits.yaml. */
export const FR3_LIMITS: [number, number][] = [
  [-2.9007, 2.9007],
  [-1.8361, 1.8361],
  [-2.9007, 2.9007],
  [-3.077, -0.1169],
  [-2.8763, 2.8763],
  [0.4398, 4.6216],
  [-3.0508, 3.0508],
]
export const FLANGE_Z = 0.107 // joint7 -> flange
export const HAND_YAW = -Math.PI / 4 // the hand is mounted turned by -45 degrees
export const FINGER_Z = 0.0584 // hand -> finger joints
export const TCP_Z = 0.1034 // hand -> tool centre point, between the fingertips
export const FINGER_MAX = 0.04 // each finger travels 0..4 cm
/** Franka's "ready" pose: elbow up, hand pointing down in front of the robot. */
export const READY = [0, -Math.PI / 4, 0, (-3 * Math.PI) / 4, 0, Math.PI / 2, Math.PI / 4]

/** URDF origin as a matrix (rpy = fixed-axis roll, pitch, yaw = three.js Euler order ZYX). */
export function originMatrix(xyz: [number, number, number], rpy: [number, number, number]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...xyz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rpy[0], rpy[1], rpy[2], 'ZYX')),
    new THREE.Vector3(1, 1, 1),
  )
}

const JOINT_FRAMES = FR3_JOINTS.map((j) => originMatrix(j.xyz, j.rpy))
const FLANGE_TO_TCP = new THREE.Matrix4()
  .makeTranslation(0, 0, FLANGE_Z)
  .multiply(new THREE.Matrix4().makeRotationZ(HAND_YAW))
  .multiply(new THREE.Matrix4().makeTranslation(0, 0, TCP_Z))
const rot = new THREE.Matrix4()

/** Tool centre point pose for joint angles q, in the frame given by `base` (identity: robot frame). */
export function forward(q: number[], base = new THREE.Matrix4(), out = new THREE.Matrix4()) {
  out.copy(base)
  for (let i = 0; i < 7; i++) out.multiply(JOINT_FRAMES[i]).multiply(rot.makeRotationZ(q[i]))
  return out.multiply(FLANGE_TO_TCP)
}

// --- Inverse kinematics: damped least squares on position + orientation, Jacobian by finite differences ---

const pose = new THREE.Matrix4()
const probe = new THREE.Matrix4()
const pos = new THREE.Vector3()
const posProbe = new THREE.Vector3()
const quat = new THREE.Quaternion()
const quatProbe = new THREE.Quaternion()
const scl = new THREE.Vector3()

/** Rotation that takes `from` to `to`, as a rotation vector (axis * angle). */
function rotationError(to: THREE.Quaternion, from: THREE.Quaternion) {
  const d = to.clone().multiply(from.clone().invert())
  if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w) // shortest way round
  const s = Math.sqrt(1 - Math.min(1, d.w * d.w))
  const angle = 2 * Math.acos(Math.min(1, d.w))
  return s < 1e-9 ? new THREE.Vector3() : new THREE.Vector3(d.x / s, d.y / s, d.z / s).multiplyScalar(angle)
}

/** Solve A x = b for a small dense system (Gaussian elimination with partial pivoting). */
function solveLinear(A: number[][], b: number[]) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]
    x[r] = s / M[r][r]
  }
  return x
}

export interface IkResult {
  q: number[]
  positionError: number // in the units of `base`
  angleError: number // rad
}

/**
 * Joint angles that put the tool centre point at `position` with orientation `rotation` (in the frame of
 * `base`), starting from `seed`; stays within the joint limits. Close to the seed, so consecutive poses
 * solved from each other move the arm smoothly. `scale`: length of one metre in the units of `base`.
 */
export function inverse(
  position: THREE.Vector3,
  rotation: THREE.Quaternion,
  seed: number[],
  { base = new THREE.Matrix4(), scale = 1, iterations = 300 } = {},
): IkResult {
  const q = seed.map((v, i) => THREE.MathUtils.clamp(v, FR3_LIMITS[i][0] + 1e-3, FR3_LIMITS[i][1] - 1e-3))
  const h = 1e-5
  const lambda = 0.05
  let positionError = Infinity
  let angleError = Infinity
  for (let it = 0; it < iterations; it++) {
    forward(q, base, pose).decompose(pos, quat, scl)
    const ep = position.clone().sub(pos).divideScalar(scale) // metres, comparable to radians
    const er = rotationError(rotation, quat)
    positionError = ep.length() * scale
    angleError = er.length()
    if (positionError < 1e-4 * scale && angleError < 1e-4) break
    const e = [ep.x, ep.y, ep.z, er.x, er.y, er.z]
    // Jacobian columns: effect of a tiny turn of each joint.
    const J: number[][] = [[], [], [], [], [], []]
    for (let j = 0; j < 7; j++) {
      q[j] += h
      forward(q, base, probe).decompose(posProbe, quatProbe, scl)
      q[j] -= h
      const dp = posProbe.sub(pos).divideScalar(h * scale)
      const dr = rotationError(quatProbe, quat).divideScalar(h)
      ;[dp.x, dp.y, dp.z, dr.x, dr.y, dr.z].forEach((v, r) => (J[r][j] = v))
    }
    // dq = J^T (J J^T + lambda^2 I)^-1 e
    const JJt = J.map((ri, a) => J.map((rj, b) => ri.reduce((s, v, k) => s + v * rj[k], 0) + (a === b ? lambda * lambda : 0)))
    const y = solveLinear(JJt, e)
    for (let j = 0; j < 7; j++) {
      const step = J.reduce((s, row, r) => s + row[j] * y[r], 0)
      q[j] = THREE.MathUtils.clamp(q[j] + THREE.MathUtils.clamp(step, -0.3, 0.3), FR3_LIMITS[j][0] + 1e-3, FR3_LIMITS[j][1] - 1e-3)
    }
  }
  return { q, positionError, angleError }
}
