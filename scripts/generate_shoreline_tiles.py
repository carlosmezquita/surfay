"""Build composite IHM shoreline tiles for exposure and spot research."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path

import shapefile

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / ".generated-shoreline" / "LC"
SOURCES = {
    "natural": SOURCE_ROOT / "COALNE" / "COALNE.shp",
    "artificial": SOURCE_ROOT / "SLCONS" / "SLCONS.shp",
    "low_water": SOURCE_ROOT / "DEPCNT" / "DEPCNT.shp",
}
CALCULATION_LAYERS = {"natural", "artificial"}
OUTPUT = ROOT / "public" / "shoreline" / "ihm-lc-composite-v3"
VERSION = "ihm-lc-composite-v3"
TILE_SIZE = 0.25
DATA_BOUNDS = (-10.5, 40.9, -5.7, 44.0)
SPOT_BOUNDS = (-9.6, 41.7, -6.65, 43.79207720657858)


def tile_index(longitude: float, latitude: float) -> tuple[int, int]:
    return (
        math.floor((longitude - DATA_BOUNDS[0]) / TILE_SIZE),
        math.floor((latitude - DATA_BOUNDS[1]) / TILE_SIZE),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=SOURCE_ROOT,
                        help="Directory containing COALNE/, SLCONS/ and DEPCNT/ shapefiles")
    args = parser.parse_args()
    sources = {layer: args.source_dir / path.relative_to(SOURCE_ROOT) for layer, path in SOURCES.items()}
    missing = [str(path) for path in sources.values() if not path.exists()]
    if missing:
        raise SystemExit(f"IHM shoreline shapefiles not found: {', '.join(missing)}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    # Never leave obsolete tiles behind after regenerating a smaller subset.
    for existing in OUTPUT.glob("*.json"):
        existing.unlink()
    tiles: dict[tuple[int, int], list[list[float | int | str]]] = defaultdict(list)
    segment_id = 0
    layer_counts: dict[str, int] = defaultdict(int)
    for layer, source in sources.items():
        reader = shapefile.Reader(str(source))
        for shape in reader.iterShapes():
            left, bottom, right, top = shape.bbox
            if right < DATA_BOUNDS[0] or left > DATA_BOUNDS[2] or top < DATA_BOUNDS[1] or bottom > DATA_BOUNDS[3]:
                continue
            starts = list(shape.parts) + [len(shape.points)]
            for start, end in zip(starts, starts[1:]):
                for point_index in range(start, end - 1):
                    lon1, lat1 = shape.points[point_index]
                    lon2, lat2 = shape.points[point_index + 1]
                    if max(lon1, lon2) < DATA_BOUNDS[0] or min(lon1, lon2) > DATA_BOUNDS[2] or max(lat1, lat2) < DATA_BOUNDS[1] or min(lat1, lat2) > DATA_BOUNDS[3]:
                        continue
                    x1, y1 = tile_index(min(lon1, lon2), min(lat1, lat2))
                    x2, y2 = tile_index(max(lon1, lon2), max(lat1, lat2))
                    segment = [segment_id, round(lon1, 7), round(lat1, 7), round(lon2, 7), round(lat2, 7), layer]
                    for tile_x in range(max(0, x1), x2 + 1):
                        for tile_y in range(max(0, y1), y2 + 1):
                            tiles[(tile_x, tile_y)].append(segment)
                    segment_id += 1
                    layer_counts[layer] += 1

    tile_names = []
    for (tile_x, tile_y), segments in sorted(tiles.items()):
        name = f"{tile_x}_{tile_y}.json"
        tile_names.append(name)
        (OUTPUT / name).write_text(json.dumps(segments, separators=(",", ":")), encoding="utf-8")

    manifest = {
        "datasetVersion": VERSION,
        "sourceShapefileSha256": {layer: hashlib.sha256(source.read_bytes()).hexdigest() for layer, source in sources.items()},
        "sourceUrl": "https://centrodedescargas.cnig.es/CentroDescargas/linea-costa",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
        "attribution": "Instituto Hidrográfico de la Marina (IHM), CC BY 4.0",
        "layers": {
            "natural": {"source": "COALNE", "purpose": "natural coastline", "calculation": True},
            "artificial": {"source": "SLCONS", "purpose": "ports and artificial works", "calculation": True},
            "low_water": {"source": "DEPCNT", "purpose": "low-water / zero-depth contour", "calculation": False},
        },
        "calculationLayers": sorted(CALCULATION_LAYERS),
        "layerSegmentCounts": layer_counts,
        "tileSizeDeg": TILE_SIZE,
        "dataBounds": DATA_BOUNDS,
        "spotBounds": SPOT_BOUNDS,
        "referenceLatitude": 43.40230530769231,
        "rawBearingStepDeg": 5,
        "sectorStepDeg": 10,
        "fanHalfWidthDeg": 20,
        "seawardHalfWidthDeg": 105,
        "traceOriginOffsetM": 100,
        "localIgnoreM": 50,
        "maxTraceM": 90000,
        "blockedTransmission": 0.08,
        "tiles": tile_names,
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Generated {len(tile_names)} composite tiles with {segment_id:,} unique segments in {OUTPUT}")
    print(f"Layer segments: {dict(layer_counts)}")


if __name__ == "__main__":
    main()

