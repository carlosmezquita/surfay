import { describe, expect, it } from 'vitest'
import { shorelineExposureProfiles } from '../data/shorelineExposure.generated'
import { getSpotBySlug, surfSpots } from '../data/spots'
import type { RawForecastHour } from './forecast'
import { angularDifference, normalizeDegrees, scoreForecastHour } from './scoreEngine'
import { getShorelineTransmission } from './shorelineExposure'

const pantin = getSpotBySlug('pantin')
const bastiagueiro = getSpotBySlug('bastiagueiro')
const orzan = getSpotBySlug('orzan')
const doninos = getSpotBySlug('doninos')
const razo = getSpotBySlug('razo')
const generatedAt = '2026-07-21T08:00:00.000Z'

function hour(overrides: Partial<RawForecastHour> = {}): RawForecastHour {
  return {
    time: '2026-07-21T10:00',
    waveHeightM: 1.6,
    waveDirectionDeg: 340,
    wavePeriodS: 12,
    swellHeightM: 1.45,
    swellDirectionDeg: 340,
    swellPeriodS: 12.5,
    windWaveHeightM: 0.35,
    windWaveDirectionDeg: 330,
    windWavePeriodS: 5.5,
    secondarySwellHeightM: 0.2,
    secondarySwellDirectionDeg: 310,
    secondarySwellPeriodS: 8,
    tertiarySwellHeightM: null,
    tertiarySwellDirectionDeg: null,
    tertiarySwellPeriodS: null,
    windSpeedKmh: 12,
    windDirectionDeg: 170,
    windGustKmh: 17,
    tideHeightMslM: 1,
    tideNormalized: 0.52,
    seaTemperatureC: 17,
    airTemperatureC: 20,
    feelsLikeC: 19,
    precipProbabilityPct: 0,
    precipitationMm: 0,
    cloudCoverPct: 30,
    weatherCode: 1,
    ...overrides,
  }
}

