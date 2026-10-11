#!/usr/bin/env python3
"""Audit EMODnet DTM 2024 and generate reproducible SWAN transfer cases.

The raw NetCDF is deliberately kept outside the deployed application. Generated
SWAN work files live under .generated-bathymetry (gitignored); the final compact
JSON is suitable for review and conversion to the runtime TypeScript artifact.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

try:
    import numpy as np
    from netCDF4 import Dataset
except ImportError as error:  # pragma: no cover - user-facing dependency guard
    raise SystemExit(
        "Bathymetry dependencies are missing. Run: "
        "python -m pip install -r scripts/requirements-bathymetry.txt"
    ) from error


REQUIRED_VARIABLES = (
    "latitude",
    "longitude",
    "elevation",
    "value_count",
    "cdi_index",
    "interpolation_flag",
    "elevation_max",
    "elevation_min",
    "stdev",
)
EXPECTED_DATUM = "Lowest Astronomical Tide"
SWAN_IMAGE = (
    "delftwaves/swan@sha256:"
    "705a093bfb4c6866da0deed92bc96af8d32846f9b58b167a393e8a73e6bd865a"
)
METRES_PER_LATITUDE_DEGREE = 111_320.0

RIA_BOUNDS = {
    "coruna": (-8.52, -8.30, 43.28, 43.44),
    "ares_betanzos": (-8.38, -8.02, 43.20, 43.50),
    "ferrol": (-8.42, -8.12, 43.40, 43.58),
    "cedeira": (-8.42, -8.20, 43.60, 43.72),
    "ortigueira": (-8.05, -7.75, 43.65, 43.80),
    "viveiro": (-7.70, -7.50, 43.62, 43.77),
    "ribadeo": (-7.10, -6.95, 43.42, 43.58),
    "muros_noia": (-9.22, -8.72, 42.58, 42.90),
    "arousa": (-9.15, -8.60, 42.40, 42.76),
    "pontevedra": (-8.98, -8.57, 42.24, 42.50),
    "vigo": (-8.96, -8.50, 42.05, 42.34),
}

DOMAINS = {
    "coruna": {
        "bounds": (-8.65, -8.25, 43.25, 43.45),
        "spots": ("orzan", "matadero", "bastiagueiro", "santa-cristina"),
    },
    "bergantinos": {
        "bounds": (-8.95, -8.42, 43.20, 43.42),
        "spots": ("sabon", "barranan", "malpica", "caion", "razo", "baldaio"),
    },
    "ferrol": {
        "bounds": (-8.45, -8.20, 43.43, 43.60),
        "spots": ("doninos", "esmelle"),
    },
    "cedeira": {
        "bounds": (-8.32, -8.02, 43.52, 43.72),
        "spots": ("campelo", "pantin"),
    },
}


@dataclass(frozen=True)
class Spot:
    slug: str
    name: str
    latitude: float
    longitude: float
    shore_facing_deg: float


@dataclass(frozen=True)
class Receptor:
    slug: str
    name: str
    longitude: float
    latitude: float
    x_m: float
    y_m: float
    depth_lat_m: float
    distance_from_catalogue_km: float
    interpolation_flag: int
    cdi_index: int


def masked(array: Any, fill: float | int) -> np.ndarray:
    return np.asarray(np.ma.filled(array, fill))


def angular_difference(a: float, b: float) -> float:
    return 180.0 - abs(abs((a % 360.0) - (b % 360.0)) - 180.0)


def bearing_from_delta(dx_km: np.ndarray, dy_km: np.ndarray) -> np.ndarray:
    return (np.degrees(np.arctan2(dx_km, dy_km)) + 360.0) % 360.0


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_spots(path: Path) -> list[Spot]:
    text = path.read_text(encoding="utf-8")
    blocks = re.findall(r"\{\s*id:\s*'[^']+',([\s\S]*?)\n\s*\},", text)
    spots: list[Spot] = []
    for block in blocks:
        strings = {
            key: re.search(rf"{key}:\s*'([^']+)'", block)
            for key in ("slug", "name")
        }
        numbers = {
            key: re.search(rf"{key}:\s*([-\d.]+)", block)
            for key in ("latitude", "longitude", "shoreFacingDeg")
        }
        if not all(strings.values()) or not all(numbers.values()):
            continue
        spots.append(
            Spot(
                slug=strings["slug"].group(1),
                name=strings["name"].group(1),
                latitude=float(numbers["latitude"].group(1)),
                longitude=float(numbers["longitude"].group(1)),
                shore_facing_deg=float(numbers["shoreFacingDeg"].group(1)),
            )
        )
    if not spots:
        raise ValueError(f"No spot definitions found in {path}")
    return spots


def index_slice(axis: np.ndarray, minimum: float, maximum: float) -> slice:
    return slice(
        max(0, int(np.searchsorted(axis, minimum, side="left"))),
        min(len(axis), int(np.searchsorted(axis, maximum, side="right"))),
    )


def validate_dataset(dataset: Dataset) -> tuple[np.ndarray, np.ndarray]:
    missing = [name for name in REQUIRED_VARIABLES if name not in dataset.variables]
    if missing:
        raise ValueError(f"NetCDF is missing variables: {', '.join(missing)}")
    datum = str(getattr(dataset["elevation"], "long_name", ""))
    if EXPECTED_DATUM not in datum:
        raise ValueError(f"Expected LAT bathymetry, got: {datum or 'unknown datum'}")
    latitudes = np.asarray(dataset["latitude"][:], dtype=np.float64)
    longitudes = np.asarray(dataset["longitude"][:], dtype=np.float64)
    if latitudes.size < 2 or longitudes.size < 2:
        raise ValueError("Bathymetry grid is empty")
    if not np.all(np.diff(latitudes) > 0) or not np.all(np.diff(longitudes) > 0):
        raise ValueError("Latitude and longitude axes must be ascending")
    return latitudes, longitudes


def quality_stats(
    dataset: Dataset,
    longitudes: np.ndarray,
    latitudes: np.ndarray,
    bounds: tuple[float, float, float, float],
) -> dict[str, Any]:
    min_lon, max_lon, min_lat, max_lat = bounds
    ys = index_slice(latitudes, min_lat, max_lat)
    xs = index_slice(longitudes, min_lon, max_lon)
    elevation = masked(dataset["elevation"][ys, xs], np.nan)
    interpolation = masked(dataset["interpolation_flag"][ys, xs], 127)
    counts = masked(dataset["value_count"][ys, xs], -1)
    deviation = masked(dataset["stdev"][ys, xs], np.nan)
    sources = masked(dataset["cdi_index"][ys, xs], -1)
    water = np.isfinite(elevation) & (elevation < 0)
    count = int(water.sum())
    valid_deviation = deviation[water & np.isfinite(deviation)]
    valid_sources = sources[water & (sources >= 0)]
    return {
        "bounds": list(bounds),
        "waterCellCount": count,
        "notInterpolatedFraction": round(float((interpolation[water] == 0).mean()), 5) if count else None,
        "interpolatedFraction": round(float((interpolation[water] == 1).mean()), 5) if count else None,
        "positiveValueCountFraction": round(float((counts[water] > 0).mean()), 5) if count else None,
        "stdevMedianM": round(float(np.median(valid_deviation)), 3) if valid_deviation.size else None,
        "stdevP90M": round(float(np.percentile(valid_deviation, 90)), 3) if valid_deviation.size else None,
        "sourceIndexes": [int(value) for value in np.unique(valid_sources)],
    }


def nearest_receptor(
    dataset: Dataset,
    longitudes: np.ndarray,
    latitudes: np.ndarray,
    spot: Spot,
    origin_lon: float,
    origin_lat: float,
    target_depth_m: float = 10.0,
) -> Receptor:
    radius_km = 2.0
    lon_scale = METRES_PER_LATITUDE_DEGREE * math.cos(math.radians(spot.latitude)) / 1000.0
    lat_scale = METRES_PER_LATITUDE_DEGREE / 1000.0
    ys = index_slice(latitudes, spot.latitude - radius_km / lat_scale, spot.latitude + radius_km / lat_scale)
    xs = index_slice(longitudes, spot.longitude - radius_km / lon_scale, spot.longitude + radius_km / lon_scale)
    local_latitudes = latitudes[ys]
    local_longitudes = longitudes[xs]
    elevation = masked(dataset["elevation"][ys, xs], np.nan)
    interpolation = masked(dataset["interpolation_flag"][ys, xs], 127)
    sources = masked(dataset["cdi_index"][ys, xs], -1)
    lon_grid, lat_grid = np.meshgrid(local_longitudes, local_latitudes)
    dx = (lon_grid - spot.longitude) * lon_scale
    dy = (lat_grid - spot.latitude) * lat_scale
    distance = np.hypot(dx, dy)
    bearing = bearing_from_delta(dx, dy)
    bearing_delta = np.abs((bearing - spot.shore_facing_deg + 180.0) % 360.0 - 180.0)
    depth = -elevation
    candidates = (
        np.isfinite(depth)
        & (depth > 1.0)
        & (distance <= radius_km)
        & (bearing_delta <= 50.0)
    )
    if not candidates.any():
        candidates = np.isfinite(depth) & (depth > 1.0) & (distance <= radius_km)
    if not candidates.any():
        raise ValueError(f"No wet receptor cell found within {radius_km:g} km of {spot.name}")
    cost = abs(depth - target_depth_m) / target_depth_m + distance + bearing_delta / 180.0
    row, column = np.unravel_index(np.argmin(np.where(candidates, cost, np.inf)), cost.shape)
    longitude = float(lon_grid[row, column])
    latitude = float(lat_grid[row, column])
    x_m = (longitude - origin_lon) * METRES_PER_LATITUDE_DEGREE * math.cos(math.radians(origin_lat))
    y_m = (latitude - origin_lat) * METRES_PER_LATITUDE_DEGREE
    return Receptor(
        slug=spot.slug,
        name=spot.name,
        longitude=longitude,
        latitude=latitude,
        x_m=round(x_m, 3),
        y_m=round(y_m, 3),
        depth_lat_m=round(float(depth[row, column]), 3),
        distance_from_catalogue_km=round(float(distance[row, column]), 3),
        interpolation_flag=int(interpolation[row, column]),
        cdi_index=int(sources[row, column]),
    )


def boundary_control_receptor(
    side: str,
    elevation: np.ndarray,
    interpolation: np.ndarray,
    sources: np.ndarray,
    grid_longitudes: np.ndarray,
    grid_latitudes: np.ndarray,
    origin_lon: float,
    origin_lat: float,
) -> Receptor:
    """Pick a wet, reasonably deep QA point just inside a model boundary."""
    rows, columns = elevation.shape
    band = max(1, min(4, rows // 4, columns // 4))
    row_grid, column_grid = np.indices(elevation.shape)
    if side == "W":
        edge_distance = column_grid
        along_distance = abs(row_grid - (rows - 1) / 2.0) / max(rows, 1)
    elif side == "E":
        edge_distance = columns - 1 - column_grid
        along_distance = abs(row_grid - (rows - 1) / 2.0) / max(rows, 1)
    elif side == "S":
        edge_distance = row_grid
        along_distance = abs(column_grid - (columns - 1) / 2.0) / max(columns, 1)
    elif side == "N":
        edge_distance = rows - 1 - row_grid
        along_distance = abs(column_grid - (columns - 1) / 2.0) / max(columns, 1)
    else:  # pragma: no cover - internal invariant
        raise ValueError(f"Unknown SWAN boundary side: {side}")
    depth = -elevation
    candidates = np.isfinite(depth) & (depth >= 10.0) & (edge_distance < band)
    if not candidates.any():
        candidates = np.isfinite(depth) & (depth > 1.0) & (edge_distance < band)
    if not candidates.any():
        raise ValueError(f"No wet QA control found on the {side} boundary")
    cost = edge_distance * 0.2 + along_distance - np.minimum(depth, 100.0) / 1000.0
    row, column = np.unravel_index(np.argmin(np.where(candidates, cost, np.inf)), cost.shape)
    longitude = float(grid_longitudes[column])
    latitude = float(grid_latitudes[row])
    x_m = (longitude - origin_lon) * METRES_PER_LATITUDE_DEGREE * math.cos(math.radians(origin_lat))
    y_m = (latitude - origin_lat) * METRES_PER_LATITUDE_DEGREE
    return Receptor(
        slug=f"qa_{side.lower()}",
        name=f"QA {side} boundary",
        longitude=longitude,
        latitude=latitude,
        x_m=round(x_m, 3),
        y_m=round(y_m, 3),
        depth_lat_m=round(float(depth[row, column]), 3),
        distance_from_catalogue_km=0.0,
        interpolation_flag=int(interpolation[row, column]),
        cdi_index=int(sources[row, column]),
    )


def audit(args: argparse.Namespace) -> None:
    spots = parse_spots(args.spots)
    with Dataset(args.netcdf) as dataset:
        latitudes, longitudes = validate_dataset(dataset)
        spot_results: dict[str, Any] = {}
        for spot in spots:
            lon_scale = METRES_PER_LATITUDE_DEGREE * math.cos(math.radians(spot.latitude)) / 1000.0
            lat_scale = METRES_PER_LATITUDE_DEGREE / 1000.0
            bounds = (
                spot.longitude - 5.0 / lon_scale,
                spot.longitude + 5.0 / lon_scale,
                spot.latitude - 5.0 / lat_scale,
                spot.latitude + 5.0 / lat_scale,
            )
            spot_results[spot.slug] = quality_stats(dataset, longitudes, latitudes, bounds)
        result = {
            "schemaVersion": 1,
            "dataset": {
                "name": "EMODnet Digital Bathymetry DTM 2024",
                "datum": "LAT",
                "sha256": sha256(args.netcdf),
                "shape": [int(latitudes.size), int(longitudes.size)],
                "bounds": [float(longitudes[0]), float(latitudes[0]), float(longitudes[-1]), float(latitudes[-1])],
                "spacingDegrees": [float(latitudes[1] - latitudes[0]), float(longitudes[1] - longitudes[0])],
            },
            "rias": {
                name: quality_stats(dataset, longitudes, latitudes, bounds)
                for name, bounds in RIA_BOUNDS.items()
            },
            "spots": spot_results,
            "qualityInterpretation": (
                "interpolation_flag=0 means source-covered/not extrapolated in EMODnet; "
                "it does not prove a direct sounding exists in every 115 m cell."
            ),
        }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.output}")


def float_list(values: Iterable[float]) -> str:
    return " ".join(f"{value:.3f}" for value in values)


def incoming_boundary_sides(direction_deg: float) -> list[str]:
    radians = math.radians(direction_deg % 360.0)
    sides: list[str] = []
    # In nautical convention direction is where waves come from. Apply the
    # spectrum only on the up-wave sides; diagonal seas enter on two sides.
    if math.sin(radians) < -1e-8:
        sides.append("W")
    if math.sin(radians) > 1e-8:
        sides.append("E")
    if math.cos(radians) > 1e-8:
        sides.append("N")
    if math.cos(radians) < -1e-8:
        sides.append("S")
    return sides


def write_swan_input(
    path: Path,
    case_name: str,
    output_name: str,
    nx: int,
    ny: int,
    dx_m: float,
    dy_m: float,
    direction_deg: float,
    period_s: float,
    water_level_lat_m: float,
    diffraction: bool,
) -> None:
    width_m = (nx - 1) * dx_m
    height_m = (ny - 1) * dy_m
    boundary_sides = incoming_boundary_sides(direction_deg)
    boundary_commands = "\n".join(
        f"BOUN SIDE {side} CCW CON PAR 1.0 {period_s:.3f} {direction_deg:.3f} 20."
        for side in boundary_sides
    )
    diffraction_command = "DIFFRAC 1 0.2 6 1" if diffraction else ""
    text = f"""PROJECT '{case_name[:16]}' 'T01'
