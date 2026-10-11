import type { ShorelineExposureProfile, SpotProfile } from './forecast'

export type SpotDraft = Omit<SpotProfile, 'id' | 'shorelineExposure'>
export type SpotStatus = 'draft' | 'published' | 'archived'
export type AdminSpotRecord = {
  id: string; slug: string; status: SpotStatus; draft: SpotDraft; published: SpotDraft | null
  exposure: ShorelineExposureProfile | null; revision: number; hasUnpublishedChanges: boolean
  createdAt: string; updatedAt: string; publishedAt: string | null
}

export const SHORELINE_DATASET_VERSION = 'ihm-lc-composite-v3'

export const COALNE_BOUNDS = {
  minLongitude: -9.6, minLatitude: 41.7,
  maxLongitude: -6.65, maxLatitude: 43.79207720657858,
} as const

export function spotInputFingerprint(spot: Pick<SpotDraft, 'latitude' | 'longitude' | 'shoreFacingDeg'>) {
  return `${spot.latitude.toFixed(6)}:${spot.longitude.toFixed(6)}:${spot.shoreFacingDeg?.toFixed(2) ?? 'null'}`
}

export function normalizeSlug(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
}

const normalizeBearing = (value: number) => ((value % 360) + 360) % 360
const bearingDifference = (first: number, second: number) => 180 - Math.abs(Math.abs(normalizeBearing(first) - normalizeBearing(second)) - 180)

/**
 * Turns the directional COALNE result into the swell inputs used by the score
 * model. COALNE defines geographic access; the selected seaward normal keeps
 * the result centred on the beach rather than an unrelated opening offshore.
 */
export function deriveSwellParameters(profile: ShorelineExposureProfile) {
  const sectors = profile.transmission.map((transmission, index) => ({
    bearing: index * profile.intervalDeg,
    transmission,
    difference: bearingDifference(index * profile.intervalDeg, profile.shoreFacingDeg),
  })).filter((sector) => sector.difference <= 90)
  const peak = Math.max(...sectors.map((sector) => sector.transmission))
  const preferredThreshold = Math.min(peak, Math.max(0.5, peak * 0.85))
  const preferred = sectors
    .filter((sector) => sector.transmission >= preferredThreshold)
    .sort((first, second) => first.difference - second.difference || second.transmission - first.transmission)[0]
  const idealSwellDeg = preferred?.bearing ?? normalizeBearing(profile.shoreFacingDeg)
  const threshold = Math.max(0.35, peak * 0.5)
  let halfWindow = 0
  for (let offset = profile.intervalDeg; offset <= 90; offset += profile.intervalDeg) {
    const leftIndex = Math.round(normalizeBearing(idealSwellDeg - offset) / profile.intervalDeg) % profile.transmission.length
    const rightIndex = Math.round(normalizeBearing(idealSwellDeg + offset) / profile.intervalDeg) % profile.transmission.length
    if (profile.transmission[leftIndex] < threshold && profile.transmission[rightIndex] < threshold) break
    halfWindow = offset
  }
  return {
    idealSwellDeg: normalizeBearing(idealSwellDeg),
    swellWindowDeg: Math.max(20, Math.min(180, halfWindow * 2 || profile.intervalDeg * 2)),
  }
}

