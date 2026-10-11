import type { SpotProfile, SpotProfileSources } from './forecast'

export const PROVISIONAL_SPOT_DEFAULTS = {
  swellWindowDeg: 70,

  preferredHeightM: [0.6, 1.8] as [number, number],
  maxSafeHeightM: 2.8,

  preferredPeriodS: [8, 14.5] as [number, number],
  maximumUsefulPeriodS: 20,

  tidePreference: {
    min: 0,
    ideal: 0.5,
    max: 1,
  },

  windSensitivity: 1,
  strongOffshoreLimitKmh: 32,

  closeoutSensitivity: 1,
  unresolvedDiffractionFloor: 0.05,

  breakType: 'unknown' as const,
  skillLevel: 'unknown' as const,

  orientationConfidence: 0.35,
  heightRangeConfidence: 0.25,
  periodConfidence: 0.35,
  tideConfidence: 0,
  bathymetryConfidence: 0,

  calibrationStatus: 'provisional' as const,
}

export const PROVISIONAL_PROFILE_SOURCES: SpotProfileSources = {
  shoreFacingDeg: 'default',
  idealSwellDeg: 'default',
  swellWindowDeg: 'default',
  preferredHeightM: 'default',
  preferredPeriodS: 'default',
  tidePreference: 'default',
  closeoutSensitivity: 'default',
}

export function createProvisionalSpotProfile(
  input: {
    id: string
    slug: string
    name: string
    province: string
    municipality: string
    latitude: number
    longitude: number
  },
): SpotProfile {
  return {
    ...input,
    ...PROVISIONAL_SPOT_DEFAULTS,

    shoreFacingDeg: null,
    idealSwellDeg: null,
    shorelineExposure: undefined,
    cameraUrl: undefined,
    profileSources: { ...PROVISIONAL_PROFILE_SOURCES },
  }
}
