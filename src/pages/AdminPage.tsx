import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Archive,
  ArrowLeft,
  Check,
  ClipboardText,
  Gauge,
  MapPin,
  Plus,
  Prohibit,
  ShieldCheck,
  SignOut,
  SpinnerGap,
  UsersThree,
  Waves,
  X,
} from '@phosphor-icons/react'
import { Link, Navigate } from 'react-router-dom'
import type { ShorelineExposureProfile } from '../domain/forecast'
import {
  deriveSwellParameters,
  normalizeSlug,
  SHORELINE_DATASET_VERSION,
  spotInputFingerprint,
  type AdminSpotRecord,
  type SpotDraft,
} from '../domain/spotAdmin'
import { SpotCoordinatePicker } from '../features/admin/SpotCoordinatePicker'
import { useLocale } from '../features/i18n/localeContext'
import { authClient } from '../services/authClient'
import {
  archiveAdminSpot,
  createAdminSpot,
  fetchAdminReports,
  fetchAdminSpots,
  fetchAdminSummary,
  moderateAdminReport,
  publishAdminSpot,
  updateAdminSpot,
  type AdminReport,
  type AdminSummary,
} from '../services/adminApi'
import { calculateShorelineExposure } from '../services/shorelineCalculator'

type Tab = 'overview' | 'spots' | 'reports' | 'members'
type AdminUser = {
  id: string
  name: string
  email: string
  role?: string
  banned?: boolean
  createdAt: string | Date
}

const emptyDraft: SpotDraft = {
  slug: '',
  name: '',
  province: 'A Coruña',
  municipality: '',
  latitude: 43.42,
  longitude: -8.4,
  shoreFacingDeg: null,
  idealSwellDeg: null,
  swellWindowDeg: 70,
  preferredHeightM: [0.6, 1.8],
  maxSafeHeightM: 2.8,
  preferredPeriodS: [8, 14.5],
  maximumUsefulPeriodS: 20,
  tidePreference: { min: 0, ideal: 0.5, max: 1 },
  breakType: 'unknown',
  skillLevel: 'unknown',
  orientationConfidence: 0.35,
  heightRangeConfidence: 0.25,
  periodConfidence: 0.35,
  tideConfidence: 0,
  bathymetryConfidence: 0,
  calibrationStatus: 'provisional',
  windSensitivity: 1,
  strongOffshoreLimitKmh: 32,
  closeoutSensitivity: 1,
  unresolvedDiffractionFloor: 0.05,
  profileSources: {
    shoreFacingDeg: 'default',
    idealSwellDeg: 'default',
    swellWindowDeg: 'default',
    preferredHeightM: 'default',
    preferredPeriodS: 'default',
    tidePreference: 'default',
    closeoutSensitivity: 'default',
  },
}

function Field({ label, field, children }: { label: string; field: string; children: ReactNode }) {
  return (
    <label className="admin-field" data-field={field}>
      <span>{label}</span>
      {children}
    </label>
  )
}

