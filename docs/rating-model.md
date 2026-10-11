# Surf rating model: evidence and limits

Last reviewed: 2026-10-11. Current scoring model version: 8.

## What the rating represents

The public score is a surf-session suitability estimate, not an offshore-wave
score. It must first establish that usable wave energy reaches the spot. Wind,
tide and gusts may then preserve or reduce that potential; they cannot create
wave quality when the transformed sea is small or shadowed.

The current implementation therefore uses:

1. an explicit `0/5 Flat` feasibility gate based on period-adjusted local
   height and an `H²T` energy proxy;
2. energy-combined offshore wave partitions;
3. per-partition coastal and, where available, SWAN bathymetric transfer;
4. a weighted geometric mean of useful height, period, directional exposure
   and spectral consistency;
5. a bounded wind/tide/gust surface modifier between 0.58 and 1.00 (v6);
6. explicit wind-quality caps for direct-onshore, cross-onshore, and strong
   offshore conditions;
7. conservative defaults when wind, tide, or gusts are unavailable;
8. 4/5 and 5/5 eligibility gates requiring complete surface data, acceptable
   wind, and useful swell height;
9. a 5/5 confidence gate requiring ≥78% confidence.

Server snapshots and the browser cache carry a scoring-model version. Only
the current model's snapshots are served. Version 8 keeps the v7 quality
equations and requires UTC timestamps; older snapshots are refreshed.

The lower and upper values in `preferredHeightM` describe a locally surfable
interval. They are no longer a flat 100% plateau: its middle is treated as the
prime height band.

## Rating buckets (v6)

| Quality | Score |
|---:|---|
| 0 (flat) | 0 |
| 1–24 | 1 |
| 25–44 | 2 |
| 45–64 | 3 |
| 65–84 | 4 |
| 85+ | Eligible for 5 |

The 3/5 bucket was narrowed from 45–71 to 45–64. This makes 4/5 numerically
easier to reach, so the eligibility gates below are essential.

## 4/5 eligibility gates (v6)

A calculated 4/5 additionally requires:

- **Complete surface data**: both wind and tide data are available.
- **Acceptable wind**: wind is not onshore at ≥12 km/h, not cross-onshore at
  ≥22 km/h, and not offshore at ≥32 km/h.
- **Useful height**: effective height is within the spot's preferred range.

If a base quality maps to 4+ but the gates fail, the score is capped at 3/5.

## 5/5 eligibility gates (v6)

For a 5/5 "Epic" rating, all of the following must be true in addition to the
4/5 gates:

- swell height score ≥ 0.90
- swell period score ≥ 0.82
- swell exposure ≥ 0.75
- swell consistency ≥ 0.85
- wind score ≥ 0.80
- tide score ≥ 0.65
- confidence ≥ 0.78
- sheltered spots need bathymetry coverage ≥ 0.65 and either shoreline
  transmission ≥ 0.55 or bathymetry coverage ≥ 0.65

## Wind caps (v6)

Direct onshore wind (≥145° from ideal offshore):

| Wind speed | Maximum quality | Max score |
|---:|---:|---:|
| <12 km/h | No cap | Formula decides |
| 12–20 km/h | 71→59 (interpolated) | 3/5 |
| 20–28 km/h | 59→44 (interpolated) | 3/5 |
| ≥28 km/h | 44 | 2/5 |

Cross-onshore wind (105°–145° from ideal offshore) at ≥22 km/h is capped from
69→52 over 22–34 km/h, preventing 4/5 for strong cross-onshore conditions.

Offshore wind becomes penalized at ≥32 km/h, with quality capped from 71→52
over 32–48 km/h. This prevents strong offshore from reaching 4/5 while
preserving normal offshore as beneficial.

## Missing data (v6)

- Missing wind data uses a conservative score of 0.45 (previously 0.62) and
  is flagged as unavailable. It cannot produce 4/5 or 5/5.
- Missing tide data uses a conservative score of 0.55 (previously 0.68) and
  is flagged as unavailable. It cannot produce 4/5 or 5/5.
- Missing gusts use a factor of 0.55 (previously 0.72) — unavailable gust
  data is no longer treated as reasonably favorable.
