#!/usr/bin/env bash
# Force-archive all files in data/outbox/ (demo / dev verification of 3-day policy).
set -euo pipefail

API="${PLASMA_API:-http://localhost:3847}"

echo "Forcing outbox sweep via ${API}/api/outbox/sweep ..."
curl -sf -X POST "${API}/api/outbox/sweep" \
  -H "Content-Type: application/json" \
  -d '{"force":true}' | python3 -m json.tool

echo ""
echo "Remaining in data/outbox/:"
ls -la data/outbox/*.dxf 2>/dev/null || echo "  (none)"
echo "Archived copies:"
ls -la data/outbox/archive/*.dxf 2>/dev/null | tail -5 || echo "  (none yet)"
