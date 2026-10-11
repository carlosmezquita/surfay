import type { SpotDraft } from '../domain/spotAdmin'
import { calculateExposureProfile, type ShorelineSegment } from '../domain/shorelineCalculatorCore'

type Segment = ShorelineSegment
type TileSegment = [number, number, number, number, number, 'natural' | 'artificial' | 'low_water']
type Manifest = {
  datasetVersion: string; tileSizeDeg: number; dataBounds: [number, number, number, number]
  spotBounds: [number, number, number, number]; referenceLatitude: number; rawBearingStepDeg: number
  sectorStepDeg: number; fanHalfWidthDeg: number; seawardHalfWidthDeg: number; traceOriginOffsetM: number
  localIgnoreM: number; maxTraceM: number; blockedTransmission: number; tiles: string[]; calculationLayers: string[]
}
type GeometrySpot = Pick<SpotDraft, 'latitude' | 'longitude' | 'shoreFacingDeg'>
type RequestMessage = { type: 'calculate'; requestId: string; spot: GeometrySpot }

const METRES_PER_LATITUDE_DEGREE = 111_320
const send = (requestId: string, payload: Record<string, unknown>) => self.postMessage({ requestId, ...payload })

async function calculate(requestId: string, spot: GeometrySpot) {
  send(requestId, { type: 'progress', progress: 0.03, stage: 'manifest' })
  const manifestResponse = await fetch('/shoreline/ihm-lc-composite-v3/manifest.json')
  if (!manifestResponse.ok) throw new Error('Could not load the IHM shoreline manifest')
  const manifest = await manifestResponse.json() as Manifest
  const [minLon, minLat, maxLon, maxLat] = manifest.spotBounds
  if (spot.longitude < minLon || spot.longitude > maxLon || spot.latitude < minLat || spot.latitude > maxLat) {
    throw new Error('The spot is outside the supported IHM coastline coverage')
  }

  const longitudeMetres = METRES_PER_LATITUDE_DEGREE * Math.cos(manifest.referenceLatitude * Math.PI / 180)
  const lonMargin = manifest.maxTraceM / longitudeMetres
  const latMargin = manifest.maxTraceM / METRES_PER_LATITUDE_DEGREE
  const tileX1 = Math.floor((spot.longitude - lonMargin - manifest.dataBounds[0]) / manifest.tileSizeDeg)
  const tileX2 = Math.floor((spot.longitude + lonMargin - manifest.dataBounds[0]) / manifest.tileSizeDeg)
  const tileY1 = Math.floor((spot.latitude - latMargin - manifest.dataBounds[1]) / manifest.tileSizeDeg)
  const tileY2 = Math.floor((spot.latitude + latMargin - manifest.dataBounds[1]) / manifest.tileSizeDeg)
  const available = new Set(manifest.tiles)
  const names: string[] = []
  for (let x = tileX1; x <= tileX2; x += 1) for (let y = tileY1; y <= tileY2; y += 1) {
    const name = `${x}_${y}.json`; if (available.has(name)) names.push(name)
  }
  const unique = new Map<number, Segment>()
  for (let index = 0; index < names.length; index += 1) {
    const response = await fetch(`/shoreline/${manifest.datasetVersion}/${names[index]}`)
    if (!response.ok) throw new Error(`Could not load shoreline tile ${names[index]}`)
    for (const segment of await response.json() as TileSegment[]) {
      if (manifest.calculationLayers.includes(segment[5])) unique.set(segment[0], segment.slice(0, 5) as Segment)
    }
    send(requestId, { type: 'progress', progress: 0.05 + (index + 1) / Math.max(1, names.length) * 0.45, stage: 'tiles' })
  }
  const profile = calculateExposureProfile(spot, [...unique.values()], manifest, (bearing) => {
    send(requestId, { type: 'progress', progress: 0.5 + (bearing + manifest.rawBearingStepDeg) / 360 * 0.48, stage: 'rays' })
  })
  send(requestId, { type: 'complete', progress: 1, profile })
}

self.onmessage = (event: MessageEvent<RequestMessage>) => {
  if (event.data.type !== 'calculate') return
  void calculate(event.data.requestId, event.data.spot).catch((error: unknown) => {
    send(event.data.requestId, { type: 'error', error: error instanceof Error ? error.message : 'Exposure calculation failed' })
  })
}
