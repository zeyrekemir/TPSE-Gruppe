import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { forward, FR3_LIMITS, inverse, READY } from '../intro/fr3'

const position = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(m)
const rotation = (m: THREE.Matrix4) => new THREE.Quaternion().setFromRotationMatrix(m)

describe('FR3 kinematics', () => {
  it('puts the hand where Franka documents it in the ready pose', () => {
    // Ready pose: hand 30.7 cm in front of the base, 48.7 cm high, pointing straight down.
    const tcp = forward(READY)
    const p = position(tcp)
    expect(p.x).toBeCloseTo(0.307, 3)
    expect(p.y).toBeCloseTo(0, 3)
    expect(p.z).toBeCloseTo(0.4869, 3)
    const toolAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation(tcp))
    expect(toolAxis.z).toBeCloseTo(-1, 3)
  })

  it('finds joint angles for reachable poses, within the joint limits', () => {
    // Targets made from known joint angles, so they are reachable; solved from the ready pose.
    const samples = [
      [0.4, -0.2, 0.1, -2.0, 0.2, 1.9, 0.5],
      [-1.0, 0.3, -0.2, -1.5, -0.3, 1.4, -0.4],
      [1.6, -0.6, 0.4, -2.4, 0.5, 2.2, 1.2],
    ]
    for (const sample of samples) {
      const target = forward(sample)
      const { q, positionError, angleError } = inverse(position(target), rotation(target), READY)
      expect(positionError).toBeLessThan(1e-3)
      expect(angleError).toBeLessThan(1e-3)
      q.forEach((v, i) => {
        expect(v).toBeGreaterThanOrEqual(FR3_LIMITS[i][0])
        expect(v).toBeLessThanOrEqual(FR3_LIMITS[i][1])
      })
    }
  })

  it('works in a scaled, rotated scene frame', () => {
    // As in the welcome scene: z-up robot in a y-up world, 3.6x larger.
    const base = new THREE.Matrix4().makeRotationX(-Math.PI / 2).scale(new THREE.Vector3(3.6, 3.6, 3.6))
    const target = forward([0.2, 0.1, 0, -1.8, 0, 1.9, 0.8], base)
    const { positionError, angleError } = inverse(position(target), rotation(target), READY, { base, scale: 3.6 })
    expect(positionError).toBeLessThan(3.6e-3)
    expect(angleError).toBeLessThan(1e-3)
  })
})
