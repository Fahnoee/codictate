# AeroSpace (tiling window manager)

For how the recording HUD is implemented in the app (separate window, title string, packaging, Electrobun **BrowserWindow** options), see **[RECORDING_INDICATOR.md](./RECORDING_INDICATOR.md)**.

If you use [AeroSpace](https://github.com/nikitabobko/AeroSpace) on macOS, Codictate opens two kinds of windows:

- **Main window** — normal app UI (you may want a rule that moves it to a specific workspace).
- **Recording HUD** — a small floating overlay titled **Codictate indicator**. It should stay **floating** and should **not** be handled by the same rules as the main window, or the HUD can steal focus and jump workspaces with the main app.

## Recommended `on-window-detected` snippet

Add a block that matches the HUD **before** any broader `Codictate` rule (for example before `move-node-to-workspace`). Use `check-further-callbacks = false` so AeroSpace does not run additional callbacks on that window (this helps avoid focus and workspace side effects chaining from other rules).

```toml
[[on-window-detected]]
if.app-name-regex-substring = 'Codictate'
if.window-title-regex-substring = 'indicator'
run = ['layout floating']
check-further-callbacks = false
```

Then your general Codictate rule can follow, for example:

```toml
[[on-window-detected]]
if.app-name-regex-substring = 'Codictate'
run = ['move-node-to-workspace 7']
```

Reload the config after editing: `aerospace reload-config`.

**Note:** In `on-window-detected`, AeroSpace currently allows only a small set of commands (`layout floating`, `layout tiling`, `move-node-to-workspace`). See [AeroSpace issue #20](https://github.com/nikitabobko/AeroSpace/issues/20) for discussion of richer callbacks.

## Known limitation

With AeroSpace, the recording HUD can behave as if it belongs to the workspace where it was first created. In practice, that means it may show normally only on that initial workspace, while on other AeroSpace workspaces it can flicker or flash briefly instead of staying visible.

This appears to be an interaction between AeroSpace workspace behavior and the tiny floating HUD window, not a general Codictate problem outside that setup.

If you know a cleaner AeroSpace-side fix, contributions are welcome.
