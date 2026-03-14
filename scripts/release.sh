#!/bin/bash
# Codictate release script
#
# Versioning model:
#   release:stable  → releases the current baseVersion (e.g. "0.0.2"),
#                     then bumps baseVersion for the next cycle and resets canaryBuild.
#   release:canary  → increments canaryBuild and releases "0.0.2-canary.3".
#   release         → stable first (bumps version), then canary starts the new cycle.
#
# Usage (from project root via package.json scripts):
#   bun run release           → build & release both channels
#   bun run release:canary    → build & release canary only
#   bun run release:stable    → build & release stable only
#
# Requires: gh CLI installed and authenticated (gh auth login)

set -e

CHANNEL="${1:-both}"
REPO="EmilLykke/codictate-releases"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="${PROJECT_DIR}/electrobun.config.ts"
VERSION_FILE="${PROJECT_DIR}/version.json"
ARTIFACT_DIR="${PROJECT_DIR}/artifacts"

# ── Validate ─────────────────────────────────────────────────────────────────

if [ "$CHANNEL" != "both" ] && [ "$CHANNEL" != "canary" ] && [ "$CHANNEL" != "stable" ]; then
  echo "Error: channel must be 'canary', 'stable', or omitted (both)."
  exit 1
fi

if ! command -v gh &> /dev/null; then
  echo "Error: gh CLI not found. Install it with: brew install gh"
  exit 1
fi

if [ ! -f "$VERSION_FILE" ]; then
  echo "Error: version.json not found at ${VERSION_FILE}"
  exit 1
fi

# ── Version helpers ───────────────────────────────────────────────────────────

read_version_field() {
  python3 -c "import json; print(json.load(open('${VERSION_FILE}'))['$1'])"
}

save_version() {
  local base="$1"
  local canary="$2"
  python3 -c "
import json
with open('${VERSION_FILE}', 'w') as f:
    json.dump({'baseVersion': '${base}', 'canaryBuild': ${canary}}, f, indent=2)
    f.write('\n')
"
}

patch_config_version() {
  python3 -c "
import re
content = open('${CONFIG_FILE}').read()
content = re.sub(r'(version: \")[^\"]*\"', r'\g<1>$1\"', content, count=1)
open('${CONFIG_FILE}', 'w').write(content)
"
}

bump_patch() {
  local ver="$1"
  local major minor patch
  IFS='.' read -r major minor patch <<< "$ver"
  echo "${major}.${minor}.$((patch + 1))"
}

# ── Per-channel build + release ───────────────────────────────────────────────

