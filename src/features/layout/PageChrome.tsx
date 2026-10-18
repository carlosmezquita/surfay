import type { ReactNode } from 'react'
import { ArrowLeft, MagnifyingGlass, Waves } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { UserMenu } from '../auth/UserMenu'
import { useLocale } from '../i18n/localeContext'

export function MapMast({ children }: { children?: ReactNode }) {
  const { t } = useLocale()
  return (
    <header className="home-mast">
      <Link to="/map" className="wordmark" aria-label="Surfay">
        <span>
          <Waves size={19} weight="bold" />
        </span>
        <strong>Surfay</strong>
      </Link>
      {children ?? (
        <div className="spot-search">
          <MagnifyingGlass size={17} weight="bold" />
          <input
            disabled
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
          />
        </div>
      )}
      <div className="home-mast__actions">
        <UserMenu />
      </div>
    </header>
  )
}

export function PageNav({ account = false }: { account?: boolean }) {
  const { t } = useLocale()
  return (
    <header className={account ? 'account-nav' : 'detail-nav'}>
      <Link to="/map" className="detail-nav__back">
        <ArrowLeft size={18} weight="bold" /> {t('backToMap')}
      </Link>
      <Link to="/map" className="detail-brand">
        <span>
          <Waves size={20} weight="bold" />
        </span>
        Surfay
      </Link>
      {!account && (
        <div className="detail-nav__actions">
          <UserMenu />
        </div>
      )}
    </header>
  )
}
