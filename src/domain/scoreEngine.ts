import type {
  ConfidenceLevel,
  ForecastReason,
  ForecastSource,
  RatingConstraint,
  RawForecastHour,
  ScoredForecastHour,
  SpotProfile,
  SurfScore,
} from './forecast'
import { getBathymetryTransfer, hasBathymetryTransferProfile } from './bathymetryTransfer'
import { getShorelineTransmission } from './shorelineExposure'
import { wavePowerKwPerM } from './wavePower'

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))

function interpolateCap(
  value: number,
  start: number,
  end: number,
  startCap: number,
  endCap: number,
) {
  if (value <= start) return startCap
  if (value >= end) return endCap

  const amount = (value - start) / (end - start)
  return startCap + (endCap - startCap) * amount
}

type QualityState = {
  quality: number
  ratingConstraint: RatingConstraint
}

function applyQualityCap(
  state: QualityState,
  maximumQuality: number,
  constraint: RatingConstraint,
): QualityState {
  if (state.quality <= maximumQuality) return state
  return { quality: maximumQuality, ratingConstraint: constraint ?? state.ratingConstraint }
}

const WEAK_PERIOD_MAX_S = 6.5
const WEAK_POWER_MAX_KW_M = 3.5
const WEAK_SURF_QUALITY_CAP = 0.44
const MINIMUM_GOOD_PERIOD_S = 8
const SHORT_PERIOD_QUALITY_CAP = 0.64

export function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360
}

export function angularDifference(a: number, b: number) {
  return 180 - Math.abs(Math.abs(normalizeDegrees(a) - normalizeDegrees(b)) - 180)
}

function interpolateBearing(from: number, to: number, amount: number) {
  const signedDifference = ((to - from + 540) % 360) - 180
  return normalizeDegrees(from + signedDifference * amount)
}

export function directionToCompass(degrees: number | null) {
  if (degrees === null) return '—'
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return directions[Math.round(normalizeDegrees(degrees) / 45) % directions.length]
}

function smoothRangeScore(value: number, minimum: number, idealLow: number, idealHigh: number, maximum: number) {
  if (value <= minimum || value >= maximum) return 0
  if (value >= idealLow && value <= idealHigh) return 1
  if (value < idealLow) return clamp((value - minimum) / Math.max(0.01, idealLow - minimum))
  return clamp((maximum - value) / Math.max(0.01, maximum - idealHigh))
}

/**
 * `preferredHeightM` is the locally surfable interval, not a flat guarantee
 * of excellent surf. Its lower edge therefore starts as merely worthwhile;
 * the middle of the interval is the prime band. This prevents 0.45 m and
 * 1.0 m from receiving identical height marks at a small beach break.
 */
function surfHeightScore(profile: SpotProfile, value: number) {
  const [preferredMin, preferredMax] = profile.preferredHeightM
  const span = preferredMax - preferredMin
  const viableMin = Math.max(0.08, preferredMin * 0.3)
  const primeLow = preferredMin + span * 0.35
  const primeHigh = preferredMin + span * 0.7
  const upperLimit = Math.max(profile.maxSafeHeightM * 1.1, preferredMax + 0.1)

  if (value <= viableMin || value >= upperLimit) return 0
  if (value < preferredMin) return 0.6 * (value - viableMin) / (preferredMin - viableMin)
  if (value < primeLow) return 0.6 + 0.4 * (value - preferredMin) / (primeLow - preferredMin)
  if (value <= primeHigh) return 1
  if (value <= preferredMax) return 1 - 0.2 * (value - primeHigh) / (preferredMax - primeHigh)
  if (value <= profile.maxSafeHeightM) {
    return 0.8 - 0.35 * (value - preferredMax) / Math.max(0.01, profile.maxSafeHeightM - preferredMax)
  }
  return 0.45 * (upperLimit - value) / Math.max(0.01, upperLimit - profile.maxSafeHeightM)
}

function flatSurfThreshold(profile: SpotProfile, periodS: number) {
  const periodFactor = periodS < 6 ? 0.5 : periodS < 8 ? 0.42 : periodS < 12 ? 0.35 : 0.3
  return Math.max(0.15, profile.preferredHeightM[0] * periodFactor)
}

