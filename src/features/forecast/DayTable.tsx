import { useEffect, useRef, type MouseEvent } from 'react'
import { Clock } from '@phosphor-icons/react'
import type { ScoredForecastHour } from '../../domain/forecast'
import { formatClock } from '../../domain/forecastSelectors'
import { directionToCompass } from '../../domain/scoreEngine'
import { tideExtrema, tideSeries } from '../../domain/tideCurve'
import { useLocale } from '../i18n/localeContext'

const Y = (level: number) => 8 + (1 - level) * 84

/** Catmull-Rom → cubic Bézier for a hand-drawn smooth tide line. */
function smoothPath(coords: Array<[number, number]>) {
  if (coords.length < 2) return ''
  let path = `M ${coords[0][0].toFixed(2)} ${coords[0][1].toFixed(2)}`
  for (let index = 0; index < coords.length - 1; index += 1) {
    const p0 = coords[Math.max(0, index - 1)]
    const p1 = coords[index]
    const p2 = coords[index + 1]
    const p3 = coords[Math.min(coords.length - 1, index + 2)]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
  }
  return path
}

/**
 * The whole day in one element: the tide curve (with daylight shading,
 * sun hairlines and high/low labels) sits directly over the hourly table
 * so both share the same hour columns and the same horizontal scroll on
 * thin screens. Every hour is visible at a glance; clicking any column or
 * the curve selects that hour and moves the map arrows.
 */
