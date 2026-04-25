#!/bin/bash
# Codictate release script
#
# Handles versioning, committing, and pushing the git tag.
# Building and publishing to GitHub Releases is handled entirely by the
# CI workflow (.github/workflows/release.yml) which triggers automatically
# when this script pushes the tag.
#
# Usage:
#   bun run release:canary    → increment canaryBuild, tag, push
#   bun run release:stable    → tag current baseVersion, push, bump for next cycle
#   bun run release           → both channels

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="${PROJECT_DIR}/electrobun.config.ts"
VERSION_FILE="${PROJECT_DIR}/version.json"

# ── Validate ──────────────────────────────────────────────────────────────────

if [ ! -f "$VERSION_FILE" ]; then
  echo "Error: version.json not found at ${VERSION_FILE}"
  exit 1
fi

# ── Args ──────────────────────────────────────────────────────────────────────

CHANNEL=""

while [ $# -gt 0 ]; do
  case "$1" in
    stable|canary|both)
      [ -n "$CHANNEL" ] && { echo "Error: channel specified more than once"; exit 1; }
      CHANNEL="$1"
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [stable|canary|both]"
      exit 0
      ;;
    *)
      echo "Error: unknown argument: $1"
      exit 1
      ;;
  esac
done

[ -z "$CHANNEL" ] && CHANNEL="both"

# ── Helpers ───────────────────────────────────────────────────────────────────

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
  local major minor patch
  IFS='.' read -r major minor patch <<< "$1"
  echo "${major}.${minor}.$((patch + 1))"
}

push_tag() {
  local tag="$1"
  if git -C "${PROJECT_DIR}" ls-remote --exit-code --tags origin "refs/tags/${tag}" > /dev/null 2>&1; then
    echo "Tag already on origin: ${tag}"
  else
    git -C "${PROJECT_DIR}" push origin "refs/tags/${tag}"
    echo "Pushed tag: ${tag}"
  fi
}

# ── Per-channel tag ───────────────────────────────────────────────────────────

tag_channel() {
  local CH="$1"
  local OVERRIDE_VERSION="${2:-}"
  local BASE_VERSION CANARY_BUILD FULL_VERSION TAG

  cd "$PROJECT_DIR"
  BASE_VERSION=$(read_version_field baseVersion)
  CANARY_BUILD=$(read_version_field canaryBuild)

  if [ -n "$OVERRIDE_VERSION" ]; then
    FULL_VERSION="$OVERRIDE_VERSION"
    if [ "$CH" = "canary" ]; then
      TAG="v${FULL_VERSION}-canary.1"
      save_version "$FULL_VERSION" "1"
    else
      TAG="v${FULL_VERSION}"
    fi
  elif [ "$CH" = "stable" ]; then
    FULL_VERSION="$BASE_VERSION"
    TAG="v${BASE_VERSION}"
  else
    CANARY_BUILD=$((CANARY_BUILD + 1))
    FULL_VERSION="${BASE_VERSION}-canary.${CANARY_BUILD}"
    TAG="v${FULL_VERSION}"
    save_version "$BASE_VERSION" "$CANARY_BUILD"
  fi

  echo ""
  echo "── ${CH} → ${FULL_VERSION} ──────────────────────────────"

  patch_config_version "$FULL_VERSION"

  git add electrobun.config.ts version.json
  git commit -m "release: ${TAG}"
  git tag -a "${TAG}" -m "release: ${TAG}"
  git push origin HEAD
  push_tag "${TAG}"

  echo "${TAG} pushed — GitHub Actions will build and publish automatically."
}

# ── Main ──────────────────────────────────────────────────────────────────────

cd "$PROJECT_DIR"

if [ "$CHANNEL" = "both" ]; then
  SHARED_VERSION=$(read_version_field baseVersion)
  echo "Tagging v${SHARED_VERSION} for both stable and canary..."
  tag_channel "stable" "$SHARED_VERSION"
  tag_channel "canary" "$SHARED_VERSION"
  NEXT_BASE=$(bump_patch "$SHARED_VERSION")
  save_version "$NEXT_BASE" "0"
  git add version.json
  git commit -m "chore: bump version to v${NEXT_BASE}"
  git push origin HEAD
  echo ""
  echo "Both channels tagged ✓ — next canaries will target v${NEXT_BASE}"

elif [ "$CHANNEL" = "stable" ]; then
  BASE_VERSION=$(read_version_field baseVersion)
  tag_channel "stable"
  NEXT_BASE=$(bump_patch "$BASE_VERSION")
  save_version "$NEXT_BASE" "0"
  git add version.json
  git commit -m "chore: bump version to v${NEXT_BASE}"
  git push origin HEAD
  echo "Next canaries will target v${NEXT_BASE}"

else
  tag_channel "canary"
fi
