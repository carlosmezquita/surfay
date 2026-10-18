import { Fragment, type CSSProperties } from 'react'
import { Clock, Drop, Waves, Wind } from '@phosphor-icons/react'
import { useParams } from 'react-router-dom'
import { surfSpots } from '../../data/spots'
import type { SpotProfile } from '../../domain/forecast'
import { SpotHeading } from '../forecast/SpotHeading'
import { AccountAuthHeading } from '../auth/AccountAuthHeading'
import { useLocale } from '../i18n/localeContext'
import { MapMast, PageNav } from '../layout/PageChrome'
import { LoadingStatus, Skeleton } from '../ui/Loading'

export function MapLoadingSurface({ compact = false }: { compact?: boolean }) {
  const { t } = useLocale()
  return (
    <div className={`map-loading-surface${compact ? ' map-loading-surface--compact' : ''}`}>
      <div className="map-loading-surface__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <LoadingStatus>{t('loadingMap')}</LoadingStatus>
    </div>
  )
}

/** Uses the same metric grid, CTA, clock, slider and provenance slots as the live sheet. */
export function SpotSheetSkeletonBody() {
  const { t } = useLocale()
  return (
    <>
      <LoadingStatus>{t('loadingForecast')}</LoadingStatus>
      <div className="spot-sheet__metrics" aria-hidden="true">
        {[Waves, Wind, Drop].map((Icon, index) => (
          <article key={index}>
            <Icon size={18} weight="bold" />
            <div>
              <strong className="sheet-value">
                <Skeleton />
              </strong>
              <span>{t(index === 0 ? 'surfHeight' : index === 1 ? 'wind' : 'tide')}</span>
            </div>
          </article>
        ))}
      </div>
      <div className="primary-link skeleton-action" aria-hidden="true">
        <Skeleton className="skeleton--button-label" />
      </div>
      <div className="spot-sheet__time" aria-hidden="true">
        <label>
          <Clock size={15} weight="bold" />
          <Skeleton className="sheet-date" />
          <Skeleton className="sheet-clock" />
        </label>
        <div className="sheet-slider">
          <Skeleton />
        </div>
      </div>
      <div className="spot-sheet__meta" aria-hidden="true">
        <Skeleton className="sheet-dot" />
        <Skeleton className="sheet-provenance" />
        <Skeleton className="sheet-refresh" />
      </div>
    </>
  )
}

export function MapPageSkeleton() {
  return (
    <main className="home-page">
      <div className="forecast-map-shell">
        <MapLoadingSurface />
      </div>
      <MapMast />
      <section className="spot-sheet" aria-busy="true">
        <div className="spot-sheet__head" aria-hidden="true">
          <div className="sheet-heading-placeholder">
            <Skeleton className="skeleton--location" />
            <Skeleton className="sheet-name" />
          </div>
          <Skeleton className="large-score" />
        </div>
        <SpotSheetSkeletonBody />
      </section>
    </main>
  )
}