function SpotEditor({
  record,
  locale,
  onSaved,
}: {
  record: AdminSpotRecord | null
  locale: 'gl' | 'es'
  onSaved: (spot: AdminSpotRecord) => void
}) {
  const [draft, setDraft] = useState<SpotDraft>(record?.draft ?? emptyDraft)
  const [exposure, setExposure] = useState<ShorelineExposureProfile | null>(
    record?.exposure ?? null,
  )
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState<'save' | 'publish' | 'archive' | 'exposure' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})
  const labels =
    locale === 'gl'
      ? {
          identity: 'Identidade e localización',
          scoring: 'Condicións do spot',
          exposure: 'Exposición costeira IHM',
          name: 'Nome',
          slug: 'Slug',
          province: 'Provincia',
          municipality: 'Concello',
          latitude: 'Latitude',
          longitude: 'Lonxitude',
          derived: 'Só xeometría costeira',
          seaEntry: 'Dirección directa máis aberta',
          window: 'Apertura directa IHM',
          derivedHelp: 'Son raios de liña de visión. Non calculan batimetría nin refracción.',
          idealSwell: 'Mar ideal calibrado (°)',
          idealWindow: 'Xanela calibrada (°)',
          tuningHelp:
            'Estes dous valores axustan o scoring con coñecemento local; a xeometría segue aplicándose por separado.',
          minHeight: 'Altura ideal mín. (m)',
          maxHeight: 'Altura ideal máx. (m)',
          safe: 'Altura segura máx. (m)',
          tideMin: 'Marea mín.',
          tideIdeal: 'Marea ideal',
          tideMax: 'Marea máx.',
          confidence: 'Confianza do perfil (0–1)',
          break: 'Tipo de fondo',
          skill: 'Nivel',
          camera: 'URL da cámara',
          save: 'Gardar borrador',
          publish: 'Publicar',
          archive: 'Arquivar',
          calculate: 'Calculando a costa',
          ready: 'Xeometría calculada',
          stale: 'Falta calcular a xeometría',
          credit: 'Fonte: IHM COALNE + SLCONS · CC BY 4.0',
          published: 'A versión pública non cambia ata publicar.',
          confirmArchive: 'Arquivar este spot e retiralo da previsión pública?',
          failed: 'Non se puido gardar o spot.',
        }
      : {
          identity: 'Identidad y ubicación',
          scoring: 'Condiciones del spot',
          exposure: 'Exposición costera IHM',
          name: 'Nombre',
          slug: 'Slug',
          province: 'Provincia',
          municipality: 'Municipio',
          latitude: 'Latitud',
          longitude: 'Longitud',
          derived: 'Sólo geometría costera',
          seaEntry: 'Dirección directa más abierta',
          window: 'Apertura directa IHM',
          derivedHelp: 'Son rayos de línea de visión. No calculan batimetría ni refracción.',
          idealSwell: 'Mar ideal calibrado (°)',
          idealWindow: 'Ventana calibrada (°)',
          tuningHelp:
            'Estos dos valores ajustan el scoring con conocimiento local; la geometría se sigue aplicando por separado.',
          minHeight: 'Altura ideal mín. (m)',
          maxHeight: 'Altura ideal máx. (m)',
          safe: 'Altura segura máx. (m)',
          tideMin: 'Marea mín.',
          tideIdeal: 'Marea ideal',
          tideMax: 'Marea máx.',
          confidence: 'Confianza del perfil (0–1)',
          break: 'Tipo de fondo',
          skill: 'Nivel',
          camera: 'URL de cámara',
          save: 'Guardar borrador',
          publish: 'Publicar',
          archive: 'Archivar',
          calculate: 'Calculando la costa',
          ready: 'Geometría calculada',
          stale: 'Falta calcular la geometría',
          credit: 'Fuente: IHM COALNE + SLCONS · CC BY 4.0',
          published: 'La versión pública no cambia hasta publicar.',
          confirmArchive: '¿Archivar este spot y retirarlo de la previsión pública?',
          failed: 'No se pudo guardar el spot.',
        }
  const fingerprint = spotInputFingerprint(draft)
  const displayFacing = draft.shoreFacingDeg ?? 0
  const geometry = useMemo(
    () => ({
      latitude: draft.latitude,
      longitude: draft.longitude,
      shoreFacingDeg: displayFacing,
    }),
    [draft.latitude, draft.longitude, displayFacing],
  )
  const currentExposure =
    exposure?.inputFingerprint === fingerprint &&
    exposure.datasetVersion === SHORELINE_DATASET_VERSION
      ? exposure
      : null
  const geographicOpening = useMemo(
    () => (currentExposure ? deriveSwellParameters(currentExposure) : null),
    [currentExposure],
  )
  useEffect(() => {
    if (currentExposure || draft.shoreFacingDeg === null) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setExposure(null)
      setBusy('exposure')
      setProgress(0)
      setError(null)
      void calculateShorelineExposure(
        geometry,
        ({ progress: next }) => setProgress(next),
        controller.signal,
      )
        .then((profile) => {
          setExposure(profile)
          const derived = deriveSwellParameters(profile)
          setDraft((current) => ({ ...current, ...derived }))
        })
        .catch((calculationError: unknown) => {
          if (!(calculationError instanceof DOMException && calculationError.name === 'AbortError'))
            setError(
              calculationError instanceof Error
                ? calculationError.message
                : 'Exposure calculation failed',
            )
        })
        .finally(() => setBusy((current) => (current === 'exposure' ? null : current)))
    }, 650)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [currentExposure, geometry, draft.shoreFacingDeg])

  const set = <K extends keyof SpotDraft>(key: K, value: SpotDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))
  const setShoreFacing = (bearing: number) =>
    setDraft((current) => ({ ...current, shoreFacingDeg: bearing, idealSwellDeg: bearing }))
  const number = (value: string) => Number(value)
  const save = async () => {
    setBusy('save')
    setError(null)
    setFields({})
    try {
      const result = record
        ? await updateAdminSpot(record, draft, currentExposure)
        : await createAdminSpot(draft, currentExposure)
      onSaved(result.spot)
      return result.spot
    } catch (saveError) {
      const typed = saveError as Error & { fields?: Record<string, string> }
      setFields(typed.fields ?? {})
      setError(typed.message || labels.failed)
      return null
    } finally {
      setBusy(null)
    }
  }
  const publish = async () => {
    if ((!currentExposure && draft.calibrationStatus !== 'provisional') || busy === 'exposure')
      return
    setBusy('publish')
    setError(null)
    try {
      const saved = await (record
        ? updateAdminSpot(record, draft, currentExposure).then((result) => result.spot)
        : createAdminSpot(draft, currentExposure).then((result) => result.spot))
      const result = await publishAdminSpot(saved.id, saved.revision)
      onSaved(result.spot)
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : labels.failed)
    } finally {
      setBusy(null)
    }
  }
  const archive = async () => {
    if (!record || !window.confirm(labels.confirmArchive)) return
    setBusy('archive')
    setError(null)
    try {
      const result = await archiveAdminSpot(record.id, record.revision)
      onSaved(result.spot)
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : labels.failed)
    } finally {
      setBusy(null)
    }
  }
  return (
    <form
      className="admin-spot-editor"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <div className="admin-editor-lead">
        <div>
          <span className={`admin-status admin-status--${record?.status ?? 'draft'}`}>
            {record?.status ?? 'draft'}
          </span>
          <h2>{draft.name || (locale === 'gl' ? 'Novo spot' : 'Nuevo spot')}</h2>
          <p>{labels.published}</p>
        </div>
      </div>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {Object.entries(fields).map(([field, message]) => (
        <p className="admin-field-error" key={field}>
          {field}: {message}
        </p>
      ))}
      <section>
        <h3>{labels.identity}</h3>
        <div className="admin-form-grid">
          <Field label={labels.name} field="name">
            <input
              value={draft.name}
              onChange={(event) => {
                set('name', event.target.value)
                if (!record?.published) set('slug', normalizeSlug(event.target.value))
              }}
            />
          </Field>
          <Field label={labels.slug} field="slug">
            <input
              value={draft.slug}
              disabled={Boolean(record?.published)}
              onChange={(event) => set('slug', normalizeSlug(event.target.value))}
            />
          </Field>
          <Field label={labels.province} field="province">
            <input
              value={draft.province}
              onChange={(event) => set('province', event.target.value)}
            />
          </Field>
          <Field label={labels.municipality} field="municipality">
            <input
              value={draft.municipality}
              onChange={(event) => set('municipality', event.target.value)}
            />
          </Field>
        </div>
        <SpotCoordinatePicker
          latitude={draft.latitude}
          longitude={draft.longitude}
          shoreFacingDeg={displayFacing}
          exposure={currentExposure}
          locale={locale}
          onChange={(latitude, longitude) =>
            setDraft((current) => ({ ...current, latitude, longitude }))
          }
          onShoreFacingChange={setShoreFacing}
        />
        <div className="admin-form-grid admin-form-grid--numbers">
          <Field label={labels.latitude} field="latitude">
            <input
              type="number"
              step="0.000001"
              value={draft.latitude}
              onChange={(event) => set('latitude', number(event.target.value))}
            />
          </Field>
          <Field label={labels.longitude} field="longitude">
            <input
              type="number"
              step="0.000001"
              value={draft.longitude}
              onChange={(event) => set('longitude', number(event.target.value))}
            />
          </Field>
          <Field label={labels.camera} field="cameraUrl">
            <input
              type="url"
              value={draft.cameraUrl ?? ''}
              onChange={(event) => set('cameraUrl', event.target.value)}
            />
          </Field>
        </div>
      </section>
      <section>
        <h3>{labels.scoring}</h3>
        <div className="admin-derived-directions">
          <div>
            <span>{labels.derived}</span>
            <strong>
              {labels.seaEntry} ·{' '}
              {geographicOpening ? `${Math.round(geographicOpening.idealSwellDeg)}°` : '—'}
            </strong>
            <small>{labels.derivedHelp}</small>
          </div>
          <output>
            <span>{labels.window}</span>
            <strong>
              {geographicOpening ? `${Math.round(geographicOpening.swellWindowDeg)}°` : '—'}
            </strong>
          </output>
        </div>
        <div className="admin-form-grid admin-form-grid--numbers">
          <Field label={labels.idealSwell} field="idealSwellDeg">
            <input
              type="number"
              min="0"
              max="359.999"
              step="1"
              value={draft.idealSwellDeg ?? ''}
              onChange={(event) =>
                set('idealSwellDeg', event.target.value ? number(event.target.value) : null)
              }
            />
          </Field>
          <Field label={labels.idealWindow} field="swellWindowDeg">
            <input
              type="number"
              min="1"
              max="180"
              step="1"
              value={draft.swellWindowDeg}
              onChange={(event) => set('swellWindowDeg', number(event.target.value))}
            />
          </Field>
          <Field label={labels.minHeight} field="preferredHeightM">
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={draft.preferredHeightM[0]}
              onChange={(event) =>
                set('preferredHeightM', [number(event.target.value), draft.preferredHeightM[1]])
              }
            />
          </Field>
          <Field label={labels.maxHeight} field="preferredHeightM">
            <input
              type="number"
              min="0.2"
              step="0.1"
              value={draft.preferredHeightM[1]}
              onChange={(event) =>
                set('preferredHeightM', [draft.preferredHeightM[0], number(event.target.value)])
              }
            />
          </Field>
          <Field label={labels.safe} field="maxSafeHeightM">
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={draft.maxSafeHeightM}
              onChange={(event) => set('maxSafeHeightM', number(event.target.value))}
            />
          </Field>
          <Field label={labels.tideMin} field="tidePreference">
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={draft.tidePreference.min}
              onChange={(event) =>
                set('tidePreference', { ...draft.tidePreference, min: number(event.target.value) })
              }
            />
          </Field>
          <Field label={labels.tideIdeal} field="tidePreference">
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={draft.tidePreference.ideal}
              onChange={(event) =>
                set('tidePreference', {
                  ...draft.tidePreference,
                  ideal: number(event.target.value),
                })
              }
            />
          </Field>
          <Field label={labels.tideMax} field="tidePreference">
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={draft.tidePreference.max}
              onChange={(event) =>
                set('tidePreference', { ...draft.tidePreference, max: number(event.target.value) })
              }
            />
          </Field>
          <Field label={labels.confidence} field="orientationConfidence">
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={draft.orientationConfidence}
              onChange={(event) => set('orientationConfidence', number(event.target.value))}
            />
          </Field>
          <Field label={labels.break} field="breakType">
            <select
              value={draft.breakType}
              onChange={(event) => set('breakType', event.target.value as SpotDraft['breakType'])}
            >
              <option value="beach">Beach break</option>
              <option value="mixed">Mixto</option>
              <option value="reef">Reef</option>
            </select>
          </Field>
          <Field label={labels.skill} field="skillLevel">
            <select
              value={draft.skillLevel}
              onChange={(event) => set('skillLevel', event.target.value as SpotDraft['skillLevel'])}
            >
              <option value="all">Todos</option>
              <option value="intermediate">Intermedio</option>
              <option value="advanced">Avanzado</option>
            </select>
          </Field>
        </div>
        <p className="admin-scoring-help">{labels.tuningHelp}</p>
      </section>
      <section className="admin-exposure-state">
        <div>
          <h3>{labels.exposure}</h3>
          <p>
            {busy === 'exposure'
              ? `${labels.calculate} · ${Math.round(progress * 100)}%`
              : currentExposure
                ? labels.ready
                : labels.stale}
          </p>
          <small>{labels.credit}</small>
        </div>
        <span className={currentExposure ? 'is-ready' : ''}>
          {currentExposure ? <Check size={18} weight="bold" /> : <SpinnerGap size={18} />}
        </span>
      </section>
      <div className="admin-editor-actions">
        <button
          className="admin-button admin-button--secondary"
          type="submit"
          disabled={Boolean(busy)}
        >
          {busy === 'save' ? <SpinnerGap className="spin" /> : <Check />} {labels.save}
        </button>
        <button
          className="admin-button"
          type="button"
          disabled={
            Boolean(busy) || (!currentExposure && draft.calibrationStatus !== 'provisional')
          }
          onClick={() => void publish()}
        >
          {busy === 'publish' ? <SpinnerGap className="spin" /> : <Waves />} {labels.publish}
        </button>
        {record?.status === 'published' && (
          <button
            className="admin-button admin-button--danger"
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void archive()}
          >
            <Archive /> {labels.archive}
          </button>
        )}
      </div>
    </form>
  )
}

