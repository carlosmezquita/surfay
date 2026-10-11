import type { ShorelineExposureProfile } from './forecast'
import type { SpotDraft } from './spotAdmin'
import { spotInputFingerprint } from './spotAdmin'

export type ShorelineSegment = [number, number, number, number, number]
export type ShorelineConstants = {
  datasetVersion: string; referenceLatitude: number; rawBearingStepDeg: number; sectorStepDeg: number
  fanHalfWidthDeg: number; seawardHalfWidthDeg: number; traceOriginOffsetM: number; localIgnoreM: number
  maxTraceM: number; blockedTransmission: number
}
type GeometrySpot = Pick<SpotDraft, 'latitude' | 'longitude' | 'shoreFacingDeg'>
const METRES_PER_LATITUDE_DEGREE = 111_320
const normalize = (value: number) => ((value % 360) + 360) % 360
const angularDifference = (first: number, second: number) => 180 - Math.abs(Math.abs(normalize(first) - normalize(second)) - 180)
const cross = (first: [number, number], second: [number, number]) => first[0] * second[1] - first[1] * second[0]

export function calculateExposureProfile(
  spot: GeometrySpot,
  segments: ShorelineSegment[],
  constants: ShorelineConstants,
  onRay?: (bearing: number) => void,
): ShorelineExposureProfile {
  const longitudeMetres = METRES_PER_LATITUDE_DEGREE * Math.cos(constants.referenceLatitude * Math.PI / 180)
  const projected = segments.map((segment) => ({
    start: [(segment[1] - spot.longitude) * longitudeMetres, (segment[2] - spot.latitude) * METRES_PER_LATITUDE_DEGREE] as [number, number],
    end: [(segment[3] - spot.longitude) * longitudeMetres, (segment[4] - spot.latitude) * METRES_PER_LATITUDE_DEGREE] as [number, number],
  }))
  const shoreFacingDeg = spot.shoreFacingDeg
  if (shoreFacingDeg === null) {
    return {
      intervalDeg: constants.sectorStepDeg,
      shoreFacingDeg: 0,
      transmission: new Array(360 / constants.sectorStepDeg).fill(constants.blockedTransmission) as number[],
      datasetVersion: constants.datasetVersion,
      inputFingerprint: spotInputFingerprint({ ...spot, shoreFacingDeg: 0 }),
    } as ShorelineExposureProfile
  }
  const shoreNormalRadians = shoreFacingDeg * Math.PI / 180
  const origin: [number, number] = [
    Math.sin(shoreNormalRadians) * constants.traceOriginOffsetM,
    Math.cos(shoreNormalRadians) * constants.traceOriginOffsetM,
  ]
  const firstIntersection = (bearing: number) => {
    const radians = bearing * Math.PI / 180
    const direction: [number, number] = [Math.sin(radians), Math.cos(radians)]
    let nearest: number | null = null
    for (const segment of projected) {
      const vector: [number, number] = [segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]]
      const denominator = cross(direction, vector)
      if (Math.abs(denominator) < 1e-9) continue
      const originToStart: [number, number] = [segment.start[0] - origin[0], segment.start[1] - origin[1]]
      const rayDistance = cross(originToStart, vector) / denominator
      const segmentFraction = cross(originToStart, direction) / denominator
      if (rayDistance <= constants.localIgnoreM || rayDistance > constants.maxTraceM || segmentFraction < -1e-9 || segmentFraction > 1.000000001) continue
      if (nearest === null || rayDistance < nearest) nearest = rayDistance
    }
    return nearest
  }
  const rays = new Map<number, [number, number, number | null]>()
  for (let bearing = 0; bearing < 360; bearing += constants.rawBearingStepDeg) {
    if (angularDifference(bearing, shoreFacingDeg) > constants.seawardHalfWidthDeg) {
      rays.set(bearing, [constants.blockedTransmission, 0, 0])
    } else {
      const distance = firstIntersection(bearing)
      rays.set(bearing, [distance === null ? 1 : constants.blockedTransmission, distance === null ? 1 : 0, distance])
    }
    onRay?.(bearing)
  }
  const transmission: number[] = []; const openFraction: number[] = []; const nearestObstacleKm: Array<number | null> = []
  for (let sector = 0; sector < 360; sector += constants.sectorStepDeg) {
    const samples: Array<[number, number, number | null]> = []
    for (let offset = -constants.fanHalfWidthDeg; offset <= constants.fanHalfWidthDeg; offset += constants.rawBearingStepDeg) samples.push(rays.get(normalize(sector + offset))!)
    transmission.push(Math.round(samples.reduce((sum, item) => sum + item[0], 0) / samples.length * 100) / 100)
    openFraction.push(Math.round(samples.reduce((sum, item) => sum + item[1], 0) / samples.length * 100) / 100)
    const distances = samples.map((item) => item[2]).filter((item): item is number => item !== null)
    nearestObstacleKm.push(distances.length ? Math.round(Math.min(...distances) / 100) / 10 : null)
  }
  return {
    intervalDeg: constants.sectorStepDeg, shoreFacingDeg, transmission, openFraction,
    nearestObstacleKm, datasetVersion: constants.datasetVersion, inputFingerprint: spotInputFingerprint(spot),
  }
}
