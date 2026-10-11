import { shorelineExposureProfiles } from '../data/shorelineExposure.generated'
import type { ShorelineExposureProfile } from './forecast'

type ExposureProfile = {
  intervalDeg: number
  transmission: readonly number[]
}

const profiles = shorelineExposureProfiles as Record<string, ExposureProfile>
const normalizeDegrees = (value: number) => ((value % 360) + 360) % 360

/**
 * Interpolate the precomputed IHM natural + artificial coastline transmission profile.
 * A value of 1 is an unobstructed geographic path; values near 0 indicate that
 * most rays in the directional fan encounter a headland, island, or shore.
 */
export function getShorelineTransmission(
  spotSlug: string,
  bearingDeg: number | null,
  runtimeProfile?: ShorelineExposureProfile,
) {
  const profile = runtimeProfile ?? profiles[spotSlug]
  if (!profile || bearingDeg === null || profile.transmission.length === 0) return 1

  const normalizedBearing = normalizeDegrees(bearingDeg)
  const sectorPosition = normalizedBearing / profile.intervalDeg
  const lowerIndex = Math.floor(sectorPosition) % profile.transmission.length
  const upperIndex = (lowerIndex + 1) % profile.transmission.length
  const fraction = sectorPosition - Math.floor(sectorPosition)
  const lower = profile.transmission[lowerIndex]
  const upper = profile.transmission[upperIndex]
  return lower + (upper - lower) * fraction
}
