import { forecastDateKey, forecastMinutesOfDay, FORECAST_TIME_ZONE, forecastDisplayDate } from './forecastTime'
import type { ScoredForecastHour, SpotForecast } from './forecast'

export function nearestHour<T extends { time: string }>(hours: T[], target = new Date()): T | null {
  if (!hours.length) return null
  const targetTime = target.getTime()
  return hours.reduce((closest, hour) => {
    const currentDistance = Math.abs(new Date(hour.time).getTime() - targetTime)
    const closestDistance = Math.abs(new Date(closest.time).getTime() - targetTime)
    return currentDistance < closestDistance ? hour : closest
  })
}

export function findHourAt<T extends { time: string }>(hours: T[] | undefined, time: string | undefined): T | null {
  if (!hours?.length) return null
  if (!time) return nearestHour(hours)
  return nearestHour(hours, forecastDisplayDate(time))
}

export function threeHourlySlots<T extends { time: string }>(hours: T[] | undefined): T[] {
  if (!hours?.length) return []
  const now = Date.now()
  const startIndex = hours.findIndex((hour) => new Date(hour.time).getTime() >= now - 60 * 60 * 1000)
  const safeStart = startIndex < 0 ? 0 : startIndex
  return hours.filter((_, index) => index >= safeStart && (index - safeStart) % 3 === 0)
}

export type DailyForecast = {
  dateKey: string
  hours: ScoredForecastHour[]
  best: ScoredForecastHour
}

export function dailyForecasts(forecast: SpotForecast | undefined): DailyForecast[] {
  if (!forecast?.hours.length) return []
  const groups = new Map<string, ScoredForecastHour[]>()
  forecast.hours.forEach((hour) => {
    const dateKey = forecastDateKey(hour.time)
    groups.set(dateKey, [...(groups.get(dateKey) ?? []), hour])
  })

  return Array.from(groups.entries()).slice(0, 7).map(([dateKey, hours]) => {
    const daylight = hours.filter((hour) => {
      const clockHour = forecastMinutesOfDay(hour.time) / 60
      return clockHour >= 7 && clockHour <= 21
    })
    const candidates = daylight.length ? daylight : hours
    const best = candidates.reduce((winner, hour) => {
      if (hour.quality !== winner.quality) return hour.quality > winner.quality ? hour : winner
      return hour.confidence > winner.confidence ? hour : winner
    })
    return { dateKey, hours, best }
  })
}

export function formatClock(time: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: FORECAST_TIME_ZONE }).format(forecastDisplayDate(time))
}

export function formatDay(time: string, locale: string, long = false) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: FORECAST_TIME_ZONE,
    weekday: long ? 'long' : 'short',
    day: 'numeric',
    month: long ? 'long' : undefined,
  }).format(forecastDisplayDate(time))
}

