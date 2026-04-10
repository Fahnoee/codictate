# macOS code signing and notarization

Codictate ships as a Developer ID–signed, notarized app so Gatekeeper accepts it without extra steps. This note is for **maintainers** building release artifacts.

## What Apple expects

[Notarizing macOS software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution) scans **every Mach-O executable** in the upload. Each one must be:

1. Signed with a **Developer ID Application** identity (not “Apple Development” and not ad hoc).
2. Signed with a **secure timestamp** (`codesign --timestamp`).
3. Built with **hardened runtime** (`codesign --options runtime`).

Your main `.app` can be signed correctly while notarization still **fails** if **nested tools** inside the bundle are unsigned. The outer app signature does not replace per-binary signing for helpers.

## Electrobun build order (Codictate)

Rough sequence for `electrobun build --env=stable|canary` on macOS:

1. Electrobun assembles the **inner** `.app` (writes `Info.plist`, copies `Contents/MacOS/launcher`, `bun`, resources, etc.).
2. **`scripts/post-build.ts`** runs (`ELECTROBUN_BUILD_DIR`, `ELECTROBUN_BUILD_ENV`, `ELECTROBUN_APP_IDENTIFIER`, …).
3. Electrobun continues (ASAR, tarball, self-extracting wrapper if applicable).
4. **`scripts/post-wrap.ts`** runs on the **wrapper** bundle only (`ELECTROBUN_WRAPPER_BUNDLE_PATH`), before that bundle is signed.
5. **`codesignAppBundle`** signs Mach-Os under `Contents/MacOS/`, then the `.app` as a whole.

`post-build` runs **before** Electrobun’s main codesign pass. Native helpers under `Resources/app/native-helpers/` are **not** rescanned by Electrobun’s signer; they stay signed as in step 2.

### Do not rename `Contents/MacOS/launcher`

The main executable on disk must stay named **`launcher`**. Electrobun’s signer looks up that path explicitly to apply the app’s entitlements and to keep signing consistent with the rest of the pipeline. Renaming it (and changing `CFBundleExecutable`) caused **broken TCC attribution**: the app could fail to appear correctly under Privacy & Security (Accessibility, Microphone, Input Monitoring).

User-visible naming comes from **`CFBundleName` / bundle folder name** (Electrobun’s `getMacOSBundleDisplayName` from `app.name` + `--env`) and from **`scripts/post-wrap.ts`** on the shipping wrapper—not from renaming the launcher binary.

## Main app entitlements (`electrobun.config.ts`)

Hardened Runtime [audio input](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.device.audio-input) must be a **boolean** `<true/>` in the **signed** entitlements plist.

Electrobun’s `build.mac.entitlements` values are written straight into that plist. Using a **string** (e.g. a human-readable sentence) produces `<string>…</string>`, which is **invalid** for `com.apple.security.device.audio-input`. The app may then get **no effective microphone entitlement** under hardened runtime (silent failure, wrong TCC behavior).

Codictate uses:

```ts
entitlements: {
  "com.apple.security.device.audio-input": true,
},
```

**Privacy copy** for the microphone prompt (`NSMicrophoneUsageDescription`, etc.) belongs in **`Info.plist`**, not as the entitlement value. `post-build.ts` and `post-wrap.ts` set those strings via PlistBuddy.

## Native helpers (`native-helpers/`)

| Binary        | Role                               |
|---------------|------------------------------------|
| `KeyListener` | Global shortcut / permission bridge  |
| `MicRecorder` | Microphone capture                 |
| `whisper-cli` | Local Whisper (whisper.cpp)        |

Electrobun signs `Contents/MacOS/*`, frameworks, and `Resources/app/bun/**/*.node`. It does **not** sign arbitrary executables in `Resources/app/native-helpers/`.

**`scripts/post-build.ts`** Developer ID–signs each helper with `--options runtime`, `--timestamp`, and **`--entitlements`** pointing at plists under **`main/entitlements/`**:

- `KeyListener.entitlements` / `MicRecorder.entitlements` — microphone / audio-input (KeyListener also queries mic status).
- `whisper-cli.entitlements` — `com.apple.security.cs.allow-unsigned-executable-memory` for inference.

Without per-helper entitlements, hardened runtime can **deny** those capabilities with little surface error.

Helpers are signed with an identifier derived from the app bundle id, e.g. `app.codictate.native.keylistener` (stable) or `app.codictate.canary.native.keylistener` (canary). **`ELECTROBUN_APP_IDENTIFIER`** is set by Electrobun from `electrobun.config.ts`; `post-build.ts` falls back to `ELECTROBUN_BUILD_ENV` if needed.

