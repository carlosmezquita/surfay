"""Scan tracked files and all fetched Git history without printing credential values.

This is a publication guard, not a replacement for provider secret scanning.
Fetch every branch before running it; unreachable objects and hosted attachments
are outside its scope. On a finding, rotate/revoke first, then clean history.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

PATTERNS = {
    "private key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "GitHub token": re.compile(rb"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{40,})\b"),
    "AWS access key": re.compile(rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "provider API key": re.compile(rb"\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{25,}|AIza[A-Za-z0-9_-]{30,})\b"),
}
CREDENTIAL_URL = re.compile(rb"https?://[^/\s:@]+:[^/\s@]+@([^/\s'\"<>]+)")


def git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args], stderr=subprocess.DEVNULL)


def inspect(path: str, data: bytes, location: str) -> list[str]:
    issues = []
    name = Path(path).name
    if (name.startswith(".env") or name.startswith(".dev.vars")) and not name.endswith(".example"):
        issues.append("tracked private environment file")
    if name == "wrangler.production.json":
        issues.append("tracked private deployment configuration")
    for label, pattern in PATTERNS.items():
        if pattern.search(data):
            issues.append(label)
    for match in CREDENTIAL_URL.finditer(data):
        host = match.group(1).decode("utf-8", errors="replace").lower()
        if host not in {"example.com", "example.org", "example.net", "localhost"}:
            issues.append("credentials in URL")
    return [f"{location}: {path}: {issue}" for issue in issues]


def main() -> int:
    root = Path(git("rev-parse", "--show-toplevel").decode().strip())
    findings: set[str] = set()
    for raw in git("ls-files", "-z").split(b"\0"):
        if raw:
            path = raw.decode()
            file = root / path
            if file.is_file():
                findings.update(inspect(path, file.read_bytes(), "working tree"))
    versions = 0
    for line in git("rev-list", "--objects", "--all").decode().splitlines():
        parts = line.split(" ", 1)
        if len(parts) != 2:
            continue
        sha, path = parts
        if git("cat-file", "-t", sha).strip() != b"blob":
            continue
        versions += 1
        findings.update(inspect(path, git("cat-file", "blob", sha), sha[:12]))
    if findings:
        print("Publication scan found potential exposure (values redacted):", file=sys.stderr)
        for finding in sorted(findings):
            print(finding, file=sys.stderr)
        return 1
    print(f"No configured secret patterns detected in tracked files and {versions} historical blobs.")
    print("Review third-party assets, permissions and unfetched refs separately.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
