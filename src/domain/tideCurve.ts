import type { ScoredForecastHour } from './forecast'

/**
 * Tide-curve helpers. The model stores a normalized level (0 = relative low,
 * 1 = relative high) plus an optional MSL height; these helpers reduce a day
 * of hourly values into the extrema and trend the UI needs, without any SVG
 * concerns so they stay unit-testable.
 */
export type TidePoint = {
  time: string
  level: number
  heightM: number | null
}

export type TideExtremum = TidePoint & {
  kind: 'high' | 'low'
}

export function tideSeries(hours: ScoredForecastHour[]): TidePoint[] {
  return hours
    .filter((hour) => hour.tideNormalized !== null)
    .map((hour) => ({
      time: hour.time,
      level: hour.tideNormalized as number,
      heightM: hour.tideHeightMslM,
    }))
}

/** Local maxima/minima of the day, in chronological order. */
export function tideExtrema(points: TidePoint[]): TideExtremum[] {
  const extrema: TideExtremum[] = []
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1].level
    const current = points[index].level
    const next = points[index + 1].level
    if (current >= previous && current > next) extrema.push({ ...points[index], kind: 'high' })
    if (current <= previous && current < next) extrema.push({ ...points[index], kind: 'low' })
  }
  return extrema
}

/** Is the tide rising at the given moment? Compares against the next sample. */
export function tideTrend(points: TidePoint[], time: string): 'rising' | 'falling' | null {
  const index = points.findIndex((point) => point.time === time)
  if (index < 0) return null
  const next = points[index + 1]
  if (!next) return null
  if (next.level > points[index].level) return 'rising'
  if (next.level < points[index].level) return 'falling'
  return null
}

/** First extremum after the given moment, used for "Pleamar ~18:35". */
export function nextTideExtremum(points: TidePoint[], time: string): TideExtremum | null {
  return tideExtrema(points).find((extremum) => extremum.time > time) ?? null
}
