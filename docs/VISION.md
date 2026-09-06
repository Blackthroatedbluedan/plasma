# Plasma — Future Vision

This memo describes where we want to take the plasma cutting workflow over time. It is a direction statement, not a product roadmap or delivery promise. Horizons are labeled so expectations stay honest.

---

## Near term — foundation (in progress)

We are building the shop floor data layer first:

- **Local vault** — drawings, job notes, and cut history stay on-premises, under our control.
- **Nest → DXF → FlashCut** — take nested layouts from the vault and hand them to the existing FlashCut path without retyping paths or hunting folders.
- **Inventory and remnants** — track sheet stock and usable offcuts so nesting decisions use what is actually on the rack.
- **Optional geometry cleanup** — light fix-ups (gaps, duplicates, scale) before export when a part needs it.
- **Inbox / Outbox (later)** — simple drop zones: new work lands in Inbox; finished nests and DXFs stage in Outbox for the operator or FlashCut pickup.

This phase does not replace FlashCut or the table controller. It makes the path from drawing to cut repeatable and local.

---

## ~1 year — smarter drawing and field-to-shop handoff

### Frontier engineering AI for drawing

Use natural-language requests plus patterns learned from **our own** past shop drawings (stored in the vault as structured context, not a dump of customer secrets) to:

- Generate new part outlines from a verbal spec (“10×6 plate, four ½″ holes on a 2″ grid, corner radius ¼″”).
- Adapt an existing part (“same bracket, mirror mounting holes, add ½″ to the leg”).

The vault becomes training and reference material for **style and conventions** — hole callouts, typical kerf allowances, standard plate sizes — not a leak of job files or customer identity. Human review before cut stays the default.

### Jobsite messaging

Crew in the field can message what they need (dimensions, photos, “same as job 47 but wider”). When they are back in the shop:

1. The drawing is ready or staged in the vault.
2. They load a sheet, nest or pull a single-part layout.
3. Hand off to FlashCut or drop the DXF in Outbox and cut.

The goal is zero “I thought you were making that tonight” gaps between field request and torch time.

---

## ~3 years — long-horizon ambition (not a current commitment)

**Replace the legacy FlashCut-era stack end-to-end:** control the plasma table from mobile, with strong nesting and drawing built in — request → nest → program → cut without hopping through separate desktop tools.

We label this **distant horizon** deliberately:

- **Machine safety and interlocks** — plasma tables are industrial equipment; any software that commands motion must meet shop safety practice and applicable standards. That work is open, not solved here.
- **Certification and liability** — vendor controllers, OEM paths, and shop insurance may require qualified integrations we have not scoped.
- **Operational risk** — cutting without a proven, reviewed program path is not acceptable; migration would be gradual with FlashCut (or equivalent) as fallback for years.

So: this section is **ambition**, not a commitment to ship mobile table control by a fixed date. Near-term and ~1-year work stands on its own and delivers value even if the long horizon slips or narrows.

---

## Principles

| Principle | What it means |
|-----------|----------------|
| **Local first** | Vault and cut history stay in the shop; cloud is optional later, not required to cut. |
| **Honest horizons** | Foundation now; AI and messaging ~1 year; full stack replacement ~3 years and uncertain. |
| **Safety before speed** | No feature ships that bypasses operator review or known-safe export paths without explicit shop sign-off. |
| **Our data, our patterns** | AI learns shop style from our vault, not from exposing customer jobs or credentials in a public repo. |

---

*Last updated: September 2026. Revise as foundation work lands and horizons become clearer.*
