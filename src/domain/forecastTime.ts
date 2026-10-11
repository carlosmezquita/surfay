export const FORECAST_TIME_ZONE = 'Europe/Madrid'

/** Old naive cached values are rejected via model v8; new forecasts carry UTC offsets. */
export function forecastDateKey(time: string | Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FORECAST_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(time))
}

export function forecastMinutesOfDay(time: string | Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: FORECAST_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(time))
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0)
  return part('hour') * 60 + part('minute')
}

/** A date-only label is noon in UTC so formatting never moves it to yesterday. */
export function forecastDisplayDate(time: string) {
  return new Date(time.length === 10 ? `${time}T12:00:00Z` : time)
}
