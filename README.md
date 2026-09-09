# Plasma — Fab-Cut Shop Overlay

Local-first web app that sits beside **FlashCut** on your Windows laptop. Plasma handles part library, sheet/remnant inventory, nesting, and cut/yield logging. Hand-off to FlashCut is a **nested DXF** the operator imports for lead-ins, kerf compensation, and torch control.

> Plasma does **not** replace FlashCut or send G-code. DXF export is the integration surface.

## Features (v1 MVP)

- **Home** — Inbox window (auto-import from `data/inbox/`) + nest builder with live preview; exports to `data/outbox/`
- **Drawing vault** — Searchable list of every shop DXF (name, material, gauge, customer, job, tags). Send single parts to outbox or add to nest
- **Sheet & remnant inventory** — Full sheets + rectangular remnants with shop presets (never hard-limited)
- **Nesting** — Bottom-left-fill with 90° rotation, configurable kerf/gap (~0.125" default), SVG preview
- **DXF export** — Closed polylines on `PARTS` layer, sheet outline on `SHEET` layer
- **Job / yield log** — Confirm cut → consume sheet, optionally add remnants back to inventory

## Shop Stock Presets

| Material | Gauges |
|----------|--------|
| Galvanized | 10ga, 12ga, 14ga |
| Black Steel | 3/4", 1/2", 3/8", 1/4", 3/16", 10ga |
| Checker Plate | 3/16", 10ga |

**Sheet sizes:** 5×10 ft (60"×120") primary, 4×8 ft (48"×96") rare, plus any custom W×L.

A realistic starter inventory is seeded on first run (mostly 5×10 across common gauges, plus remnants).

## Requirements

- **Node.js 18+** (LTS recommended)
- Windows 10/11 (works on macOS/Linux too)
- Modern browser (Chrome, Edge, Firefox)

## Quick Start (Windows)

```powershell
# Clone and install
cd plasma
npm install

# Development (API on :3847, UI on :5173)
npm run dev
```

Open **http://localhost:5173** in your browser.

### Production / Shop Floor

```powershell
npm run build
npm start
```

Open **http://localhost:3847** — single server serves API + UI. Works fully offline after install.

## KLFS inventory sync (Confirm cut → KLFSapps)

On **Confirm cut**, Plasma queues material use for **KLFSapps** sheet inventory (Firebase project `gen-lang-client-0901687565`) via the HTTPS callable `recordPlasmaMaterialUse`. Local sheet consumption and remnants are unchanged; KLFS sync is best-effort when online.

1. Copy `.env.example` → `.env`
2. For local UI/dev without Firebase: keep `VITE_FIREBASE_MOCK=true` (default in example)
3. For real KLFS sync: set `VITE_FIREBASE_*` from the Firebase console web app config, set `VITE_FIREBASE_MOCK=false`, restart `npm run dev`
4. Sign in with Google (`@klfs.ca` only) in the header — session persists across restarts
5. Confirm cut on **Jobs** — pending sync rows retry automatically and via **Retry sync**

See [docs/klfsapps-inventory-callable.md](docs/klfsapps-inventory-callable.md) for the callable contract (KLFSapps repo: `cnc-sheet-inventory`).

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_FIREBASE_API_KEY` | yes* | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | yes* | Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | yes* | `gen-lang-client-0901687565` |
| `VITE_FIREBASE_APP_ID` | yes* | Firebase web app ID |
| `VITE_FIREBASE_MOCK` | no | `true` = mock callable for offline dev |
| `VITE_FIREBASE_FUNCTIONS_REGION` | no | Default `us-central1` |

\*Not required when `VITE_FIREBASE_MOCK=true`.

## Typical Workflow

1. **Home** — Inbox window shows new DXFs (drop in `data/inbox/` — auto-imports to vault). Build a nest on the right; finished nests land in `data/outbox/` for FlashCut
2. **Vault** — Search every shop DXF; send a single part to outbox or add to nest on Home
3. **Inventory** — Review seeded stock or add sheets/remnants
4. **Download nested DXF** → import into FlashCut for lead-ins/kerf/torch
5. **Jobs** — Confirm cut → sheet consumed, add remnants if any

### Outbox hygiene

Files in `data/outbox/` are swept every **3 days**: older DXFs are archived to `data/outbox/archive/` (vault still holds originals; nest jobs stay in the job log). The server runs a sweep on boot and hourly so downtime does not skip cleanup.

**Demo / dev:** `npm run demo:sweep` forces an immediate archive. Override retention with `OUTBOX_RETENTION_DAYS=0.001` (minutes-scale) for testing without force. See `npm run demo:prep` for a full screen-recording walkthrough script.

## Sample DXFs

| File | Description |
|------|-------------|
| `samples/bracket-6x4.dxf` | 6"×4" bracket with hole |
| `samples/plate-8x8.dxf` | 8"×8" plate with center hole |
| `samples/gusset-pair.dxf` | Two small gussets |
| `samples/washer-4in.dxf` | 4" OD washer (circle) |
| `samples/plate-12x12-dirty.dxf` | 12"×12" plate with holes, open gap + frayed junk (cleanup demo) |
| `samples/test-parts/` | Five shop-realistic test DXFs for pre-go-live exercise |

## E2E validation

Screenshots, nest preview SVG, sample nested DXF export, and API test report from a full vault → nest → FlashCut hand-off run are in [`docs/e2e/`](docs/e2e/). Re-run locally with `npm start` then `./scripts/e2e-test.sh`.

## Experimental: Geometry Cleanup add-on

Optional, non-blocking tool to diagnose and fix messy DXF geometry (open contours, endpoint gaps, tiny fragments, duplicate edges). Reach it from **Cleanup** on any drawing row — nest and export never require it.

- Settings: snap/join tolerance (default 0.02"), min segment length (default 0.05")
- Actions: join endpoints, close near-gaps, strip junk, remove duplicates
- Save cleaned DXF as a new revision or download — never overwrites without your action
- Demo dirty file: `samples/bracket-dirty-open.dxf` (intentional open gap + frayed lines)

## Data Storage

SQLite database at `data/plasma.db`. Uploaded DXFs in `data/uploads/`, exported nests in `data/exports/`. **Drop DXFs in `data/inbox/`** — they auto-import to the vault (no button click). **Finished nests and single-part exports land in `data/outbox/`** for FlashCut pickup; outbox files older than 3 days are archived automatically. Back up the `data/` folder to preserve inventory and parts.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/config` | Materials, gauges, sheet presets |
| GET | `/api/parts` | Search drawings (`q`, `material`, `thickness`, `sort=name\|recent`) → `{ parts, total }` |
| POST | `/api/parts` | Import DXF to vault |
| GET | `/api/parts/:id/dxf` | Download original part DXF |
| POST | `/api/parts/:id/revision` | Upload new DXF revision |
| GET/POST | `/api/sheets` | List / add inventory |
| POST | `/api/nest` | Run nesting, create pending job |
| GET | `/api/jobs` | Job history |
| POST | `/api/jobs/:id/confirm` | Confirm cut, consume sheet, add remnants, queue KLFS sync |
| GET | `/api/inventory-sync/pending` | Pending KLFS inventory sync queue |
| POST | `/api/inventory-sync/:id/complete` | Mark queue item synced (client after callable) |
| POST | `/api/inventory-sync/:id/fail` | Record sync failure for retry |
| GET | `/api/jobs/:id/dxf` | Download nested DXF |
| GET | `/api/inbox` | Inbox files + recently processed (auto-import enabled) |
| POST | `/api/inbox/import` | Manual inbox import (legacy; auto-import is default) |
| GET | `/api/outbox` | Outbox files + sweep metadata |
| POST | `/api/outbox/sweep` | Force or catch-up outbox archive (`{ "force": true }`) |
| POST | `/api/parts/:id/outbox` | Copy single-part DXF to outbox for FlashCut |

## Architecture

```
plasma/
├── server/          Express API + SQLite + nesting engine
│   ├── db.js        Schema
│   ├── seed.js      Shop stock seed data
│   ├── dxf.js       DXF parse & export
│   └── nesting.js   Bottom-left-fill nest (90° rotation)
├── src/             Vite + React UI
├── samples/         Demo DXF files
└── data/            SQLite DB (created on first run)
```

## Kerf / Gap

Default spacing between parts is **0.125"** (⅛"). Adjust on the Nest page. FlashCut applies its own kerf compensation during import — Plasma spacing is for nest clearance only.

## Future vision

See [docs/VISION.md](docs/VISION.md) for near-term foundation work, ~1-year goals (drawing AI and jobsite messaging), and long-horizon direction. Horizons are labeled; nothing here replaces operator review or proven cut paths until the shop says so.

## License

MIT
