-- Add preferredPeriodS, maximumUsefulPeriodS, and confidence fields to existing spot JSONs.
-- Existing spots without these fields will be handled at load time via defaults.

-- Update all published surf_spot records to include calibration status and new fields
-- in their draft_json and published_json. Spot metadata is stored as JSON;
-- this migration adds the new fields to existing records.
UPDATE surf_spot
SET draft_json = json_insert(
  draft_json,
  '$.calibrationStatus', 'locally-reviewed',
  '$.heightRangeConfidence', 0.7,
  '$.periodConfidence', 0.6,
  '$.tideConfidence', 0.7,
  '$.bathymetryConfidence', 0.65,
  '$.windSensitivity', 1,
  '$.strongOffshoreLimitKmh', 32,
  '$.closeoutSensitivity', 1,
  '$.unresolvedDiffractionFloor', 0.05,
  '$.preferredPeriodS', json_array(8, 14),
  '$.maximumUsefulPeriodS', 18,
  '$.profileSources', json_object(
    'shoreFacingDeg', 'manual',
    'idealSwellDeg', 'manual',
    'swellWindowDeg', 'manual',
    'preferredHeightM', 'manual',
    'preferredPeriodS', 'manual',
    'tidePreference', 'manual',
    'closeoutSensitivity', 'default'
  )
)
WHERE json_extract(draft_json, '$.calibrationStatus') IS NULL
  AND draft_json IS NOT NULL;

UPDATE surf_spot
SET published_json = json_insert(
  published_json,
  '$.calibrationStatus', 'locally-reviewed',
  '$.heightRangeConfidence', 0.7,
  '$.periodConfidence', 0.6,
  '$.tideConfidence', 0.7,
  '$.bathymetryConfidence', 0.65,
  '$.windSensitivity', 1,
  '$.strongOffshoreLimitKmh', 32,
  '$.closeoutSensitivity', 1,
  '$.unresolvedDiffractionFloor', 0.05,
  '$.preferredPeriodS', json_array(8, 14),
  '$.maximumUsefulPeriodS', 18,
  '$.profileSources', json_object(
    'shoreFacingDeg', 'manual',
    'idealSwellDeg', 'manual',
    'swellWindowDeg', 'manual',
    'preferredHeightM', 'manual',
    'preferredPeriodS', 'manual',
    'tidePreference', 'manual',
    'closeoutSensitivity', 'default'
  )
)
WHERE json_extract(published_json, '$.calibrationStatus') IS NULL
  AND published_json IS NOT NULL;
