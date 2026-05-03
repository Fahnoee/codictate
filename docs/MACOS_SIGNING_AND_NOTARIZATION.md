# macOS Signing and Notarization

Release builds are signed and notarized automatically by CI. For local signing or debugging notarization failures:

## Requirements

- Apple Developer Program membership
- Developer ID Application certificate in your keychain
- `.env` file with credentials (copy from `.env.example`)

```bash
ELECTROBUN_DEVELOPER_ID=Developer ID Application: Your Name (TEAMID)
ELECTROBUN_TEAMID=XXXXXXXXXX
ELECTROBUN_APPLEID=you@example.com
ELECTROBUN_APPLEIDPASS=xxxx-xxxx-xxxx-xxxx   # app-specific password from appleid.apple.com
```

## What gets signed

Electrobun signs `Contents/MacOS/`, frameworks, and `.node` files. `scripts/post-build.ts` additionally signs everything under `native-helpers/` — these are not covered by Electrobun's signer and must be signed before the outer `codesignAppBundle` pass, otherwise notarization fails.

Each helper is signed with `--options runtime --timestamp` and its own entitlements plist from `entitlements/`. The identifier is derived from the app bundle ID, e.g. `app.codictate.native.keylistener`.

## Important constraints

- **Do not rename `Contents/MacOS/launcher`** — Electrobun's signer looks up that path explicitly. Renaming breaks TCC attribution (Accessibility, Microphone, Input Monitoring stop working).
- **`com.apple.security.device.audio-input` must be boolean `true`**, not a string. A string produces an invalid plist entry and silently breaks microphone access under hardened runtime.

## Verifying a build

```bash
# Verify app signature
codesign --verify --deep --strict --verbose=2 "/path/to/Codictate.app"
spctl --assess --verbose --type execute "/path/to/Codictate.app"

# Inspect audio entitlement (should show <true/>, not a string)
codesign -d --entitlements - --xml "/path/to/Codictate.app/Contents/MacOS/launcher"

# Inspect a helper
codesign -dv --entitlements - "/path/to/Codictate.app/Contents/Resources/app/native-helpers/MicRecorder"
```

## Common issues

| Symptom | Cause |
|---------|-------|
| Notarization: unsigned nested binary | Add the binary to `post-build.ts` signing loop + `entitlements/` |
| Microphone never prompts | `audio-input` entitlement is a string instead of boolean `true` |
| App missing from Privacy & Security | `launcher` was renamed, or signing identity mismatch |
| Whisper crash under hardened runtime | `whisper-cli.entitlements` needs `allow-unsigned-executable-memory` |