type WavePartition = {
  kind: 'primary' | 'secondary' | 'tertiary' | 'wind-wave' | 'residual'
  heightM: number
  directionDeg: number
  periodS: number
}

function directionalExposure(profile: SpotProfile, directionDeg: number) {
  if (profile.idealSwellDeg === null) return { difference: 45, transmission: 0.45 }
  const difference = angularDifference(directionDeg, profile.idealSwellDeg)
  const fullExposureUntil = Math.max(12, profile.swellWindowDeg * 0.35)
  return {
    difference,
    transmission: difference <= fullExposureUntil
      ? 1
      : clamp(1 - (difference - fullExposureUntil) / (112 - fullExposureUntil)),
  }
}

/**
 * Build a non-overlapping approximation of the offshore wave spectrum.
 * Significant heights combine by energy (H²), not by adding metres. Any
 * energy present in total Hs but absent from the provider's partitions is
 * retained as a residual partition using the total-wave direction/period.
 */
function wavePartitions(hour: RawForecastHour) {
  const partitions: WavePartition[] = []
  const add = (
    kind: WavePartition['kind'],
    heightM: number | null | undefined,
    directionDeg: number | null | undefined,
    periodS: number | null | undefined,
  ) => {
    if (heightM === null || heightM === undefined || heightM <= 0 || directionDeg === null || directionDeg === undefined) return
    partitions.push({ kind, heightM, directionDeg, periodS: periodS ?? 0 })
  }

  add('primary', hour.swellHeightM, hour.swellDirectionDeg ?? hour.waveDirectionDeg, hour.swellPeriodS ?? hour.wavePeriodS)
  add('secondary', hour.secondarySwellHeightM, hour.secondarySwellDirectionDeg, hour.secondarySwellPeriodS)
  add('tertiary', hour.tertiarySwellHeightM, hour.tertiarySwellDirectionDeg, hour.tertiarySwellPeriodS)
  add('wind-wave', hour.windWaveHeightM, hour.windWaveDirectionDeg, hour.windWavePeriodS)

  const totalEnergy = Math.max(0, hour.waveHeightM ?? 0) ** 2
  const partitionEnergy = partitions.reduce((sum, partition) => sum + partition.heightM ** 2, 0)
  if (totalEnergy > 0 && partitionEnergy > totalEnergy) {
    const scale = Math.sqrt(totalEnergy / partitionEnergy)
    partitions.forEach((partition) => { partition.heightM *= scale })
  } else if (totalEnergy - partitionEnergy > 0.01) {
    add('residual', Math.sqrt(totalEnergy - partitionEnergy), hour.waveDirectionDeg, hour.wavePeriodS)
  }
  if (!partitions.length) add('residual', hour.waveHeightM, hour.waveDirectionDeg, hour.wavePeriodS)
  return partitions
}

