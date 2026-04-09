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
#   bun run release                 → both channels (stable + canary), default notes
#   bun run release:canary          → canary only, default notes
#   bun run release:stable          → stable only, default notes
#   (Default GitHub body is still "Codictate <fullVersion>" when you omit -m / env.)
#
# Release notes (GitHub body; optional — same default as before when omitted):
#   bun run release -- -m "Fixed tray flicker on wake"
#   bun run release:stable -- --message $'## 0.0.8\n- …'
#   ./scripts/release.sh canary -m "Experimental menu"
#   -m / --message wins over CODICTATE_RELEASE_NOTES when both are set.
#
# Requires: gh CLI installed and authenticated (gh auth login)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="${PROJECT_DIR}/electrobun.config.ts"
VERSION_FILE="${PROJECT_DIR}/version.json"
ARTIFACT_DIR="${PROJECT_DIR}/artifacts"

resolve_repo() {
  local remote_url repo_path
  remote_url="$(git -C "${PROJECT_DIR}" remote get-url origin 2>/dev/null || true)"
  repo_path="${remote_url#git@github.com:}"
  repo_path="${repo_path#https://github.com/}"
  repo_path="${repo_path#http://github.com/}"
  repo_path="${repo_path%.git}"
  echo "${repo_path}"
}

REPO="${CODICTATE_RELEASE_REPO:-$(resolve_repo)}"

# ── Args: channel + optional -m / --message ─────────────────────────────────

CHANNEL=""
RELEASE_NOTES_FLAG=""

usage_err() {
  echo "Error: $1"
  echo "Usage: $0 [stable|canary|both] [-m|--message <text>]"
  echo "       $0 -m <text>   # channel defaults to both"
  exit 1
}

while [ $# -gt 0 ]; do
  case "$1" in
    -m|--message)
      [ -z "${2:-}" ] && usage_err "$1 requires a value"
      RELEASE_NOTES_FLAG="$2"
      shift 2
      ;;
    --message=*)
      RELEASE_NOTES_FLAG="${1#*=}"
      shift
      ;;
    stable|canary|both)
      [ -n "$CHANNEL" ] && usage_err "channel specified more than once"
      CHANNEL="$1"
      shift
      ;;
    -h|--help)
      cat <<'EOF'
Codictate release — GitHub releases repo

  scripts/release.sh [stable|canary|both] [-m|--message <text>]

Examples:
  bun run release -- -m "Fixed tray on wake"
  bun run release:stable -- --message $'## 0.0.8\n- item'
  CODICTATE_RELEASE_NOTES="…" bun run release:canary   # if -m not passed

-m / --message overrides CODICTATE_RELEASE_NOTES when both are set.
EOF
      exit 0
      ;;
    *)
      usage_err "unknown argument: $1"
      ;;
  esac
done

[ -z "$CHANNEL" ] && CHANNEL="both"

# ── Validate ─────────────────────────────────────────────────────────────────

if ! command -v gh &> /dev/null; then
  echo "Error: gh CLI not found. Install it with: brew install gh"
  exit 1
fi

if [ -z "${REPO}" ]; then
  echo "Error: could not determine GitHub repo from git remote 'origin'"
  echo "Set CODICTATE_RELEASE_REPO=owner/repo if you need to override it."
  exit 1
fi

if [ ! -f "$VERSION_FILE" ]; then
  echo "Error: version.json not found at ${VERSION_FILE}"
  exit 1
fi

if [ -n "$RELEASE_NOTES_FLAG" ]; then
  RELEASE_NOTES_BODY="$RELEASE_NOTES_FLAG"
elif [ -n "${CODICTATE_RELEASE_NOTES:-}" ]; then
  RELEASE_NOTES_BODY="$CODICTATE_RELEASE_NOTES"
else
  RELEASE_NOTES_BODY=""
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

ensure_tag_pushed() {
  local tag="$1"

  if git -C "${PROJECT_DIR}" rev-parse -q --verify "refs/tags/${tag}" > /dev/null; then
    echo "Tag exists locally: ${tag}"
  else
    git -C "${PROJECT_DIR}" tag -a "${tag}" -m "release: ${tag}"
    echo "Created local tag: ${tag}"
  fi

  if git -C "${PROJECT_DIR}" ls-remote --exit-code --tags origin "refs/tags/${tag}" > /dev/null 2>&1; then
    echo "Tag exists on origin: ${tag}"
  else
    git -C "${PROJECT_DIR}" push origin "refs/tags/${tag}"
    echo "Pushed tag to origin: ${tag}"
  fi
}

# ── Per-channel build + release ───────────────────────────────────────────────

