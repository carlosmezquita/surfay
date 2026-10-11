import { bathymetryTransferProfiles } from '../data/bathymetryTransfer.generated'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const lerp = (a: number, b: number, amount: number) => a + (b - a) * amount

type TransferProfile = (typeof bathymetryTransferProfiles)[keyof typeof bathymetryTransferProfiles]

function profileReliability(profile: TransferProfile) {
  const maximumTransmission = Math.max(...profile.heightCoefficients.flat())
  // A refraction-only stationary run cannot resolve energy diffracted around
  // a headland. If every computed direction is essentially zero, retain part
  // of the conservative geometric fallback instead of claiming false certainty.
  return maximumTransmission < 0.05 ? 0.65 : 1
}

export function hasBathymetryTransferProfile(spotSlug: string) {
  return spotSlug in bathymetryTransferProfiles
}

function interval(values: readonly number[], value: number) {
  if (value <= values[0]) return { low: 0, high: 0, amount: 0 }
  const last = values.length - 1
  if (value >= values[last]) return { low: last, high: last, amount: 0 }
  const high = values.findIndex((candidate) => candidate >= value)
  const low = high - 1
  return { low, high, amount: (value - values[low]) / (values[high] - values[low]) }
}

function interpolateGrid(
  profile: TransferProfile,
  grid: readonly (readonly number[])[],
  directionDeg: number,
  periodS: number,
) {
  const direction = interval(profile.directionsDeg, directionDeg)
  const period = interval(profile.periodsS, periodS)
  const lowPeriod = lerp(
    grid[period.low][direction.low],
    grid[period.low][direction.high],
    direction.amount,
  )
  const highPeriod = lerp(
    grid[period.high][direction.low],
    grid[period.high][direction.high],
    direction.amount,
  )
  return lerp(lowPeriod, highPeriod, period.amount)
}

/**
 * Return a validated SWAN height-transfer coefficient where a native-grid
 * table exists. A small taper outside the computed grid avoids a discontinuity
 * when the scoring engine falls back to shoreline geometry.
 */
export function getBathymetryTransfer(spotSlug: string, directionDeg: number, periodS: number) {
  const profile = (bathymetryTransferProfiles as Record<string, TransferProfile | undefined>)[spotSlug]
  if (!profile || !Number.isFinite(directionDeg) || !Number.isFinite(periodS)) return null

  const firstDirection = profile.directionsDeg[0]
  const lastDirection = profile.directionsDeg[profile.directionsDeg.length - 1]
  const centreDirection = (firstDirection + lastDirection) / 2
  let unwrappedDirection = ((directionDeg % 360) + 360) % 360
  while (unwrappedDirection - centreDirection > 180) unwrappedDirection -= 360
  while (centreDirection - unwrappedDirection > 180) unwrappedDirection += 360

  const directionOutside = Math.max(
    firstDirection - unwrappedDirection,
    unwrappedDirection - lastDirection,
    0,
  )
  const periodOutside = Math.max(
    profile.periodsS[0] - periodS,
    periodS - profile.periodsS[profile.periodsS.length - 1],
    0,
  )
  const directionMarginDeg = 15
  const periodMarginS = 2
  if (directionOutside >= directionMarginDeg || periodOutside >= periodMarginS) return null

  const sampledDirection = clamp(unwrappedDirection, firstDirection, lastDirection)
  const sampledPeriod = clamp(periodS, profile.periodsS[0], profile.periodsS[profile.periodsS.length - 1])
  const modelWeight = (1 - directionOutside / directionMarginDeg)
    * (1 - periodOutside / periodMarginS)
    * profileReliability(profile)
  return {
    heightCoefficient: interpolateGrid(
      profile,
      profile.heightCoefficients,
      sampledDirection,
      sampledPeriod,
    ),
    localDirectionDeg: interpolateGrid(
      profile,
      profile.localDirectionsDeg,
      sampledDirection,
      sampledPeriod,
    ),
    modelWeight,
  }
}
