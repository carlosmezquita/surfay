import type { ForecastSummary, SpotForecast } from '../domain/forecast'

const TTL_MS = 30 * 60 * 1000

/** Immutable snapshots for React; generation checks prevent old requests repopulating a cleared cache. */
export class SpotForecastCache {
  private snapshot: ReadonlyMap<string, SpotForecast> = new Map()
  private deadlines = new Map<string, number>()
  private pending = new Map<string, Promise<SpotForecast>>()
  private listeners = new Set<() => void>()
  private generation = 0
  private summaryKey = ''

  private fetchForecast: (slug: string) => Promise<SpotForecast>
  private now: () => number

  constructor(fetchForecast: (slug: string) => Promise<SpotForecast>, now = Date.now) {
    this.fetchForecast = fetchForecast
    this.now = now
  }

  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private emit(next: ReadonlyMap<string, SpotForecast>) {
    this.snapshot = next
    this.listeners.forEach((listener) => listener())
  }

  acceptSummary(summary: Pick<ForecastSummary, 'catalogueVersion' | 'scoringModelVersion' | 'generatedAt'>) {
    const key = `${summary.catalogueVersion}:${summary.scoringModelVersion}:${summary.generatedAt}`
    if (key !== this.summaryKey) {
      this.summaryKey = key
      this.generation += 1
      this.pending.clear()
      this.deadlines.clear()
      this.emit(new Map())
    } else {
      const next = new Map(this.snapshot)
      for (const [slug, deadline] of this.deadlines) {
        if (deadline <= this.now()) { next.delete(slug); this.deadlines.delete(slug) }
      }
      if (next.size !== this.snapshot.size) this.emit(next)
    }
  }

  get = (slug: string): Promise<SpotForecast> => {
    const cached = this.snapshot.get(slug)
    if (cached && (this.deadlines.get(slug) ?? 0) > this.now()) return Promise.resolve(cached)
    const existing = this.pending.get(slug)
    if (existing) return existing
    const generation = this.generation
    const request = this.fetchForecast(slug).then((forecast) => {
      if (generation !== this.generation) return this.get(slug)
      this.deadlines.set(slug, this.now() + TTL_MS)
      this.emit(new Map(this.snapshot).set(slug, forecast))
      return forecast
    }).finally(() => {
      if (this.pending.get(slug) === request) this.pending.delete(slug)
    })
    this.pending.set(slug, request)
    return request
  }
}
