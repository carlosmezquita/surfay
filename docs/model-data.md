# Optional shoreline research data

The checked-in TypeScript exposure profiles and bathymetric table are enough
for seeded forecasts. The full-resolution shoreline tiles are **not** tracked.
Calculating a new geographic exposure profile in the admin editor requires
those tiles. Provisional spots can be saved/published without them and remain
subject to the conservative provisional rating cap.

## Rebuild tiles

Download **Línea de Costa (LC)** from the
[official CNIG catalogue](https://centrodedescargas.cnig.es/CentroDescargas/linea-costa)
and extract it outside tracked source, for example:

```text
.generated-shoreline/LC/
  COALNE/COALNE.shp  (+ .shx, .dbf and accompanying metadata)
  SLCONS/SLCONS.shp  (+ .shx, .dbf and accompanying metadata)
  DEPCNT/DEPCNT.shp  (+ .shx, .dbf and accompanying metadata)
```

Then run:

```bash
python -m venv .venv-shoreline
.venv-shoreline/bin/python -m pip install -r scripts/requirements-shoreline.txt
.venv-shoreline/bin/python scripts/generate_shoreline_tiles.py \
  --source-dir .generated-shoreline/LC
bun run test:data
```

On Windows use `.venv-shoreline/Scripts/python.exe`. `--source-dir` can point
to any directory with the three layer directories. The generator records
source shapefile hashes and attribution in its manifest. It does not download
or fabricate replacement geometry if the source is missing.

`bun run test:data` is the original real-data comparison against the stored
Pantín/Bastiagueiro exposure profiles. It fails clearly if the source tiles
are absent. `bun run test` uses synthetic obstruction fixtures to test ray
geometry without depending on an external download.

Serve generated tiles with the app when deploying the geographic editor.
The CNIG download was unavailable (HTTP 502) during the hardening review;
no claim is made that the external download or full dataset regression was
verified in that review. If the catalogue changes, inspect source hashes and
review profile differences before regenerating migrations.

## Regenerate fallback exposure profiles

```bash
bun run shoreline:generate -- \
  --shapefile .generated-shoreline/LC/COALNE/COALNE.shp \
  --shapefile .generated-shoreline/LC/SLCONS/SLCONS.shp
```

Do not hand-edit generated TypeScript or historical migrations. A new profile
version needs a new migration and reviewed changes to the stored catalogue.

## Bathymetry

`scripts/generate_bathymetry_model.py` takes an explicit EMODnet NetCDF path.
It audits the source, runs the pinned SWAN container, rejects cases without
incident-boundary QA, and compiles a compact runtime table. See `--help` and
[the model notes](rating-model.md) for scope and calibration limitations.
The raw input and SWAN outputs remain under `.generated-bathymetry`.
