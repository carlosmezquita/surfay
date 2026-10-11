import { describe, expect, it } from 'vitest'
import { shorelineExposureProfiles } from '../data/shorelineExposure.generated'
import { surfSpots } from '../data/spots'
import type { SpotProfile } from './forecast'
import { deriveSwellParameters, normalizeSlug, SHORELINE_DATASET_VERSION, spotInputFingerprint, validExposure, validateSpotDraft } from './spotAdmin'

function draftOf(spot: SpotProfile) {
  const { id, ...draft } = spot
  void id
  return draft
}

describe('admin spot validation', () => {
  it('accepts every seeded spot', () => {
    for (const spot of surfSpots) expect(validateSpotDraft(draftOf(spot))).toEqual({ valid: true, errors: {} })
  })

  it('normalizes public slugs and rejects unsafe model ranges', () => {
    expect(normalizeSlug('  A Lanzáda / Norte ')).toBe('a-lanzada-norte')
    const spot = draftOf(surfSpots[0])
    expect(validateSpotDraft({ ...spot, latitude: 50, preferredHeightM: [2, 1] }).valid).toBe(false)
  })

  it('binds exposure profiles to their geometry inputs', () => {
    const spot = draftOf(surfSpots[0])
    const profile = {
      ...shorelineExposureProfiles[spot.slug as keyof typeof shorelineExposureProfiles],
      datasetVersion: SHORELINE_DATASET_VERSION, inputFingerprint: spotInputFingerprint(spot),
    }
    expect(validExposure(profile, spot)).toBe(true)
    expect(validExposure(profile, { ...spot, shoreFacingDeg: spot.shoreFacingDeg! + 1 })).toBe(false)
  })

  it('derives a bounded swell entry and window from COALNE exposure', () => {
    const profile = shorelineExposureProfiles.pantin
    const derived = deriveSwellParameters(profile)
    expect(derived.idealSwellDeg).toBeGreaterThanOrEqual(0)
    expect(derived.idealSwellDeg).toBeLessThan(360)
    expect(derived.swellWindowDeg).toBeGreaterThanOrEqual(20)
    expect(derived.swellWindowDeg).toBeLessThanOrEqual(180)
  })

  it('still selects the most open sector for strongly sheltered spots', () => {
    const profile = {
      ...shorelineExposureProfiles.matadero,
      transmission: shorelineExposureProfiles.matadero.transmission.map((value) => Math.min(value, 0.49)),
    }
    const derived = deriveSwellParameters(profile)
    expect(derived).toEqual({ idealSwellDeg: 290, swellWindowDeg: 40 })
    expect(deriveSwellParameters(shorelineExposureProfiles.orzan)).toEqual({ idealSwellDeg: 310, swellWindowDeg: 60 })
  })
})


describe('untrusted spot payloads', () => {
  it.each([null, [], 'spot', 123])('rejects non-object drafts: %s', (input) => {
    expect(validateSpotDraft(input).valid).toBe(false)
  })

  it('rejects missing provenance, invalid statuses and non-finite model ranges', () => {
    const draft = draftOf(surfSpots[0])
    for (const patch of [{ profileSources: null }, { calibrationStatus: 'epic' },
      { preferredPeriodS: [8, Infinity] }, { periodConfidence: 2 }, { windSensitivity: -1 },
      { shoreFacingDeg: undefined }, { cameraUrl: 'https://user:password@example.com' }]) {
      expect(validateSpotDraft({ ...draft, ...patch }).valid).toBe(false)
    }
  })
})
