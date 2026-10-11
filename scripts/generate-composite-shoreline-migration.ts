import { shorelineExposureProfiles } from '../src/data/shorelineExposure.generated'
import { surfSpots } from '../src/data/spots'
import { SHORELINE_DATASET_VERSION, spotInputFingerprint } from '../src/domain/spotAdmin'

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
const exposureFor = (spot: (typeof surfSpots)[number]) => {
  const { id: _id, ...draft } = spot
  void _id
  return {
    ...shorelineExposureProfiles[spot.slug as keyof typeof shorelineExposureProfiles],
    datasetVersion: SHORELINE_DATASET_VERSION,
    inputFingerprint: spotInputFingerprint(draft),
  }
}
const geometryMatches = (column: 'draft_json' | 'published_json', spot: (typeof surfSpots)[number]) =>
  `slug = ${quote(spot.slug)} AND json_extract(${column}, '$.latitude') = ${spot.latitude} `
  + `AND json_extract(${column}, '$.longitude') = ${spot.longitude} `
  + `AND json_extract(${column}, '$.shoreFacingDeg') = ${spot.shoreFacingDeg}`
const draftCases = surfSpots.map((spot) =>
  `WHEN ${geometryMatches('draft_json', spot)} THEN ${quote(JSON.stringify(exposureFor(spot)))}`,
).join('\n      ')
const publishedCases = surfSpots.map((spot) =>
  `WHEN ${geometryMatches('published_json', spot)} THEN ${quote(JSON.stringify(exposureFor(spot)))}`,
).join('\n      ')
const slugs = surfSpots.map((spot) => quote(spot.slug)).join(', ')

const sql = `PRAGMA foreign_keys = ON;

UPDATE surf_spot
   SET draft_exposure_json = CASE
      ${draftCases}
      ELSE draft_exposure_json END,
       published_exposure_json = CASE WHEN published_json IS NOT NULL THEN CASE
      ${publishedCases}
      ELSE published_exposure_json END ELSE published_exposure_json END,
       revision = revision + 1,
       updated_at = unixepoch() * 1000
 WHERE slug IN (${slugs});

UPDATE spot_catalogue_state
   SET version = version + 1,
       updated_at = unixepoch() * 1000
 WHERE id = 1;
`

await Bun.write(new URL('../migrations/0006_coastal_exposure_v3.sql', import.meta.url), sql)
console.log(`Generated v3 coastal exposure migration for ${surfSpots.length} spots`)