function DayTableSkeleton() {
  const { t } = useLocale()
  const columns = Array.from({ length: 24 }, (_, index) => index)
  const rows = [
    t('scoreShort'),
    `${t('swell')} (m)`,
    `${t('wind')} (km/h)`,
    `${t('tide')} (%)`,
    `${t('rain')} (%)`,
  ]
  return (
    <div className="dt-scroll" aria-hidden="true">
      <div className="dt dt-skeleton" style={{ '--cols': 24 } as CSSProperties}>
        <div className="dt__corner" />
        <div className="dt__curve">
          <Skeleton className="day-curve-placeholder" />
        </div>
        <div className="dt__label">
          <Clock size={12} weight="bold" />
        </div>
        {columns.map((index) => (
          <div className="dt__th" key={index}>
            <Skeleton className="day-hour-placeholder" />
          </div>
        ))}
        {rows.map((label, row) => (
          <Fragment key={label}>
            <div className="dt__label">{label}</div>
            {columns.map((index) => (
              <div
                className={`dt__cell${row === 1 || row === 2 ? ' dt__cell--double' : ''}`}
                key={index}
              >
                <Skeleton className={row === 0 ? 'dt__dot' : 'day-value-placeholder'} />
                {(row === 1 || row === 2) && <Skeleton className="day-detail-placeholder" />}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

export function SpotDetailSkeleton({ spot }: { spot?: SpotProfile }) {
  const { t } = useLocale()
  return (
    <main className="detail-page">
      <PageNav />
      <LoadingStatus>{t('loadingForecast')}</LoadingStatus>
      <div className="detail-shell" aria-busy="true">
        <div className="top-grid">
          <SpotHeading spot={spot}>
            <Skeleton className="score-dial" />
            <div className="score-verdict-placeholder">
              <Skeleton />
              <Skeleton />
            </div>
          </SpotHeading>
          <section className="directions">
            <p className="kicker">{t('directions')}</p>
            <div className="direction-context" aria-hidden="true">
              <div className="direction-map">
                <Skeleton className="direction-map-placeholder" />
              </div>
              <p className="direction-caption">
                <Skeleton />
                <Skeleton />
              </p>
            </div>
          </section>
          <section className="now">
            <p className="kicker">
              <Waves size={14} weight="bold" />
              <Skeleton className="skeleton--location" />
            </p>
            <div className="now__main" aria-hidden="true">
              {[t('surfHeight'), t('wind'), t('tide')].map((label) => (
                <div className="now__cell" key={label}>
                  <p>{label}</p>
                  <Skeleton className="now-value-placeholder" />
                  <Skeleton className="now-detail-placeholder" />
                </div>
              ))}
            </div>
            <div className="now__extra" aria-hidden="true">
              <Skeleton />
              <Skeleton />
              <Skeleton />
            </div>
          </section>
        </div>
        <section className="day">
          <p className="kicker">
            <Drop size={14} weight="fill" />
            {t('theDay')} · <Skeleton className="skeleton--location" />
          </p>
          <DayTableSkeleton />
        </section>
        <section className="week">
          <p className="kicker">{t('sevenDays')}</p>
          <div className="week__rows" aria-hidden="true">
            {Array.from({ length: 7 }, (_, index) => (
              <div className="week__row" key={index}>
                <Skeleton className="week-date-placeholder" />
                <Skeleton className="week-score-placeholder" />
                <Skeleton className="week-height-placeholder" />
                <Skeleton className="week-time-placeholder" />
              </div>
            ))}
          </div>
        </section>
        <section className="why">
          <p className="kicker">{t('whyScore')}</p>
          <div className="why__quality">
            <Skeleton className="skeleton--meta" />
          </div>
          <div className="reason-list" aria-hidden="true">
            {[0, 1, 2, 3].map((index) => (
              <div className="reason reason-placeholder" key={index}>
                <Skeleton className="reason-dot-placeholder" />
                <Skeleton className="reason-text-placeholder" />
              </div>
            ))}
          </div>
          <p className="kicker breakdown-kicker">{t('modelBreakdown')}</p>
          <div className="breakdown-list" aria-hidden="true">
            {[
              t('swellPotential'),
              t('coastalExposure'),
              t('wind'),
              t('tide'),
              t('consistency'),
            ].map((label) => (
              <div key={label}>
                <span>{label}</span>
                <Skeleton className="breakdown-value-placeholder" />
                <i>
                  <Skeleton className="breakdown-bar-placeholder" />
                </i>
              </div>
            ))}
          </div>
        </section>
        <footer className="detail-foot" aria-hidden="true">
          <Skeleton className="skeleton--provenance" />
        </footer>
      </div>
    </main>
  )
}

export function SpotRouteSkeleton() {
  const { slug } = useParams()
  return <SpotDetailSkeleton spot={surfSpots.find((spot) => spot.slug === slug)} />
}

export function AccountAuthSkeleton() {
  const { t } = useLocale()
  return (
    <section className="account-card account-auth-card" aria-busy="true">
      <LoadingStatus>{t('loadingAccount')}</LoadingStatus>
      <AccountAuthHeading title="Iniciar sesión" />
      <div className="auth-form-placeholder" aria-hidden="true">
        {[t('accountEmail'), t('accountPassword')].map((label) => (
          <div className="auth-field-placeholder" key={label}>
            <span>{label}</span>
            <Skeleton className="auth-input-placeholder" />
          </div>
        ))}
        <Skeleton className="auth-submit-placeholder" />
      </div>
      <div className="account-switch" aria-hidden="true">
        <Skeleton className="auth-switch-placeholder" />
      </div>
    </section>
  )
}

export function AccountPageSkeleton() {
  return (
    <main className="account-page">
      <PageNav account />
      <div className="account-shell">
        <AccountAuthSkeleton />
      </div>
    </main>
  )
}

export function AccountReportsSkeleton() {
  const { t } = useLocale()
  return (
    <div className="account-report-list" aria-busy="true">
      <LoadingStatus>{t('loadingReports')}</LoadingStatus>
      {[0, 1, 2].map((index) => (
        <article key={index} aria-hidden="true">
          <Skeleton className="report-score-placeholder" />
          <div className="report-text-placeholder">
            <Skeleton />
            <Skeleton />
          </div>
          <small>
            <Skeleton className="report-status-placeholder" />
          </small>
        </article>
      ))}
    </div>
  )
}
