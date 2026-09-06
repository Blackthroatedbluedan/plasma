#!/usr/bin/env bash
# Prep a clean demo walkthrough for Daniel's screen recording.
# Usage: ./scripts/demo-walkthrough.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

API="${PLASMA_API:-http://localhost:3847}"
UI="${PLASMA_UI:-http://localhost:5173}"
STAMP="$(date +%Y%m%d-%H%M%S)"
INBOX_NAME="demo-plate-8x8-${STAMP}.dxf"

mkdir -p data/inbox data/outbox

echo "== Plasma demo prep =="
echo ""

# Fresh inbox drop (auto-imports within ~5s)
cp samples/plate-8x8.dxf "data/inbox/${INBOX_NAME}"
echo "✓ Copied samples/plate-8x8.dxf → data/inbox/${INBOX_NAME}"
echo "  Vault name after import: Demo Plate 8x8 ${STAMP} (or similar)"
echo ""

echo "== URLs =="
echo "  Home (inbox + nest):  ${UI}/"
echo "  Vault (search/outbox): ${UI}/vault"
echo "  API health:            ${API}/api/config"
echo ""

echo "== Suggested on-camera flow (≈2–3 min) =="
echo "  1. Home — show Inbox left; within ~5s file moves to 'Recently imported'"
echo "     Open Vault, search 'demo plate' or sort Recent — drawing is there (no import click)"
echo "  2. Home right — + Add part → search 'bracket' → add Bracket 6×4"
echo "     Sheet auto-filters to Black Steel 1/4\" → Run nest → Outbox → show SVG preview"
echo "  3. Vault — search 'washer' → Outbox on Washer 4\" → green success banner"
echo "     Point at Outbox bar at bottom: files waiting in data/outbox/"
echo "  4. Outbox sweep (optional) — run: npm run demo:sweep"
echo "     Or: curl -X POST ${API}/api/outbox/sweep -H 'Content-Type: application/json' -d '{\"force\":true}'"
echo "     Check data/outbox/archive/ — vault originals unchanged"
echo ""

if curl -sf "${API}/api/config" >/dev/null 2>&1; then
  echo "== Server is up =="
  sleep 6
  echo "Inbox status:"
  curl -sf "${API}/api/inbox" | python3 -m json.tool 2>/dev/null || true
  echo ""
  echo "Outbox status:"
  curl -sf "${API}/api/outbox" | python3 -m json.tool 2>/dev/null || true
else
  echo "== Start the app first =="
  echo "  npm run dev"
  echo "  Then re-run: ./scripts/demo-walkthrough.sh"
fi
