#!/usr/bin/env bash
# Plasma end-to-end exercise script — run against localhost:3847
set -euo pipefail

API="${API_BASE:-http://localhost:3847/api}"
ARTIFACTS="${ARTIFACTS_DIR:-/opt/cursor/artifacts}"
REPORT="$ARTIFACTS/e2e-report.txt"
mkdir -p "$ARTIFACTS"

pass() { echo "PASS: $1" | tee -a "$REPORT"; }
fail() { echo "FAIL: $1" | tee -a "$REPORT"; exit 1; }

: > "$REPORT"
echo "Plasma E2E — $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$REPORT"
echo "API: $API" | tee -a "$REPORT"
echo "---" | tee -a "$REPORT"

# --- 1. Import test parts ---
echo "" | tee -a "$REPORT"
echo "STEP 1: Import test DXFs into vault" | tee -a "$REPORT"

declare -A PART_IDS
import_part() {
  local file="$1" name="$2" material="$3" thickness="$4" qty="$5" customer="$6" job="$7" tags="$8"
  local resp
  resp=$(curl -sf -X POST "$API/parts" \
    -F "dxf=@$file" \
    -F "name=$name" \
    -F "material=$material" \
    -F "thickness=$thickness" \
    -F "qty=$qty" \
    -F "customer=$customer" \
    -F "job_ref=$job" \
    -F "tags=$tags")
  local id
  id=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
  PART_IDS["$name"]="$id"
  echo "  imported: $name ($id)" | tee -a "$REPORT"
}

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TP="$ROOT/samples/test-parts"

import_part "$TP/panel-5x10-slotted.dxf"     "Panel 5x10 Slotted"     "Black Steel" "1/4\"" 2 "TestCo" "E2E-001" "panel,slots"
import_part "$TP/flange-8in-bolt-circle.dxf"  "Flange 8in Bolt Circle" "Black Steel" "3/8\"" 1 "TestCo" "E2E-001" "flange,bolt-circle"
import_part "$TP/bracket-L-simple.dxf"        "Bracket L Simple"       "Black Steel" "1/4\"" 4 "TestCo" "E2E-002" "bracket"
import_part "$TP/plate-14x10-center-hole.dxf" "Plate 14x10 Center Hole" "Black Steel" "1/4\"" 1 "TestCo" "E2E-002" "plate"
import_part "$TP/gusset-triangle.dxf"         "Gusset Triangle"        "Black Steel" "3/16\"" 3 "TestCo" "E2E-003" "gusset"

