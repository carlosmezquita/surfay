export type ForecastSource = 'open-meteo' | 'cache' | 'demo'

export const SCORING_MODEL_VERSION = 8

export type SurfScore = 0 | 1 | 2 | 3 | 4 | 5

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export type TidePreference = {
  min: number
  ideal: number
  max: number
}

export type ShorelineExposureProfile = {
  intervalDeg: number
  shoreFacingDeg: number
  transmission: readonly number[]
  openFraction?: readonly (number | null)[]
  nearestObstacleKm?: readonly (number | null)[]
  datasetVersion?: string
  inputFingerprint?: string
}

export type SpotCalibrationStatus =
  | 'provisional'
  | 'geography-reviewed'
  | 'locally-reviewed'
  | 'calibrated'

export type SpotFieldSource =
  | 'default'
  | 'derived'
  | 'manual'
  | 'model'
  | 'observed'

export type SpotProfileSources = {
  shoreFacingDeg: SpotFieldSource
  idealSwellDeg: SpotFieldSource
  swellWindowDeg: SpotFieldSource
  preferredHeightM: SpotFieldSource
  preferredPeriodS: SpotFieldSource
  tidePreference: SpotFieldSource
  closeoutSensitivity: SpotFieldSource
}

export type SpotProfile = {
  id: string
  slug: string
  name: string
  province: string
  municipality: string
  latitude: number
  longitude: number
  shoreFacingDeg: number | null
  idealSwellDeg: number | null
  swellWindowDeg: number
  preferredHeightM: [number, number]
  maxSafeHeightM: number
  preferredPeriodS: [number, number]
  maximumUsefulPeriodS: number
  tidePreference: TidePreference
  breakType: 'beach' | 'reef' | 'mixed' | 'unknown'
  skillLevel: 'all' | 'intermediate' | 'advanced' | 'unknown'
  orientationConfidence: number
  heightRangeConfidence: number
  periodConfidence: number
  tideConfidence: number
  bathymetryConfidence: number
  calibrationStatus: SpotCalibrationStatus
  windSensitivity: number
  strongOffshoreLimitKmh: number
  closeoutSensitivity: number
  unresolvedDiffractionFloor: number
  profileSources: SpotProfileSources
  cameraUrl?: string
  shorelineExposure?: ShorelineExposureProfile
}

export type RawForecastHour = {
  time: string
  waveHeightM: number | null
  waveDirectionDeg: number | null
  wavePeriodS: number | null
  swellHeightM: number | null
  swellDirectionDeg: number | null
  swellPeriodS: number | null
  windWaveHeightM: number | null
  windWaveDirectionDeg: number | null
  windWavePeriodS: number | null
  secondarySwellHeightM: number | null
  secondarySwellDirectionDeg: number | null
  secondarySwellPeriodS: number | null
  tertiarySwellHeightM: number | null
  tertiarySwellDirectionDeg: number | null
  tertiarySwellPeriodS: number | null
  windSpeedKmh: number | null
  windDirectionDeg: number | null
  windGustKmh: number | null
  tideHeightMslM: number | null
  tideNormalized: number | null
  seaTemperatureC: number | null
  airTemperatureC: number | null
  feelsLikeC: number | null
  precipProbabilityPct: number | null
  precipitationMm: number | null
  cloudCoverPct: number | null
  weatherCode: number | null
}

export type ScoreBreakdown = {
  swell: number
  shoreline: number
  wind: number
  tide: number
  consistency: number
}

export type ForecastReason = {
  kind: 'positive' | 'neutral' | 'negative'
  key:
    | 'directSwell'
    | 'angledSwell'
    | 'shadowedSwell'
    | 'offshoreWind'
    | 'crossWind'
    | 'onshoreWind'
    | 'lightWind'
    | 'missingWind'
    | 'missingTide'
    | 'strongOffshoreWind'
    | 'goodTide'
    | 'poorTide'
    | 'smallSurf'
    | 'largeSurf'
    | 'longPeriod'
    | 'mixedSwell'
    | 'flatSurf'
    | 'weakWindSea'
    | 'shortPeriod'
    | 'provisionalProfile'
    | 'unknownOrientation'
    | 'unknownTide'
    | 'missingBathymetry'
    | 'genericHeightRange'
    | 'genericPeriodRange'
}

export type WindImpact = 'offshore' | 'cross-offshore' | 'cross-shore' | 'cross-onshore' | 'onshore' | 'variable'

export type RatingConstraint =
  | 'weak-short-period'
  | 'short-period'
  | 'direct-onshore'
  | 'cross-onshore'
  | 'strong-offshore'
  | 'missing-data'
  | 'provisional'
  | null

export type ScoredForecastHour = RawForecastHour & {
  score: SurfScore
  quality: number
  confidence: number
  confidenceLevel: ConfidenceLevel
  effectiveHeightM: number
  effectiveDirectionDeg: number | null
  effectivePeriodS: number | null
  exposure: number
  shorelineTransmission: number
  bathymetryCoverage: number
  windImpact: WindImpact
  breakdown: ScoreBreakdown
  reasons: ForecastReason[]
  ratingConstraint: RatingConstraint
  wavePowerKwM: number | null
}

export type ForecastHourScore = {
  time: string
  score: SurfScore
  quality: number
  confidence: number
  effectiveHeightM: number
  effectiveDirectionDeg: number | null
  effectivePeriodS: number | null
  windSpeedKmh: number | null
  windDirectionDeg: number | null
  windImpact: WindImpact
  tideNormalized: number | null
  weatherCode: number | null
  precipProbabilityPct: number | null
}

export type SpotForecastSummary = {
  spotSlug: string
  hours: ForecastHourScore[]
}

export type ForecastSummary = {
  scoringModelVersion: number
  source: ForecastSource
  generatedAt: string
  model: string
  catalogueVersion: number
  spots: SpotProfile[]
  forecasts: Record<string, SpotForecastSummary>
}

export type SpotForecast = {
  snapshotId?: string
  catalogueVersion?: number
  spotSlug: string
  source: ForecastSource
  generatedAt: string
  model: string
  hours: ScoredForecastHour[]
}

export type ForecastDataset = {
  scoringModelVersion: number
  source: ForecastSource
  generatedAt: string
  model: string
  catalogueVersion: number
  spots: SpotProfile[]
  forecasts: Record<string, SpotForecast>
}

export type ForecastLoadState = {
  status: 'loading' | 'ready' | 'error'
  dataset: ForecastDataset | null
  error: string | null
  isRefreshing: boolean
}

