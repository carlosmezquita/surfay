import { useState, type FormEvent } from 'react'
import { ArrowsClockwise, CheckCircle, ChatCircleDots } from '@phosphor-icons/react'
import { Link, useLocation } from 'react-router-dom'
import type { ScoredForecastHour, SpotProfile } from '../../domain/forecast'
import { authClient } from '../../services/authClient'
import { submitConditionReport } from '../../services/reportsApi'
import { useLocale } from '../i18n/localeContext'
import { LoadingStatus, Skeleton } from '../ui/Loading'

export function ConditionReport({ spot, hour, snapshotId }: { spot: SpotProfile; hour: ScoredForecastHour; snapshotId?: string }) {
  const { locale, t } = useLocale()
  const location = useLocation()
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const [isOpen, setIsOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [score, setScore] = useState<1 | 2 | 3 | 4 | 5>(hour.score === 0 ? 1 : hour.score)
  const [height, setHeight] = useState<'smaller' | 'matched' | 'larger'>('matched')
  const [windMatched, setWindMatched] = useState<boolean | null>(null)
  const role = (session?.user as { role?: string } | undefined)?.role
  const hasPermission = role === 'reporter' || role === 'admin'
  const canReport = hasPermission && Boolean(snapshotId)

  const labels = locale === 'gl' ? {
    refreshFirst: 'Actualiza a previsión antes de informar.', open: 'Informar das condicións', title: 'Que atopaches na auga?', height: 'Altura observada', smaller: 'Menor', matched: 'Acertada', larger: 'Maior', wind: 'Coincidía o vento?', yes: 'Si', no: 'Non', save: 'Gardar observación', local: 'Gardarase na túa conta e vincularase con esta previsión.', done: 'Observación gardada. Grazas.', login: 'Inicia sesión para enviar un reporte.', approval: 'Un administrador debe activar o teu permiso de reporte.', failed: 'Non se puido gardar. Téntao de novo.',
  } : {
    refreshFirst: 'Actualiza la previsión antes de informar.', open: 'Reportar condiciones', title: '¿Qué encontraste en el agua?', height: 'Altura observada', smaller: 'Menor', matched: 'Acertada', larger: 'Mayor', wind: '¿Coincidía el viento?', yes: 'Sí', no: 'No', save: 'Guardar observación', local: 'Se guardará en tu cuenta y se vinculará con esta previsión.', done: 'Observación guardada. Gracias.', login: 'Inicia sesión para enviar un reporte.', approval: 'Un administrador debe activar tu permiso de reporte.', failed: 'No se pudo guardar. Inténtalo de nuevo.',
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await submitConditionReport({ spotSlug: spot.slug, snapshotId: snapshotId!, forecastTime: hour.time, observedScore: score, observedHeight: height, windMatched, note: '' })
      setSaved(true)
      setIsOpen(false)
    } catch {
      setError(labels.failed)
    } finally {
      setSubmitting(false)
    }
  }

  if (saved) return <div className="report-saved"><CheckCircle size={18} weight="fill" /> {labels.done}</div>

  return (
    <div className="condition-report">
      {sessionPending && !session && <div className="report-session-placeholder" aria-busy="true"><LoadingStatus>{t('loadingSession')}</LoadingStatus><Skeleton /></div>}
      {!sessionPending && !session && <Link className="report-login" to={`/account?returnTo=${encodeURIComponent(location.pathname)}`}>{labels.login}</Link>}
      {!sessionPending && session && !hasPermission && <p className="report-login">{labels.approval}</p>}
      {!sessionPending && session && hasPermission && !snapshotId && <p className="report-login">{labels.refreshFirst}</p>}
      <button type="button" className="report-trigger" disabled={!canReport} onClick={() => setIsOpen((value) => !value)}><ChatCircleDots size={18} weight="bold" /> {labels.open}</button>
      {isOpen && canReport && (
        <form aria-busy={submitting} onSubmit={(event) => void submit(event)}>
          <strong>{labels.title}</strong>
          <div className="report-score" aria-label="Calidad observada">
            {([1, 2, 3, 4, 5] as const).map((value) => <button key={value} type="button" className={`${score === value ? 'is-active ' : ''}score-${value}`} onClick={() => setScore(value)}>{value}</button>)}
          </div>
          <label>{labels.height}<select value={height} onChange={(event) => setHeight(event.target.value as typeof height)}><option value="smaller">{labels.smaller}</option><option value="matched">{labels.matched}</option><option value="larger">{labels.larger}</option></select></label>
          <div className="report-binary"><span>{labels.wind}</span><button type="button" className={windMatched === true ? 'is-active' : ''} onClick={() => setWindMatched(true)}>{labels.yes}</button><button type="button" className={windMatched === false ? 'is-active' : ''} onClick={() => setWindMatched(false)}>{labels.no}</button></div>
          <small>{labels.local}</small>
          {error && <small className="report-error" role="alert">{error}</small>}
          <button type="submit" className="report-submit" disabled={submitting}>{submitting && <ArrowsClockwise size={16} className="is-spinning" aria-hidden="true" />}{submitting ? t('savingReport') : labels.save}</button>
        </form>
      )}
    </div>
  )
}