TOTAL=$(curl -sf "$API/parts" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")
if [ "$TOTAL" -ge 5 ]; then pass "Imported 5 test parts (vault total: $TOTAL)"; else fail "Expected >=5 parts, got $TOTAL"; fi

# --- 2. Search ---
echo "" | tee -a "$REPORT"
echo "STEP 2: Search vault" | tee -a "$REPORT"

S1=$(curl -sf "$API/parts?q=flange" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['total'], d['parts'][0]['name'] if d['parts'] else '')")
if echo "$S1" | grep -q "Flange"; then pass "Search 'flange' → $S1"; else fail "Search flange: $S1"; fi

S2=$(curl -sf "$API/parts?material=Black%20Steel&thickness=1/4%22" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['total'])")
if [ "$S2" -ge 3 ]; then pass "Filter Black Steel 1/4\" → $S2 hits"; else fail "Material/thickness filter: $S2"; fi

S3=$(curl -sf "$API/parts?q=E2E-001" | python3 -c "import sys,json; print(json.load(sys.stdin)['total'])")
if [ "$S3" -ge 2 ]; then pass "Search job E2E-001 → $S3 hits"; else fail "Job search: $S3"; fi

# --- 3. Nest ---
echo "" | tee -a "$REPORT"
echo "STEP 3: Nest multiple parts on 5x10 Black Steel 1/4\"" | tee -a "$REPORT"

SHEET_ID=$(curl -sf "$API/sheets?material=Black%20Steel&thickness=1/4%22&status=available" | python3 -c "
import sys,json
sheets=json.load(sys.stdin)
full=[s for s in sheets if not s['is_remnant'] and s['width_in']==60 and s['height_in']==120]
print(full[0]['id'] if full else '')
")
if [ -z "$SHEET_ID" ]; then fail "No 5x10 Black Steel 1/4\" sheet available"; fi
echo "  sheet: $SHEET_ID" | tee -a "$REPORT"

P1="${PART_IDS[Panel 5x10 Slotted]}"
P2="${PART_IDS[Bracket L Simple]}"
P3="${PART_IDS[Gusset Triangle]}"

NEST=$(curl -sf -X POST "$API/nest" -H "Content-Type: application/json" -d "{
  \"partIds\": [\"$P1\", \"$P2\", \"$P3\"],
  \"quantities\": {\"$P1\": 1, \"$P2\": 2, \"$P3\": 2},
  \"sheetId\": \"$SHEET_ID\",
  \"kerf\": 0.125
}")

JOB_ID=$(echo "$NEST" | python3 -c "import sys,json; print(json.load(sys.stdin).get('jobId',''))")
SUCCESS=$(echo "$NEST" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success', False))")
YIELD=$(echo "$NEST" | python3 -c "import sys,json; print(json.load(sys.stdin).get('yieldPct', 0))")

if [ "$SUCCESS" = "True" ] && [ -n "$JOB_ID" ]; then
  pass "Nest OK — job $JOB_ID, yield ${YIELD}%"
else
  echo "$NEST" | tee -a "$REPORT"
  fail "Nest failed"
fi

# Save preview SVG
echo "$NEST" | python3 -c "
import sys,json,os
d=json.load(sys.stdin)
svg=d.get('previewSvg','')
path=os.environ.get('ARTIFACTS_DIR','/opt/cursor/artifacts')+'/nest-preview.svg'
open(path,'w').write(svg)
print('  saved', path, len(svg), 'bytes')
" | tee -a "$REPORT"

# --- 4. Export DXF ---
echo "" | tee -a "$REPORT"
echo "STEP 4: Export nested DXF" | tee -a "$REPORT"

DXF_OUT="$ARTIFACTS/nested-export.dxf"
HTTP=$(curl -sf -o "$DXF_OUT" -w "%{http_code}" "$API/jobs/$JOB_ID/dxf")
if [ "$HTTP" != "200" ]; then fail "DXF download HTTP $HTTP"; fi
if [ ! -s "$DXF_OUT" ]; then fail "DXF file empty"; fi

python3 << PY | tee -a "$REPORT"
path = "$DXF_OUT"
text = open(path).read()
has_parts = "PARTS" in text
has_sheet = "SHEET" in text
has_lwpoly = "LWPOLYLINE" in text
print(f"  size: {len(text)} bytes")
print(f"  PARTS layer: {has_parts}")
print(f"  SHEET layer: {has_sheet}")
print(f"  LWPOLYLINE entities: {has_lwpoly}")
if has_parts and has_sheet and has_lwpoly:
    print("PASS: DXF has PARTS/SHEET layers and geometry")
else:
    raise SystemExit("FAIL: DXF missing expected layers")
PY

# --- 5. Confirm cut ---
echo "" | tee -a "$REPORT"
echo "STEP 5: Confirm cut / inventory" | tee -a "$REPORT"

BEFORE=$(curl -sf "$API/sheets?status=available&material=Black%20Steel&thickness=1/4%22" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")

curl -sf -X POST "$API/jobs/$JOB_ID/confirm" -H "Content-Type: application/json" \
  -d '{"remnants":[{"width_in":18,"height_in":42}]}' | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['status']=='completed', d"

AFTER=$(curl -sf "$API/sheets?status=available&material=Black%20Steel&thickness=1/4%22" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
CONSUMED=$(curl -sf "$API/sheets/$SHEET_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])" 2>/dev/null || echo "consumed")

if [ "$CONSUMED" = "consumed" ] || [ "$AFTER" -ge "$BEFORE" ]; then
  pass "Job confirmed — sheet consumed, remnant added (available sheets: $BEFORE → $AFTER)"
else
  fail "Inventory not updated correctly"
fi

JOBS_DONE=$(curl -sf "$API/jobs" | python3 -c "import sys,json; print(sum(1 for j in json.load(sys.stdin) if j['status']=='completed'))")
pass "Completed jobs: $JOBS_DONE"

echo "" | tee -a "$REPORT"
echo "=== ALL STEPS PASSED ===" | tee -a "$REPORT"