If you add another Mach-O under `native-helpers/`, add it to `nativeHelperNames` in `post-build.ts`, add an entitlements plist if it needs runtime exceptions, or notarization / runtime will fail.

## Channels: `app.name`, `identifier`, and TCC

- **`app.name`** in `electrobun.config.ts` is a **single** product string (`Codictate`). Do **not** bake “canary” or “dev” into `name`; Electrobun appends the channel from **`electrobun build --env=…`**, producing folder / `CFBundleName` values such as `Codictate`, `Codictate-canary`, `Codictate-dev`.
- **`app.identifier`** is driven by **`CODICTATE_CHANNEL`** when you build: `app.codictate` (stable), `app.codictate.canary`, `app.codictate.dev`.

**Stable and canary are separate apps for macOS TCC.** Each channel has its own Privacy & Security entries; granting one does not grant the other.

**Dev** builds (`electrobun dev` / `--env=dev`) typically **skip** Electrobun’s release codesign path; behavior differs from signed release builds.

## Wrapper bundle (`post-wrap.ts`)

The self-extracting **outer** `.app` gets `Info.plist` patches for the same usage-description keys as the inner app, plus **`CFBundleDisplayName` / `CFBundleName`** aligned with `APP_NAME` + `CODICTATE_CHANNEL` (same rule as Electrobun’s display naming).

## Certificate and environment

You need an **Apple Developer Program** membership and a **Developer ID Application** certificate in your login keychain.

Typical variables (see project `.env.example` if present):

- **`ELECTROBUN_DEVELOPER_ID`** — exact certificate name, e.g. `Developer ID Application: Your Name (TEAMID)`.
- **Notarization** — Electrobun supports Apple ID + app-specific password or App Store Connect API keys; see Electrobun docs. `electrobun.config.ts` has `notarize: true` for release builds.

Release builds use **`bun run build:stable`**, **`bun run build:canary`**, or **`scripts/release.sh`**, which invoke the same Electrobun build with the right `CODICTATE_CHANNEL`.

## Verifying locally

Verify the shipping `.app`:

```bash
codesign --verify --deep --strict --verbose=2 "/path/to/Codictate.app"
spctl --assess --verbose --type execute "/path/to/Codictate.app"
```

Inspect **main** audio entitlement (should show boolean `true`, not a string):

```bash
codesign -d --entitlements - --xml "/path/to/Codictate.app/Contents/MacOS/launcher"
```

Inspect a helper:

```bash
codesign -dv --entitlements - "/path/to/Codictate.app/Contents/Resources/app/native-helpers/MicRecorder"
```

Expect `Authority=Developer ID Application: …`, `Timestamp`, `flags=0x10000(runtime)`, and non-empty entitlements for mic / ML as applicable.

## Common issues

| Symptom | Typical cause |
|--------|----------------|
| Notarization: unsigned nested binary | Add/sign the binary in `post-build.ts` (and entitlements if needed). |
| Microphone never works / no real prompt | Main app `audio-input` must be **boolean `true`** in config, not a string. Helpers need mic entitlements. |
| App missing from Privacy lists after “fixing” the bundle | Renamed `launcher` or mismatched signing; keep executable name `launcher` and rebuild. |
| Stable vs canary permissions differ | Normal — different `CFBundleIdentifier` / TCC clients. |
| Signature does not include a secure timestamp | Ensure `--timestamp` (Electrobun + `post-build.ts` already use it). |
| Hardened runtime crash in whisper | `whisper-cli` needs `allow-unsigned-executable-memory` in its entitlements plist. |

Apple’s [Resolving common notarization issues](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution/resolving_common_notarization_issues) has the full official list.

## Privacy prompts (Input Monitoring, Accessibility, Microphone)

Signing does not replace **`Info.plist` usage description** keys. On current macOS, missing **`NSInputMonitoringUsageDescription`**, **`NSAccessibilityUsageDescription`**, or **`NSMicrophoneUsageDescription`** can prevent prompts or cause silent denials. **`post-build.ts`** and **`post-wrap.ts`** set these on the inner and wrapper bundles respectively.

Application logic should not fire **Input Monitoring** (`CGRequestListenEventAccess`) until the user reaches that step in onboarding; see `KeyListener.swift` and the permissions UI order.

During development, stale TCC rows can confuse testing; **`tccutil reset`** for a specific service + bundle id can help—use with care and only when you understand the impact.
