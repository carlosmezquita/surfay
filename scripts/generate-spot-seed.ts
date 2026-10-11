import { shorelineExposureProfiles } from '../src/data/shorelineExposure.generated'
import { surfSpots } from '../src/data/spots'
import { SHORELINE_DATASET_VERSION, spotInputFingerprint } from '../src/domain/spotAdmin'

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
const rows = surfSpots.map((spot) => {
  const { id, ...draft } = spot
  const generated = shorelineExposureProfiles[spot.slug as keyof typeof shorelineExposureProfiles]
  const exposure = {
    ...generated,
    datasetVersion: SHORELINE_DATASET_VERSION,
    inputFingerprint: spotInputFingerprint(draft),
  }
  const json = JSON.stringify(draft)
  const exposureJson = JSON.stringify(exposure)
  return `(${quote(id)}, ${quote(spot.slug)}, 'published', ${quote(json)}, ${quote(json)}, ${quote(exposureJson)}, ${quote(exposureJson)}, 1, NULL, NULL, unixepoch() * 1000, unixepoch() * 1000, unixepoch() * 1000)`
})

const sql = `PRAGMA foreign_keys = ON;

INSERT INTO "surf_spot"
  ("id", "slug", "status", "draft_json", "published_json", "draft_exposure_json", "published_exposure_json",
   "revision", "created_by", "updated_by", "created_at", "updated_at", "published_at")
VALUES
  ${rows.join(',\n  ')};
`

await Bun.write(new URL('../migrations/0004_seed_spots.sql', import.meta.url), sql)
console.log(`Generated migration for ${rows.length} spots`)
