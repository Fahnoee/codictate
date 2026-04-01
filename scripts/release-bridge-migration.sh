#!/usr/bin/env bash
# One-off: publish a build to the *old* releases repo (codictate-releases) so existing
# installs (embedded baseUrl → that repo) receive an update whose binary already contains
# release.baseUrl → github.com/…/codictate/releases (see electrobun.config.ts).
#
# This script does NOT use release.sh’s --verify-tag path: tags must exist on the *target*
# repo; your origin is usually the main codictate repo. GitHub will create the tag on the
# releases repo from its default branch when we omit --verify-tag.
#
# Usage (from repo root):
#   ./scripts/release-bridge-migration.sh -y
#   BRIDGE_VERSION=0.0.10 BRIDGE_CHANNELS=both ./scripts/release-bridge-migration.sh -y
#
# Env:
#   BRIDGE_VERSION       default 0.0.10
#   CODICTATE_RELEASE_REPO  default EmilLykke/codictate-releases
#   BRIDGE_CHANNELS      stable (default) | both   — both = stable + canary same version
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="${PROJECT_DIR}/electrobun.config.ts"
VERSION_FILE="${PROJECT_DIR}/version.json"
ARTIFACT_DIR="${PROJECT_DIR}/artifacts"

BRIDGE_VERSION="${BRIDGE_VERSION:-0.0.10}"
TARGET_REPO="${CODICTATE_RELEASE_REPO:-EmilLykke/codictate-releases}"
BRIDGE_CHANNELS="${BRIDGE_CHANNELS:-stable}"

AUTO_YES=0
for a in "$@"; do
  if [ "$a" = "-y" ] || [ "$a" = "--yes" ]; then
    AUTO_YES=1
  fi
done

die() {
  echo "Error: $*" >&2
  exit 1
}

if ! command -v gh &>/dev/null; then
  die "gh CLI not found (brew install gh)"
fi

if ! command -v bun &>/dev/null; then
  die "bun not found"
fi

# Embedded updater must already target the *main* repo, not codictate-releases.
if ! grep -q 'github.com/EmilLykke/codictate/releases' "$CONFIG_FILE"; then
  die "electrobun.config.ts release.baseUrl must contain github.com/EmilLykke/codictate/releases"
fi
if grep -q 'codictate-releases' "$CONFIG_FILE"; then
  die "Refusing: electrobun.config.ts still mentions codictate-releases in baseUrl"
fi

TAG="v${BRIDGE_VERSION}"
TAG_CANARY="v${BRIDGE_VERSION}-canary"

if gh release view "$TAG" --repo "$TARGET_REPO" &>/dev/null; then
  die "Release ${TAG} already exists on ${TARGET_REPO}"
fi
if [ "$BRIDGE_CHANNELS" = "both" ] && gh release view "$TAG_CANARY" --repo "$TARGET_REPO" &>/dev/null; then
  die "Release ${TAG_CANARY} already exists on ${TARGET_REPO}"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Bridge migration release"
echo "  Version:       ${BRIDGE_VERSION}"
echo "  Target repo:   ${TARGET_REPO}"
echo "  Channels:      ${BRIDGE_CHANNELS}"
echo "  App baseUrl:   (must be main codictate repo — verified above)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$AUTO_YES" != "1" ]; then
  read -r -p "Continue? [y/N] " reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *) echo "Aborted."; exit 1 ;;
  esac
fi

save_version_json() {
  python3 -c "
import json
with open('${VERSION_FILE}', 'w') as f:
    json.dump({'baseVersion': '$1', 'canaryBuild': $2}, f, indent=2)
    f.write('\n')
"
}

patch_app_version() {
  local ver="$1"
  python3 -c "
import re
path = r'''${CONFIG_FILE}'''
ver = r'''${ver}'''
content = open(path).read()
content = re.sub(r'(version: \")[^\"]*\"', r'\\g<1>' + ver + '\"', content, count=1)
open(path, 'w').write(content)
"
}

