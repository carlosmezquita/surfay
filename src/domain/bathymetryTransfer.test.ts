import { describe, expect, it } from 'vitest'
import { surfSpots } from '../data/spots'
import { getBathymetryTransfer, hasBathymetryTransferProfile } from './bathymetryTransfer'

describe('bathymetry transfer', () => {
  it('returns the validated Orzán west coefficient at a computed grid point', () => {
    const transfer = getBathymetryTransfer('orzan', 270, 12)
    expect(transfer?.heightCoefficient).toBeCloseTo(0.1772, 4)
    expect(transfer?.localDirectionDeg).toBeCloseTo(304.6, 1)
    expect(transfer?.modelWeight).toBe(1)
  })

  it('interpolates direction and period inside the SWAN grid', () => {
    const transfer = getBathymetryTransfer('orzan', 285, 10)
    expect(transfer?.heightCoefficient).toBeCloseTo(0.26105, 4)
    expect(transfer?.modelWeight).toBe(1)
  })

  it('tapers just outside the grid and falls back outside its support', () => {
    expect(getBathymetryTransfer('orzan', 200, 12)?.modelWeight).toBeCloseTo(1 / 3, 5)
    expect(getBathymetryTransfer('orzan', 190, 12)).toBeNull()
    expect(getBathymetryTransfer('unknown-spot', 300, 12)).toBeNull()
  })

  it('contains a computed profile for every catalogue spot', () => {
    expect(surfSpots.every((spot) => hasBathymetryTransferProfile(spot.slug))).toBe(true)
  })

  it('keeps a conservative unresolved-diffraction fallback for fully shadowed profiles', () => {
    const transfer = getBathymetryTransfer('matadero', 300, 12)
    expect(transfer?.heightCoefficient).toBeLessThan(0.001)
    expect(transfer?.modelWeight).toBe(0.65)
  })
})