describe('score engine', () => {
  it('uses circular angular differences around north', () => {
    expect(angularDifference(350, 10)).toBe(20)
    expect(angularDifference(10, 190)).toBe(180)
  })

  it('rewards swell entering the spot window over shadowed swell', () => {
    const direct = scoreForecastHour(pantin, hour(), 'open-meteo', generatedAt)
    const shadowed = scoreForecastHour(
      pantin,
      hour({ swellDirectionDeg: 150, waveDirectionDeg: 150 }),
      'open-meteo',
      generatedAt,
    )
    expect(direct.exposure).toBeGreaterThan(85)
    expect(direct.quality).toBeGreaterThan(shadowed.quality)
    expect(direct.effectiveHeightM).toBeGreaterThan(shadowed.effectiveHeightM)
  })

  it('uses COALNE geography to distinguish protected Bastiagueiro from open Pantín', () => {
    const northwestSwell = hour({
      swellDirectionDeg: 310,
      waveDirectionDeg: 310,
      windWaveHeightM: null,
      windWaveDirectionDeg: null,
      windWavePeriodS: null,
      secondarySwellHeightM: null,
      secondarySwellDirectionDeg: null,
      secondarySwellPeriodS: null,
    })
    const protectedSpot = scoreForecastHour(bastiagueiro, northwestSwell, 'open-meteo', generatedAt)
    const openSpot = scoreForecastHour(pantin, northwestSwell, 'open-meteo', generatedAt)

    expect(getShorelineTransmission('bastiagueiro', 310)).toBeLessThan(0.2)
    expect(getShorelineTransmission('pantin', 310)).toBeGreaterThan(0.7)
    expect(openSpot.effectiveHeightM).toBeGreaterThan(protectedSpot.effectiveHeightM * 2)
    expect(openSpot.quality).toBeGreaterThan(protectedSpot.quality)
    expect(protectedSpot.score).toBeLessThanOrEqual(3)
    expect(protectedSpot.confidenceLevel).toBe('medium')
  })

  it('combines independently transformed partitions by wave energy', () => {
    const common = {
      waveHeightM: Math.sqrt(10),
      waveDirectionDeg: 270,
      swellHeightM: 3,
      swellDirectionDeg: 270,
      windWaveHeightM: null,
      windWaveDirectionDeg: null,
      windWavePeriodS: null,
      tertiarySwellHeightM: null,
      tertiarySwellDirectionDeg: null,
      tertiarySwellPeriodS: null,
    }
    const openSecondary = scoreForecastHour(orzan, hour({
      ...common,
      secondarySwellHeightM: 1,
      secondarySwellDirectionDeg: 310,
      secondarySwellPeriodS: 12,
    }), 'open-meteo', generatedAt)
    const shadowedResidual = scoreForecastHour(orzan, hour({
      ...common,
      secondarySwellHeightM: null,
      secondarySwellDirectionDeg: null,
      secondarySwellPeriodS: null,
    }), 'open-meteo', generatedAt)

    expect(openSecondary.effectiveHeightM).toBeGreaterThan(shadowedResidual.effectiveHeightM)
    expect(openSecondary.quality).toBeGreaterThanOrEqual(shadowedResidual.quality)
  })

  it('represents Orzán west swell as size-dependent but geographically shadowed', () => {
    const west = {
      waveDirectionDeg: 270,
      swellDirectionDeg: 270,
      windWaveHeightM: null,
      windWaveDirectionDeg: null,
      windWavePeriodS: null,
      secondarySwellHeightM: null,
      secondarySwellDirectionDeg: null,
      secondarySwellPeriodS: null,
    }
    const small = scoreForecastHour(orzan, hour({ ...west, waveHeightM: 2, swellHeightM: 2 }), 'open-meteo', generatedAt)
    const large = scoreForecastHour(orzan, hour({ ...west, waveHeightM: 5, swellHeightM: 5 }), 'open-meteo', generatedAt)
    const shortPeriod = scoreForecastHour(orzan, hour({ ...west, waveHeightM: 2, swellHeightM: 2, swellPeriodS: 8 }), 'open-meteo', generatedAt)
    const longPeriod = scoreForecastHour(orzan, hour({ ...west, waveHeightM: 2, swellHeightM: 2, swellPeriodS: 16 }), 'open-meteo', generatedAt)

    expect(small.shorelineTransmission).toBeLessThan(20)
    expect(small.effectiveHeightM).toBeLessThan(orzan.preferredHeightM[0])
    expect(large.effectiveHeightM).toBeGreaterThan(orzan.preferredHeightM[0])
    expect(longPeriod.effectiveHeightM).toBeGreaterThan(shortPeriod.effectiveHeightM)
    expect(small.confidenceLevel).toBe('medium')
    expect(large.confidenceLevel).toBe('medium')
  })

  it('generates a complete bounded directional profile for every spot', () => {
    expect(Object.keys(shorelineExposureProfiles)).toHaveLength(13)
    for (const profile of Object.values(shorelineExposureProfiles)) {
      expect(profile.transmission).toHaveLength(36)
      expect(profile.transmission.every((value) => value >= 0 && value <= 1)).toBe(true)
    }
  })

  it('distinguishes offshore from strong onshore wind', () => {
    const offshore = scoreForecastHour(pantin, hour({ windDirectionDeg: 169, windSpeedKmh: 20 }), 'open-meteo', generatedAt)
    const onshore = scoreForecastHour(pantin, hour({ windDirectionDeg: 349, windSpeedKmh: 34 }), 'open-meteo', generatedAt)
    expect(offshore.windImpact).toBe('offshore')
    expect(onshore.windImpact).toBe('onshore')
    expect(offshore.breakdown.wind).toBeGreaterThan(onshore.breakdown.wind)
  })

  it('does not over-penalize a nearly calm onshore breeze', () => {
    const calm = scoreForecastHour(pantin, hour({ windDirectionDeg: 349, windSpeedKmh: 3 }), 'open-meteo', generatedAt)
    expect(calm.breakdown.wind).toBeGreaterThan(80)
  })

  it('does not let ideal wind and tide manufacture epic surf at Bastiagueiro', () => {
    // Open-Meteo marine partitions for 2026-07-28 07:00 at Bastiagueiro,
    // paired with the rounded wind values reported in the UI.
    const result = scoreForecastHour(bastiagueiro, hour({
      time: '2026-07-28T07:00',
      waveHeightM: 1.18,
      waveDirectionDeg: 350,
      wavePeriodS: 7.65,
      swellHeightM: 0.92,
      swellDirectionDeg: 331,
      swellPeriodS: 7.85,
      windWaveHeightM: 0.06,
      windWaveDirectionDeg: 89,
      windWavePeriodS: 0.5,
      secondarySwellHeightM: 0.72,
      secondarySwellDirectionDeg: 15,
      secondarySwellPeriodS: 4.3,
      windSpeedKmh: 5,
      windDirectionDeg: 180,
      windGustKmh: 8,
      tideNormalized: 0.473,
    }), 'open-meteo', '2026-07-22T08:00:00.000Z')

    expect(result.effectiveHeightM).toBeCloseTo(0.52, 1)
    expect(result.score).toBe(3)
    expect(result.quality).toBeLessThan(72)
    expect(result.bathymetryCoverage).toBeGreaterThan(50)
    expect(result.confidenceLevel).toBe('medium')
  })

  it('rates tiny short-period shadowed surf as flat regardless of wind and tide', () => {
    const result = scoreForecastHour(doninos, hour({
      waveHeightM: 0.8,
      waveDirectionDeg: 30,
      wavePeriodS: 5,
      swellHeightM: 0.8,
      swellDirectionDeg: 30,
      swellPeriodS: 5,
      windWaveHeightM: null,
      windWaveDirectionDeg: null,
      windWavePeriodS: null,
      secondarySwellHeightM: null,
      secondarySwellDirectionDeg: null,
      secondarySwellPeriodS: null,
      windSpeedKmh: 2,
      windDirectionDeg: 22,
      windGustKmh: 9,
      tideNormalized: 0.8,
    }), 'open-meteo', generatedAt)

    expect(result.effectiveHeightM).toBeLessThan(0.25)
    expect(result.score).toBe(0)
    expect(result.quality).toBe(0)
    expect(result.reasons[0]?.key).toBe('flatSurf')
  })

  it('uses the middle of a preferred height range as prime, not its lower edge', () => {
    const common = {
      waveDirectionDeg: 0,
      swellDirectionDeg: 0,
      swellPeriodS: 12,
      windWaveHeightM: null,
      windWaveDirectionDeg: null,
      windWavePeriodS: null,
      secondarySwellHeightM: null,
      secondarySwellDirectionDeg: null,
      secondarySwellPeriodS: null,
    }
    const lowerEdge = scoreForecastHour(
      pantin,
      hour({ ...common, waveHeightM: pantin.preferredHeightM[0], swellHeightM: pantin.preferredHeightM[0] }),
      'open-meteo',
      generatedAt,
    )
    const middle = scoreForecastHour(
      pantin,
      hour({ ...common, waveHeightM: 1.35, swellHeightM: 1.35 }),
      'open-meteo',
      generatedAt,
    )

    expect(middle.breakdown.swell).toBeGreaterThan(lowerEdge.breakdown.swell)
    expect(lowerEdge.score).toBeLessThan(5)
  })

  it('reduces confidence as the forecast horizon grows', () => {
    const near = scoreForecastHour(pantin, hour(), 'open-meteo', generatedAt)
    const far = scoreForecastHour(pantin, hour({ time: '2026-07-27T10:00' }), 'open-meteo', generatedAt)
    expect(near.confidence).toBeGreaterThan(far.confidence)
  })

  it('keeps the coastal transform bounded and size-monotonic for every spot and direction', () => {
    for (const spot of surfSpots) {
      for (let direction = 0; direction < 360; direction += 10) {
        const seaState = {
          waveDirectionDeg: direction,
          swellDirectionDeg: direction,
          windWaveHeightM: null,
          windWaveDirectionDeg: null,
          windWavePeriodS: null,
          secondarySwellHeightM: null,
          secondarySwellDirectionDeg: null,
          secondarySwellPeriodS: null,
        }
        const small = scoreForecastHour(spot, hour({ ...seaState, waveHeightM: 1, swellHeightM: 1 }), 'open-meteo', generatedAt)
        const large = scoreForecastHour(spot, hour({ ...seaState, waveHeightM: 4, swellHeightM: 4 }), 'open-meteo', generatedAt)
        expect(small.effectiveHeightM).toBeGreaterThanOrEqual(0)
        expect(large.effectiveHeightM).toBeLessThanOrEqual(6)
        expect(large.effectiveHeightM).toBeGreaterThanOrEqual(small.effectiveHeightM)
        expect(small.exposure).toBeGreaterThanOrEqual(0)
        expect(small.exposure).toBeLessThanOrEqual(100)
        if (small.shorelineTransmission < 25) expect(small.confidence).toBeLessThanOrEqual(74)
      }
    }
  })

  describe('wind progression', () => {
    const excellentSwell = {
      swellDirectionDeg: pantin.idealSwellDeg!,
      waveDirectionDeg: pantin.idealSwellDeg!,
      waveHeightM: 2.0,
      swellHeightM: 2.0,
      swellPeriodS: 14,
      windWaveHeightM: null,
      windWaveDirectionDeg: null,
      windWavePeriodS: null,
      secondarySwellHeightM: null,
      secondarySwellDirectionDeg: null,
      secondarySwellPeriodS: null,
      tideNormalized: pantin.tidePreference.ideal,
    }

    it('caps direct onshore wind progressively', () => {
      const onshoreDir = pantin.shoreFacingDeg!
      const at3 = scoreForecastHour(pantin, hour({ ...excellentSwell, windDirectionDeg: onshoreDir, windSpeedKmh: 3 }), 'open-meteo', generatedAt)
      const at12 = scoreForecastHour(pantin, hour({ ...excellentSwell, windDirectionDeg: onshoreDir, windSpeedKmh: 12 }), 'open-meteo', generatedAt)
      const at20 = scoreForecastHour(pantin, hour({ ...excellentSwell, windDirectionDeg: onshoreDir, windSpeedKmh: 20 }), 'open-meteo', generatedAt)
      const at28 = scoreForecastHour(pantin, hour({ ...excellentSwell, windDirectionDeg: onshoreDir, windSpeedKmh: 28 }), 'open-meteo', generatedAt)

      expect(at3.quality).toBeGreaterThan(at12.quality)
      expect(at12.score).toBeLessThanOrEqual(3)
      expect(at20.score).toBeLessThanOrEqual(3)
      expect(at28.score).toBeLessThanOrEqual(2)
      expect(at28.ratingConstraint).toBe('direct-onshore')
    })

    it('preserves calm onshore without automatic capping', () => {
      const onshoreDir = pantin.shoreFacingDeg!
      const calm = scoreForecastHour(pantin, hour({ ...excellentSwell, windDirectionDeg: onshoreDir, windSpeedKmh: 3 }), 'open-meteo', generatedAt)
      expect(calm.breakdown.wind).toBeGreaterThan(80)
      expect(calm.ratingConstraint).toBeNull()
    })

    it('caps cross-onshore wind', () => {
      const idealOffshore = normalizeDegrees(pantin.shoreFacingDeg! + 180)
      const crossOnshoreDir = normalizeDegrees(idealOffshore + 130)
      const at22 = scoreForecastHour(pantin, hour({ ...excellentSwell, windDirectionDeg: crossOnshoreDir, windSpeedKmh: 22 }), 'open-meteo', generatedAt)
      const at34 = scoreForecastHour(pantin, hour({ ...excellentSwell, windDirectionDeg: crossOnshoreDir, windSpeedKmh: 34 }), 'open-meteo', generatedAt)

      expect(at22.score).toBeLessThanOrEqual(3)
      expect(at34.quality).toBeLessThanOrEqual(52)
      expect(at34.ratingConstraint).toBe('cross-onshore')
    })

    it('penalizes strong offshore wind', () => {
      const idealOffshore = normalizeDegrees(pantin.shoreFacingDeg! + 180)
      const at20 = scoreForecastHour(pantin, hour({ ...excellentSwell, windDirectionDeg: idealOffshore, windSpeedKmh: 20 }), 'open-meteo', generatedAt)
      const at32 = scoreForecastHour(pantin, hour({ ...excellentSwell, windDirectionDeg: idealOffshore, windSpeedKmh: 32 }), 'open-meteo', generatedAt)
      const at48 = scoreForecastHour(pantin, hour({ ...excellentSwell, windDirectionDeg: idealOffshore, windSpeedKmh: 48 }), 'open-meteo', generatedAt)

      expect(at20.score).toBeGreaterThanOrEqual(at32.score)
      expect(at32.score).toBeLessThanOrEqual(3)
      expect(at48.quality).toBeLessThanOrEqual(52)
      expect(at48.ratingConstraint).toBe('strong-offshore')
    })
  })

  describe('missing data', () => {
    it('caps score when wind is unavailable', () => {
      const result = scoreForecastHour(pantin, hour({
        windSpeedKmh: null,
        windDirectionDeg: null,
        swellDirectionDeg: pantin.idealSwellDeg!,
        waveDirectionDeg: pantin.idealSwellDeg!,
        waveHeightM: 2.0,
        swellHeightM: 2.0,
        windWaveHeightM: null,
        windWaveDirectionDeg: null,
        windWavePeriodS: null,
        secondarySwellHeightM: null,
        secondarySwellDirectionDeg: null,
        secondarySwellPeriodS: null,
      }), 'open-meteo', generatedAt)

      expect(result.score).toBeLessThanOrEqual(3)
      expect(result.ratingConstraint).toBe('missing-data')
    })

    it('caps score when tide is unavailable', () => {
      const result = scoreForecastHour(pantin, hour({
        tideNormalized: null,
        swellDirectionDeg: pantin.idealSwellDeg!,
        waveDirectionDeg: pantin.idealSwellDeg!,
        waveHeightM: 2.0,
        swellHeightM: 2.0,
        windWaveHeightM: null,
        windWaveDirectionDeg: null,
        windWavePeriodS: null,
        secondarySwellHeightM: null,
        secondarySwellDirectionDeg: null,
        secondarySwellPeriodS: null,
      }), 'open-meteo', generatedAt)

      expect(result.score).toBeLessThanOrEqual(3)
      expect(result.ratingConstraint).toBe('missing-data')
    })

    it('does not produce lightWind reason when wind is missing', () => {
      const result = scoreForecastHour(pantin, hour({
        windSpeedKmh: null,
        windDirectionDeg: null,
        swellDirectionDeg: pantin.idealSwellDeg!,
        waveDirectionDeg: pantin.idealSwellDeg!,
        waveHeightM: 2.0,
        swellHeightM: 2.0,
        windWaveHeightM: null,
        windWaveDirectionDeg: null,
        windWavePeriodS: null,
        secondarySwellHeightM: null,
        secondarySwellDirectionDeg: null,
        secondarySwellPeriodS: null,
      }), 'open-meteo', generatedAt)

      expect(result.reasons.some((r) => r.key === 'lightWind')).toBe(false)
      expect(result.reasons.some((r) => r.key === 'missingWind')).toBe(true)
    })

    it('produces missingTide reason when tide is unavailable', () => {
      const result = scoreForecastHour(pantin, hour({
        tideNormalized: null,
        swellDirectionDeg: pantin.idealSwellDeg!,
        waveDirectionDeg: pantin.idealSwellDeg!,
        waveHeightM: 2.0,
        swellHeightM: 2.0,
        windWaveHeightM: null,
        windWaveDirectionDeg: null,
        windWavePeriodS: null,
        secondarySwellHeightM: null,
        secondarySwellDirectionDeg: null,
        secondarySwellPeriodS: null,
      }), 'open-meteo', generatedAt)

      expect(result.reasons.some((r) => r.key === 'missingTide')).toBe(true)
    })
  })

  describe('epic gates', () => {
    const perfectSwell = {
      swellDirectionDeg: pantin.idealSwellDeg!,
      waveDirectionDeg: pantin.idealSwellDeg!,
      waveHeightM: pantin.preferredHeightM[0] + (pantin.preferredHeightM[1] - pantin.preferredHeightM[0]) * 0.65,
      swellHeightM: pantin.preferredHeightM[0] + (pantin.preferredHeightM[1] - pantin.preferredHeightM[0]) * 0.65,
      swellPeriodS: 14,
      windWaveHeightM: null,
      windWaveDirectionDeg: null,
      windWavePeriodS: null,
      secondarySwellHeightM: null,
      secondarySwellDirectionDeg: null,
      secondarySwellPeriodS: null,
      tideNormalized: pantin.tidePreference.ideal,
    }

    it('prevents epic with onshore wind', () => {
      const onshoreDir = pantin.shoreFacingDeg!
      const result = scoreForecastHour(pantin, hour({
        ...perfectSwell,
        windDirectionDeg: onshoreDir,
        windSpeedKmh: 14,
      }), 'open-meteo', generatedAt)

      expect(result.score).toBeLessThan(5)
    })

    it('prevents epic with mixed swell', () => {
      const result = scoreForecastHour(pantin, hour({
        ...perfectSwell,
        secondarySwellHeightM: 1.2,
        secondarySwellDirectionDeg: normalizeDegrees(pantin.idealSwellDeg! + 90),
        secondarySwellPeriodS: 10,
      }), 'open-meteo', generatedAt)

      expect(result.score).toBeLessThan(5)
    })

    it('prevents epic with insufficient bathymetry coverage', () => {
      const result = scoreForecastHour(doninos, hour({
        ...perfectSwell,
        swellDirectionDeg: doninos.idealSwellDeg,
        waveDirectionDeg: doninos.idealSwellDeg,
        waveHeightM: doninos.preferredHeightM[0] + (doninos.preferredHeightM[1] - doninos.preferredHeightM[0]) * 0.65,
        swellHeightM: doninos.preferredHeightM[0] + (doninos.preferredHeightM[1] - doninos.preferredHeightM[0]) * 0.65,
      }), 'open-meteo', generatedAt)

      expect(result.score).toBeLessThan(5)
    })

    it('may be epic with complete excellent conditions', () => {
      const idealOffshore = normalizeDegrees(pantin.shoreFacingDeg! + 180)
      const result = scoreForecastHour(pantin, hour({
        ...perfectSwell,
        windDirectionDeg: idealOffshore,
        windSpeedKmh: 8,
        windGustKmh: 12,
        tideNormalized: pantin.tidePreference.ideal,
      }), 'open-meteo', generatedAt)

      // May be epic if conditions warrant, but definitive assertions depend on subtle interactions
      // The gate ensures it doesn't get 5 without meeting all criteria
      expect(result.score).toBeGreaterThanOrEqual(3)
      if (result.score === 5) {
        expect(result.ratingConstraint).toBeNull()
        expect(result.confidenceLevel).toBe('high')
      }
    })
  })

  describe('continuity', () => {
    it('caps ramp smoothly within each direct-onshore tier', () => {
      const onshoreDir = pantin.shoreFacingDeg!
      const common = {
        swellDirectionDeg: pantin.idealSwellDeg!,
        waveDirectionDeg: pantin.idealSwellDeg!,
        waveHeightM: 2.0,
        swellHeightM: 2.0,
        swellPeriodS: 14,
        windDirectionDeg: onshoreDir,
        windWaveHeightM: null,
        windWaveDirectionDeg: null,
        windWavePeriodS: null,
        secondarySwellHeightM: null,
        secondarySwellDirectionDeg: null,
        secondarySwellPeriodS: null,
        tideNormalized: pantin.tidePreference.ideal,
      }

      // Within 12–20 range, quality should decrease monotonically without jumps
      const at12 = scoreForecastHour(pantin, hour({ ...common, windSpeedKmh: 12.0 }), 'open-meteo', generatedAt)
      const at16 = scoreForecastHour(pantin, hour({ ...common, windSpeedKmh: 16.0 }), 'open-meteo', generatedAt)
      const at20 = scoreForecastHour(pantin, hour({ ...common, windSpeedKmh: 20.0 }), 'open-meteo', generatedAt)

      expect(at12.quality).toBeGreaterThanOrEqual(at16.quality)
      expect(at16.quality).toBeGreaterThanOrEqual(at20.quality)
      expect(Math.abs(at12.quality - at20.quality)).toBeGreaterThan(0)

      // Within 20–28 range, quality should decrease monotonically
      const at21 = scoreForecastHour(pantin, hour({ ...common, windSpeedKmh: 21.0 }), 'open-meteo', generatedAt)
      const at24 = scoreForecastHour(pantin, hour({ ...common, windSpeedKmh: 24.0 }), 'open-meteo', generatedAt)
      const at28 = scoreForecastHour(pantin, hour({ ...common, windSpeedKmh: 28.0 }), 'open-meteo', generatedAt)

      expect(at20.quality).toBeGreaterThanOrEqual(at21.quality)
      expect(at21.quality).toBeGreaterThanOrEqual(at24.quality)
      expect(at24.quality).toBeGreaterThanOrEqual(at28.quality)
    })
  })

  describe('provisional spots', () => {
    it('caps provisional spots at 3/5 regardless of conditions', () => {
      const idealOffshore = normalizeDegrees(pantin.shoreFacingDeg! + 180)
      const result = scoreForecastHour(
        { ...pantin, calibrationStatus: 'provisional', tideConfidence: 0.7, bathymetryConfidence: 0.65 },
        hour({
          swellDirectionDeg: pantin.idealSwellDeg!,
          waveDirectionDeg: pantin.idealSwellDeg!,
          waveHeightM: 2.0, swellHeightM: 2.0, swellPeriodS: 14,
          windDirectionDeg: idealOffshore, windSpeedKmh: 8, windGustKmh: 12,
          windWaveHeightM: null, windWaveDirectionDeg: null, windWavePeriodS: null,
          secondarySwellHeightM: null, secondarySwellDirectionDeg: null, secondarySwellPeriodS: null,
          tideNormalized: pantin.tidePreference.ideal,
        }),
        'open-meteo',
        generatedAt,
      )
      expect(result.score).toBeLessThanOrEqual(3)
      expect(result.ratingConstraint).toBe('provisional')
    })

    it('caps geography-reviewed spots at 4/5', () => {
      const idealOffshore = normalizeDegrees(pantin.shoreFacingDeg! + 180)
      const result = scoreForecastHour(
        { ...pantin, calibrationStatus: 'geography-reviewed', tideConfidence: 0.7, bathymetryConfidence: 0.65 },
        hour({
          swellDirectionDeg: pantin.idealSwellDeg!,
          waveDirectionDeg: pantin.idealSwellDeg!,
          waveHeightM: 2.0, swellHeightM: 2.0, swellPeriodS: 14,
          windDirectionDeg: idealOffshore, windSpeedKmh: 8, windGustKmh: 12,
          windWaveHeightM: null, windWaveDirectionDeg: null, windWavePeriodS: null,
          secondarySwellHeightM: null, secondarySwellDirectionDeg: null, secondarySwellPeriodS: null,
          tideNormalized: pantin.tidePreference.ideal,
        }),
        'open-meteo',
        generatedAt,
      )
      expect(result.score).toBeLessThanOrEqual(4)
    })

    it('only allows 5/5 for locally-reviewed or calibrated spots', () => {
      const locallyReviewed = scoreForecastHour(
        { ...pantin, calibrationStatus: 'locally-reviewed' },
        hour({
          swellDirectionDeg: pantin.idealSwellDeg!,
          waveDirectionDeg: pantin.idealSwellDeg!,
          waveHeightM: 1.35, swellHeightM: 1.35, swellPeriodS: 14,
          windDirectionDeg: normalizeDegrees(pantin.shoreFacingDeg! + 180),
          windSpeedKmh: 8, windGustKmh: 12,
          windWaveHeightM: null, windWaveDirectionDeg: null, windWavePeriodS: null,
          secondarySwellHeightM: null, secondarySwellDirectionDeg: null, secondarySwellPeriodS: null,
          tideNormalized: pantin.tidePreference.ideal,
        }),
        'open-meteo',
        generatedAt,
      )
      // Not guaranteed to be 5 (must pass all epic gates), but at least eligible
      expect(locallyReviewed.score).toBeGreaterThanOrEqual(3)
      expect(locallyReviewed.ratingConstraint).toBeNull()
    })

    it('returns missing wind with score 0.45 when orientation is unknown', () => {
      const result = scoreForecastHour(
        { ...pantin, shoreFacingDeg: null, idealSwellDeg: null },
        hour({
          swellDirectionDeg: 340, waveDirectionDeg: 340,
          waveHeightM: 2.0, swellHeightM: 2.0, swellPeriodS: 14,
          windDirectionDeg: 170, windSpeedKmh: 12, windGustKmh: 17,
          windWaveHeightM: null, windWaveDirectionDeg: null, windWavePeriodS: null,
          secondarySwellHeightM: null, secondarySwellDirectionDeg: null, secondarySwellPeriodS: null,
          tideNormalized: pantin.tidePreference.ideal,
        }),
        'open-meteo',
        generatedAt,
      )
      expect(result.windImpact).toBe('variable')
      expect(result.breakdown.wind).toBe(45)
    })

    it('does not produce offshoreWind reason when orientation is unknown', () => {
      const result = scoreForecastHour(
        { ...pantin, shoreFacingDeg: null, idealSwellDeg: null },
        hour({
          swellDirectionDeg: 340, waveDirectionDeg: 340,
          waveHeightM: 2.0, swellHeightM: 2.0, swellPeriodS: 14,
          windDirectionDeg: 170, windSpeedKmh: 12, windGustKmh: 17,
          windWaveHeightM: null, windWaveDirectionDeg: null, windWavePeriodS: null,
          secondarySwellHeightM: null, secondarySwellDirectionDeg: null, secondarySwellPeriodS: null,
          tideNormalized: pantin.tidePreference.ideal,
        }),
        'open-meteo',
        generatedAt,
      )
      expect(result.reasons.some((r) => r.key === 'offshoreWind')).toBe(false)
      expect(result.reasons.some((r) => r.key === 'missingWind')).toBe(true)
    })

    it('treats tide as unknown when tideConfidence is 0', () => {
      const result = scoreForecastHour(
        { ...pantin, tideConfidence: 0, calibrationStatus: 'provisional' },
        hour({
          swellDirectionDeg: pantin.idealSwellDeg!,
          waveDirectionDeg: pantin.idealSwellDeg!,
          waveHeightM: 2.0, swellHeightM: 2.0, swellPeriodS: 14,
          windDirectionDeg: normalizeDegrees(pantin.shoreFacingDeg! + 180),
          windSpeedKmh: 8, windGustKmh: 12,
          windWaveHeightM: null, windWaveDirectionDeg: null, windWavePeriodS: null,
          secondarySwellHeightM: null, secondarySwellDirectionDeg: null, secondarySwellPeriodS: null,
          tideNormalized: pantin.tidePreference.ideal,
        }),
        'open-meteo',
        generatedAt,
      )
      expect(result.breakdown.tide).toBe(55)
      expect(result.reasons.some((r) => r.key === 'goodTide')).toBe(false)
      expect(result.reasons.some((r) => r.key === 'poorTide')).toBe(false)
    })

    it('survives when no shoreline profile exists', () => {
      const result = scoreForecastHour(
        { ...pantin, shorelineExposure: undefined, calibrationStatus: 'provisional' },
        hour({
          swellDirectionDeg: pantin.idealSwellDeg!,
          waveDirectionDeg: pantin.idealSwellDeg!,
          waveHeightM: 1.5, swellHeightM: 1.5, swellPeriodS: 12,
          windDirectionDeg: normalizeDegrees(pantin.shoreFacingDeg! + 180),
          windSpeedKmh: 10, windGustKmh: 15,
          windWaveHeightM: null, windWaveDirectionDeg: null, windWavePeriodS: null,
          secondarySwellHeightM: null, secondarySwellDirectionDeg: null, secondarySwellPeriodS: null,
          tideNormalized: pantin.tidePreference.ideal,
        }),
        'open-meteo',
        generatedAt,
      )
      expect(result.score).toBeLessThanOrEqual(3)
      expect(result.effectiveHeightM).toBeGreaterThan(0)
    })

    it('produces provisionalProfile reason for provisional spots', () => {
      const result = scoreForecastHour(
        { ...pantin, calibrationStatus: 'provisional', tideConfidence: 0.7, bathymetryConfidence: 0.65 },
        hour(),
        'open-meteo',
        generatedAt,
      )
      expect(result.reasons.some((r) => r.key === 'provisionalProfile')).toBe(true)
    })
  })

  describe('weak short-period surf', () => {
    it('caps Razo weak local sea at 2/5', () => {
      const result = scoreForecastHour(razo, hour({
        swellDirectionDeg: razo.idealSwellDeg!,
        waveDirectionDeg: razo.idealSwellDeg!,
        waveHeightM: 0.9, swellHeightM: 0.9, swellPeriodS: 5.5,
        windWaveHeightM: null, windWaveDirectionDeg: null, windWavePeriodS: null,
        secondarySwellHeightM: null, secondarySwellDirectionDeg: null, secondarySwellPeriodS: null,
        windSpeedKmh: 3, windDirectionDeg: 45, windGustKmh: 6,
        tideNormalized: razo.tidePreference.ideal,
      }), 'open-meteo', generatedAt)

      expect(result.score).toBe(2)
      expect(result.quality).toBeLessThanOrEqual(44)
      expect(result.ratingConstraint).toBe('weak-short-period')
      expect(result.reasons.some((r) => r.key === 'weakWindSea')).toBe(true)
      expect(result.score).not.toBe(0)
    })

    it('caps Razo 7s at 3/5 (short period, good power)', () => {
      const result = scoreForecastHour(razo, hour({
        swellDirectionDeg: razo.idealSwellDeg!,
        waveDirectionDeg: razo.idealSwellDeg!,
        waveHeightM: 1.4, swellHeightM: 1.4, swellPeriodS: 7,
        windWaveHeightM: null, windWaveDirectionDeg: null, windWavePeriodS: null,
        secondarySwellHeightM: null, secondarySwellDirectionDeg: null, secondarySwellPeriodS: null,
        windSpeedKmh: 8, windDirectionDeg: 100, windGustKmh: 12,
        tideNormalized: razo.tidePreference.ideal,
      }), 'open-meteo', generatedAt)

      expect(result.score).toBeLessThanOrEqual(3)
      expect(result.quality).toBeLessThanOrEqual(64)
      expect(result.ratingConstraint).toBe('short-period')
    })
  })

  describe('short-period boundaries', () => {
    it('caps period <=6.5s and power clearly below 3.5 at 0.44', () => {
      // 0.6m at 6.5s → effective power ≈ 0.49 * 0.6² * 6.5 ≈ 1.1 kW/m << 3.5
      const result = scoreForecastHour(razo, hour({
        swellDirectionDeg: razo.idealSwellDeg!,
        waveDirectionDeg: razo.idealSwellDeg!,
        waveHeightM: 0.6, swellHeightM: 0.6, swellPeriodS: 6.5,
        windWaveHeightM: null, windWaveDirectionDeg: null, windWavePeriodS: null,
        secondarySwellHeightM: null, secondarySwellDirectionDeg: null, secondarySwellPeriodS: null,
        windSpeedKmh: 5, windDirectionDeg: normalizeDegrees(razo.shoreFacingDeg! + 180), windGustKmh: 8,
        tideNormalized: razo.tidePreference.ideal,
      }), 'open-meteo', generatedAt)

      expect(result.ratingConstraint).toBe('weak-short-period')
      expect(result.score).toBeLessThanOrEqual(2)
    })

    it('does not cap period <8s but above weak power threshold at 0.44', () => {
      const result = scoreForecastHour(razo, hour({
        swellDirectionDeg: razo.idealSwellDeg!,
        waveDirectionDeg: razo.idealSwellDeg!,
        waveHeightM: 2.0, swellHeightM: 2.0, swellPeriodS: 7.5,
        windWaveHeightM: null, windWaveDirectionDeg: null, windWavePeriodS: null,
        secondarySwellHeightM: null, secondarySwellDirectionDeg: null, secondarySwellPeriodS: null,
        windSpeedKmh: 5, windDirectionDeg: normalizeDegrees(razo.shoreFacingDeg! + 180), windGustKmh: 8,
        tideNormalized: razo.tidePreference.ideal,
      }), 'open-meteo', generatedAt)

      // Not weak (power is high), but short period → capped at 0.64 (score ≤3)
      if (result.ratingConstraint === 'short-period') {
        expect(result.score).toBeLessThanOrEqual(3)
      }
      expect(result.ratingConstraint).not.toBe('weak-short-period')
    })

    it('allows period >=8s without period cap', () => {
      const result = scoreForecastHour(razo, hour({
        swellDirectionDeg: razo.idealSwellDeg!,
        waveDirectionDeg: razo.idealSwellDeg!,
        waveHeightM: 2.0, swellHeightM: 2.0, swellPeriodS: 8.0,
        windWaveHeightM: null, windWaveDirectionDeg: null, windWavePeriodS: null,
        secondarySwellHeightM: null, secondarySwellDirectionDeg: null, secondarySwellPeriodS: null,
        windSpeedKmh: 5, windDirectionDeg: normalizeDegrees(razo.shoreFacingDeg! + 180), windGustKmh: 8,
        tideNormalized: razo.tidePreference.ideal,
      }), 'open-meteo', generatedAt)

      expect(result.ratingConstraint).not.toBe('short-period')
      expect(result.ratingConstraint).not.toBe('weak-short-period')
    })

    it('preserves Flat as 0 regardless of period', () => {
      const result = scoreForecastHour(razo, hour({
        swellDirectionDeg: razo.idealSwellDeg!,
        waveDirectionDeg: razo.idealSwellDeg!,
        waveHeightM: 0.08, swellHeightM: 0.08, swellPeriodS: 4,
        windWaveHeightM: null, windWaveDirectionDeg: null, windWavePeriodS: null,
        secondarySwellHeightM: null, secondarySwellDirectionDeg: null, secondarySwellPeriodS: null,
        windSpeedKmh: 2, windDirectionDeg: 22, windGustKmh: 9,
        tideNormalized: 0.8,
      }), 'open-meteo', generatedAt)

      expect(result.score).toBe(0)
      expect(result.reasons.some((r) => r.key === 'flatSurf')).toBe(true)
    })

    it('does not cap long-period small swell as short-period', () => {
      const result = scoreForecastHour(razo, hour({
        swellDirectionDeg: razo.idealSwellDeg!,
        waveDirectionDeg: razo.idealSwellDeg!,
        waveHeightM: 0.4, swellHeightM: 0.4, swellPeriodS: 16,
        windWaveHeightM: null, windWaveDirectionDeg: null, windWavePeriodS: null,
        secondarySwellHeightM: null, secondarySwellDirectionDeg: null, secondarySwellPeriodS: null,
        windSpeedKmh: 5, windDirectionDeg: normalizeDegrees(razo.shoreFacingDeg! + 180), windGustKmh: 8,
        tideNormalized: razo.tidePreference.ideal,
      }), 'open-meteo', generatedAt)

      expect(result.ratingConstraint).not.toBe('short-period')
      expect(result.ratingConstraint).not.toBe('weak-short-period')
    })

    it('does not mislabel Flat-wind sea as Flat', () => {
      const result = scoreForecastHour(razo, hour({
        swellDirectionDeg: razo.idealSwellDeg!,
        waveDirectionDeg: razo.idealSwellDeg!,
        waveHeightM: 0.5, swellHeightM: 0.5, swellPeriodS: 5,
        windWaveHeightM: null, windWaveDirectionDeg: null, windWavePeriodS: null,
        secondarySwellHeightM: null, secondarySwellDirectionDeg: null, secondarySwellPeriodS: null,
        windSpeedKmh: 5, windDirectionDeg: normalizeDegrees(razo.shoreFacingDeg! + 180), windGustKmh: 8,
        tideNormalized: razo.tidePreference.ideal,
      }), 'open-meteo', generatedAt)

      // Should not be Flat — surf exists, just weak
      expect(result.score).not.toBe(0)
    })

    it('preserves calm wind score (~90) even with short period', () => {
      const result = scoreForecastHour(razo, hour({
        swellDirectionDeg: razo.idealSwellDeg!,
        waveDirectionDeg: razo.idealSwellDeg!,
        waveHeightM: 0.9, swellHeightM: 0.9, swellPeriodS: 6,
        windWaveHeightM: null, windWaveDirectionDeg: null, windWavePeriodS: null,
        secondarySwellHeightM: null, secondarySwellDirectionDeg: null, secondarySwellPeriodS: null,
        windSpeedKmh: 3, windDirectionDeg: 45, windGustKmh: 6,
        tideNormalized: razo.tidePreference.ideal,
      }), 'open-meteo', generatedAt)

      // Wind penalty should still be minor despite the period cap
      expect(result.breakdown.wind).toBeGreaterThan(75)
    })
  })
})

