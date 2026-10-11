import { describe, expect, it } from 'vitest'
import { nextTideExtremum, tideExtrema, tideTrend, type TidePoint } from './tideCurve'

const points = (levels: number[]): TidePoint[] =>
  levels.map((level, index) => ({ time: `2026-07-21T${String(index).padStart(2, '0')}:00`, level, heightM: null }))

describe('tideExtrema', () => {
  it('finds local highs and lows in order', () => {
    const extrema = tideExtrema(points([0.2, 0.5, 0.9, 0.7, 0.3, 0.1, 0.4, 0.8]))
    expect(extrema).toEqual([
      { time: '2026-07-21T02:00', level: 0.9, heightM: null, kind: 'high' },
      { time: '2026-07-21T05:00', level: 0.1, heightM: null, kind: 'low' },
    ])
  })
})

describe('tideTrend', () => {
  it('reports rising and falling around the extrema', () => {
    const series = points([0.2, 0.5, 0.9, 0.7, 0.3])
    expect(tideTrend(series, '2026-07-21T01:00')).toBe('rising')
    expect(tideTrend(series, '2026-07-21T03:00')).toBe('falling')
    expect(tideTrend(series, '2026-07-21T04:00')).toBeNull()
    expect(tideTrend(series, '2026-07-21T99:00')).toBeNull()
  })
})

describe('nextTideExtremum', () => {
  it('returns the first extremum after the given time', () => {
    const series = points([0.2, 0.5, 0.9, 0.7, 0.3, 0.1, 0.4, 0.8])
    expect(nextTideExtremum(series, '2026-07-21T00:00')?.kind).toBe('high')
    expect(nextTideExtremum(series, '2026-07-21T03:00')?.kind).toBe('low')
    expect(nextTideExtremum(series, '2026-07-21T06:30')).toBeNull()
  })
})