release_channel() {
  local CH="$1"
  local OVERRIDE_VERSION="$2"   # optional — forces a specific version (used by release:both)
  # optional — when releasing canary after stable in the same run, mirror assets here (avoids gh "latest" / timing issues)
  local EXPLICIT_STABLE_RELEASE_TAG="${3:-}"
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
  ensure_tag_pushed "${VERSIONED_TAG}"
  local TITLE
  if [ "$CH" = "canary" ]; then
    TITLE="v${BASE_VERSION} Canary ${CANARY_BUILD}"
  else
    TITLE="v${BASE_VERSION}"
  fi

  local NOTES NOTES_FILE
  if [ -n "${RELEASE_NOTES_BODY}" ]; then
    NOTES="$RELEASE_NOTES_BODY"
    echo "  Using custom release notes (${#NOTES} chars)"
  else
    NOTES="Codictate ${FULL_VERSION}"
  fi
  NOTES_FILE=$(mktemp)
  printf '%s' "$NOTES" > "${NOTES_FILE}"

  # Collect assets once. Passing them to `gh release create` uses GitHub's draft →
  # upload → publish flow and avoids "release not found" races from a separate
  # immediate `gh release upload` right after create.
  local FILES_TO_UPLOAD=()
  local FILE
  for FILE in "${ARTIFACT_DIR}/${CH}-"*; do
    [ -f "$FILE" ] || continue
    FILES_TO_UPLOAD+=("$FILE")
  done

  # Stable = regular release (GitHub marks it as "Latest" automatically).
  # Canary = pre-release (never gets the "Latest" badge).
  if [ "$CH" = "canary" ]; then
    if [ ${#FILES_TO_UPLOAD[@]} -gt 0 ]; then
      gh release create "${VERSIONED_TAG}" \
        --title "${TITLE}" \
        --notes-file "${NOTES_FILE}" \
        --prerelease \
        --verify-tag \
        --repo "${REPO}" \
        "${FILES_TO_UPLOAD[@]}"
    else
      gh release create "${VERSIONED_TAG}" \
        --title "${TITLE}" \
        --notes-file "${NOTES_FILE}" \
        --prerelease \
        --verify-tag \
        --repo "${REPO}"
    fi
  else
    if [ ${#FILES_TO_UPLOAD[@]} -gt 0 ]; then
      gh release create "${VERSIONED_TAG}" \
        --title "${TITLE}" \
        --notes-file "${NOTES_FILE}" \
        --verify-tag \
        --repo "${REPO}" \
        "${FILES_TO_UPLOAD[@]}"
    else
      gh release create "${VERSIONED_TAG}" \
        --title "${TITLE}" \
        --notes-file "${NOTES_FILE}" \
        --verify-tag \
        --repo "${REPO}"
    fi
  fi
  rm -f "${NOTES_FILE}"

  for FILE in "${FILES_TO_UPLOAD[@]}"; do
    echo "  → $(basename "$FILE") [versioned]"
  done

  # Also upload to the latest STABLE release so the in-app updater can always
  # find both canary-* and stable-* artifacts at releases/latest/download/.
  # For stable: this IS the versioned release we just created (already "latest").
  # For canary: use the tag we just shipped stable with (both-channel), else resolve latest non-prerelease.
  if [ "$CH" = "canary" ] && [ ${#FILES_TO_UPLOAD[@]} -gt 0 ]; then
    local LATEST_STABLE_TAG
    if [ -n "$EXPLICIT_STABLE_RELEASE_TAG" ]; then
      LATEST_STABLE_TAG="$EXPLICIT_STABLE_RELEASE_TAG"
    else
      LATEST_STABLE_TAG=$(gh release view --repo "${REPO}" --json tagName -q '.tagName' 2>/dev/null || true)
    fi
    if [ -n "$LATEST_STABLE_TAG" ]; then
      for FILE in "${FILES_TO_UPLOAD[@]}"; do
        echo "  → $(basename "$FILE") [→ ${LATEST_STABLE_TAG} for updater]"
        local attempt=1
        local max_attempts=5
        while [ "$attempt" -le "$max_attempts" ]; do
          if gh release upload "${LATEST_STABLE_TAG}" "$FILE" --clobber --repo "${REPO}"; then
            break
          fi
          if [ "$attempt" -eq "$max_attempts" ]; then
            echo "Error: could not upload $(basename "$FILE") to ${LATEST_STABLE_TAG} after ${max_attempts} attempts"
            exit 1
          fi
          sleep 2
          attempt=$((attempt + 1))
        done
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
  release_channel "canary" "$SHARED_VERSION" "v${SHARED_VERSION}"
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
echo "  git add electrobun.config.ts version.json && git commit -m \"release: v${RELEASED_VERSION}\" && git push"