function scoreSwell(profile: SpotProfile, hour: RawForecastHour) {
  const transformed = wavePartitions(hour).map((partition) => {
    const incidence = directionalExposure(profile, partition.directionDeg)
    const shorelineTransmission = getShorelineTransmission(
      profile.slug,
      partition.directionDeg,
      profile.shorelineExposure,
    )
    const hasShorelineProfile = profile.shorelineExposure !== undefined
    const geographicExposure = hasShorelineProfile
      ? Math.min(incidence.transmission, shorelineTransmission)
      : Math.min(incidence.transmission * 0.65, shorelineTransmission)
    // The fallback keeps a conservative unresolved-diffraction floor. Where a
    // reviewed native-grid SWAN table exists, its refraction/shoaling height
    // coefficient replaces that approximation with a tapered boundary.
    const fallbackHeightCoefficient = 0.12 + geographicExposure * 0.88
    const bathymetry = getBathymetryTransfer(
      profile.slug,
      partition.directionDeg,
      partition.periodS,
    )
    const heightCoefficient = bathymetry
      ? fallbackHeightCoefficient + (bathymetry.heightCoefficient - fallbackHeightCoefficient) * bathymetry.modelWeight
      : fallbackHeightCoefficient
    const effectiveHeightM = partition.heightM * clamp(heightCoefficient, 0, 1.5)
    const effectiveDirectionDeg = bathymetry
      ? interpolateBearing(partition.directionDeg, bathymetry.localDirectionDeg, bathymetry.modelWeight)
      : partition.directionDeg
    return {
      ...partition,
      directionDifference: incidence.difference,
      exposure: clamp(heightCoefficient),
      shorelineTransmission,
      bathymetryModelWeight: bathymetry?.modelWeight ?? 0,
      effectiveDirectionDeg,
      offshoreEnergy: partition.heightM ** 2,
      effectiveHeightM,
      effectiveEnergy: effectiveHeightM ** 2,
    }
  })
  const offshoreEnergy = transformed.reduce((sum, partition) => sum + partition.offshoreEnergy, 0)
  const effectiveEnergy = transformed.reduce((sum, partition) => sum + partition.effectiveEnergy, 0)
  const effectiveHeightM = Math.sqrt(effectiveEnergy)
  const effectiveWeight = effectiveEnergy || offshoreEnergy || 1
  const offshoreWeight = offshoreEnergy || 1
  const exposure = transformed.reduce((sum, partition) => sum + partition.exposure * partition.effectiveEnergy, 0) / effectiveWeight
  const shorelineTransmission = transformed.reduce(
    (sum, partition) => sum + partition.shorelineTransmission * partition.offshoreEnergy,
    0,
  ) / offshoreWeight
  const bathymetryCoverage = transformed.reduce(
    (sum, partition) => sum + partition.bathymetryModelWeight * partition.offshoreEnergy,
    0,
  ) / offshoreWeight
  const period = transformed.reduce((sum, partition) => sum + partition.periodS * partition.effectiveEnergy, 0) / effectiveWeight
  const dominant = transformed.reduce<(typeof transformed)[number] | null>(
    (winner, partition) => !winner || partition.effectiveEnergy > winner.effectiveEnergy ? partition : winner,
    null,
  )
  const effectiveDirectionDeg = dominant?.effectiveDirectionDeg ?? null
  const directionDifference = dominant?.directionDifference ?? 100
  const heightScore = surfHeightScore(profile, effectiveHeightM)
  const periodScore = smoothRangeScore(period, 4.5, 9.5, 16.5, 22)
  // H²T is proportional to deep-water energy flux and is used only as a
  // conservative feasibility proxy here. The height threshold relaxes for
  // longer-period energy and scales with the spot's locally calibrated range.
  const waveEnergyProxy = effectiveHeightM ** 2 * period
  const isFlat = effectiveHeightM < 0.12
    || (effectiveHeightM < flatSurfThreshold(profile, period) && waveEnergyProxy < 0.7)

  let consistencyPenalty = 0
  if (dominant && dominant.effectiveHeightM > 0) {
    for (const partition of transformed) {
      if (partition === dominant) continue
      const spread = angularDifference(dominant.directionDeg, partition.directionDeg)
      const heightRatio = partition.effectiveHeightM / dominant.effectiveHeightM
      consistencyPenalty += Math.max(0, spread - 35) / 145 * Math.min(0.65, heightRatio)
    }
  }
  const consistency = clamp(1 - consistencyPenalty)

  // Surf potential is conjunctive: usable size, period, exposure and a clean
  // spectrum all have to be present. A weighted geometric mean makes a weak
  // physical component a bottleneck instead of letting another one erase it.
  const score = Math.pow(heightScore, 0.42)
    * Math.pow(periodScore, 0.24)
    * Math.pow(exposure, 0.24)
    * Math.pow(consistency, 0.1)

  const wavePowerKwM = wavePowerKwPerM(effectiveHeightM, period > 0 ? period : null)

  return {
    score,
    exposure,
    shorelineTransmission,
    bathymetryCoverage,
    heightScore,
    periodScore,
    isFlat,
    consistency,
    effectiveHeightM,
    effectiveDirectionDeg,
    directionDifference,
    period,
    wavePowerKwM,
  }
}

type WindScore = {
  score: number
  impact: ScoredForecastHour['windImpact']
  difference: number
  available: boolean
}

