import { describe, expect, it } from 'vitest'
import { formatWavePower, wavePowerBand, wavePowerKwPerM } from './wavePower'

describe('wavePowerKwPerM', () => {
  it('returns null when data is missing', () => {
    expect(wavePowerKwPerM(null, 10)).toBeNull()
    expect(wavePowerKwPerM(1, null)).toBeNull()
    expect(wavePowerKwPerM(0, 10)).toBeNull()
    expect(wavePowerKwPerM(1, 0)).toBeNull()
  })

  it('grows with the square of height and linearly with period', () => {
    expect(wavePowerKwPerM(1, 10)).toBeCloseTo(4.9, 5)
    expect(wavePowerKwPerM(2, 10)).toBeCloseTo(19.6, 5)
    expect(wavePowerKwPerM(2, 14)).toBeCloseTo(27.44, 5)
  })
})

describe('wavePowerBand', () => {
  it('maps power to surfer-friendly bands', () => {
    expect(wavePowerBand(null)).toBeNull()
    expect(wavePowerBand(1)).toBe('calm')
    expect(wavePowerBand(5)).toBe('fun')
    expect(wavePowerBand(15)).toBe('solid')
    expect(wavePowerBand(30)).toBe('heavy')
  })
})

describe('formatWavePower', () => {
  it('keeps decimals for small swells and rounds big ones', () => {
    expect(formatWavePower(null)).toBe('—')
    expect(formatWavePower(0.098)).toBe('0.1')
    expect(formatWavePower(4.9)).toBe('4.9')
    expect(formatWavePower(27.44)).toBe('27')
  })
})
