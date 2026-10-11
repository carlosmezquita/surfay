"""Export the staged, sanitized tree into a fresh single-commit repository.

No remote calls, publication or source-history changes. Stage reviewed changes
first. The destination must be new and outside this repository.
"""
from __future__ import annotations

import argparse
import os
import runpy
import subprocess
import sys
from pathlib import Path

inspect = runpy.run_path(str(Path(__file__).with_name("scan-secrets.py")))["inspect"]


def git(root: Path, *args: str) -> bytes:
    return subprocess.check_output(["git", "-C", str(root), *args])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"]).decode().strip())
    destination = args.destination.resolve()
    if destination.exists() or destination.is_relative_to(root):
        parser.error("Destination must not exist and must be outside the source repository.")
    if git(root, "diff", "--name-only"):
        parser.error("Stage reviewed changes first; unstaged tracked changes would be omitted.")

    entries: list[tuple[str, bytes, str]] = []
    findings: list[str] = []
    removed = {"src/assets/hero.png", "src/assets/react.svg", "src/assets/vite.svg",
               "docs/images/forecast-desktop.png", "docs/images/forecast-mobile.png"}
    for record in git(root, "ls-files", "--stage", "-z").split(b"\0"):
        if not record:
            continue
        metadata, raw_path = record.split(b"\t", 1)
        mode, sha, stage = metadata.decode().split()
        path = raw_path.decode()
        if stage != "0" or mode not in {"100644", "100755"}:
            parser.error(f"Unsupported or unresolved index entry: {path}")
        parts = Path(path).parts
        if path in removed or any(p in {".git", "node_modules", "dist", ".wrangler", "test-results", "playwright-report"} or p.startswith(".generated-") for p in parts):
            parser.error(f"Unexpected release entry: {path}")
        data = git(root, "cat-file", "blob", sha)
        findings.extend(inspect(path, data, "snapshot"))
        entries.append((path, data, mode))
    if findings:
        parser.error("\n".join(findings))
    if not {"LICENSE", "THIRD_PARTY_NOTICES.md", "docs/images/forecast.png"}.issubset({p for p, _, _ in entries}):
        parser.error("Required licence/attribution/screenshot files are missing.")

    destination.mkdir(parents=True)
    for path, data, mode in entries:
        output = destination / path
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(data)
        if mode == "100755":
            output.chmod(0o755)
    # Initialize from files, never copy .git, refs, tags, objects or remotes.
    git(destination, "init", "--initial-branch=main")
    git(destination, "add", "--all")
    subprocess.run([
        "git", "-C", str(destination), "-c", "user.name=Carlos Mezquita",
        "-c", "user.email=79549732+carlosmezquita@users.noreply.github.com",
        "-c", "commit.gpgsign=false", "commit", "-m", "Initial sanitized Surfay release",
    ], check=True, env={**os.environ, "GIT_CONFIG_NOSYSTEM": "1"})
    assert git(destination, "rev-list", "--all", "--count").strip() == b"1"
    subprocess.run([sys.executable, "scripts/scan-secrets.py"], cwd=destination, check=True)
    print(f"Exported {len(entries)} files and one root commit to {destination}. Nothing published.")


if __name__ == "__main__":
    main()
