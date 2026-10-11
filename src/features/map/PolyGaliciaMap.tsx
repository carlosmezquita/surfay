import { useEffect, useRef } from 'react'
import * as THREE from 'three'

type PolyGaliciaMapProps = {
  zoom: number
}

const LAND_COLUMNS = 56
const LAND_ROWS = 40
const X_MIN = -15
const X_MAX = 15
const Z_MIN = -9
const Z_MAX = 9

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function coastZ(x: number) {
  return -1.15 + x * 0.23 + Math.sin((x + 2.4) * 0.58) * 0.82 + Math.sin(x * 1.35) * 0.18
}

function isLand(x: number, z: number) {
  return z > coastZ(x)
}

function heightAt(x: number, z: number) {
  const distanceFromCoast = clamp(z - coastZ(x), 0, 8)
  const ridgeOne = Math.exp(-((x + 7.5) ** 2 + (z + 4.9) ** 2) / 18) * 2.05
  const ridgeTwo = Math.exp(-((x - 1.5) ** 2 + (z + 1.8) ** 2) / 28) * 1.55
  const ridgeThree = Math.exp(-((x - 7.2) ** 2 + (z - 2.9) ** 2) / 16) * 1.65
  const facets = Math.sin(x * 1.7 + z * 0.8) * 0.24 + Math.sin((x - z) * 0.9) * 0.18

  return 0.12 + Math.pow(distanceFromCoast, 0.68) * 0.19 + ridgeOne + ridgeTwo + ridgeThree + facets
}

function terrainColor(height: number, x: number, z: number) {
  const low = new THREE.Color('#53615d')
  const mid = new THREE.Color('#8f988e')
  const high = new THREE.Color('#e5e6da')
  const color = new THREE.Color()
  const t = clamp(height / 4.25, 0, 1)

  if (t < 0.55) {
    color.lerpColors(low, mid, t / 0.55)
  } else {
    color.lerpColors(mid, high, (t - 0.55) / 0.45)
  }

  color.multiplyScalar(0.86 + Math.sin(x * 2.1 + z * 1.3) * 0.15)
  return color
}

function pushVertex(positions: number[], colors: number[], x: number, z: number) {
  const y = heightAt(x, z)
  const color = terrainColor(y, x, z)

  positions.push(x, y, z)
  colors.push(color.r, color.g, color.b)
}

