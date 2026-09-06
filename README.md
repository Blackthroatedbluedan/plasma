# Plasma — Fab-Cut Shop Overlay

Local-first web app that sits beside **FlashCut** on your Windows laptop. Plasma handles part library, sheet/remnant inventory, nesting, and cut/yield logging. Hand-off to FlashCut is a **nested DXF** the operator imports for lead-ins, kerf compensation, and torch control.

> Plasma does **not** replace FlashCut or send G-code. DXF export is the integration surface.

## Features (v1 MVP)

- **Drawing vault** — Searchable list of every shop DXF (name, material, gauge, customer, job, tags). Find lost drawings fast, then one-click into nest → FlashCut export
- **Part library** — Import DXF, assign metadata, optional revision upload; bulk-select to nest
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

## Typical Workflow

1. **Drawings** — Search the vault by name fragment, material, customer, or job; download original DXF or **Nest** a hit
2. **Inventory** — Review seeded stock or add sheets/remnants
3. **Nest** — Parts can arrive pre-selected from the vault; pick sheet, run nest, preview
4. **Download nested DXF** → import into FlashCut for lead-ins/kerf/torch
5. **Jobs** — Confirm cut → sheet consumed, add remnants if any

## Sample DXFs

| File | Description |
|------|-------------|
| `samples/bracket-6x4.dxf` | 6"×4" bracket with hole |
| `samples/plate-8x8.dxf` | 8"×8" plate with center hole |
| `samples/gusset-pair.dxf` | Two small gussets |
| `samples/washer-4in.dxf` | 4" OD washer (circle) |

## Data Storage

SQLite database at `data/plasma.db`. Uploaded DXFs in `data/uploads/`, exported nests in `data/exports/`. Back up the `data/` folder to preserve inventory and parts.

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
| POST | `/api/jobs/:id/confirm` | Confirm cut, consume sheet, add remnants |
| GET | `/api/jobs/:id/dxf` | Download nested DXF |

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

## License

MIT