function SpotsPanel({ locale }: { locale: 'gl' | 'es' }) {
  const [spots, setSpots] = useState<AdminSpotRecord[]>([])
  const [selected, setSelected] = useState<AdminSpotRecord | null>(null)
  const [filter, setFilter] = useState<'all' | AdminSpotRecord['status']>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void fetchAdminSpots()
      .then(({ spots: result }) => {
        if (active) {
          setSpots(result)
          setSelected(result[0] ?? null)
        }
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])
  const visible = filter === 'all' ? spots : spots.filter((spot) => spot.status === filter)
  const saved = (spot: AdminSpotRecord) => {
    setSpots((current) => [spot, ...current.filter((item) => item.id !== spot.id)])
    setSelected(spot)
  }
  return (
    <div className="admin-split">
      <aside className="admin-list-pane">
        <div className="admin-pane-head">
          <div>
            <p>{locale === 'gl' ? 'Catálogo' : 'Catálogo'}</p>
            <strong>{spots.length} spots</strong>
          </div>
          <button
            type="button"
            className="admin-icon-button"
            onClick={() => setSelected(null)}
            aria-label="New spot"
          >
            <Plus />
          </button>
        </div>
        <div className="admin-filter-row">
          {(['all', 'published', 'draft', 'archived'] as const).map((value) => (
            <button
              type="button"
              className={filter === value ? 'is-active' : ''}
              onClick={() => setFilter(value)}
              key={value}
            >
              {value}
            </button>
          ))}
        </div>
        {error && <p className="admin-error">{error}</p>}
        {loading ? (
          <div className="admin-skeleton-list">
            <i />
            <i />
            <i />
          </div>
        ) : visible.length ? (
          <div className="admin-spot-list">
            {visible.map((spot) => (
              <button
                type="button"
                key={spot.id}
                className={selected?.id === spot.id ? 'is-active' : ''}
                onClick={() => setSelected(spot)}
              >
                <span>
                  <strong>{spot.draft.name}</strong>
                  <small>{spot.draft.municipality}</small>
                </span>
                <em className={`admin-status admin-status--${spot.status}`}>
                  {spot.hasUnpublishedChanges && spot.status === 'published'
                    ? 'changed'
                    : spot.status}
                </em>
              </button>
            ))}
          </div>
        ) : (
          <p className="admin-empty">
            {locale === 'gl' ? 'Non hai spots neste estado.' : 'No hay spots en este estado.'}
          </p>
        )}
      </aside>
      <SpotEditor key={selected?.id ?? 'new'} record={selected} locale={locale} onSaved={saved} />
    </div>
  )
}

