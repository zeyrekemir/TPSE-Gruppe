// Converts Franka's official FR3 visual meshes (Collada, from github.com/frankaemika/franka_description,
// Apache-2.0) into one compact glTF file for the welcome animation: frontend/public/models/fr3.glb
//
//   node tools/convert_franka.mjs <path to franka_description checkout>
//
// Run from the repository root; uses three and jsdom from frontend/node_modules.
// Each link becomes one node (link0..link7, hand, finger) in its own link frame, with one mesh per CAD
// colour (named <link>_c<r>_<g>_<b>) so the scene can give each its material.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(resolve('frontend/package.json'))
const { JSDOM } = require('jsdom')
const window = new JSDOM('').window
globalThis.DOMParser = window.DOMParser
globalThis.FileReader = window.FileReader
globalThis.Blob = window.Blob

// The ES module build, the same copy the example modules import, so `instanceof` checks agree.
const threeDir = resolve('frontend/node_modules/three')
const load = (path) => import(pathToFileURL(join(threeDir, path)).href)
const THREE = await load('build/three.module.js')
const { ColladaLoader } = await load('examples/jsm/loaders/ColladaLoader.js')
const { GLTFExporter } = await load('examples/jsm/exporters/GLTFExporter.js')
const { mergeGeometries, mergeVertices } = await load('examples/jsm/utils/BufferGeometryUtils.js')

const source = process.argv[2]
if (!source) throw new Error('usage: node tools/convert_franka.mjs <franka_description dir>')

const files = {
  link0: 'meshes/robots/fr3/visual/link0.dae',
  link1: 'meshes/robots/fr3/visual/link1.dae',
  link2: 'meshes/robots/fr3/visual/link2.dae',
  link3: 'meshes/robots/fr3/visual/link3.dae',
  link4: 'meshes/robots/fr3/visual/link4.dae',
  link5: 'meshes/robots/fr3/visual/link5.dae',
  link6: 'meshes/robots/fr3/visual/link6.dae',
  link7: 'meshes/robots/fr3/visual/link7.dae',
  hand: 'meshes/robot_ee/franka_hand_white/visual/hand.dae',
  finger: 'meshes/robot_ee/franka_hand_white/visual/finger.dae',
}

/**
 * A part's CAD colour as a key like "c202_209_238", taken from the material name Franka's exporter writes
 * ("..._color_202_209_238-material"). Every colour stays its own mesh, so lettering, status lights and
 * buttons keep their look; the scene gives each colour a material.
 */
function look(material) {
  const m = /color_(\d+)_(\d+)_(\d+)/.exec(material.name ?? '')
  if (m) return `c${m[1]}_${m[2]}_${m[3]}`
  const c = material.color ?? new THREE.Color(1, 1, 1)
  return `c${[c.r, c.g, c.b].map((v) => Math.round(v * 255)).join('_')}`
}

const out = new THREE.Scene()
let triangles = 0
for (const [name, file] of Object.entries(files)) {
  const text = readFileSync(join(source, file), 'utf8')
  const collada = new ColladaLoader().parse(text, '')
  const root = collada.scene
  // ColladaLoader converts Z-up files to three's Y-up; undo that so every mesh stays in its URDF link frame.
  root.rotation.set(0, 0, 0)
  root.updateMatrixWorld(true)
  const groups = {}
  root.traverse((o) => {
    if (!o.isMesh) return
    const materials = Array.isArray(o.material) ? o.material : [o.material]
    const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld)
    const parts = geometry.groups.length && materials.length > 1 ? geometry.groups : [{ start: 0, count: Infinity, materialIndex: 0 }]
    for (const part of parts) {
      const kind = look(materials[part.materialIndex ?? 0])
      let piece = geometry.index ? geometry.toNonIndexed() : geometry
      if (parts.length > 1) {
        const count = Math.min(part.count, piece.attributes.position.count - part.start)
        const sub = new THREE.BufferGeometry()
        for (const [key, attr] of Object.entries(piece.attributes)) {
          sub.setAttribute(key, new THREE.BufferAttribute(attr.array.slice(part.start * attr.itemSize, (part.start + count) * attr.itemSize), attr.itemSize))
        }
        piece = sub
      }
      for (const key of Object.keys(piece.attributes)) if (key !== 'position' && key !== 'normal') piece.deleteAttribute(key)
      if (!piece.attributes.normal) piece.computeVertexNormals()
      ;(groups[kind] ??= []).push(piece)
    }
  })
  const node = new THREE.Group()
  node.name = name
  for (const [kind, pieces] of Object.entries(groups)) {
    const merged = mergeVertices(mergeGeometries(pieces), 1e-5)
    triangles += merged.index.count / 3
    const m = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ name: kind }))
    m.name = `${name}_${kind}`
    node.add(m)
  }
  out.add(node)
  console.log(name, Object.fromEntries(Object.entries(node.children).map(([, m]) => [m.name, m.geometry.index.count / 3])))
}

const glb = await new GLTFExporter().parseAsync(out, { binary: true })
mkdirSync('frontend/public/models', { recursive: true })
writeFileSync('frontend/public/models/fr3.glb', Buffer.from(glb))
console.log(`triangles: ${triangles}, size: ${(glb.byteLength / 1e6).toFixed(1)} MB`)
