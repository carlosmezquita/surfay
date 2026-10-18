import type { CSSProperties } from 'react'
import { Compass, MapPin } from '@phosphor-icons/react'
import type { ScoredForecastHour, SpotProfile } from '../../domain/forecast'
import { directionToCompass, normalizeDegrees } from '../../domain/scoreEngine'
import { formatWavePower, wavePowerKwPerM } from '../../domain/wavePower'
import { useLocale } from '../i18n/localeContext'
import { SpotMiniMap } from '../map/SpotMiniMap'

/**
 * Compass-needle arrow: a single pointy half-needle (triangle) whose tip
 * disappears under the spot pin, pointing in the travel direction like the
 * needle of a compass or a veleta.
 */
function VectorArrow({ bearingFrom, kind }: { bearingFrom: number; kind: 'swell' | 'wind' }) {
  const travelBearing = normalizeDegrees(bearingFrom + 180)
  const style = { '--vector-bearing': `${travelBearing - 90}deg` } as CSSProperties

  return (
    <div className={`direction-vector direction-vector--${kind}`} style={style} aria-hidden="true">
      <div className="direction-vector__track">
        <svg className="direction-vector__arrow" viewBox="-40 -9 80 18" preserveAspectRatio="none" aria-hidden="true">
          <path className="direction-vector__needle" d="M0,0 L-40,8 L-40,-8 Z" />
        </svg>
      </div>
    </div>
  )
}

/**
 * Minimal direction map: compass needles + pin, and one caption line with the
 * numbers. Needles point toward the spot pin in the direction the swell/wind
 * travels, like the needle of a compass.
 */
export function DirectionContextMap({ spot, hour }: { spot: SpotProfile; hour: ScoredForecastHour }) {
  const { t } = useLocale()
  const swellDirection = hour.swellDirectionDeg ?? hour.waveDirectionDeg
  const swellHeight = hour.swellHeightM ?? hour.waveHeightM
  const swellPeriod = hour.swellPeriodS ?? hour.wavePeriodS
  const power = wavePowerKwPerM(hour.effectiveHeightM, hour.effectivePeriodS ?? swellPeriod)

  return (
    <div className="direction-context">
      <div className="direction-map">
        <SpotMiniMap key={spot.slug} spot={spot} />
        <div className="direction-map__wash" />
        <div className="direction-map__compass" aria-hidden="true"><Compass size={18} weight="bold" /><span>N</span></div>
        <div className="direction-map__shore-label">
          {t('beachFaces')} {spot.shoreFacingDeg !== null ? `${directionToCompass(spot.shoreFacingDeg)} · ${Math.round(spot.shoreFacingDeg)}°` : '—'}
        </div>

        {swellDirection !== null && <VectorArrow bearingFrom={swellDirection} kind="swell" />}
        {hour.windDirectionDeg !== null && <VectorArrow bearingFrom={hour.windDirectionDeg} kind="wind" />}

        <div className="direction-map__spot" aria-hidden="true"><MapPin size={22} weight="fill" /></div>
      </div>

      <p className="direction-caption">
        <span><i className="legend-swatch legend-swatch--swell" />{t('primarySwell')} {directionToCompass(swellDirection)}{swellDirection === null ? '' : ` ${Math.round(swellDirection)}°`}
          {swellHeight !== null && ` · ${swellHeight.toFixed(1)} m`}
          {swellPeriod !== null && ` ${Math.round(swellPeriod)} s`}
          {power !== null && ` · ${formatWavePower(power)} kW/m`}
        </span>
        <span><i className="legend-swatch legend-swatch--wind" />{t('wind')} {directionToCompass(hour.windDirectionDeg)}{hour.windDirectionDeg === null ? '' : ` ${Math.round(hour.windDirectionDeg)}°`}
          {hour.windSpeedKmh !== null && ` · ${Math.round(hour.windSpeedKmh)} km/h`}
        </span>
      </p>
    </div>
  )
}