function scoreWind(profile: SpotProfile, hour: RawForecastHour): WindScore {
  if (hour.windDirectionDeg === null || hour.windSpeedKmh === null || profile.shoreFacingDeg === null) {
    return { score: 0.45, impact: 'variable' as const, difference: 90, available: false }
  }

  const idealOffshoreFrom = normalizeDegrees(profile.shoreFacingDeg + 180)
  const difference = angularDifference(hour.windDirectionDeg, idealOffshoreFrom)
  let directionScore: number
  let impact: ScoredForecastHour['windImpact'] = 'onshore'

  if (difference <= 30) {
    directionScore = 1
    impact = 'offshore'
  } else if (difference <= 65) {
    directionScore = 0.84
    impact = 'cross-offshore'
  } else if (difference <= 105) {
    directionScore = 0.58
    impact = 'cross-shore'
  } else if (difference <= 145) {
    directionScore = 0.28
    impact = 'cross-onshore'
  } else {
    directionScore = 0.05
  }

  const directionalInfluence = clamp((hour.windSpeedKmh - 4) / 22)
  let score = 0.9 * (1 - directionalInfluence) + directionScore * directionalInfluence
  if (difference < 65 && hour.windSpeedKmh > 34) score *= clamp(1 - (hour.windSpeedKmh - 34) / 55, 0.55, 1)
  if (difference > 105 && hour.windSpeedKmh > 28) score *= clamp(1 - (hour.windSpeedKmh - 28) / 35, 0.3, 1)

  return { score: clamp(score), impact, difference, available: true }
}

type TideScore = {
  score: number
  available: boolean
}

function scoreTide(profile: SpotProfile, hour: RawForecastHour): TideScore {
  if (hour.tideNormalized === null) return { score: 0.55, available: false }
  const { min, ideal, max } = profile.tidePreference
  const calculated = smoothRangeScore(hour.tideNormalized, Math.max(0, min - 0.16), ideal - 0.1, ideal + 0.1, Math.min(1, max + 0.16))
  const blended = 0.55 + (calculated - 0.55) * profile.tideConfidence
  return {
    score: clamp(blended),
    available: true,
  }
}

function getConfidence(
  profile: SpotProfile,
  hour: RawForecastHour,
  source: ForecastSource,
  horizonHours: number,
  shorelineTransmission: number,
  bathymetryCoverage: number,
) {
  const required = [
    hour.waveHeightM,
    hour.waveDirectionDeg,
    hour.wavePeriodS,
    hour.windSpeedKmh,
    hour.windDirectionDeg,
    hour.tideHeightMslM,
  ]
  const completeness = required.filter((value) => value !== null).length / required.length
  const sourceConfidence = source === 'open-meteo' ? 0.88 : source === 'cache' ? 0.8 : 0.42
  const horizonConfidence = clamp(0.96 - Math.max(0, horizonHours - 18) * 0.0034, 0.48, 0.96)
  let confidence = clamp(
    sourceConfidence * 0.32 + horizonConfidence * 0.28 + completeness * 0.22 + profile.orientationConfidence * 0.18,
  )
  // A low line-of-sight value remains sensitive to unresolved diffraction and
  // local calibration even where the reviewed refraction table is available.
  // Do not label those protected-ría forecasts as high confidence yet.
  if (shorelineTransmission < 0.25) {
    confidence = Math.min(confidence, bathymetryCoverage >= 0.65 ? 0.74 : 0.66)
  } else if (shorelineTransmission < 0.5) {
    confidence = Math.min(confidence, bathymetryCoverage >= 0.65 ? 0.78 : 0.7)
  }
  if (hasBathymetryTransferProfile(profile.slug) && bathymetryCoverage < 0.45) {
    confidence = Math.min(confidence, 0.7)
  }
  return confidence
}

function confidenceLevel(value: number): ConfidenceLevel {
  if (value >= 0.78) return 'high'
  if (value >= 0.6) return 'medium'
  return 'low'
}

type QualityResult = {
  score: SurfScore
  ratingConstraint: RatingConstraint
}