SET LEVEL {water_level_lat_m:.3f} NAUT
MODE STAT TWOD
COORD CART
CGRID 0. 0. 0. {width_m:.3f} {height_m:.3f} {nx - 1} {ny - 1} CIRCLE 72 0.04 0.50 31
INPGRID BOTTOM REG 0. 0. 0. {nx - 1} {ny - 1} {dx_m:.6f} {dy_m:.6f} EXC -999.
READINP BOTTOM 1. 'bottom.bot' 1 0 FREE
BOUND SHAPE JONSWAP 3.3 PEAK DSPR DEGREES
{boundary_commands}
{diffraction_command}
OFF QUAD
NUM STOPC 0.005 0.01 0.005 99.5 STAT 60 0.01
POINTS 'spots' FILE 'receptors.loc'
TABLE 'spots' NOHEAD '{output_name}' XP YP DEP HS RTP DIR DSPR
COMPUTE
STOP
"""
    path.write_text(text, encoding="ascii")


def parse_swan_table(path: Path, receptors: list[Receptor]) -> dict[str, Any]:
    rows: list[list[float]] = []
    for line in path.read_text(encoding="ascii").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("%"):
            continue
        rows.append([float(value) for value in stripped.split()])
    if len(rows) != len(receptors):
        raise ValueError(f"Expected {len(receptors)} SWAN rows in {path}, found {len(rows)}")
    result: dict[str, Any] = {}
    for receptor, row in zip(receptors, rows, strict=True):
        if len(row) < 7:
            raise ValueError(f"Unexpected SWAN row in {path}: {row}")
        result[receptor.slug] = {
            "depthM": round(row[2], 4),
            "heightCoefficient": round(row[3], 5),
            "peakPeriodS": round(row[4], 4),
            "localDirectionDeg": round(row[5] % 360.0, 3),
            "directionalSpreadDeg": round(row[6], 3),
        }
    return result


def swan(args: argparse.Namespace) -> None:
    if args.domain not in DOMAINS:
        raise ValueError(f"Unknown domain {args.domain}; choose from {', '.join(DOMAINS)}")
    domain = DOMAINS[args.domain]
    selected_slugs = set(domain["spots"])
    spots = [spot for spot in parse_spots(args.spots) if spot.slug in selected_slugs]
    if not spots:
        raise ValueError(f"No catalogue spots are assigned to domain {args.domain}")
    args.workdir.mkdir(parents=True, exist_ok=True)
    min_lon, max_lon, min_lat, max_lat = domain["bounds"]
    with Dataset(args.netcdf) as dataset:
        latitudes, longitudes = validate_dataset(dataset)
        if args.stride < 1:
            raise ValueError("SWAN grid stride must be at least 1")
        domain_ys = index_slice(latitudes, min_lat, max_lat)
        domain_xs = index_slice(longitudes, min_lon, max_lon)
        ys = slice(domain_ys.start, domain_ys.stop, args.stride)
        xs = slice(domain_xs.start, domain_xs.stop, args.stride)
        grid_latitudes = latitudes[ys]
        grid_longitudes = longitudes[xs]
        elevation = masked(dataset["elevation"][ys, xs], np.nan)
        interpolation = masked(dataset["interpolation_flag"][ys, xs], 127)
        sources = masked(dataset["cdi_index"][ys, xs], -1)
        if grid_latitudes.size < 2 or grid_longitudes.size < 2:
            raise ValueError("Selected SWAN domain does not overlap the NetCDF grid")
        origin_lon = float(grid_longitudes[0])
        origin_lat = float(grid_latitudes[0])
        reference_lat = float((grid_latitudes[0] + grid_latitudes[-1]) / 2.0)
        dx_m = float((grid_longitudes[1] - grid_longitudes[0]) * METRES_PER_LATITUDE_DEGREE * math.cos(math.radians(reference_lat)))
        dy_m = float((grid_latitudes[1] - grid_latitudes[0]) * METRES_PER_LATITUDE_DEGREE)
        receptors = [
            nearest_receptor(dataset, longitudes, latitudes, spot, origin_lon, origin_lat)
            for spot in spots
        ]
        for side in ("W", "N", "E", "S"):
            try:
                receptors.append(
                    boundary_control_receptor(
                        side,
                        elevation,
                        interpolation,
                        sources,
                        grid_longitudes,
                        grid_latitudes,
                        origin_lon,
                        origin_lat,
                    )
                )
            except ValueError:
                # A land-only edge is valid, but cannot supply incident waves.
                continue
        depth = np.where(np.isfinite(elevation), -elevation, -999.0)
        with (args.workdir / "bottom.bot").open("w", encoding="ascii", newline="\n") as output:
            for row in depth[::-1]:  # SWAN idla=1 starts in the upper-left corner.
                output.write(float_list(row) + "\n")
    with (args.workdir / "receptors.loc").open("w", encoding="ascii", newline="\n") as output:
        for receptor in receptors:
            output.write(f"{receptor.x_m:.3f} {receptor.y_m:.3f}\n")

    metadata = {
        "domain": args.domain,
        "sourceGridStride": args.stride,
        "bounds": [float(grid_longitudes[0]), float(grid_latitudes[0]), float(grid_longitudes[-1]), float(grid_latitudes[-1])],
        "shape": [int(grid_latitudes.size), int(grid_longitudes.size)],
        "spacingM": [round(dx_m, 4), round(dy_m, 4)],
        "receptors": [asdict(receptor) for receptor in receptors],
    }
    (args.workdir / "domain.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    cases: list[dict[str, Any]] = []
    for direction in args.directions:
        for period in args.periods:
            for water_level in args.water_levels:
                mode = "d" if args.diffraction else "r"
                token = (
                    f"{mode}{args.stride}_d{round(direction):03d}_"
                    f"p{round(period):02d}_l{round(water_level * 10):02d}"
                )
                input_path = args.workdir / f"{token}.swn"
                output_name = f"{token}.tbl"
                write_swan_input(
                    input_path,
                    token,
                    output_name,
                    grid_longitudes.size,
                    grid_latitudes.size,
                    dx_m,
                    dy_m,
                    direction,
                    period,
                    water_level,
                    args.diffraction,
                )
                case = {
                    "directionDeg": direction,
                    "periodS": period,
                    "waterLevelLatM": water_level,
                    "input": input_path.name,
                    "output": output_name,
                }
                if args.run:
                    output_path = args.workdir / output_name
                    if args.force or not output_path.is_file():
                        command = [
                            "docker", "run", "--rm",
                            "--mount", f"type=bind,source={args.workdir.resolve()},target=/home/swan",
                            args.swan_image,
                            "swanrun", "-input", token,
                        ]
                        completed = subprocess.run(command, check=False, text=True, capture_output=True)
                        case["stdout"] = completed.stdout.strip().splitlines()[-1:] or []
                        if completed.returncode != 0 or "Normal end of run" not in completed.stdout:
                            print(completed.stdout, file=sys.stderr)
                            print(completed.stderr, file=sys.stderr)
                            raise RuntimeError(f"SWAN failed for {token} with exit code {completed.returncode}")
                    else:
                        case["resumed"] = True
                    case["spots"] = parse_swan_table(args.workdir / output_name, receptors)
                    boundary_validation: dict[str, float] = {}
                    for side in incoming_boundary_sides(direction):
                        control = case["spots"].get(f"qa_{side.lower()}")
                        if control is None:
                            # A fully terrestrial incoming edge cannot inject
                            # energy. Diagonal seas can still enter through the
                            # other wet up-wave edge, which is validated below.
                            continue
                        coefficient = float(control["heightCoefficient"])
                        boundary_validation[side] = coefficient
                    if not boundary_validation:
                        raise RuntimeError(
                            f"SWAN domain has no wet incoming boundary QA receptor for {token}"
                        )
                    if not any(0.5 <= value <= 1.5 for value in boundary_validation.values()):
                        values = ", ".join(
                            f"{side}={value:g}" for side, value in boundary_validation.items()
                        )
                        raise RuntimeError(
                            f"SWAN rejected {token}: no incident boundary coefficient is "
                            f"approximately 1 ({values})"
                        )
                    case["boundaryValidation"] = boundary_validation
                cases.append(case)

    result = {
        "schemaVersion": 1,
        "status": "computed" if args.run else "prepared",
        "dataset": {
            "name": "EMODnet Digital Bathymetry DTM 2024",
            "datum": "LAT",
            "sha256": sha256(args.netcdf),
        },
        "solver": {
            "name": "SWAN",
            "image": args.swan_image,
            "diffraction": {
                "enabled": args.diffraction,
                "smoothingParameter": 0.2 if args.diffraction else None,
                "smoothingSteps": 6 if args.diffraction else None,
            },
            "incidentHeightM": 1.0,
            "directionalSpreadDeg": 20.0,
        },
        **metadata,
        "cases": cases,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.output}")


def compile_runtime(args: argparse.Namespace) -> None:
    documents = [json.loads(transfer.read_text(encoding="utf-8")) for transfer in args.transfers]
    if not documents:
        raise ValueError("At least one computed SWAN transfer file is required")
    dataset_hashes = {document["dataset"]["sha256"] for document in documents}
    solver_images = {document["solver"]["image"] for document in documents}
    strides = {document["sourceGridStride"] for document in documents}
    if len(dataset_hashes) != 1 or len(solver_images) != 1 or strides != {1}:
        raise ValueError("Runtime transfers must share one dataset/solver and use the native grid")
    if any(document.get("status") != "computed" for document in documents):
        raise ValueError("Runtime transfers must all be computed")
    if any(document["solver"]["diffraction"]["enabled"] for document in documents):
        raise ValueError("Experimental diffraction runs cannot be compiled into the runtime table")

    document_cases: list[dict[tuple[float, float], dict[str, Any]]] = []
    document_periods: list[list[float]] = []
    document_directions: list[list[float]] = []
    levels: set[float] = set()
    for document in documents:
        cases: dict[tuple[float, float], dict[str, Any]] = {}
        for case in document["cases"]:
            boundary_validation = case.get("boundaryValidation")
            if not isinstance(boundary_validation, dict) or not any(
                0.5 <= float(value) <= 1.5 for value in boundary_validation.values()
            ):
                raise ValueError(
                    "Runtime transfer case is missing a valid incident-boundary QA coefficient"
                )
            key = (float(case["periodS"]), float(case["directionDeg"]))
            if key in cases:
                raise ValueError(
                    f"Duplicate SWAN transfer case for {document['domain']} period/direction {key}"
                )
            cases[key] = case
            levels.add(float(case["waterLevelLatM"]))
        periods = sorted({key[0] for key in cases})
        directions = sorted({key[1] for key in cases})
        expected = {(period, direction) for period in periods for direction in directions}
        if set(cases) != expected:
            raise ValueError(
                f"Runtime transfer cases for {document['domain']} must form a complete grid"
            )
        document_cases.append(cases)
        document_periods.append(periods)
        document_directions.append(directions)
    if len(levels) != 1:
        raise ValueError("Runtime transfers must share one LAT water level")
    if any(periods != document_periods[0] for periods in document_periods[1:]):
        raise ValueError("Runtime transfer domains must share one period grid")
    if any(directions != document_directions[0] for directions in document_directions[1:]):
        raise ValueError("Runtime transfer domains must share one direction grid")
    periods = document_periods[0]
    directions = document_directions[0]

    first = documents[0]
    receptor_documents: dict[str, tuple[dict[str, Any], dict[tuple[float, float], dict[str, Any]]]] = {}
    for document, cases in zip(documents, document_cases, strict=True):
        for receptor in document["receptors"]:
            slug = receptor["slug"]
            if slug.startswith("qa_"):
                continue
            if slug in receptor_documents:
                raise ValueError(f"Spot {slug} occurs in more than one SWAN domain")
            receptor_documents[slug] = (receptor, cases)
    profiles: dict[str, Any] = {}
    for slug in args.include_spots:
        if slug not in receptor_documents:
            raise ValueError(f"No receptor metadata found for {slug}")
        receptor, cases = receptor_documents[slug]
        coefficients: list[list[float]] = []
        local_directions: list[list[float]] = []
        for period in periods:
            coefficient_row: list[float] = []
            local_direction_row: list[float] = []
            for direction in directions:
                result = cases[(period, direction)]["spots"].get(slug)
                if result is None:
                    raise ValueError(f"No SWAN result for {slug}, {period}s, {direction}°")
                coefficient = float(result["heightCoefficient"])
                if not 0 <= coefficient <= 1.5:
                    raise ValueError(f"Invalid SWAN coefficient {coefficient} for {slug}")
                coefficient_row.append(round(coefficient, 5))
                local_direction_row.append(round(float(result["localDirectionDeg"]), 3))
            coefficients.append(coefficient_row)
            local_directions.append(local_direction_row)
        profiles[slug] = {
            "directionsDeg": directions,
            "periodsS": periods,
            "heightCoefficients": coefficients,
            "localDirectionsDeg": local_directions,
            "receptor": receptor,
        }

    metadata = {
        "schemaVersion": 1,
        "dataset": first["dataset"]["name"],
        "datasetSha256": next(iter(dataset_hashes)),
        "verticalDatum": first["dataset"]["datum"],
        "solver": "SWAN",
        "solverImage": next(iter(solver_images)),
        "method": "native-grid stationary refraction and shoaling",
        "sourceGridStride": 1,
        "waterLevelLatM": next(iter(levels)),
        "incidentHeightM": first["solver"]["incidentHeightM"],
        "directionalSpreadDeg": first["solver"]["directionalSpreadDeg"],
        "limitations": (
            "Refraction/shoaling only; diffraction, reflecting harbour walls, "
            "wave breaking, currents and observation calibration are not included."
        ),
    }
    generated = (
        "// Generated by scripts/generate_bathymetry_model.py from validated SWAN cases.\n"
        "// Do not edit by hand.\n\n"
        f"export const bathymetryTransferMetadata = {json.dumps(metadata, ensure_ascii=False, indent=2)} as const\n\n"
        f"export const bathymetryTransferProfiles = {json.dumps(profiles, ensure_ascii=False, indent=2)} as const\n"
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(generated, encoding="utf-8")
    print(f"Wrote {args.output}")


def path(value: str) -> Path:
    return Path(value).expanduser().resolve()


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--netcdf", required=True, type=path, help="EMODnet DTM 2024 NetCDF subset")
    result.add_argument(
        "--spots",
        type=path,
        default=Path(__file__).resolve().parents[1] / "src" / "data" / "spots.ts",
    )
    commands = result.add_subparsers(dest="command", required=True)
    audit_command = commands.add_parser("audit", help="write a deterministic quality audit")
    audit_command.add_argument(
        "--output",
        type=path,
        default=Path(__file__).resolve().parents[1] / ".generated-bathymetry" / "audit.json",
    )
    audit_command.set_defaults(handler=audit)

    swan_command = commands.add_parser("swan", help="prepare or run stationary SWAN transfer cases")
    swan_command.add_argument("--domain", choices=sorted(DOMAINS), default="coruna")
    swan_command.add_argument("--directions", nargs="+", type=float, default=[270.0, 300.0, 320.0])
    swan_command.add_argument("--periods", nargs="+", type=float, default=[12.0])
    swan_command.add_argument("--water-levels", nargs="+", type=float, default=[2.0])
    swan_command.add_argument("--run", action="store_true")
    swan_command.add_argument("--force", action="store_true", help="recompute cases with existing output")
    swan_command.add_argument(
        "--diffraction",
        action="store_true",
        help="enable SWAN's phase-decoupled diffraction approximation (experimental)",
    )
    swan_command.add_argument(
        "--stride",
        type=int,
        default=1,
        help="use every Nth EMODnet cell (for quick solver diagnostics; production uses 1)",
    )
    swan_command.add_argument("--swan-image", default=SWAN_IMAGE)
    swan_command.add_argument(
        "--workdir",
        type=path,
        default=Path(__file__).resolve().parents[1] / ".generated-bathymetry" / "coruna",
    )
    swan_command.add_argument(
        "--output",
        type=path,
        default=Path(__file__).resolve().parents[1] / ".generated-bathymetry" / "coruna-transfer.json",
    )
    swan_command.set_defaults(handler=swan)

    compile_command = commands.add_parser(
        "compile",
        help="compile validated native-grid SWAN JSON files into the runtime TypeScript table",
    )
    compile_command.add_argument("--transfers", nargs="+", required=True, type=path)
    compile_command.add_argument("--include-spots", nargs="+", required=True)
    compile_command.add_argument(
        "--output",
        type=path,
        default=Path(__file__).resolve().parents[1] / "src" / "data" / "bathymetryTransfer.generated.ts",
    )
    compile_command.set_defaults(handler=compile_runtime)
    return result


def main() -> None:
    args = parser().parse_args()
    if not args.netcdf.is_file():
        raise SystemExit(f"NetCDF file does not exist: {args.netcdf}")
    args.handler(args)


if __name__ == "__main__":
    main()
