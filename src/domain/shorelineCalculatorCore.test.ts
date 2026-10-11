import { describe, expect, it } from 'vitest'
import { calculateExposureProfile, type ShorelineConstants, type ShorelineSegment } from './shorelineCalculatorCore'
import { spotInputFingerprint } from './spotAdmin'

const constants: ShorelineConstants = {
  datasetVersion: 'synthetic-unit-fixture', referenceLatitude: 43,
  rawBearingStepDeg: 5, sectorStepDeg: 10, fanHalfWidthDeg: 0,
  seawardHalfWidthDeg: 90, traceOriginOffsetM: 100, localIgnoreM: 50,
  maxTraceM: 90_000, blockedTransmission: 0.08,
}
const spot = { latitude: 43, longitude: -8, shoreFacingDeg: 0 }
const metresPerDegree = 111_320
const lonMetres = metresPerDegree * Math.cos(43 * Math.PI / 180)
const horizontal = (id: number, metresNorth: number): ShorelineSegment => [id,
  spot.longitude - 1000 / lonMetres, spot.latitude + metresNorth / metresPerDegree,
  spot.longitude + 1000 / lonMetres, spot.latitude + metresNorth / metresPerDegree]

describe('shoreline ray geometry', () => {
  it('leaves open seaward rays open and masks the landward half-plane', () => {
    const result = calculateExposureProfile(spot, [], constants)
    expect(result.transmission[0]).toBe(1)
    expect(result.transmission[18]).toBe(0.08)
    expect(result.inputFingerprint).toBe(spotInputFingerprint(spot))
  })
  it('detects a blocking shore and retains its distance from the seaward origin', () => {
    const result = calculateExposureProfile(spot, [horizontal(1, 1100)], constants)
    expect(result.transmission[0]).toBe(0.08)
    expect(result.nearestObstacleKm?.[0]).toBe(1)
    expect(result.transmission[9]).toBe(1)
  })
  it('ignores local geometry and obstacles outside the trace radius', () => {
    const result = calculateExposureProfile(spot, [horizontal(1, 125), horizontal(2, 100_000)], constants)
    expect(result.transmission[0]).toBe(1)
  })
})
