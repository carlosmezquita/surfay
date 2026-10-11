import { describe, expect, it } from 'vitest'
import { createProvisionalSpotProfile } from './spotDefaults'

describe('provisional spot defaults', () => {
  it('applies all defaults from a shared source', () => {
    const spot = createProvisionalSpotProfile({
      id: 'spot_test', slug: 'test-beach', name: 'Test Beach',
      province: 'A Coruña', municipality: 'Test', latitude: 43.5, longitude: -8.5,
    })

    expect(spot.calibrationStatus).toBe('provisional')
    expect(spot.preferredHeightM).toEqual([0.6, 1.8])
    expect(spot.preferredPeriodS).toEqual([8, 14.5])
    expect(spot.maxSafeHeightM).toBe(2.8)
    expect(spot.maximumUsefulPeriodS).toBe(20)
    expect(spot.tidePreference).toEqual({ min: 0, ideal: 0.5, max: 1 })
    expect(spot.tideConfidence).toBe(0)
    expect(spot.bathymetryConfidence).toBe(0)
    expect(spot.orientationConfidence).toBe(0.35)
    expect(spot.heightRangeConfidence).toBe(0.25)
    expect(spot.periodConfidence).toBe(0.35)
    expect(spot.shoreFacingDeg).toBeNull()
    expect(spot.idealSwellDeg).toBeNull()
    expect(spot.shorelineExposure).toBeUndefined()
    expect(spot.breakType).toBe('unknown')
    expect(spot.skillLevel).toBe('unknown')
    expect(spot.windSensitivity).toBe(1)
    expect(spot.strongOffshoreLimitKmh).toBe(32)
    expect(spot.closeoutSensitivity).toBe(1)
    expect(spot.unresolvedDiffractionFloor).toBe(0.05)
    expect(spot.profileSources.shoreFacingDeg).toBe('default')
    expect(spot.profileSources.idealSwellDeg).toBe('default')
    expect(spot.profileSources.preferredHeightM).toBe('default')
  })

  it('uses provided identity fields', () => {
    const spot = createProvisionalSpotProfile({
      id: 'spot_xyz', slug: 'my-spot', name: 'My Spot',
      province: 'Pontevedra', municipality: 'Vigo', latitude: 42.24, longitude: -8.72,
    })

    expect(spot.id).toBe('spot_xyz')
    expect(spot.slug).toBe('my-spot')
    expect(spot.name).toBe('My Spot')
    expect(spot.province).toBe('Pontevedra')
    expect(spot.municipality).toBe('Vigo')
    expect(spot.latitude).toBe(42.24)
    expect(spot.longitude).toBe(-8.72)
  })
})

