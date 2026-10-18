import type { ReactNode } from 'react'
import { MapPin } from '@phosphor-icons/react'
import type { SpotProfile } from '../../domain/forecast'
import { useLocale } from '../i18n/localeContext'
import type { CopyKey } from '../i18n/localeCopy'
import { Skeleton } from '../ui/Loading'

const breakTypeCopy: Record<SpotProfile['breakType'], CopyKey> = {
  beach: 'breakBeach',
  reef: 'breakReef',
  mixed: 'breakMixed',
  unknown: 'breakUnknown',
}
const skillCopy: Record<SpotProfile['skillLevel'], CopyKey> = {
  all: 'skillAll',
  intermediate: 'skillIntermediate',
  advanced: 'skillAdvanced',
  unknown: 'skillUnknown',
}

export function SpotHeading({ spot, children }: { spot?: SpotProfile; children: ReactNode }) {
  const { t } = useLocale()
  return (
    <section className="spot-head">
      <p className="kicker">
        <MapPin size={14} weight="fill" />
        {spot ? (
          `${spot.municipality}, ${spot.province}`
        ) : (
          <Skeleton className="skeleton--location" />
        )}
      </p>
      {spot ? (
        <h1>{spot.name}</h1>
      ) : (
        <div className="spot-heading-placeholder">
          <Skeleton />
        </div>
      )}
      <p className="spot-head__meta">
        {spot ? (
          <>
            {t(breakTypeCopy[spot.breakType])} · {t(skillCopy[spot.skillLevel])}
          </>
        ) : (
          <Skeleton className="skeleton--meta" />
        )}
      </p>
      <div className="spot-head__score">{children}</div>
    </section>
  )
}
