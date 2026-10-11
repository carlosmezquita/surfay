import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { ForecastSummary } from '../../domain/forecast'
import { fetchForecastSummary, fetchSpotForecast } from '../../services/forecastGateway'
import { SpotForecastCache } from '../../services/spotForecastCache'
import { ForecastContext } from './forecastContext'

let pendingSummaryRequest: Promise<ForecastSummary> | null = null
function requestSummary() {
  pendingSummaryRequest ??= fetchForecastSummary().finally(() => { pendingSummaryRequest = null })
  return pendingSummaryRequest
}

export function ForecastProvider({ children }: { children: ReactNode }) {
  const [cache] = useState(() => new SpotForecastCache(fetchSpotForecast))
  const spotCache = useSyncExternalStore(cache.subscribe, cache.getSnapshot, cache.getSnapshot)
  const [summary, setSummary] = useState<ForecastSummary | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const accept = useCallback((data: ForecastSummary) => {
    cache.acceptSummary(data)
    setSummary(data)
    setStatus('ready')
    setError(null)
  }, [cache])

  const refresh = useCallback(async () => {
    setIsRefreshing(true)
    try { accept(await requestSummary()) }
    catch (err) { setError(err instanceof Error ? err.message : 'Forecast refresh failed') }
    finally { setIsRefreshing(false) }
  }, [accept])

  useEffect(() => {
    let active = true
    void requestSummary().then((data) => { if (active) accept(data) }).catch((err: unknown) => {
      if (active) { setError(err instanceof Error ? err.message : 'Forecast failed'); setStatus('error') }
    })
    const interval = setInterval(() => { void refresh() }, 30 * 60 * 1000)
    return () => { active = false; clearInterval(interval) }
  }, [accept, refresh])

  const value = useMemo(() => ({ status, summary, error, isRefreshing, refresh, spotCache, getSpotForecast: cache.get }),
    [status, summary, error, isRefreshing, refresh, spotCache, cache])
  return <ForecastContext.Provider value={value}>{children}</ForecastContext.Provider>
}
