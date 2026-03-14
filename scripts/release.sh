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

  gh release create "${VERSIONED_TAG}" \
    --title "${TITLE}" \
    --notes "Codictate ${FULL_VERSION}" \
    --repo "${REPO}"

  for FILE in "${ARTIFACT_DIR}/${CH}-"*; do
    [ -f "$FILE" ] || continue
    echo "  → $(basename "$FILE")"
    gh release upload "${VERSIONED_TAG}" "$FILE" --repo "${REPO}"
  done

  # Update the fixed pointer release (what Electrobun's updater fetches)
  local PREFIXED_JSON
  PREFIXED_JSON=$(ls "${ARTIFACT_DIR}/${CH}-"*-update.json 2>/dev/null | head -1)
  if [ -n "$PREFIXED_JSON" ]; then
    if ! gh release view "${CH}" --repo "${REPO}" > /dev/null 2>&1; then
      echo "Creating pointer release: ${CH}"
      gh release create "${CH}" \
        --title "${CH^} — Latest" \
        --notes "Pointer release for Electrobun's auto-updater." \
        --repo "${REPO}"
    fi
    cp "$PREFIXED_JSON" /tmp/update.json
    gh release upload "${CH}" /tmp/update.json --clobber --repo "${REPO}"
    rm -f /tmp/update.json
    echo "  → Updated '${CH}' pointer with update.json"
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
  echo "Releasing v${SHARED_VERSION} to both stable and canary..."
  release_channel "stable" "$SHARED_VERSION"
  release_channel "canary" "$SHARED_VERSION"
  NEXT_BASE=$(bump_patch "$SHARED_VERSION")
  save_version "$NEXT_BASE" "0"
  echo ""
  echo "Both channels released as v${SHARED_VERSION} ✓"
  echo "Next canaries will target v${NEXT_BASE}"
else
  release_channel "$CHANNEL"
fi

echo ""
echo "Commit the version files:"
echo "  git add electrobun.config.ts version.json && git commit -m \"release: $(read_version_field baseVersion | xargs -I{} echo v{} | sed 's/v//')\""