- Missing wind no longer produces a false-positive "light wind" reason.

## Surface modifier (v6)

```
surfaceModifier = 0.58 + wind.score * 0.25 + tide.score * 0.10 + gustFactor * 0.07
```

(v5: `0.72 + wind.score * 0.16 + tide * 0.08 + gustFactor * 0.04`)

Both formulas reach 1.0 under perfect conditions. The new weights give wind
and tide more influence and let genuinely bad conditions produce a more
meaningful reduction.

## confidence threshold for 5/5 (v6)

Confidence below 78% prevents a 5/5 rating even if all other epic gates pass.
Missing wind or tide already blocks 4/5 and 5/5 through the surface-data gate.

## Short-period safeguards (v7)

Non-Flat conditions are constrained by wave power (computed from transformed
local height and energy-weighted effective period):

| Condition | Period | Power | Max quality | Max score |
|---|---|---|---|---|
| Weak short-period sea | ≤6.5 s | <3.5 kW/m | 0.44 | 2/5 |
| Short-period | <8 s | ≥3.5 kW/m | 0.64 | 3/5 |

These gates use transformed local height and the energy-weighted effective
period. They do not use raw offshore height. A period ≥8 s is required for
4/5 (Good) or 5/5 (Epic) eligibility.

Calm or favorable wind cannot manufacture organized swell from weak
short-period conditions. The thresholds are conservative engineering
boundaries informed by surfability research and should later be checked
against cameras or observations.

Flat surf (0/5) takes precedence over all period caps. Conversely, non-Flat
weak surf will never receive 0/5 solely because of these rules.

## Provisional spots and calibration status (v6)

Newly created spots begin as `provisional` with conservative defaults. Rating
eligibility depends on `calibrationStatus`:

| Status | Maximum score | Requirements |
|---|---:|---|
| `provisional` | 3/5 | Identity + coordinates only |
| `geography-reviewed` | 4/5 | Derived shoreline exposure, confirmed orientation |
| `locally-reviewed` | 5/5 eligible | Locally reviewed height, period, tide, wind parameters |
| `calibrated` | 5/5 eligible | Observed calibration data available |

Provisional spots use a quality cap of 0.64 (≤3/5) regardless of conditions.

Confidence fields (`orientationConfidence`, `heightRangeConfidence`,
`periodConfidence`, `tideConfidence`, `bathymetryConfidence`) describe how
well the configuration is known — not the forecast conditions. Provisional
defaults set orientationConfidence to 0.35, tideConfidence to 0, and
bathymetryConfidence to 0.

When `tideConfidence` is 0, the effective tide score blends toward a
conservative 0.55 via `lerp(0.55, calculatedScore, tideConfidence)`. No
"good tide" or "poor tide" reasons are generated.

Missing orientation (`shoreFacingDeg === null`) returns wind score 0.45
with `windImpact = 'variable'`. Missing `idealSwellDeg` returns a
conservative `directionalExposure` of 0.45.

Missing shoreline profile dampens geographic exposure by 0.65 instead of
assuming full coastal access. The forecast continues to operate without
pretending the coastline is fully open.

Existing pilot spots are assigned `locally-reviewed` or `geography-reviewed`
status based on whether their surf parameters were manually reviewed.

## Why SWAN is not the whole answer

SWAN is a phase-averaged spectral model and is suitable for offshore-to-
nearshore shoaling, refraction, bottom friction, triads and depth-induced
breaking. Its diffraction option is a phase-decoupled mild-slope
approximation. The SWAN manual warns that it does not properly handle
diffraction in harbours or in front of reflecting obstacles, can converge
poorly, and needs roughly 1/5–1/10 of the dominant wavelength near an obstacle
tip.

The accepted EMODnet table in this repository models stationary refraction and
shoaling for all 14 catalogue spots across four native-grid domains. Its
Atlantic support is 210°–360° at 30° intervals and 5/8/12/16/20 s at a
representative +2 m LAT water level. Runtime interpolation fills the interior
of that grid and tapers to the coastline fallback just outside it. It excludes
diffraction, currents, breaking and harbour reflections, so receptor output is
still not breaking-wave face height.

For sheltered ría beaches, the recommended stack is:

