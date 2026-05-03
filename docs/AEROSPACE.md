# AeroSpace

If you use [AeroSpace](https://github.com/nikitabobko/AeroSpace) on macOS, Codictate opens two kinds of windows:

- **Main window** — normal app UI (you may want a rule that moves it to a specific workspace).
- **Recording HUD** — a small floating overlay titled **Codictate indicator**. If you use broad Codictate rules in AeroSpace, it is still sensible to keep the HUD out of those rules so it is not treated like the main window.

## Recommended `on-window-detected` snippet

If you want AeroSpace to treat the HUD differently from the main window, add a block that matches the HUD **before** any broader `Codictate` rule. Use `check-further-callbacks = false` so AeroSpace does not chain broader callbacks onto the HUD.

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
