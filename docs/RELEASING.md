# Releasing

Releases are built entirely by CI. The local script only handles versioning and pushing the tag.

## How it works

1. Run `bun run release:canary` or `bun run release:stable` locally
2. The script bumps the version, commits, and pushes a git tag
3. The tag triggers `.github/workflows/release.yml`, which:
   - Builds macOS and Windows in parallel
   - Uploads artifacts to a draft GitHub Release
   - Publishes the release once both builds succeed

You do not need to build anything locally.

## Commands

```bash
bun run release:canary   # v0.0.34-canary.1
bun run release:stable   # v0.0.34 (then bumps to v0.0.35 for next cycle)
bun run release          # both channels at the same version
```

## Channels

| Channel | Tag format | GitHub Release |
|---------|-----------|----------------|
| Stable | `v0.0.34` | Regular release, shown as "Latest" |
| Canary | `v0.0.34-canary.1` | Pre-release, not shown as "Latest" |

`version.json` tracks `baseVersion` and `canaryBuild`. The release script updates it automatically.

## First-time CI setup

The CI workflow requires these secrets set in **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `MACOS_CERTIFICATE` | Base64-encoded Developer ID `.p12` — `base64 -i cert.p12` |
| `MACOS_CERTIFICATE_PWD` | Password for the `.p12` |
| `ELECTROBUN_DEVELOPER_ID` | `Developer ID Application: Your Name (TEAMID)` |
| `ELECTROBUN_TEAMID` | 10-character Apple Team ID (developer.apple.com → Membership) |
| `ELECTROBUN_APPLEID` | Apple ID email |
| `ELECTROBUN_APPLEIDPASS` | App-specific password from appleid.apple.com |

Windows builds require no secrets.

## Manual builds (no release)

To build without publishing, use the manual workflows in GitHub Actions:

- **Actions → Build macOS → Run workflow**
- **Actions → Build Windows → Run workflow**

Artifacts are uploaded as a zip to the workflow run — useful for testing before a real release.

## Re-running a failed build

If one platform fails after the tag is already pushed, re-run just the failed job from the Actions UI. The draft release stays open until the publish job succeeds.

If the release itself needs to be deleted, do it from GitHub before re-pushing the tag.
