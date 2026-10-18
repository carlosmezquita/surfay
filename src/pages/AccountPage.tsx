import { useEffect, useState, type FormEvent } from 'react'
import { ArrowsClockwise, CheckCircle, SignOut, UserCircle } from '@phosphor-icons/react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getSpotBySlug } from '../data/spots'
import { useLocale } from '../features/i18n/localeContext'
import { AccountAuthHeading } from '../features/auth/AccountAuthHeading'
import { PageNav } from '../features/layout/PageChrome'
import { AccountAuthSkeleton, AccountReportsSkeleton } from '../features/loading/PublicPageSkeletons'
import { Skeleton } from '../features/ui/Loading'
import { authClient } from '../services/authClient'
import {
  fetchEntitlements,
  fetchMyReports,
  type ConditionReportRecord,
  type Entitlements,
} from '../services/reportsApi'

type Mode = 'sign-in' | 'sign-up'

export function AccountPage() {
  const { locale, t } = useLocale()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: session, isPending: sessionPending, refetch: refetchSession } = authClient.useSession()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accountData, setAccountData] = useState<{ userId: string; reports: ConditionReportRecord[]; entitlements: Entitlements } | null>(null)
  const [failedUserId, setFailedUserId] = useState<string | null>(null)
  const [reloadAttempt, setReloadAttempt] = useState(0)
  const userId = session?.user.id
  const data = accountData?.userId === userId ? accountData : null
  const dataFailed = Boolean(userId && failedUserId === userId)
  const dataLoading = Boolean(userId && !data && !dataFailed)

  const copy = locale === 'gl' ? {
    back: 'Volver ao mapa', title: 'A túa conta', subtitle: 'Garda reportes e axúdanos a calibrar a costa galega.',
    signIn: 'Iniciar sesión', signUp: 'Crear conta', name: 'Nome', email: 'Correo electrónico', password: 'Contrasinal',
    newHere: 'Aínda non tes conta?', already: 'Xa tes conta?', create: 'Crear unha', enter: 'Entrar',
    account: 'Conta', plan: 'Plan', free: 'Gratuíto', reports: 'Os teus reportes', none: 'Aínda non enviaches ningún reporte.',
    signOut: 'Pechar sesión', score: 'Calidade observada', pending: 'Pendente de validación', memberSoon: 'As membresías activaranse nunha seguinte fase.',
  } : {
    back: 'Volver al mapa', title: 'Tu cuenta', subtitle: 'Guarda reportes y ayúdanos a calibrar la costa gallega.',
    signIn: 'Iniciar sesión', signUp: 'Crear cuenta', name: 'Nombre', email: 'Correo electrónico', password: 'Contraseña',
    newHere: '¿Todavía no tienes cuenta?', already: '¿Ya tienes cuenta?', create: 'Crear una', enter: 'Entrar',
    account: 'Cuenta', plan: 'Plan', free: 'Gratis', reports: 'Tus reportes', none: 'Todavía no has enviado ningún reporte.',
    signOut: 'Cerrar sesión', score: 'Calidad observada', pending: 'Pendiente de validación', memberSoon: 'Las membresías se activarán en una siguiente fase.',
  }

  useEffect(() => {
    if (!userId) return
    let active = true
    Promise.all([fetchMyReports(), fetchEntitlements()])
      .then(([reportPayload, entitlementPayload]) => {
        if (!active) return
        setAccountData({ userId, reports: reportPayload.reports, entitlements: entitlementPayload })
        setFailedUserId(null)
      })
      .catch(() => { if (active) setFailedUserId(userId) })
    return () => { active = false }
  }, [userId, reloadAttempt])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const result = mode === 'sign-up'
        ? await authClient.signUp.email({ name, email, password })
        : await authClient.signIn.email({ email, password })

      if (result.error) {
        setError(result.error.message || 'Authentication failed')
        return
      }

      await refetchSession()
      const returnTo = searchParams.get('returnTo')
      if (returnTo?.startsWith('/')) navigate(returnTo)
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Authentication failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="account-page">
      <PageNav account />

      <div className="account-shell">
        {sessionPending && !session ? <AccountAuthSkeleton /> : !session ? (
          <section className="account-card account-auth-card">
            <AccountAuthHeading title={mode === 'sign-in' ? copy.signIn : copy.signUp} />
            <form aria-busy={submitting} onSubmit={(event) => void submit(event)}>
              {mode === 'sign-up' && <label>{copy.name}<input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>}
              <label>{copy.email}<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label>{copy.password}<input required minLength={8} type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              {error && <p className="account-error" role="alert">{error}</p>}
              <button className="account-primary" type="submit" disabled={submitting}>{submitting && <ArrowsClockwise size={16} className="is-spinning" aria-hidden="true" />}{submitting ? t(mode === 'sign-in' ? 'signingIn' : 'signingUp') : mode === 'sign-in' ? copy.signIn : copy.signUp}</button>
            </form>
            <p className="account-switch">{mode === 'sign-in' ? copy.newHere : copy.already} <button type="button" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setError(null) }}>{mode === 'sign-in' ? copy.create : copy.enter}</button></p>
          </section>
        ) : (
          <div className="account-dashboard">
            <section className="account-card account-profile">
              <div className="account-heading"><UserCircle size={38} weight="duotone" /><div><p>{copy.account}</p><h1>{session.user.name}</h1><small>{session.user.email}</small></div></div>
              <div className="membership-row"><span>{copy.plan}</span><strong>{dataLoading ? <Skeleton className="plan-placeholder" /> : data ? data.entitlements.plan === 'free' ? copy.free : data.entitlements.plan : t('planUnavailable')}</strong></div>
              <p className="membership-note">{copy.memberSoon}</p>
              <button className="account-secondary" type="button" onClick={() => void authClient.signOut()}><SignOut size={18} /> {copy.signOut}</button>
            </section>

            <section className="account-card account-reports">
              <h2>{copy.reports}</h2>
              {dataFailed ? <div className="account-load-error" role="alert"><p className="account-error">{t('accountError')}</p><button type="button" className="account-secondary" onClick={() => { setFailedUserId(null); setReloadAttempt(attempt => attempt + 1) }}>{t('retry')}</button></div> : dataLoading ? <AccountReportsSkeleton /> : !data?.reports.length ? <p className="account-empty">{copy.none}</p> : (
                <div className="account-report-list">
                  {data.reports.map((report) => {
                    const spot = getSpotBySlug(report.spotSlug)
                    return <article key={report.id}><span className={`score-${report.observedScore}`}>{report.observedScore}</span><div><strong>{report.spotName ?? spot.name}</strong><p>{copy.score} · {new Intl.DateTimeFormat(locale === 'gl' ? 'gl-ES' : 'es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.observedAt))}</p></div><small><CheckCircle size={14} /> {copy.pending}</small></article>
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
