import { describe, expect, it } from 'vitest'
import { nearbyTileNames, type ShorelineManifest } from './shorelineTiles'

const manifest: ShorelineManifest = {
  datasetVersion: 'test', tileSizeDeg: 0.25, dataBounds: [-10.5, 40.9, -5.7, 44],
  tiles: ['7_9.json', '8_9.json', '8_10.json', '9_9.json', '9_10.json'],
}

describe('COALNE research overlay tiles', () => {
  it('loads only available tiles around the spot', () => {
    expect(nearbyTileNames(manifest, 43.37, -8.4)).toEqual(['7_9.json', '8_9.json', '8_10.json', '9_9.json', '9_10.json'])
  })
})