function ReportsPanel({ locale }: { locale: 'gl' | 'es' }) {
  const [status, setStatus] = useState('pending')
  const [reports, setReports] = useState<AdminReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void fetchAdminReports(status)
      .then((result) => {
        if (active) setReports(result.reports)
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [status])
  const moderate = async (report: AdminReport, next: 'accepted' | 'rejected') => {
    try {
      await moderateAdminReport(report.id, next)
      setReports((current) =>
        status === 'pending'
          ? current.filter((item) => item.id !== report.id)
          : current.map((item) =>
              item.id === report.id ? { ...item, moderationStatus: next } : item,
            ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }
  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <div>
          <p>{locale === 'gl' ? 'Moderación' : 'Moderación'}</p>
          <h2>{locale === 'gl' ? 'Reportes da comunidade' : 'Reportes de la comunidad'}</h2>
        </div>
        <div className="admin-segmented">
          {['pending', 'accepted', 'rejected', 'all'].map((item) => (
            <button
              type="button"
              className={status === item ? 'is-active' : ''}
              key={item}
              onClick={() => {
                setLoading(true)
                setError(null)
                setStatus(item)
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="admin-error">{error}</p>}
      {loading ? (
        <div className="admin-skeleton-list">
          <i />
          <i />
          <i />
        </div>
      ) : reports.length ? (
        <div className="admin-report-list">
          {reports.map((report) => (
            <article key={report.id}>
              <span className={`ticket-score score-${report.observedScore}`}>
                {report.observedScore}
              </span>
              <div>
                <strong>{report.spotName ?? report.spotSlug}</strong>
                <p>
                  {report.reporter.name} · {report.reporter.email}
                </p>
                <small>
                  {new Intl.DateTimeFormat(locale === 'gl' ? 'gl-ES' : 'es-ES', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(report.observedAt))}{' '}
                  · {report.observedHeight}
                </small>
                {report.note && <blockquote>{report.note}</blockquote>}
              </div>
              <span className={`admin-status admin-status--${report.moderationStatus}`}>
                {report.moderationStatus}
              </span>
              {report.moderationStatus === 'pending' && (
                <nav>
                  <button
                    type="button"
                    className="admin-approve"
                    onClick={() => void moderate(report, 'accepted')}
                  >
                    <Check /> {locale === 'gl' ? 'Aceptar' : 'Aceptar'}
                  </button>
                  <button
                    type="button"
                    className="admin-reject"
                    onClick={() => void moderate(report, 'rejected')}
                  >
                    <X /> {locale === 'gl' ? 'Rexeitar' : 'Rechazar'}
                  </button>
                </nav>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="admin-empty">
          {locale === 'gl' ? 'Non hai reportes nesta cola.' : 'No hay reportes en esta cola.'}
        </p>
      )}
    </section>
  )
}

function MembersPanel({ locale }: { locale: 'gl' | 'es' }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void authClient.admin
      .listUsers({ query: { limit: 100, offset: 0, sortBy: 'createdAt', sortDirection: 'desc' } })
      .then(({ data, error: authError }) => {
        if (authError) throw new Error(authError.message)
        if (active) setUsers((data?.users ?? []) as AdminUser[])
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term
      ? users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(term))
      : users
  }, [query, users])
  const setRole = async (user: AdminUser, role: 'user' | 'reporter' | 'admin') => {
    setError(null)
    const { error: authError } = await authClient.admin.setRole({ userId: user.id, role })
    if (authError) setError(authError.message ?? 'Could not update role')
    else
      setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, role } : item)))
  }
  const toggleBan = async (user: AdminUser) => {
    setError(null)
    const result = user.banned
      ? await authClient.admin.unbanUser({ userId: user.id })
      : await authClient.admin.banUser({ userId: user.id, banReason: 'Admin dashboard action' })
    if (result.error) setError(result.error.message ?? 'Could not update member')
    else
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, banned: !user.banned } : item)),
      )
  }
  return (
    <section className="admin-section">
      <div className="admin-section-head">
        <div>
          <p>{locale === 'gl' ? 'Acceso' : 'Acceso'}</p>
          <h2>{locale === 'gl' ? 'Membros e permisos' : 'Miembros y permisos'}</h2>
        </div>
        <input
          className="admin-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={locale === 'gl' ? 'Buscar nome ou correo' : 'Buscar nombre o correo'}
        />
      </div>
      {error && <p className="admin-error">{error}</p>}
      {loading ? (
        <div className="admin-skeleton-list">
          <i />
          <i />
          <i />
        </div>
      ) : (
        <div className="admin-member-list">
          {visible.map((user) => (
            <article key={user.id}>
              <span className="admin-avatar">{user.name.slice(0, 2).toUpperCase()}</span>
              <div>
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </div>
              <select
                value={user.role ?? 'user'}
                onChange={(event) =>
                  void setRole(user, event.target.value as 'user' | 'reporter' | 'admin')
                }
              >
                <option value="user">user</option>
                <option value="reporter">reporter</option>
                <option value="admin">admin</option>
              </select>
              <button
                type="button"
                className={user.banned ? 'admin-approve' : 'admin-reject'}
                onClick={() => void toggleBan(user)}
              >
                {user.banned ? <Check /> : <Prohibit />}
                {user.banned
                  ? locale === 'gl'
                    ? 'Reactivar'
                    : 'Reactivar'
                  : locale === 'gl'
                    ? 'Bloquear'
                    : 'Bloquear'}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function Overview({ locale, onTab }: { locale: 'gl' | 'es'; onTab: (tab: Tab) => void }) {
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    void fetchAdminSummary()
      .then(setSummary)
      .catch((err) => setError(err.message))
  }, [])
  if (error) return <p className="admin-error">{error}</p>
  if (!summary)
    return (
      <div className="admin-overview-skeleton">
        <i />
        <i />
        <i />
      </div>
    )
  const date = summary.latestForecast
    ? new Intl.DateTimeFormat(locale === 'gl' ? 'gl-ES' : 'es-ES', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(summary.latestForecast.generated_at))
    : '—'
  return (
    <section className="admin-overview">
      <header>
        <p>{locale === 'gl' ? 'Estado operativo' : 'Estado operativo'}</p>
        <h1>{locale === 'gl' ? 'A costa, baixo control.' : 'La costa, bajo control.'}</h1>
        <span>
          {locale === 'gl' ? 'Última previsión' : 'Última previsión'} · {date}
        </span>
      </header>
      <div className="admin-metric-stream">
        <button type="button" onClick={() => onTab('reports')}>
          <ClipboardText />
          <span>
            <strong>{summary.pendingReports}</strong>
            <small>{locale === 'gl' ? 'reportes pendentes' : 'reportes pendientes'}</small>
          </span>
        </button>
        <button type="button" onClick={() => onTab('spots')}>
          <MapPin />
          <span>
            <strong>{summary.spots.published ?? 0}</strong>
            <small>spots publicados</small>
          </span>
        </button>
        <button type="button" onClick={() => onTab('members')}>
          <UsersThree />
          <span>
            <strong>{summary.users}</strong>
            <small>{locale === 'gl' ? 'membros rexistrados' : 'miembros registrados'}</small>
          </span>
        </button>
      </div>
      <div className="admin-version-panel">
        <Gauge size={32} />
        <div>
          <p>{locale === 'gl' ? 'Versión do catálogo' : 'Versión del catálogo'}</p>
          <strong>v{summary.catalogueVersion}</strong>
          <small>
            {summary.spots.drafts ?? 0} drafts · {summary.spots.archived ?? 0} archived
          </small>
        </div>
      </div>
    </section>
  )
}

export function AdminPage() {
  const { locale, setLocale } = useLocale()
  const { data: session, isPending } = authClient.useSession()
  const [tab, setTab] = useState<Tab>('overview')
  const role = (session?.user as { role?: string } | undefined)?.role
  if (isPending)
    return (
      <main className="admin-auth-state">
        <div className="admin-auth-skeleton" />
      </main>
    )
  if (!session) return <Navigate to="/account?returnTo=%2Fadmin" replace />
  if (role !== 'admin')
    return (
      <main className="admin-auth-state">
        <ShieldCheck size={42} />
        <h1>{locale === 'gl' ? 'Acceso restrinxido' : 'Acceso restringido'}</h1>
        <p>
          {locale === 'gl'
            ? 'Esta conta non ten permisos de administración.'
            : 'Esta cuenta no tiene permisos de administración.'}
        </p>
        <Link to="/map">{locale === 'gl' ? 'Volver ao mapa' : 'Volver al mapa'}</Link>
      </main>
    )
  const nav = [
    { id: 'overview', icon: Gauge, es: 'Resumen', gl: 'Resumo' },
    { id: 'spots', icon: MapPin, es: 'Spots', gl: 'Spots' },
    { id: 'reports', icon: ClipboardText, es: 'Reportes', gl: 'Reportes' },
    { id: 'members', icon: UsersThree, es: 'Miembros', gl: 'Membros' },
  ] as const
  return (
    <main className="admin-page">
      <aside className="admin-sidebar">
        <Link className="admin-brand" to="/map">
          <span>
            <Waves weight="bold" />
          </span>
          <strong>Surfay</strong>
          <small>ADMIN</small>
        </Link>
        <nav>
          {nav.map((item) => (
            <button
              type="button"
              key={item.id}
              className={tab === item.id ? 'is-active' : ''}
              onClick={() => setTab(item.id)}
            >
              <item.icon weight="bold" /> {item[locale]}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-foot">
          <div className="language-toggle">
            <button
              type="button"
              className={locale === 'es' ? 'is-active' : ''}
              onClick={() => setLocale('es')}
            >
              ES
            </button>
            <button
              type="button"
              className={locale === 'gl' ? 'is-active' : ''}
              onClick={() => setLocale('gl')}
            >
              GL
            </button>
          </div>
          <button type="button" onClick={() => void authClient.signOut()}>
            <SignOut /> {locale === 'gl' ? 'Saír' : 'Salir'}
          </button>
        </div>
      </aside>
      <section className="admin-workspace">
        <header className="admin-mobile-head">
          <Link to="/map">
            <ArrowLeft /> Surfay
          </Link>
          <span>{nav.find((item) => item.id === tab)?.[locale]}</span>
        </header>
        {tab === 'overview' && <Overview locale={locale} onTab={setTab} />}
        {tab === 'spots' && <SpotsPanel locale={locale} />}
        {tab === 'reports' && <ReportsPanel locale={locale} />}
        {tab === 'members' && <MembersPanel locale={locale} />}
      </section>
    </main>
  )
}
