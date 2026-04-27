#!/usr/bin/env python3
"""
Fetches Codictate GitHub release download stats and estimates unique installs.

Usage:
    python3 scripts/download-stats.py
    python3 scripts/download-stats.py --json
"""

import json
import sys
import urllib.request
from collections import defaultdict

REPO = "EmilLykke/codictate"
API_URL = f"https://api.github.com/repos/{REPO}/releases?per_page=100"

FRESH_INSTALL_SUFFIXES = (".dmg", "-Setup.zip")
UPDATE_SUFFIXES = (".tar.zst", ".patch")
UPDATE_CHECK_SUFFIX = "update.json"


def fetch_releases():
    req = urllib.request.Request(API_URL, headers={"User-Agent": "codictate-stats"})
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def categorize_asset(name):
    if name.endswith(UPDATE_CHECK_SUFFIX):
        return "update_check"
    if any(name.endswith(s) for s in FRESH_INSTALL_SUFFIXES):
        return "fresh_install"
    if any(name.endswith(s) for s in UPDATE_SUFFIXES):
        return "update_package"
    return "other"


def platform_of(name):
    if "macos" in name or "darwin" in name:
        return "macOS"
    if "win" in name or "windows" in name:
        return "Windows"
    if "linux" in name:
        return "Linux"
    return "unknown"


def is_canary(tag):
    return "canary" in tag.lower()


def analyze(releases):
    totals = defaultdict(lambda: defaultdict(int))  # channel -> category -> count
    per_release = []
    peak_update_checks = {"stable": 0, "canary": 0}

    for release in releases:
        tag = release["tag_name"]
        channel = "canary" if is_canary(tag) else "stable"
        release_update_checks = 0
        release_fresh = 0

        for asset in release["assets"]:
            name = asset["name"]
            count = asset["download_count"]
            category = categorize_asset(name)
            platform = platform_of(name)

            totals[channel][category] += count
            if category == "fresh_install":
                totals[channel][f"fresh_{platform}"] += count
                release_fresh += count
            if category == "update_check":
                release_update_checks += count

        peak_update_checks[channel] = max(
            peak_update_checks[channel], release_update_checks
        )
        per_release.append(
            {
                "tag": tag,
                "channel": channel,
                "fresh_installs": release_fresh,
                "update_checks": release_update_checks,
            }
        )

    return totals, per_release, peak_update_checks


def print_report(totals, per_release, peak_update_checks):
    stable = totals["stable"]
    canary = totals["canary"]

    fresh_stable = stable["fresh_install"]
    fresh_canary = canary["fresh_install"]
    fresh_total = fresh_stable + fresh_canary

    # Peak update.json hits = proxy for concurrent active user base at that point in time
    peak_active = peak_update_checks["stable"]

    # Unique installs estimate: fresh installs are the best signal.
    # Some users reinstall across versions (slight overcount), but it's the closest proxy.
    unique_estimate = fresh_total

    print("=" * 52)
    print("  Codictate Download Stats")
    print("=" * 52)

    print("\nFresh installs (DMG / Setup.zip):")
    print(f"  macOS stable   {stable['fresh_macOS']:>6}")
    print(f"  Windows stable {stable['fresh_Windows']:>6}")
    print(f"  macOS canary   {canary['fresh_macOS']:>6}")
    print(f"  Windows canary {canary['fresh_Windows']:>6}")
    print(f"  {'Total':<15} {fresh_total:>6}")

    print("\nUpdate packages (.tar.zst / .patch):")
    print(f"  Stable  {stable['update_package']:>6}")
    print(f"  Canary  {canary['update_package']:>6}")

    print("\nAuto-update checks (update.json):")
    print(f"  Stable  {stable['update_check']:>6}")
    print(f"  Canary  {canary['update_check']:>6}")

    print("\nEstimates:")
    print(f"  Unique installs (fresh DL sum)  ~{unique_estimate}")
    print(f"  Peak concurrent active users    ~{peak_active}  (highest update checks in one release)")

    print("\nTop 5 releases by fresh installs (not exhaustive):")
    top = sorted(
        [r for r in per_release if r["channel"] == "stable"],
        key=lambda r: r["fresh_installs"],
        reverse=True,
    )[:5]
    for r in top:
        print(f"  {r['tag']:<28} {r['fresh_installs']:>3} installs  {r['update_checks']:>4} update checks")

    print("=" * 52)


def main():
    as_json = "--json" in sys.argv

    releases = fetch_releases()
    totals, per_release, peak_update_checks = analyze(releases)

    if as_json:
        print(
            json.dumps(
                {
                    "totals": {k: dict(v) for k, v in totals.items()},
                    "per_release": per_release,
                    "peak_update_checks": peak_update_checks,
                    "unique_installs_estimate": totals["stable"]["fresh_install"]
                    + totals["canary"]["fresh_install"],
                    "peak_active_users_estimate": peak_update_checks["stable"],
                },
                indent=2,
            )
        )
    else:
        print_report(totals, per_release, peak_update_checks)


if __name__ == "__main__":
    main()
