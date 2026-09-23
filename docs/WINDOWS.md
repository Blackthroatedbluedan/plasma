# Windows install and run protocol (Plasma)

Locked shop runbook for the FlashCut laptop and the **KLFS Windows app shape** other products (e.g. Store / Spire bridge) should copy—not invent a second install path.

## Protocol summary (copy-paste)

1. **Ship shape:** Electron app + **electron-builder NSIS** `Setup.exe`, built on **`windows-latest`** in GitHub Actions and published to **GitHub Releases** (`latest` rolling tag on `main`, or `v*` version tags).
2. **Shop install:** Operator downloads **`Plasma Setup … .exe`** from Releases. No terminal, npm, or Node on the shop laptop.
3. **Install location:** Per-user NSIS default: `%LOCALAPPDATA%\Programs\Plasma` (desktop + Start Menu shortcuts). `perMachine: false` in electron-builder.
4. **Data:** `%APPDATA%\Plasma\data\` (Electron `userData` + `data/`). Created on first launch. Survives reinstall unless the operator deletes AppData. Holds `plasma.db`, `inbox/`, `outbox/`, `uploads/`, `exports/`.
5. **Desktop drop folders (first launch):** Junctions on the operator’s Desktop — **Plasma Inbox** → `%APPDATA%\Plasma\data\inbox`, **Plasma Outbox** → `%APPDATA%\Plasma\data\outbox`. Idempotent if they already exist and point at the right folders.
5. **Launch:** One **Plasma** window. Express listens on **`127.0.0.1`** only. Start the server **in-process** in the main Electron process—**do not** spawn a second `Plasma.exe` with `ELECTRON_RUN_AS_NODE` (Windows packaged builds hit **ENOENT**; Plasma uses `startPlasmaServer()` from `server/index.js` instead).
6. **Native modules:** Run **`electron-builder install-app-deps`** (or `@electron/rebuild`) in the pack step so **better-sqlite3** matches the Electron ABI.
7. **CI gate:** After `desktop:pack`, on **`windows-latest`**: start the **unpacked** `release\win-unpacked\Plasma.exe` → wait for **`http://127.0.0.1:3847/api/config`** HTTP **200** → stop the app → **fail the job** on timeout/crash → **only then** upload the Release asset.
8. **Recovery:** Uninstall from Settings → reinstall from a newer Release build. AppData is kept unless the shop wipes `%APPDATA%\Plasma\`.

---

## Plasma-specific reference

| Item | Value |
|------|--------|
| Product name | **Plasma** |
| App ID | `ca.klfs.plasma` |
| Download | [Releases → `latest`](https://github.com/Blackthroatedbluedan/plasma/releases/tag/latest) (or any `v*` tag) |
| Install dir | `%LOCALAPPDATA%\Programs\Plasma` |
| Shop data | `%APPDATA%\Plasma\data\` |
| Desktop inbox / outbox | `%USERPROFILE%\Desktop\Plasma Inbox` → `…\data\inbox`, `Plasma Outbox` → `…\data\outbox` |
| Inbox formats | **`.dwg`** (primary) and **`.dxf`** — DWG converted to DXF on import (LibreDWG WASM bundled in the app; no Autodesk install) |
| Health URL | `http://127.0.0.1:3847/api/config` |
| CI smoke | `scripts/smoke-packaged-windows.ps1` after `npm run desktop:pack` |

### Known Windows packaging bug (fixed)

Earlier builds tried to run Express by spawning `process.execPath` with **`ELECTRON_RUN_AS_NODE=1`**. On some packaged Windows installs that fails with **ENOENT** on `Plasma.exe`, and child processes cannot execute scripts inside **asar**. Plasma now loads `server/index.js` in-process via **`startPlasmaServer()`** (`electron/main.cjs`).

### Maintainer build (optional)

On a Windows x64 machine with Node 20+:

```powershell
npm ci
npm run desktop:pack
```

Artifacts under `release/`: NSIS installer + `win-unpacked/` (used by CI smoke).

---

## For other KLFS Windows apps

Use this checklist so Store and sibling apps share one install story:

- [ ] **Electron + electron-builder**, NSIS **`Setup.exe`**, `appId` like `ca.klfs.<app>`, `productName` matches shop branding.
- [ ] **Release workflow** on `windows-latest`: `npm ci` → `build` → `electron-builder install-app-deps` → `electron-builder --win --x64`.
- [ ] **Per-user install** (`nsis.perMachine: false`); shortcuts for desktop + Start Menu.
- [ ] **Data under** `%APPDATA%\<ProductName>\data\` (or `userData/data`); document the path in README and Release notes.
- [ ] **Local server** on `127.0.0.1` with a stable **health route** (Plasma: `/api/config` on port **3847**).
- [ ] **Single process** for UI + server (in-process Express or equivalent); no second copy of the app binary for the server.
- [ ] **Rebuild native deps** in the pack pipeline.
- [ ] **Post-pack smoke** on GHA: unpacked `.exe` → health check → kill → publish Release **only if green**.
- [ ] **Shop doc**: download URL, install path, data path, recovery (reinstall; AppData optional wipe).

Pick a **dedicated localhost port** per app and document the health URL in that app’s `docs/WINDOWS.md` (or link here for Plasma-only ports).

---

## Operator quick steps

1. Open [Plasma Releases](https://github.com/Blackthroatedbluedan/plasma/releases/tag/latest).
2. Download **Plasma Setup … .exe** and run it.
3. Pin **Plasma** to the taskbar.
4. Drop shop **DWG or DXF** in **Plasma Inbox** on the Desktop (or `%APPDATA%\Plasma\data\inbox\`); pick up nests from **Plasma Outbox**.

Back up `%APPDATA%\Plasma\data\` before major Windows upgrades or when replacing the laptop.
