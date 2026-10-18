import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Drop,
  Waves,
} from '@phosphor-icons/react'
import { useParams } from 'react-router-dom'
import { getSpotBySlug } from '../data/spots'
import type { ForecastReason, ScoredForecastHour } from '../domain/forecast'
import { dailyForecasts, formatClock, formatDay } from '../domain/forecastSelectors'
import { directionToCompass } from '../domain/scoreEngine'
import { FORECAST_TIME_ZONE } from '../domain/forecastTime'
import { sunTimes } from '../domain/sun'
import { nextTideExtremum, tideSeries, tideTrend } from '../domain/tideCurve'
import { formatWavePower, wavePowerBand, wavePowerKwPerM, type WavePowerBand } from '../domain/wavePower'
import { weatherInfo, type WeatherKind } from '../domain/weatherCode'
import { PageNav } from '../features/layout/PageChrome'
import { SpotDetailSkeleton } from '../features/loading/PublicPageSkeletons'
import { SpotHeading } from '../features/forecast/SpotHeading'
import { DayTable } from '../features/forecast/DayTable'
import { DirectionContextMap } from '../features/forecast/DirectionContextMap'
import { useForecast } from '../features/forecast/forecastContext'
import { useLocale } from '../features/i18n/localeContext'
import type { CopyKey } from '../features/i18n/localeCopy'
import { ConditionReport } from '../features/reports/ConditionReport'

const reasonCopy: Record<ForecastReason['key'], CopyKey> = {
  flatSurf: 'reasonFlatSurf',
  directSwell: 'reasonDirectSwell',
  angledSwell: 'reasonAngledSwell',
  shadowedSwell: 'reasonShadowedSwell',
  offshoreWind: 'reasonOffshoreWind',
  crossWind: 'reasonCrossWind',
  onshoreWind: 'reasonOnshoreWind',
  lightWind: 'reasonLightWind',
  missingWind: 'reasonMissingWind',
  missingTide: 'reasonMissingTide',
  strongOffshoreWind: 'reasonStrongOffshoreWind',
  goodTide: 'reasonGoodTide',
  poorTide: 'reasonPoorTide',
  smallSurf: 'reasonSmallSurf',
  largeSurf: 'reasonLargeSurf',
  longPeriod: 'reasonLongPeriod',
  mixedSwell: 'reasonMixedSwell',
  weakWindSea: 'reasonWeakWindSea',
  shortPeriod: 'reasonShortPeriod',
  provisionalProfile: 'reasonProvisionalProfile',
  unknownOrientation: 'reasonUnknownOrientation',
  unknownTide: 'reasonUnknownTide',
  missingBathymetry: 'reasonMissingBathymetry',
  genericHeightRange: 'reasonGenericHeightRange',
  genericPeriodRange: 'reasonGenericPeriodRange',
}

const windImpactCopy: Record<ScoredForecastHour['windImpact'], CopyKey> = {
  offshore: 'offshore',
  'cross-offshore': 'crossOffshore',
  'cross-shore': 'crossShore',
  'cross-onshore': 'crossOnshore',
  onshore: 'onshore',
  variable: 'variable',
}

const powerBandCopy: Record<WavePowerBand, CopyKey> = {
  calm: 'powerCalm',
  fun: 'powerFun',
  solid: 'powerSolid',
  heavy: 'powerHeavy',
}

const weatherCopy: Record<WeatherKind, CopyKey> = {
  clear: 'weatherClear',
  partly: 'weatherPartly',
  cloudy: 'weatherCloudy',
  fog: 'weatherFog',
  drizzle: 'weatherDrizzle',
  rain: 'weatherRain',
  showers: 'weatherShowers',
  snow: 'weatherSnow',
  thunder: 'weatherThunder',
}

const verdictCopy = ['verdict0', 'verdict1', 'verdict2', 'verdict3', 'verdict4', 'verdict5'] as const