release_channel() {
  local CH="$1"
  local OVERRIDE_VERSION="$2"   # optional — forces a specific version (used by release:both)
  local BASE_VERSION CANARY_BUILD FULL_VERSION VERSIONED_TAG

  BASE_VERSION=$(read_version_field baseVersion)
  CANARY_BUILD=$(read_version_field canaryBuild)

  if [ -n "$OVERRIDE_VERSION" ]; then
    # Both-channel release: use the same version for canary and stable
    FULL_VERSION="$OVERRIDE_VERSION"
    VERSIONED_TAG="v${FULL_VERSION}-${CH}"
    # For stable in a both-release, use a clean tag (no channel suffix)
    [ "$CH" = "stable" ] && VERSIONED_TAG="v${FULL_VERSION}"
  elif [ "$CH" = "stable" ]; then
    FULL_VERSION="$BASE_VERSION"
    VERSIONED_TAG="v${BASE_VERSION}"
  else
    CANARY_BUILD=$((CANARY_BUILD + 1))
    FULL_VERSION="${BASE_VERSION}-canary.${CANARY_BUILD}"
    VERSIONED_TAG="v${FULL_VERSION}"
    save_version "$BASE_VERSION" "$CANARY_BUILD"
  fi

  echo ""
  echo "── ${CH} → ${FULL_VERSION} ────────────────────────────────────────────"

  # Patch electrobun.config.ts with the full version for the build
  patch_config_version "$FULL_VERSION"

  cd "$PROJECT_DIR"
  bun run "build:${CH}"

  echo ""
  echo "Creating release: ${VERSIONED_TAG}"
  local TITLE
  if [ "$CH" = "canary" ]; then
    TITLE="v${BASE_VERSION} Canary ${CANARY_BUILD}"
  else
    TITLE="v${BASE_VERSION}"
  fi

  # Stable = regular release (GitHub marks it as "Latest" automatically).
  # Canary = pre-release (never gets the "Latest" badge).
  if [ "$CH" = "canary" ]; then
    gh release create "${VERSIONED_TAG}" \
      --title "${TITLE}" \
      --notes "Codictate ${FULL_VERSION}" \
      --prerelease \
      --repo "${REPO}"
  else
    gh release create "${VERSIONED_TAG}" \
      --title "${TITLE}" \
      --notes "Codictate ${FULL_VERSION}" \
      --repo "${REPO}"
  fi

  # Upload artifacts to the versioned release (permanent history / user downloads)
  for FILE in "${ARTIFACT_DIR}/${CH}-"*; do
    [ -f "$FILE" ] || continue
    echo "  → $(basename "$FILE") [versioned]"
    gh release upload "${VERSIONED_TAG}" "$FILE" --repo "${REPO}"
  done

  # Also upload to the latest STABLE release so the in-app updater can always
  # find both canary-* and stable-* artifacts at releases/latest/download/.
  # For stable: this IS the versioned release we just created (already "latest").
  # For canary: we find the current latest non-prerelease and add the canary files there.
  if [ "$CH" = "canary" ]; then
    local LATEST_STABLE_TAG
    LATEST_STABLE_TAG=$(gh release view --repo "${REPO}" --json tagName -q '.tagName' 2>/dev/null || true)
    if [ -n "$LATEST_STABLE_TAG" ]; then
      for FILE in "${ARTIFACT_DIR}/${CH}-"*; do
        [ -f "$FILE" ] || continue
        echo "  → $(basename "$FILE") [→ ${LATEST_STABLE_TAG} for updater]"
        gh release upload "${LATEST_STABLE_TAG}" "$FILE" --clobber --repo "${REPO}"
      done
    else
      echo "  ⚠ No stable release found yet — canary updater files not uploaded. Run release:stable first."
    fi
  fi

  # After a solo stable release: bump baseVersion and reset canaryBuild
  if [ "$CH" = "stable" ] && [ -z "$OVERRIDE_VERSION" ]; then
    local NEXT_BASE
    NEXT_BASE=$(bump_patch "$BASE_VERSION")
    save_version "$NEXT_BASE" "0"
    echo ""
    echo "stable released as ${VERSIONED_TAG} ✓"
    echo "Next canaries will target v${NEXT_BASE}"
  else
    echo ""
    echo "${CH} released as ${VERSIONED_TAG} ✓"
  fi
}

if [ "$CHANNEL" = "both" ]; then
  # Both channels get the exact same version — this is a simultaneous milestone release.
  # After both are done, bump baseVersion for the next canary cycle.
  SHARED_VERSION=$(read_version_field baseVersion)
  RELEASED_VERSION="$SHARED_VERSION"
  echo "Releasing v${SHARED_VERSION} to both stable and canary..."
  release_channel "stable" "$SHARED_VERSION"
  release_channel "canary" "$SHARED_VERSION"
  NEXT_BASE=$(bump_patch "$SHARED_VERSION")
  save_version "$NEXT_BASE" "0"
  echo ""
  echo "Both channels released as v${SHARED_VERSION} ✓"
  echo "Next canaries will target v${NEXT_BASE}"
else
  # Capture the version that will actually be released before any bumping happens
  BASE_VERSION=$(read_version_field baseVersion)
  CANARY_BUILD=$(read_version_field canaryBuild)
  if [ "$CHANNEL" = "canary" ]; then
    RELEASED_VERSION="${BASE_VERSION}-canary.$((CANARY_BUILD + 1))"
  else
    RELEASED_VERSION="$BASE_VERSION"
  fi
  release_channel "$CHANNEL"
fi

echo ""
echo "Commit the version files:"
echo "  git add electrobun.config.ts version.json && git commit -m \"release: v${RELEASED_VERSION}\""
