import { UserCircle } from '@phosphor-icons/react'
import { useLocale } from '../i18n/localeContext'

export function AccountAuthHeading({ title }: { title: string }) {
  const { t } = useLocale()
  return (
    <div className="account-heading">
      <UserCircle size={38} weight="duotone" />
      <div>
        <h1>{title}</h1>
        <p>{t('accountSubtitle')}</p>
      </div>
    </div>
  )
}