export function SpotDetailPage() {
  const { slug = 'pantin' } = useParams()
  const { summary, getSpotForecast, spotCache } = useForecast()
  const spot = getSpotBySlug(slug, summary?.spots)
  const { locale, t } = useLocale()
  const intlLocale = locale === 'gl' ? 'gl-ES' : 'es-ES'

  const spotForecast = spotCache.get(slug) ?? null
  const [retryAttempt, setRetryAttempt] = useState(0)
  const [failedSlug, setFailedSlug] = useState<string | null>(null)
  const forecastStatus = spotForecast ? 'ready' : failedSlug === slug ? 'error' : 'loading'

  useEffect(() => {
    if (spotCache.has(slug)) return
    let active = true
    void getSpotForecast(slug).then(() => { if (active) setFailedSlug(null) })
      .catch(() => { if (active) setFailedSlug(slug) })
    return () => { active = false }
  }, [slug, getSpotForecast, spotCache, retryAttempt])

  const days = useMemo(() => dailyForecasts(spotForecast ?? undefined), [spotForecast])
  const [selectedDay, setSelectedDay] = useState(0)
  const [selectedTime, setSelectedTime] = useState<string | null>(null)
  const activeDay = days[selectedDay] ?? days[0]
  const selectedHour = activeDay?.hours.find((hour) => hour.time === selectedTime) ?? activeDay?.best

  const sunProp = useMemo(() => {
    if (!activeDay) return null
    const sun = sunTimes(new Date(`${activeDay.dateKey}T12:00:00Z`), spot.latitude, spot.longitude)
    if (!sun) return null
    const fmt = new Intl.DateTimeFormat(intlLocale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: FORECAST_TIME_ZONE })
    return {
      sunrise: sun.sunrise.toISOString(),
      sunset: sun.sunset.toISOString(),
      label: `\u2191 ${fmt.format(sun.sunrise)} \u00b7 \u2193 ${fmt.format(sun.sunset)}`,
    }
  }, [activeDay, spot.latitude, spot.longitude, intlLocale])

  if (forecastStatus === 'loading') return <SpotDetailSkeleton spot={spot} />

  if (forecastStatus === 'error' || !selectedHour || !activeDay) {
    return (
      <main className="detail-page">
        <PageNav />
        <div className="detail-shell">
          <section className="forecast-unavailable" role="status">
            <p className="kicker">{spot.name}</p>
            <h1>{t(forecastStatus === 'error' ? 'forecastError' : 'forecastEmpty')}</h1>
            {forecastStatus === 'error' && <button type="button" className="account-secondary" onClick={() => { setFailedSlug(null); setRetryAttempt(attempt => attempt + 1) }}>{t('retry')}</button>}
          </section>
        </div>
      </main>
    )
  }

  const sourceLabel =
    spotForecast?.source === 'open-meteo'
      ? t('live')
      : spotForecast?.source === 'demo'
        ? t('demo')
        : t('cached')
  const swellDirection =
    selectedHour.effectiveDirectionDeg ??
    selectedHour.swellDirectionDeg ??
    selectedHour.waveDirectionDeg
  const swellPeriod =
    selectedHour.effectivePeriodS ??
    selectedHour.swellPeriodS ??
    selectedHour.wavePeriodS
  const power = wavePowerKwPerM(selectedHour.effectiveHeightM, swellPeriod)
  const band = wavePowerBand(power)
  const tidePct =
    selectedHour.tideNormalized === null ? null : Math.round(selectedHour.tideNormalized * 100)
  const sky = weatherInfo(selectedHour.weatherCode)
  const rainProb =
    selectedHour.precipProbabilityPct !== null
      ? Math.round(selectedHour.precipProbabilityPct)
      : null

  const tidePoints = tideSeries(activeDay.hours)
  const tideNow = tideTrend(tidePoints, selectedHour.time)
  const tideNext = nextTideExtremum(tidePoints, selectedHour.time)

  const extraBits: string[] = []
  if (sky)
    extraBits.push(
      selectedHour.cloudCoverPct !== null
        ? `${t(weatherCopy[sky.kind])} ${Math.round(selectedHour.cloudCoverPct)}%`
        : t(weatherCopy[sky.kind]),
    )
  if (rainProb !== null && rainProb > 0) extraBits.push(`${t('rain')} ${rainProb}%`)
  if (selectedHour.seaTemperatureC !== null)
    extraBits.push(`${t('seaTemperature')} ${selectedHour.seaTemperatureC.toFixed(0)}\u00b0`)
  if (selectedHour.airTemperatureC !== null) {
    extraBits.push(
      `${t('airTemperature')} ${selectedHour.airTemperatureC.toFixed(0)}\u00b0${selectedHour.feelsLikeC !== null ? ` (${t('feelsLike').toLowerCase()} ${selectedHour.feelsLikeC.toFixed(0)}\u00b0)` : ''}`,
    )
  }
  if (power !== null)
    extraBits.push(
      `${formatWavePower(power)} kW/m${band ? ` \u00b7 ${t(powerBandCopy[band]).toLowerCase()}` : ''}`,
    )
  extraBits.push(`${t('exposure')} ${selectedHour.exposure}%`)
  if (selectedHour.swellHeightM !== null) {
    const offshoreDirection = selectedHour.swellDirectionDeg ?? selectedHour.waveDirectionDeg
    const offshorePeriod = selectedHour.swellPeriodS ?? selectedHour.wavePeriodS
    extraBits.push(
      `${t('offshorePrimarySwell')} ${selectedHour.swellHeightM.toFixed(1)} m \u00b7 ${offshorePeriod === null ? '\u2014' : `${Math.round(offshorePeriod)} s`} \u00b7 ${directionToCompass(offshoreDirection)}${offshoreDirection === null ? '' : ` ${Math.round(offshoreDirection)}\u00b0`}`,
    )
  }

  return (
    <main className="detail-page">
      <PageNav />

      <div className="detail-shell">
        <div className="top-grid">
          <SpotHeading spot={spot}>
              <div
                className={`score-dial dial-${selectedHour.score}`}
                style={{ '--pct': selectedHour.score * 20 } as CSSProperties}
              >
                <div className="score-dial__inner">
                  <strong>{selectedHour.score}</strong>
                  <span>/5</span>
                </div>
              </div>
              <div>
                <strong>{t(verdictCopy[selectedHour.score] ?? 'verdict0')}</strong>
                <span>
                  {t('bestWindow')}: {formatDay(activeDay.dateKey, intlLocale, true)} {'\u00b7'}{' '}
                  {formatClock(activeDay.best.time, intlLocale)}
                </span>
              </div>
          </SpotHeading>

          <section className="directions">
            <p className="kicker">{t('directions')}</p>
            <DirectionContextMap spot={spot} hour={selectedHour} />
          </section>

          <section className="now" aria-label={t('nowOnTheWater')}>
            <p className="kicker">
              <Waves size={14} weight="bold" /> {formatDay(selectedHour.time, intlLocale, true)} {'\u00b7'}{' '}
              {formatClock(selectedHour.time, intlLocale)}
            </p>
            <div className="now__main">
              <div className="now__cell">
                <p>{t('surfHeight')}</p>
                <strong>
                  {selectedHour.effectiveHeightM.toFixed(1)}
                  <small> m</small>
                </strong>
                <span>
                  {swellPeriod === null ? '\u2014' : `${Math.round(swellPeriod)} s`} {'\u00b7'}{' '}
                  {directionToCompass(swellDirection)}
                  {swellDirection === null ? '' : ` ${Math.round(swellDirection)}\u00b0`}
                </span>
              </div>
              <div className="now__cell">
                <p>{t('wind')}</p>
                <strong>
                  {selectedHour.windSpeedKmh === null
                    ? '\u2014'
                    : Math.round(selectedHour.windSpeedKmh)}
                  <small> km/h</small>
                </strong>
                <span>
                  {directionToCompass(selectedHour.windDirectionDeg)} {'\u00b7'}{' '}
                  {t(windImpactCopy[selectedHour.windImpact])}
                  {selectedHour.windGustKmh !== null &&
                    ` \u00b7 ${t('gusts')} ${Math.round(selectedHour.windGustKmh)}`}
                </span>
              </div>
              <div className="now__cell">
                <p>{t('tide')}</p>
                <strong>
                  {tidePct === null ? '\u2014' : tidePct}
                  <small> %</small>
                </strong>
                <span>
                  {tideNow && (
                    <em className={`now__trend now__trend--${tideNow}`}>
                      {tideNow === 'rising' ? (
                        <ArrowUpRight size={13} weight="bold" />
                      ) : (
                        <ArrowDownRight size={13} weight="bold" />
                      )}{' '}
                      {t(tideNow)}
                    </em>
                  )}
                  {tideNext &&
                    ` \u00b7 ${t(tideNext.kind === 'high' ? 'tideHigh' : 'tideLow')} ~${formatClock(tideNext.time, intlLocale)}`}
                </span>
              </div>
            </div>
            <p className="now__extra">{extraBits.join(' \u00b7 ')}</p>
          </section>
        </div>

        <section className="day">
          <p className="kicker">
            <Drop size={14} weight="fill" /> {t('theDay')} {'\u00b7'}{' '}
            {formatDay(activeDay.dateKey, intlLocale, true)}
          </p>
          <DayTable
            hours={activeDay.hours}
            selectedTime={selectedHour.time}
            sun={sunProp}
            locale={intlLocale}
            onSelect={setSelectedTime}
          />
        </section>

        <section className="week">
          <p className="kicker">{t('sevenDays')}</p>
          <div className="week__rows">
            {days.map((day, index) => (
              <button
                key={day.dateKey}
                type="button"
                className={`week__row${index === selectedDay ? ' is-active' : ''}`}
                onClick={() => {
                  setSelectedDay(index)
                  setSelectedTime(day.best.time)
                }}
              >
                <span>{formatDay(day.dateKey, intlLocale)}</span>
                <i className={`score-${day.best.score}`}>{day.best.score}</i>
                <strong>{day.best.effectiveHeightM.toFixed(1)} m</strong>
                <em>{formatClock(day.best.time, intlLocale)}</em>
              </button>
            ))}
          </div>
        </section>

        <section className="why">
          <p className="kicker">{t('whyScore')}</p>
          <p className="why__quality">
            {selectedHour.score}/5 {'\u00b7'} {selectedHour.quality}/100 {'\u00b7'} {t('confidence')}{' '}
            {selectedHour.confidence}%
          </p>
          <div className="reason-list">
            {selectedHour.reasons.map((reason) => (
              <div key={reason.key} className={`reason reason--${reason.kind}`}>
                <i />
                <p>{t(reasonCopy[reason.key])}</p>
              </div>
            ))}
          </div>

          <p className="kicker breakdown-kicker">{t('modelBreakdown')}</p>
          <div className="breakdown-list">
            {(
              [
                [t('swellPotential'), selectedHour.breakdown.swell],
                [t('coastalExposure'), selectedHour.breakdown.shoreline],
                [t('wind'), selectedHour.breakdown.wind],
                [t('tide'), selectedHour.breakdown.tide],
                [t('consistency'), selectedHour.breakdown.consistency],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <i>
                  <b style={{ width: `${value}%` }} />
                </i>
              </div>
            ))}
          </div>
        </section>

        <footer className="detail-foot">
          <p>
            {sourceLabel}
            {spotForecast?.model ? ` \u00b7 ${spotForecast.model}` : ''} {'\u00b7'} {t('updated')}{' '}
            {new Intl.DateTimeFormat(intlLocale, {
              timeZone: FORECAST_TIME_ZONE,
              dateStyle: 'short',
              timeStyle: 'short',
            }).format(new Date(spotForecast?.generatedAt ?? summary!.generatedAt))}
            . {t('dataWarningV2')}
          </p>
          <ConditionReport key={`${slug}:${selectedHour.time}:${spotForecast?.snapshotId}`} spot={spot} hour={selectedHour} snapshotId={spotForecast?.snapshotId} />
        </footer>
      </div>
    </main>
  )
}