export function validateSpotDraft(input: unknown) {
  const errors: Record<string, string> = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { valid: false, errors: { form: 'Invalid spot data' } }
  const value = input as Record<string, unknown>
  const text = (key: string, max = 120) => {
    if (typeof value[key] !== 'string' || !value[key].trim() || value[key].length > max) errors[key] = 'Required'
  }
  const number = (key: string, min: number, max: number, nullable = false) => {
    if (nullable && value[key] === null) return
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < min || value[key] > max) errors[key] = `Must be between ${min} and ${max}`
  }
  const range = (key: string, max: number) => {
    const items = value[key]
    if (!Array.isArray(items) || items.length !== 2 || items.some((item) => typeof item !== 'number' || !Number.isFinite(item) || item <= 0 || item > max)
      || items[0] >= items[1]) errors[key] = 'Enter a finite increasing positive range'
  }
  text('slug', 64); text('name'); text('province'); text('municipality')
  if (normalizeSlug(String(value.slug ?? '')) !== value.slug) errors.slug = 'Use lowercase letters, numbers, and hyphens'
  number('latitude', COALNE_BOUNDS.minLatitude, COALNE_BOUNDS.maxLatitude)
  number('longitude', COALNE_BOUNDS.minLongitude, COALNE_BOUNDS.maxLongitude)
  number('shoreFacingDeg', 0, 359.999, true); number('idealSwellDeg', 0, 359.999, true)
  number('swellWindowDeg', 1, 180); number('maxSafeHeightM', 0.1, 30)
  range('preferredHeightM', 30); range('preferredPeriodS', 60)
  number('maximumUsefulPeriodS', 1, 60)
  if (Array.isArray(value.preferredHeightM) && Number(value.maxSafeHeightM) < value.preferredHeightM[1]) errors.maxSafeHeightM = 'Must include the preferred height range'
  if (Array.isArray(value.preferredPeriodS) && Number(value.maximumUsefulPeriodS) < value.preferredPeriodS[1]) errors.maximumUsefulPeriodS = 'Must include the preferred period range'
  for (const key of ['orientationConfidence', 'heightRangeConfidence', 'periodConfidence', 'tideConfidence', 'bathymetryConfidence']) number(key, 0, 1)
  number('windSensitivity', 0.1, 5); number('strongOffshoreLimitKmh', 1, 150)
  number('closeoutSensitivity', 0, 5); number('unresolvedDiffractionFloor', 0, 1)
  const tide = value.tidePreference as Record<string, unknown> | undefined
  if (!tide || typeof tide !== 'object' || Array.isArray(tide)
    || !['min', 'ideal', 'max'].every((key) => typeof tide[key] === 'number' && Number.isFinite(tide[key]) && Number(tide[key]) >= 0 && Number(tide[key]) <= 1)
    || Number(tide.min) > Number(tide.ideal) || Number(tide.ideal) > Number(tide.max)) errors.tidePreference = 'Tide values must be ordered between 0 and 1'
  if (!['beach', 'reef', 'mixed', 'unknown'].includes(String(value.breakType))) errors.breakType = 'Choose a break type'
  if (!['all', 'intermediate', 'advanced', 'unknown'].includes(String(value.skillLevel))) errors.skillLevel = 'Choose a skill level'
  if (!['provisional', 'geography-reviewed', 'locally-reviewed', 'calibrated'].includes(String(value.calibrationStatus))) errors.calibrationStatus = 'Choose a calibration status'
  const sources = value.profileSources as Record<string, unknown> | undefined
  if (!sources || typeof sources !== 'object' || Array.isArray(sources)
    || !['shoreFacingDeg', 'idealSwellDeg', 'swellWindowDeg', 'preferredHeightM', 'preferredPeriodS', 'tidePreference', 'closeoutSensitivity']
      .every((key) => ['default', 'derived', 'manual', 'model', 'observed'].includes(String(sources[key])))) errors.profileSources = 'Supply the source of each model field'
  if (value.cameraUrl !== undefined && value.cameraUrl !== '') {
    try {
      if (typeof value.cameraUrl !== 'string' || value.cameraUrl.length > 2048) throw new Error()
      const url = new URL(value.cameraUrl)
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error()
    } catch { errors.cameraUrl = 'Use an HTTPS URL without credentials' }
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

export function validExposure(exposure: unknown, draft: SpotDraft) {
  if (!exposure || typeof exposure !== 'object' || Array.isArray(exposure) || draft.shoreFacingDeg === null) return false
  const value = exposure as ShorelineExposureProfile
  const validArray = (items: unknown, max: number, nullable = false) => Array.isArray(items) && items.length === 36
    && items.every((item: unknown) => nullable && item === null || typeof item === 'number' && Number.isFinite(item) && item >= 0 && item <= max)
  return value.intervalDeg === 10 && value.shoreFacingDeg === draft.shoreFacingDeg
    && validArray(value.transmission, 1)
    && (value.openFraction === undefined || validArray(value.openFraction, 1, true))
    && (value.nearestObstacleKm === undefined || validArray(value.nearestObstacleKm, 90, true))
    && value.inputFingerprint === spotInputFingerprint(draft) && value.datasetVersion === SHORELINE_DATASET_VERSION
}
