import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, SignIn, SignOut, UserCircle } from '@phosphor-icons/react'
import { Link, useLocation } from 'react-router-dom'
import { authClient } from '../../services/authClient'
import { useLocale } from '../i18n/localeContext'

/**
 * Account + language menu behind a single profile button, so the masthead
 * stays clean: session actions and the ES/GL switch live in this dropdown.
 */
export function UserMenu() {
  const { locale, setLocale } = useLocale()
  const location = useLocation()
  const { data: session } = authClient.useSession()
  const [open, setOpen] = useState(false)
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === 'admin'
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const labels = locale === 'gl'
    ? { login: 'Iniciar sesión', account: 'A miña conta', admin: 'Administración', logout: 'Pechar sesión', language: 'Idioma', trigger: 'Conta e idioma' }
    : { login: 'Iniciar sesión', account: 'Mi cuenta', admin: 'Administración', logout: 'Cerrar sesión', language: 'Idioma', trigger: 'Cuenta e idioma' }

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="icon-button user-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={labels.trigger}
        onClick={() => setOpen((value) => !value)}
      >
        <UserCircle size={20} weight="bold" />
      </button>

      {open && (
        <div className="user-menu__panel" role="menu">
          {session ? (
            <>
              <p className="user-menu__user">
                <strong>{session.user.name}</strong>
                <small>{session.user.email}</small>
              </p>
              <Link to="/account" className="user-menu__item" onClick={() => setOpen(false)}>
                <UserCircle size={15} weight="bold" /> {labels.account}
              </Link>
              {isAdmin && <Link to="/admin" className="user-menu__item" onClick={() => setOpen(false)}><ShieldCheck size={15} weight="bold" /> {labels.admin}</Link>}
            </>
          ) : (
            <Link
              to={`/account?returnTo=${encodeURIComponent(location.pathname)}`}
              className="user-menu__item"
              onClick={() => setOpen(false)}
            >
              <SignIn size={15} weight="bold" /> {labels.login}
            </Link>
          )}

          <div className="user-menu__lang">
            <span>{labels.language}</span>
            <div className="language-toggle">
              <button type="button" className={locale === 'es' ? 'is-active' : ''} onClick={() => setLocale('es')}>ES</button>
              <button type="button" className={locale === 'gl' ? 'is-active' : ''} onClick={() => setLocale('gl')}>GL</button>
            </div>
          </div>

          {session && (
            <button
              type="button"
              className="user-menu__item user-menu__item--danger"
              onClick={() => { setOpen(false); void authClient.signOut() }}
            >
              <SignOut size={15} weight="bold" /> {labels.logout}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