function createLandGeometry() {
  const positions: number[] = []
  const colors: number[] = []
  const cellWidth = (X_MAX - X_MIN) / LAND_COLUMNS
  const cellDepth = (Z_MAX - Z_MIN) / LAND_ROWS

  for (let row = 0; row < LAND_ROWS; row += 1) {
    for (let col = 0; col < LAND_COLUMNS; col += 1) {
      const x0 = X_MIN + col * cellWidth
      const x1 = x0 + cellWidth
      const z0 = Z_MIN + row * cellDepth
      const z1 = z0 + cellDepth
      const centerX = (x0 + x1) / 2
      const centerZ = (z0 + z1) / 2

      if (!isLand(centerX, centerZ)) continue

      pushVertex(positions, colors, x0, z0)
      pushVertex(positions, colors, x1, z0)
      pushVertex(positions, colors, x0, z1)

      pushVertex(positions, colors, x1, z0)
      pushVertex(positions, colors, x1, z1)
      pushVertex(positions, colors, x0, z1)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  return geometry
}

function createCoastCurve(offset = 0, lift = 0.08) {
  const points: THREE.Vector3[] = []

  for (let i = 0; i <= 92; i += 1) {
    const t = i / 92
    const x = X_MIN + (X_MAX - X_MIN) * t
    const z = coastZ(x) + offset + Math.sin(i * 0.27 + offset) * 0.05
    points.push(new THREE.Vector3(x, lift, z))
  }

  return new THREE.CatmullRomCurve3(points)
}

function createContourLines(scene: THREE.Scene) {
  const lineMaterial = new THREE.LineBasicMaterial({
    color: '#143d49',
    transparent: true,
    opacity: 0.38,
  })

  for (let offset = -8.4; offset <= -0.8; offset += 0.55) {
    const points: THREE.Vector3[] = []

    for (let i = 0; i <= 104; i += 1) {
      const t = i / 104
      const x = X_MIN + (X_MAX - X_MIN) * t
      const z = coastZ(x) + offset + Math.sin(x * 0.95 + offset * 1.8) * 0.24
      points.push(new THREE.Vector3(x, -0.18, z))
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const contour = new THREE.Line(geometry, lineMaterial)
    scene.add(contour)
  }
}

export function PolyGaliciaMap({ zoom }: PolyGaliciaMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const zoomRef = useRef(zoom)

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#294f5d')
    scene.fog = new THREE.Fog('#294f5d', 14, 34)

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80)
    camera.position.set(0, 8.6, 13.2)
    camera.lookAt(0, 0.35, 0)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.setClearColor('#294f5d')
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.domElement.className = 'poly-map-canvas'
    container.appendChild(renderer.domElement)

    const root = new THREE.Group()
    root.rotation.y = -0.18
    root.rotation.x = -0.02
    root.rotation.z = -0.1
    scene.add(root)

    const oceanGeometry = new THREE.PlaneGeometry(36, 24, 1, 1)
    const oceanMaterial = new THREE.MeshStandardMaterial({
      color: '#294f5d',
      roughness: 0.82,
      metalness: 0.05,
    })
    const ocean = new THREE.Mesh(oceanGeometry, oceanMaterial)
    ocean.rotation.x = -Math.PI / 2
    ocean.position.y = -0.24
    root.add(ocean)

    const landGeometry = createLandGeometry()
    const landMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.92,
      metalness: 0.02,
      side: THREE.DoubleSide,
      emissive: '#2d3133',
      emissiveIntensity: 0.12,
    })
    const land = new THREE.Mesh(landGeometry, landMaterial)
    land.position.y = 0.08
    root.add(land)

    const coastGlow = new THREE.Mesh(
      new THREE.TubeGeometry(createCoastCurve(0.09, 0.11), 120, 0.28, 8, false),
      new THREE.MeshBasicMaterial({
        color: '#9feffe',
        transparent: true,
        opacity: 0.2,
      }),
    )
    root.add(coastGlow)

    const coastSand = new THREE.Mesh(
      new THREE.TubeGeometry(createCoastCurve(0.02, 0.13), 120, 0.085, 8, false),
      new THREE.MeshBasicMaterial({
        color: '#e4ddc6',
      }),
    )
    root.add(coastSand)

    createContourLines(root as unknown as THREE.Scene)

    scene.add(new THREE.HemisphereLight('#e9fbff', '#1e3841', 2.2))
    const keyLight = new THREE.DirectionalLight('#ffffff', 2.8)
    keyLight.position.set(-6, 10, 6)
    scene.add(keyLight)

    const rimLight = new THREE.DirectionalLight('#69e5ff', 1.4)
    rimLight.position.set(9, 4, -5)
    scene.add(rimLight)

    const pointer = { x: 0, y: 0 }
    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      pointer.x = (event.clientX - rect.left) / rect.width - 0.5
      pointer.y = (event.clientY - rect.top) / rect.height - 0.5
    }

    const resize = () => {
      const width = Math.max(1, container.clientWidth)
      const height = Math.max(1, container.clientHeight)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(container)
    container.addEventListener('pointermove', handlePointerMove)
    resize()

    const clock = new THREE.Clock()
    renderer.setAnimationLoop(() => {
      const elapsed = clock.getElapsedTime()
      const targetZoom = clamp(zoomRef.current, 0.9, 1.35)
      const targetZ = 13.2 / targetZoom
      const targetY = 8.6 / Math.sqrt(targetZoom)

      camera.position.z += (targetZ - camera.position.z) * 0.06
      camera.position.y += (targetY - camera.position.y) * 0.06
      camera.lookAt(0, 0.35, 0)

      root.rotation.y = -0.18 + pointer.x * 0.06
      root.rotation.x = -0.02 + pointer.y * 0.025
      root.position.y = Math.sin(elapsed * 0.28) * 0.025

      renderer.render(scene, camera)
    })

    return () => {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      container.removeEventListener('pointermove', handlePointerMove)

      scene.traverse((object) => {
        const mesh = object as THREE.Mesh
        mesh.geometry?.dispose()

        const material = mesh.material
        if (Array.isArray(material)) {
          material.forEach((item) => item.dispose())
        } else {
          material?.dispose()
        }
      })

      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [])

  return <div ref={containerRef} className="absolute inset-0 overflow-hidden" aria-hidden="true" />
}
