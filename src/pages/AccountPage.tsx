import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, CheckCircle, SignOut, UserCircle, Waves } from '@phosphor-icons/react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getSpotBySlug } from '../data/spots'
import { useLocale } from '../features/i18n/localeContext'
import { authClient } from '../services/authClient'
import {
  fetchEntitlements,
  fetchMyReports,
  type ConditionReportRecord,
  type Entitlements,
} from '../services/reportsApi'

type Mode = 'sign-in' | 'sign-up'

export function AccountPage() {
  const { locale } = useLocale()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: session, isPending: sessionPending, refetch: refetchSession } = authClient.useSession()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reports, setReports] = useState<ConditionReportRecord[]>([])
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null)

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
    if (!session?.user.id) return
    let active = true
    Promise.all([fetchMyReports(), fetchEntitlements()])
      .then(([reportPayload, entitlementPayload]) => {
        if (!active) return
        setReports(reportPayload.reports)
        setEntitlements(entitlementPayload)
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load account')
      })
    return () => { active = false }
  }, [session?.user.id])

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

  if (sessionPending) {
    return <main className="account-page"><div className="account-card account-card--loading" /></main>
  }

  return (
    <main className="account-page">
      <header className="account-nav">
        <Link to="/map"><ArrowLeft size={18} weight="bold" /> {copy.back}</Link>
        <Link to="/map" className="detail-brand"><span><Waves size={20} weight="bold" /></span>Surfay</Link>
      </header>

      <div className="account-shell">
        {!session ? (
          <section className="account-card account-auth-card">
            <div className="account-heading"><UserCircle size={38} weight="duotone" /><div><h1>{mode === 'sign-in' ? copy.signIn : copy.signUp}</h1><p>{copy.subtitle}</p></div></div>
            <form onSubmit={(event) => void submit(event)}>
              {mode === 'sign-up' && <label>{copy.name}<input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>}
              <label>{copy.email}<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label>{copy.password}<input required minLength={8} type="password" autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              {error && <p className="account-error" role="alert">{error}</p>}
              <button className="account-primary" type="submit" disabled={submitting}>{mode === 'sign-in' ? copy.signIn : copy.signUp}</button>
            </form>
            <p className="account-switch">{mode === 'sign-in' ? copy.newHere : copy.already} <button type="button" onClick={() => { setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in'); setError(null) }}>{mode === 'sign-in' ? copy.create : copy.enter}</button></p>
          </section>
        ) : (
          <div className="account-dashboard">
            <section className="account-card account-profile">
              <div className="account-heading"><UserCircle size={38} weight="duotone" /><div><p>{copy.account}</p><h1>{session.user.name}</h1><small>{session.user.email}</small></div></div>
              <div className="membership-row"><span>{copy.plan}</span><strong>{entitlements?.plan === 'free' || !entitlements ? copy.free : entitlements.plan}</strong></div>
              <p className="membership-note">{copy.memberSoon}</p>
              <button className="account-secondary" type="button" onClick={() => void authClient.signOut()}><SignOut size={18} /> {copy.signOut}</button>
            </section>

            <section className="account-card account-reports">
              <h2>{copy.reports}</h2>
              {error && <p className="account-error" role="alert">{error}</p>}
              {!reports.length ? <p className="account-empty">{copy.none}</p> : (
                <div className="account-report-list">
                  {reports.map((report) => {
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