function qualityToScore(
  quality: number,
  profile: SpotProfile,
  swell: ReturnType<typeof scoreSwell>,
  wind: WindScore,
  tide: TideScore,
  hourWindSpeed: number | null,
  confidence: number,
): QualityResult {
  if (swell.isFlat) return { score: 0, ratingConstraint: null }

  const hasCompleteSurfaceData = wind.available && tide.available
  const hasAcceptableWind =
    !(wind.impact === 'onshore' && (hourWindSpeed ?? 0) >= 12) &&
    !(wind.impact === 'cross-onshore' && (hourWindSpeed ?? 0) >= 22) &&
    !(wind.difference <= 30 && (hourWindSpeed ?? 0) >= profile.strongOffshoreLimitKmh)
  const hasUsefulHeight =
    swell.effectiveHeightM >= profile.preferredHeightM[0] &&
    swell.effectiveHeightM <= profile.maxSafeHeightM

  const hasGoodPeriod =
    swell.period >= MINIMUM_GOOD_PERIOD_S

  const eligibleForGood =
    hasCompleteSurfaceData &&
    hasAcceptableWind &&
    hasUsefulHeight &&
    hasGoodPeriod

  const eligibleForEpic =
    quality >= 0.85 &&
    eligibleForGood &&
    swell.heightScore >= 0.90 &&
    swell.periodScore >= 0.82 &&
    swell.exposure >= 0.75 &&
    swell.consistency >= 0.85 &&
    wind.score >= 0.80 &&
    tide.score >= 0.65

  const hasShelteredCoverage = (!hasBathymetryTransferProfile(profile.slug) || swell.bathymetryCoverage >= 0.65)
    && (swell.shorelineTransmission >= 0.55 || swell.bathymetryCoverage >= 0.65)

  if (quality < 0.25) return { score: 1, ratingConstraint: null }
  if (quality < 0.45) return { score: 2, ratingConstraint: null }
  if (quality < 0.65) return { score: 3, ratingConstraint: null }
  if (quality < 0.85) return eligibleForGood ? { score: 4, ratingConstraint: null } : { score: 3, ratingConstraint: null }

  if (confidence < 0.78) {
    return eligibleForGood
      ? { score: 4, ratingConstraint: null }
      : { score: 3, ratingConstraint: null }
  }

  return eligibleForEpic && hasShelteredCoverage
    ? { score: profile.calibrationStatus === 'geography-reviewed' ? 4 : 5, ratingConstraint: null }
    : eligibleForGood
      ? { score: 4, ratingConstraint: null }
      : { score: 3, ratingConstraint: null }
}

