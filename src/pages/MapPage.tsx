import { useMemo, useState } from 'react'
import {
  ArrowRight,
  ArrowsClockwise,
  Clock,
  Drop,
  MagnifyingGlass,
  MapPin,
  Waves,
  Wind,
  X,
} from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { getSpotBySlug, surfSpots } from '../data/spots'
import type { ForecastHourScore } from '../domain/forecast'
import { findHourAt, formatClock, formatDay, threeHourlySlots } from '../domain/forecastSelectors'
import { directionToCompass } from '../domain/scoreEngine'
import { useForecast } from '../features/forecast/forecastContext'
import { useLocale } from '../features/i18n/localeContext'
import { MapMast } from '../features/layout/PageChrome'
import { SpotSheetSkeletonBody } from '../features/loading/PublicPageSkeletons'
import { LoadingStatus, Skeleton } from '../features/ui/Loading'
import { ForecastMap } from '../features/map/ForecastMap'

const normalizeText = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function MapPage() {
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ slug: string; tick: number } | null>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState(0)
  const { summary, status, error, isRefreshing, refresh } = useForecast()
  const { locale, t } = useLocale()
  const intlLocale = locale === 'gl' ? 'gl-ES' : 'es-ES'

  const spots = summary?.spots?.length ? summary.spots : surfSpots

  const referenceSlug = spots[0]?.slug
  const referenceHours = summary?.forecasts[referenceSlug]?.hours
  const slots = useMemo(() => threeHourlySlots(referenceHours), [referenceHours])

  const safeSelectedSlot = Math.min(selectedSlot, Math.max(0, slots.length - 1))
  const selectedTime = slots[safeSelectedSlot]?.time

  const scores = useMemo(
    () =>
      Object.fromEntries(
        spots.map((spot) => {
          const hour = findHourAt(summary?.forecasts[spot.slug]?.hours, selectedTime)
          return [spot.slug, hour?.score ?? null] as [string, number | null]
        }),
      ),
    [summary, selectedTime, spots],
  )

  const bestSlug = useMemo(
    () =>
      spots.reduce(
        (best, spot) => ((scores[spot.slug] ?? -1) > (scores[best.slug] ?? -1) ? spot : best),
        spots[0],
      ).slug,
    [scores, spots],
  )
  const hasScores = Object.values(scores).some(score => score !== null)

  const activeSpot = getSpotBySlug(activeSlug ?? bestSlug, spots)
  const activeHour = findHourAt(
    summary?.forecasts[activeSpot.slug]?.hours,
    selectedTime,
  ) as ForecastHourScore | null

  const results = useMemo(() => {
    const ranked = [...spots].sort((a, b) => (scores[b.slug] ?? -1) - (scores[a.slug] ?? -1))
    const term = normalizeText(query.trim())
    if (!term) return ranked
    return ranked.filter((spot) =>
      normalizeText(`${spot.name} ${spot.municipality}`).includes(term),
    )
  }, [query, scores, spots])

  const selectSpot = (slug: string) => {
    setActiveSlug(slug)
    setFocus({ slug, tick: Date.now() })
    setQuery('')
    setSearchOpen(false)
  }

  const sourceLabel =
    summary?.source === 'open-meteo'
      ? t('live')
      : summary?.source === 'demo'
        ? t('demo')
        : t('cached')
  const sourceDotClass =
    summary?.source === 'open-meteo'
      ? 'dot--live'
      : summary?.source === 'demo'
        ? 'dot--demo'
        : 'dot--cache'
  const updatedAt = summary ? formatClock(summary.generatedAt, intlLocale) : null

  return (
    <main className="home-page">
      <ForecastMap
        spots={spots}
        activeSlug={activeSpot.slug}
        scores={scores}
        focus={focus}
        onSelect={selectSpot}
      />

      <MapMast>
        <div
          className={`spot-search${searchOpen ? ' is-open' : ''}`}
          onFocus={() => setSearchOpen(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false)
          }}
        >
          <MagnifyingGlass size={17} weight="bold" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSearchOpen(true)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && results[0]) selectSpot(results[0].slug)
              if (event.key === 'Escape') {
                setQuery('')
                setSearchOpen(false)
                event.currentTarget.blur()
              }
            }}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
          />
          {query && (
            <button
              type="button"
              className="spot-search__clear"
              aria-label="x"
              onClick={() => setQuery('')}
            >
              <X size={13} weight="bold" />
            </button>
          )}
          {searchOpen && (
            <div
              className="spot-search__results"
              role="listbox"
              onMouseDown={(event) => event.preventDefault()}
            >
              {results.length ? (
                results.map((spot) => (
                  <button
                    key={spot.slug}
                    type="button"
                    className={`spot-search__result${spot.slug === activeSpot.slug ? ' is-active' : ''}`}
                    onClick={() => selectSpot(spot.slug)}
                  >
                    <span className={`ticket-score ${scores[spot.slug] === null ? 'score-pending' : `score-${scores[spot.slug]}`}`}>
                      {scores[spot.slug] ?? '—'}
                    </span>
                    <span className="spot-search__name">
                      <strong>{spot.name}</strong>
                      <small>{spot.municipality}</small>
                    </span>
                    {hasScores && spot.slug === bestSlug && <em>{t('bestSpotNow')}</em>}
                  </button>
                ))
              ) : (
                <p className="spot-search__empty">{t('noResults')}</p>
              )}
            </div>
          )}
        </div>

      </MapMast>

      <section className="spot-sheet" aria-busy={status === 'loading'}>
        {hasScores && activeSpot.slug === bestSlug && <span className="stamp">{t('bestSpotNow')}</span>}
        <div className="spot-sheet__head">
          <div>
            <p>
              <MapPin size={13} weight="fill" /> {activeSpot.municipality}
            </p>
            <h1>{activeSpot.name}</h1>
          </div>
          {activeHour ? <span className={`large-score score-${activeHour.score}`}>{activeHour.score}</span> : status === 'loading' ? <Skeleton className="large-score" /> : <span className="large-score score-pending">—</span>}
        </div>

        {activeHour ? (
          <>
            <div className="spot-sheet__metrics">
              <article>
                <Waves size={18} weight="bold" />
                <div>
                  <strong>
                    {activeHour.effectiveHeightM.toFixed(1)} m ·{' '}
                    {Math.round(activeHour.effectivePeriodS ?? 0)} s
                  </strong>
                  <span>{t('surfHeight')}</span>
                </div>
              </article>
              <article>
                <Wind size={18} weight="bold" />
                <div>
                  <strong>
                    {directionToCompass(activeHour.windDirectionDeg)}{' '}
                    {Math.round(activeHour.windSpeedKmh ?? 0)} km/h
                  </strong>
                  <span>{t('wind')}</span>
                </div>
              </article>
              <article>
                <Drop size={18} weight="fill" />
                <div>
                  <strong>
                    {activeHour.tideNormalized === null
                      ? '\u2014'
                      : `${Math.round(activeHour.tideNormalized * 100)}%`}
                  </strong>
                  <span>{t('tide')}</span>
                </div>
              </article>
            </div>

            <Link to={`/spots/${activeSpot.slug}`} className="primary-link">
              {t('viewDetails')} <ArrowRight size={17} weight="bold" />
            </Link>

            <div className="spot-sheet__time">
              <label>
                <Clock size={15} weight="bold" />
                <span>{selectedTime ? formatDay(selectedTime, intlLocale) : t('forecast')}</span>
                <strong>{selectedTime ? formatClock(selectedTime, intlLocale) : '\u2014'}</strong>
              </label>
              <input
                type="range"
                min="0"
                max={Math.max(0, slots.length - 1)}
                value={safeSelectedSlot}
                onChange={(event) => setSelectedSlot(Number(event.target.value))}
                disabled={!slots.length}
                aria-label="Hora de previsión"
              />
            </div>

            <p className="spot-sheet__meta">
              <i className={sourceDotClass} />
              <span>
                {status === 'loading'
                  ? '\u2026'
                  : `${sourceLabel} \u00b7 ${t('updated')} ${updatedAt} \u00b7 ${t('confidence')} ${activeHour.confidence}%`}
              </span>
              <button
                type="button"
                className="spot-sheet__refresh"
                onClick={() => void refresh()}
                aria-label={t('refresh')}
                disabled={isRefreshing}
              >
                <ArrowsClockwise
                  size={14}
                  weight="bold"
                  className={isRefreshing ? 'is-spinning' : ''}
                />
              </button>
            </p>
          </>
        ) : status === 'loading' ? <SpotSheetSkeletonBody /> : (
          <div className="forecast-empty" role="status">
            <p>{error ? t('forecastError') : t('forecastEmpty')}</p>
            <button type="button" className="account-secondary" disabled={isRefreshing} onClick={() => void refresh()}>{isRefreshing ? t('refreshing') : t('retry')}</button>
            <Link to={`/spots/${activeSpot.slug}`}>{t('viewDetails')} <ArrowRight size={15} /></Link>
          </div>
        )}
      </section>

      {isRefreshing && <LoadingStatus>{t('refreshing')}</LoadingStatus>}
      {error && activeHour && <div className="forecast-warning" role="status">{t('forecastError')} <button type="button" disabled={isRefreshing} onClick={() => void refresh()}>{t('retry')}</button></div>}
    </main>
  )
}
