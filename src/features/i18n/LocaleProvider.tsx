import { useMemo, useState, type ReactNode } from 'react'
import { LocaleContext } from './localeContext'
import { copy, type CopyKey, type Locale } from './localeCopy'

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => localStorage.getItem('surfay-locale') === 'gl' ? 'gl' : 'es')
  const setLocale = (nextLocale: Locale) => {
    localStorage.setItem('surfay-locale', nextLocale)
    setLocaleState(nextLocale)
  }
  const value = useMemo(() => ({ locale, setLocale, t: (key: CopyKey) => copy[locale][key] }), [locale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}
