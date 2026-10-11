export type ShorelineLayer = 'natural' | 'artificial' | 'low_water'
export type ShorelineTileSegment = [number, number, number, number, number, ShorelineLayer]

export type ShorelineManifest = {
  datasetVersion: string
  tileSizeDeg: number
  dataBounds: [number, number, number, number]
  tiles: string[]
}

const ROOT = '/shoreline/ihm-lc-composite-v3'
let manifestPromise: Promise<ShorelineManifest> | null = null
const tileCache = new Map<string, Promise<ShorelineTileSegment[]>>()

async function loadManifest() {
  manifestPromise ??= fetch(`${ROOT}/manifest.json`).then((response) => {
    if (!response.ok) throw new Error('Could not load the IHM shoreline manifest')
    return response.json() as Promise<ShorelineManifest>
  }).catch((error) => {
    manifestPromise = null
    throw error
  })
  return manifestPromise
}

export function nearbyTileNames(manifest: ShorelineManifest, latitude: number, longitude: number, radius = 1) {
  const centreX = Math.floor((longitude - manifest.dataBounds[0]) / manifest.tileSizeDeg)
  const centreY = Math.floor((latitude - manifest.dataBounds[1]) / manifest.tileSizeDeg)
  const available = new Set(manifest.tiles)
  const names: string[] = []
  for (let x = centreX - radius; x <= centreX + radius; x += 1) {
    for (let y = centreY - radius; y <= centreY + radius; y += 1) {
      const name = `${x}_${y}.json`
      if (available.has(name)) names.push(name)
    }
  }
  return names
}

async function loadTile(version: string, name: string) {
  const key = `${version}/${name}`
  let pending = tileCache.get(key)
  if (!pending) {
    pending = fetch(`/shoreline/${version}/${name}`).then((response) => {
      if (!response.ok) throw new Error(`Could not load shoreline tile ${name}`)
      return response.json() as Promise<ShorelineTileSegment[]>
    }).catch((error) => {
      tileCache.delete(key)
      throw error
    })
    tileCache.set(key, pending)
  }
  return pending
}

export async function loadNearbyShoreline(latitude: number, longitude: number) {
  const manifest = await loadManifest()
  const names = nearbyTileNames(manifest, latitude, longitude)
  const unique = new Map<number, ShorelineTileSegment>()
  for (const segments of await Promise.all(names.map((name) => loadTile(manifest.datasetVersion, name)))) {
    for (const segment of segments) unique.set(segment[0], segment)
  }
  return { segments: [...unique.values()], attribution: 'IHM COALNE + SLCONS + DEPCNT · CC BY 4.0' }
}