cd "$PROJECT_DIR"

echo ""
echo "→ Pinning version.json + electrobun.config.ts to ${BRIDGE_VERSION}"
save_version_json "$BRIDGE_VERSION" 0
patch_app_version "$BRIDGE_VERSION"

NOTES_FILE=$(mktemp)
trap 'rm -f "${NOTES_FILE}"' EXIT
cat > "${NOTES_FILE}" <<EOF
**Update migration**

This build switches in-app updates to the main Codictate repository. After installing **${BRIDGE_VERSION}**, future updates are loaded from \`github.com/EmilLykke/codictate/releases\`.

No feature changes intended — migration only.
EOF

release_notes_upload() {
  local tag="$1"
  local title="$2"
  local prerelease="${3:-0}"
  echo ""
  echo "→ Creating GitHub release ${tag} on ${TARGET_REPO} (no --verify-tag)"
  if [ "$prerelease" = "1" ]; then
    gh release create "$tag" \
      --repo "$TARGET_REPO" \
      --title "$title" \
      --notes-file "${NOTES_FILE}" \
      --prerelease
  else
    gh release create "$tag" \
      --repo "$TARGET_REPO" \
      --title "$title" \
      --notes-file "${NOTES_FILE}"
  fi
}

upload_channel_artifacts() {
  local tag="$1"
  local ch="$2"
  local f
  shopt -s nullglob
  for f in "${ARTIFACT_DIR}/${ch}-"*; do
    [ -f "$f" ] || continue
    echo "  → $(basename "$f")"
    gh release upload "$tag" "$f" --repo "$TARGET_REPO"
  done
  shopt -u nullglob
}

echo ""
echo "→ Building stable…"
bun run build:stable

release_notes_upload "$TAG" "v${BRIDGE_VERSION}"
upload_channel_artifacts "$TAG" "stable"

if [ "$BRIDGE_CHANNELS" = "both" ]; then
  echo ""
  echo "→ Building canary…"
  bun run build:canary
  release_notes_upload "$TAG_CANARY" "v${BRIDGE_VERSION} Canary (bridge)" "1"
  upload_channel_artifacts "$TAG_CANARY" "canary"

  LATEST_STABLE_TAG=$(gh release view --repo "$TARGET_REPO" --json tagName -q '.tagName' 2>/dev/null || true)
  if [ -n "$LATEST_STABLE_TAG" ]; then
    echo ""
    echo "→ Uploading canary updater files to latest stable ${LATEST_STABLE_TAG}"
    shopt -s nullglob
    for f in "${ARTIFACT_DIR}/canary-"*; do
      [ -f "$f" ] || continue
      echo "  → $(basename "$f") [→ ${LATEST_STABLE_TAG}]"
      gh release upload "$LATEST_STABLE_TAG" "$f" --clobber --repo "$TARGET_REPO"
    done
    shopt -u nullglob
  else
    echo "⚠ Could not resolve latest stable on ${TARGET_REPO}; skip canary → stable upload."
  fi
fi

NEXT_BASE=$(python3 -c "v='${BRIDGE_VERSION}'.split('.'); print(f\"{v[0]}.{v[1]}.{int(v[2])+1}\")")
echo ""
echo "→ Bumping local version to ${NEXT_BASE} for continued work on main repo"
save_version_json "$NEXT_BASE" 0
patch_app_version "$NEXT_BASE"

echo ""
echo "Done. Releases on ${TARGET_REPO}: ${TAG}$([ "$BRIDGE_CHANNELS" = "both" ] && echo " and ${TAG_CANARY}")"
echo ""
echo "Commit version bumps when ready:"
echo "  git add electrobun.config.ts version.json && git commit -m \"chore: post-bridge bump to v${NEXT_BASE}\""
echo ""
echo "You can delete this script after migration: scripts/release-bridge-migration.sh"
