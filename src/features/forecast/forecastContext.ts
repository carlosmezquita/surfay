import { createContext, useContext } from 'react'
import type { ForecastSummary, SpotForecast } from '../../domain/forecast'

export type ForecastContextValue = {
  status: 'loading' | 'ready' | 'error'
  summary: ForecastSummary | null
  error: string | null
  isRefreshing: boolean
  refresh: () => Promise<void>
  spotCache: ReadonlyMap<string, SpotForecast>
  getSpotForecast: (slug: string) => Promise<SpotForecast>
}

export const ForecastContext = createContext<ForecastContextValue | null>(null)

export function useForecast() {
  const context = useContext(ForecastContext)
  if (!context) throw new Error('useForecast must be used inside ForecastProvider')
  return context
}