export function DayTable({ hours, selectedTime, sun, locale, onSelect }: {
  hours: ScoredForecastHour[]
  selectedTime: string
  /** Absolute sun instants; chart spacing uses elapsed minutes across DST changes. */
  sun: { sunrise: string; sunset: string; label: string } | null
  locale: string
  onSelect: (time: string) => void
}) {
  const { t } = useLocale()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const firstScroll = useRef(true)

  /* keep the selected column centered inside the horizontal scroll
     container (never scroll the page itself) */
  useEffect(() => {
    const container = scrollRef.current
    const active = container?.querySelector('.dt__th.is-active')
    if (!container || !active || container.scrollWidth <= container.clientWidth) return
    const c = container.getBoundingClientRect()
    const r = active.getBoundingClientRect()
    container.scrollTo({ left: container.scrollLeft + (r.left - c.left) - c.width / 2 + r.width / 2, behavior: firstScroll.current ? 'auto' : 'smooth' })
    firstScroll.current = false
  }, [selectedTime])

  const points = tideSeries(hours)
  if (hours.length < 2 || points.length < 3) return null

  const cols = hours.length
  const firstInstant = Date.parse(hours[0].time)
  const minutesOf = (time: string) => (Date.parse(time) - firstInstant) / 60_000
  const firstMin = 0
  const lastMin = minutesOf(hours[cols - 1].time)
  const step = cols > 1 ? Math.max(1, (lastMin - firstMin) / (cols - 1)) : 60
  const spanMin = lastMin - firstMin + step
  const X = (minutes: number) => ((minutes - firstMin) / spanMin) * 100

  const coords = points.map((point) => [X(minutesOf(point.time)), Y(point.level)] as [number, number])
  const line = smoothPath(coords)
  const area = `${line} L ${coords.at(-1)![0].toFixed(2)} 100 L ${coords[0][0].toFixed(2)} 100 Z`
  const extrema = tideExtrema(points).slice(0, 5)

  const selectedIndex = Math.max(0, hours.findIndex((hour) => hour.time === selectedTime))
  const selectedX = ((selectedIndex + 0.5) / cols) * 100
  const sunriseX = sun ? X(minutesOf(sun.sunrise)) : null
  const sunsetX = sun ? X(minutesOf(sun.sunset)) : null
  const hasRain = hours.some((hour) => (hour.precipProbabilityPct ?? 0) >= 20)

  const pickHour = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = Math.min(0.999, Math.max(0, (event.clientX - rect.left) / rect.width))
    onSelect(hours[Math.floor(fraction * cols)].time)
  }

  return (
    <div className="dt-scroll" ref={scrollRef}>
      <div className="dt" style={{ '--cols': cols } as React.CSSProperties}>
        <div className="dt__corner" aria-hidden="true" />
        <div className="dt__curve" onClick={pickHour} role="presentation">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {sunriseX !== null && sunsetX !== null && sunsetX > sunriseX && (
              <rect className="dt__daylight" x={sunriseX} y={0} width={sunsetX - sunriseX} height={100} />
            )}
            <path className="dt__area" d={area} />
            <path className="dt__line" d={line} />
          </svg>
          {sunriseX !== null && <i className="dt__sun" style={{ left: `${sunriseX}%` }} />}
          {sunsetX !== null && <i className="dt__sun" style={{ left: `${sunsetX}%` }} />}
          <i className="dt__selected" style={{ left: `${selectedX}%` }} />
          {extrema.map((extremum) => (
            <div
              key={extremum.time}
              className={`dt__extremum dt__extremum--${extremum.kind}`}
              style={{ left: `${X(minutesOf(extremum.time))}%`, top: `${Y(extremum.level)}%` }}
            >
              <i />
              <span>{formatClock(extremum.time, locale)}</span>
            </div>
          ))}
          {sun && <small>{sun.label}</small>}
        </div>

        <div className="dt__label" aria-hidden="true"><Clock size={12} weight="bold" /></div>
        {hours.map((hour) => (
          <button key={hour.time} type="button" className={`dt__th${hour.time === selectedTime ? ' is-active' : ''}`} onClick={() => onSelect(hour.time)}>
            {formatClock(hour.time, locale)}
          </button>
        ))}

        <div className="dt__label">{t('scoreShort')}</div>
        {hours.map((hour) => (
          <button key={hour.time} type="button" className={`dt__cell${hour.time === selectedTime ? ' is-active' : ''}`} onClick={() => onSelect(hour.time)}>
            <i className={`dt__dot score-${hour.score}`}>{hour.score}</i>
          </button>
        ))}

        <div className="dt__label">{t('swell')} (m)</div>
        {hours.map((hour) => (
          <button key={hour.time} type="button" className={`dt__cell${hour.time === selectedTime ? ' is-active' : ''}`}>
            <strong>{hour.effectiveHeightM.toFixed(1)}</strong>
            <small>{hour.effectivePeriodS ?? hour.swellPeriodS ?? hour.wavePeriodS ? `${Math.round((hour.effectivePeriodS ?? hour.swellPeriodS ?? hour.wavePeriodS)!)} s ${directionToCompass(hour.effectiveDirectionDeg ?? hour.swellDirectionDeg ?? hour.waveDirectionDeg)}` : '—'}</small>
          </button>
        ))}

        <div className="dt__label">{t('wind')} (km/h)</div>
        {hours.map((hour) => (
          <button key={hour.time} type="button" className={`dt__cell${hour.time === selectedTime ? ' is-active' : ''}`}>
            <strong>{hour.windSpeedKmh === null ? '—' : Math.round(hour.windSpeedKmh)}</strong>
            <small>{directionToCompass(hour.windDirectionDeg)}</small>
          </button>
        ))}

        <div className="dt__label">{t('tide')} (%)</div>
        {hours.map((hour) => (
          <button key={hour.time} type="button" className={`dt__cell${hour.time === selectedTime ? ' is-active' : ''}`}>
            <strong>{hour.tideNormalized === null ? '—' : Math.round(hour.tideNormalized * 100)}</strong>
          </button>
        ))}

        {hasRain && (
          <>
            <div className="dt__label">{t('rain')} (%)</div>
            {hours.map((hour) => (
              <button key={hour.time} type="button" className={`dt__cell${hour.time === selectedTime ? ' is-active' : ''}`}>
                <strong className="dt__rain">{hour.precipProbabilityPct === null || hour.precipProbabilityPct < 20 ? '—' : Math.round(hour.precipProbabilityPct)}</strong>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

