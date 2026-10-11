import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { shorelineExposureProfiles } from '../data/shorelineExposure.generated'
import { getSpotBySlug } from '../data/spots'
import { calculateExposureProfile, type ShorelineSegment } from './shorelineCalculatorCore'

type Manifest = Parameters<typeof calculateExposureProfile>[2] & { tiles: string[]; calculationLayers: string[] }
const root = resolve('public/shoreline/ihm-lc-composite-v3')
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8')) as Manifest
const segments = new Map<number, ShorelineSegment>()
for (const name of manifest.tiles) {
  for (const segment of JSON.parse(readFileSync(resolve(root, name), 'utf8')) as Array<[number, number, number, number, number, string]>) {
    if (manifest.calculationLayers.includes(segment[5])) segments.set(segment[0], segment.slice(0, 5) as ShorelineSegment)
  }
}

describe('browser COALNE calculator', () => {
  it.each(['pantin', 'bastiagueiro'])('matches the checked-in profile for %s', (slug) => {
    const spot = getSpotBySlug(slug)
    const calculated = calculateExposureProfile(spot, [...segments.values()], manifest)
    const expected = shorelineExposureProfiles[slug as keyof typeof shorelineExposureProfiles]
    expect(calculated.transmission).toEqual([...expected.transmission])
    calculated.nearestObstacleKm?.forEach((distance, index) => {
      const expectedDistance = expected.nearestObstacleKm[index]
      if (distance === null || expectedDistance === null) expect(distance).toBe(expectedDistance)
      else expect(Math.abs(distance - expectedDistance)).toBeLessThanOrEqual(0.1)
    })
  })
})