- outer SWAN domain for the full directional spectrum;
- nested high-resolution SWAN through the ría with calibrated breaking,
  bottom-friction and triad settings;
- local SWASH (or a comparable phase-resolving model) across the headland /
  harbour / surf-zone domain where diffraction and individual breaking waves
  matter;
- camera or in-situ validation of breaking height, rideable crest length and
  peel rate.

High-resolution local bathymetry/topography and beach profiles are required.
The approximately 115 m EMODnet grid cannot resolve beach bars or the surf-zone
morphology that controls where waves focus and break.

## Evidence used

- [Surfline's current rating documentation](https://support.surfline.com/hc/en-us/articles/36277684017819-Surf-Ratings-Colors)
  says its automatic condition rating is based mainly on breaking surf height
  and wind, is relative to each spot, and reserves Good/Epic for human
  forecasters. Its earlier [published scale](https://www.surfline.com/blogs/the-surfline-blog-stay-up-to-date-with-whats-happening-on-surflinecom/changes-to-wave-descriptions_31936/)
  explicitly separates Flat (“unsurfable or no surf”) from Very Poor.
- [Surfline's LOTUS description](https://www.surfline.com/lp/whatsnew/features/lotus-swell-model)
  attributes spot skill to high-resolution nearshore bathymetry, breaking surf
  height, buoy/satellite assimilation, hindcasts, cameras, historical reports,
  manual calibration and machine learning—not to a published universal star
  formula.
- [SWAN 41.51 user manual](https://swanmodel.sourceforge.io/download/zip/swanuse.pdf)
  and [official diffraction documentation](https://swanmodel.sourceforge.io/online_doc/swantech/node29.html).
- [SWASH features](https://swash.sourceforge.io/features/features.htm) and
  [official documentation](https://swash.sourceforge.io/online_doc/online_doc.htm).
- Scarfe et al. (2003), [The Science of Surfing Waves and Surfing Breaks — A Review](https://escholarship.org/uc/item/6h72j1fz):
  surf amenity depends on breaking height, peel angle/intensity and section
  length, not offshore significant height alone.
- [Bathymetric control on the spatial distribution of wave breaking in the surf zone of a natural beach](https://doi.org/10.1016/j.coastaleng.2016.06.012)
  (2016): validated phase-resolving modeling links alongshore breaking
  variability to morphology.
- [Parameterization of nearshore wave front slope](https://doi.org/10.1016/j.coastaleng.2017.06.008)
  (2017): breaking depends on local wave parameters, relative depth and bed
  slope.
- [A camera based method for assessing surf amenity](https://doi.org/10.1016/j.oceaneng.2023.115606)
  (2023): Wave Peel Tracking quantifies potential ride duration, length, speed
  and rate.
- [Nearshore wave breaking limit for gentle bottom slopes](https://doi.org/10.1016/j.oceaneng.2025.124117)
  (2026): field observations show that a universal fixed `H/d = 0.78` breaking
  threshold is not reliable across slopes and morphology.

## Validation before machine learning

For each spot and hour, retain the raw offshore partitions, modeled transfer,
tide and wind alongside observations. The minimum useful label set is:

- breaking-wave height band;
- surfable/not surfable;
- closeout percentage or rideable crest length;
- surface quality;
- one overall 1–5 local-surfer rating.

Train only after the deterministic model has physics-meaningful features and
enough observations across direction, period, height and tide. Random splits
would leak adjacent hours; validation must be blocked by storm/event and date.


## Timestamp and evidence storage (v8)

Model v8 preserves the v7 quality equations but changes the data contract:
provider requests use UTC; stored hours are absolute ISO timestamps and UI
labels use Europe/Madrid. Older snapshots are rejected to prevent naive
Madrid timestamps being interpreted in a viewer's timezone.

A report carries the displayed per-spot snapshot ID. The server checks the
spot, catalogue, model and selected hour, then retains the complete scored
hour, source generation time and catalogue version in the report. Pruning
old forecast payloads can clear the foreign-key reference without deleting
that evidence. This supports future calibration; it does not establish
empirical accuracy. The confidence indicator remains a heuristic input/profile
assessment, not a calibrated probability or confidence interval.