function buildReasons(
  profile: SpotProfile,
  hour: RawForecastHour,
  swell: ReturnType<typeof scoreSwell>,
  wind: WindScore,
  tide: TideScore,
) {
  const reasons: ForecastReason[] = []
  if (swell.isFlat) reasons.push({ kind: 'negative', key: 'flatSurf' })

  const localIsWeak = !swell.isFlat && swell.period > 0 && swell.wavePowerKwM !== null && swell.period <= WEAK_PERIOD_MAX_S && swell.wavePowerKwM < WEAK_POWER_MAX_KW_M
  const localShortBlocksGood = !swell.isFlat && swell.period > 0 && swell.period < MINIMUM_GOOD_PERIOD_S

  if (localIsWeak) {
    reasons.push({ kind: 'negative', key: 'weakWindSea' })
  } else if (localShortBlocksGood) {
    reasons.push({ kind: 'negative', key: 'shortPeriod' })
  }

  if (swell.exposure >= 0.82) reasons.push({ kind: 'positive', key: 'directSwell' })
  else if (swell.exposure >= 0.48) reasons.push({ kind: 'neutral', key: 'angledSwell' })
  else reasons.push({ kind: 'negative', key: 'shadowedSwell' })

  if (!wind.available) {
    reasons.push({ kind: 'negative', key: 'missingWind' })
  } else if (hour.windSpeedKmh! <= 6) {
    reasons.push({ kind: 'positive', key: 'lightWind' })
  } else if (wind.impact === 'offshore' || wind.impact === 'cross-offshore') {
    reasons.push(
      wind.difference <= 30 && (hour.windSpeedKmh ?? 0) >= profile.strongOffshoreLimitKmh
        ? { kind: 'negative', key: 'strongOffshoreWind' }
        : { kind: 'positive', key: 'offshoreWind' },
    )
  } else if (wind.impact === 'cross-shore') {
    reasons.push({ kind: 'neutral', key: 'crossWind' })
  } else {
    reasons.push({ kind: 'negative', key: 'onshoreWind' })
  }

  if (!tide.available) {
    reasons.push({ kind: 'negative', key: 'missingTide' })
  } else if (profile.tideConfidence === 0) {
    reasons.push({ kind: 'neutral', key: 'unknownTide' })
  } else if (tide.score >= 0.72) {
    reasons.push({ kind: 'positive', key: 'goodTide' })
  } else if (tide.score < 0.38) {
    reasons.push({ kind: 'negative', key: 'poorTide' })
  }

  if (swell.effectiveHeightM < profile.preferredHeightM[0] * 0.72) reasons.push({ kind: 'negative', key: 'smallSurf' })
  if (swell.effectiveHeightM > profile.maxSafeHeightM) reasons.push({ kind: 'negative', key: 'largeSurf' })
  if (swell.period >= 13) reasons.push({ kind: 'positive', key: 'longPeriod' })
  if (swell.consistency < 0.82) reasons.push({ kind: 'neutral', key: 'mixedSwell' })

  if (profile.calibrationStatus === 'provisional') {
    reasons.push({ kind: 'negative', key: 'provisionalProfile' })
  }
  if (profile.shoreFacingDeg === null) {
    reasons.push({ kind: 'neutral', key: 'unknownOrientation' })
  }
  if (profile.bathymetryConfidence === 0) {
    reasons.push({ kind: 'neutral', key: 'missingBathymetry' })
  }
  if (profile.profileSources.preferredHeightM === 'default') {
    reasons.push({ kind: 'neutral', key: 'genericHeightRange' })
  }
  if (profile.profileSources.preferredPeriodS === 'default') {
    reasons.push({ kind: 'neutral', key: 'genericPeriodRange' })
  }

  return reasons.slice(0, 4)
}

export function scoreForecastHour(
  profile: SpotProfile,
  hour: RawForecastHour,
  source: ForecastSource,
  generatedAt: string,
): ScoredForecastHour {
  const swell = scoreSwell(profile, hour)
  const wind = scoreWind(profile, hour)
  const tide = scoreTide(profile, hour)
  const gustFactor = hour.windGustKmh === null || hour.windSpeedKmh === null
    ? 0.55
    : clamp(1 - Math.max(0, hour.windGustKmh - hour.windSpeedKmh - 8) / 35)
  const surfaceModifier = 0.58 + wind.score * 0.25 + tide.score * 0.10 + gustFactor * 0.07
  let quality = swell.score * surfaceModifier
  const ratingConstraint: RatingConstraint = null

  if (swell.isFlat) quality = 0

  let qualityState: QualityState = { quality, ratingConstraint }

  const isWeakShortPeriodSea =
    !swell.isFlat &&
    swell.wavePowerKwM !== null &&
    swell.period <= WEAK_PERIOD_MAX_S &&
    swell.wavePowerKwM < WEAK_POWER_MAX_KW_M

  const shortPeriodBlocksGood =
    !swell.isFlat &&
    swell.period > 0 &&
    swell.period < MINIMUM_GOOD_PERIOD_S

  if (isWeakShortPeriodSea) {
    qualityState = applyQualityCap(qualityState, WEAK_SURF_QUALITY_CAP, 'weak-short-period')
  } else if (shortPeriodBlocksGood) {
    qualityState = applyQualityCap(qualityState, SHORT_PERIOD_QUALITY_CAP, 'short-period')
  }

  if (swell.effectiveHeightM < 0.25) qualityState = applyQualityCap(qualityState, 0.25, null)
  else if (swell.effectiveHeightM < profile.preferredHeightM[0] * 0.72) qualityState = applyQualityCap(qualityState, 0.44, null)
  else if (swell.effectiveHeightM < profile.preferredHeightM[0]) qualityState = applyQualityCap(qualityState, 0.6, null)
  if (swell.effectiveHeightM > profile.maxSafeHeightM) qualityState = applyQualityCap(qualityState, 0.54, null)

  const isDirectOnshore = wind.available && wind.difference >= 145
  const isCrossOnshore = wind.available && wind.difference > 105 && wind.difference < 145
  const isOffshore = wind.available && wind.difference <= 30

  if (isDirectOnshore && hour.windSpeedKmh !== null) {
    if (hour.windSpeedKmh >= 28) {
      qualityState = applyQualityCap(qualityState, 0.44, 'direct-onshore')
    } else if (hour.windSpeedKmh >= 20) {
      qualityState = applyQualityCap(qualityState, interpolateCap(hour.windSpeedKmh, 20, 28, 0.59, 0.44), 'direct-onshore')
    } else if (hour.windSpeedKmh >= 12) {
      qualityState = applyQualityCap(qualityState, interpolateCap(hour.windSpeedKmh, 12, 20, 0.71, 0.59), 'direct-onshore')
    }
  }

  if (isCrossOnshore && hour.windSpeedKmh !== null && hour.windSpeedKmh >= 22) {
    const cap = interpolateCap(hour.windSpeedKmh, 22, 34, 0.69, 0.52)
    qualityState = applyQualityCap(qualityState, cap, 'cross-onshore')
  }

  if (isOffshore && hour.windSpeedKmh !== null && hour.windSpeedKmh >= profile.strongOffshoreLimitKmh) {
    const cap = interpolateCap(hour.windSpeedKmh, profile.strongOffshoreLimitKmh, profile.strongOffshoreLimitKmh + 16, 0.71, 0.52)
    qualityState = applyQualityCap(qualityState, cap, 'strong-offshore')
  }

  if (!wind.available || !tide.available) {
    qualityState.ratingConstraint = qualityState.ratingConstraint ?? 'missing-data'
  }

  if (profile.calibrationStatus === 'provisional') {
    qualityState = applyQualityCap(qualityState, 0.64, 'provisional')
  }

  if (profile.calibrationStatus === 'geography-reviewed') {
    // Capped at score 4 below in qualityToScore
  }

  const horizonHours = Math.max(0, (new Date(hour.time).getTime() - new Date(generatedAt).getTime()) / 3_600_000)
  const confidence = getConfidence(
    profile,
    hour,
    source,
    horizonHours,
    swell.shorelineTransmission,
    swell.bathymetryCoverage,
  )

  const qualityResult = qualityToScore(
    qualityState.quality,
    profile,
    swell,
    wind,
    tide,
    hour.windSpeedKmh,
    confidence,
  )

  return {
    ...hour,
    score: qualityResult.score,
    quality: Math.round(qualityState.quality * 100),
    confidence: Math.round(confidence * 100),
    confidenceLevel: confidenceLevel(confidence),
    effectiveHeightM: Math.round(swell.effectiveHeightM * 100) / 100,
    effectiveDirectionDeg: swell.effectiveDirectionDeg === null ? null : Math.round(swell.effectiveDirectionDeg),
    effectivePeriodS: swell.period > 0 ? Math.round(swell.period * 10) / 10 : null,
    exposure: Math.round(swell.exposure * 100),
    shorelineTransmission: Math.round(swell.shorelineTransmission * 100),
    bathymetryCoverage: Math.round(swell.bathymetryCoverage * 100),
    windImpact: wind.impact,
    breakdown: {
      swell: Math.round(swell.score * 100),
      shoreline: Math.round(swell.shorelineTransmission * 100),
      wind: Math.round(wind.score * 100),
      tide: Math.round(tide.score * 100),
      consistency: Math.round(swell.consistency * 100),
    },
    reasons: buildReasons(profile, hour, swell, wind, tide),
    ratingConstraint: qualityResult.ratingConstraint ?? qualityState.ratingConstraint,
    wavePowerKwM: swell.wavePowerKwM === null ? null : Math.round(swell.wavePowerKwM * 10) / 10,
  }
}

