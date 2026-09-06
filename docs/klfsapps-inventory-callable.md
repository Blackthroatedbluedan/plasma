# KLFSapps inventory callable — Plasma integration contract

Plasma (this repo) posts material use to **KLFSapps** sheet inventory on operator **Confirm cut**. Plasma stays a local app; inventory writes go through a Firebase **HTTPS callable** in the KLFSapps Firebase project — not raw client Firestore writes.

## Owner repo & feature area

| Item | Value |
|------|--------|
| Repository | [Blackthroatedbluedan/KLFSapps](https://github.com/Blackthroatedbluedan/KLFSapps) |
| Feature area | `cnc-sheet-inventory` |
| Firebase project | `gen-lang-client-0901687565` |

Implement or align the callable in KLFSapps; Plasma targets the contract below.

## Callable

**Name:** `recordPlasmaMaterialUse`  
**Region:** `us-central1` (override in Plasma via `VITE_FIREBASE_FUNCTIONS_REGION`)  
**Status:** **LIVE** — deployed revision `recordplasmamaterialuse-00001-qil` (us-central1). Plasma calls it via Firebase SDK `httpsCallable` using the name and region above — no hardcoded URL.  
**Auth:** Firebase Auth ID token — Google sign-in, **`@klfs.ca` email allowlist** (same pattern as Inventory UI)

### Request

```json
{
  "jobId": "uuid-from-plasma-job",
  "material": "Black Steel",
  "gauge": "1/4\"",
  "quantitySqFt": 50.0,
  "remnant": {
    "material": "Black Steel",
    "gauge": "1/4\"",
    "widthIn": 18,
    "lengthIn": 42,
    "notes": "Plasma job a1b2c3d4"
  }
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `jobId` | string | yes | Plasma job UUID (`jobs.id`) |
| `material` | string | yes | Shop material name from nest/job |
| `gauge` | string | yes | Thickness/gauge label (Plasma `jobs.thickness`, e.g. `1/4"`, `10ga`) |
| `quantitySqFt` | number | yes | Full sheet area consumed: `(width_in × height_in) / 144` |
| `remnant` | object | no | Optional rectangular remnant add-back |
| `remnant.material` | string | if remnant | Same as job material |
| `remnant.gauge` | string | if remnant | Same as job gauge |
| `remnant.widthIn` | number | if remnant | Remnant width in inches |
| `remnant.lengthIn` | number | if remnant | Remnant length in inches |
| `remnant.notes` | string | no | Free text (Plasma sends short job reference) |

**Multiple remnants:** Plasma’s confirm-cut UI allows several local remnants. Only the **first valid remnant** is included in this callable payload today. Additional remnants remain in Plasma’s local SQLite inventory until KLFSapps extends the contract (e.g. `remnants[]`).

### Response

Success:

```json
{ "ok": true, "transactionId": "ledger-entry-id" }
```

Error: throw `HttpsError` with a clear message (Plasma surfaces it and keeps the payload in the local sync queue for retry).

### Ledger semantics (KLFSapps side)

- Create a ledger transaction with **`type: "use"`**
- Link to **`jobId`** (same ledger model as the Inventory app)
- Apply **`quantitySqFt`** as consumed sheet area
- If `remnant` is present, record add-back per existing inventory rules

## Plasma client behaviour

1. Operator confirms cut → local job completes (sheet consumed, local remnants saved) — unchanged nest/Outbox/FlashCut flow.
2. Server enqueues callable payload in SQLite `inventory_sync_queue`.
3. Signed-in browser calls `recordPlasmaMaterialUse` via Firebase SDK `httpsCallable`.
4. On success, queue row marked `synced` and job `inventory_sync_status = synced`.
5. On failure / offline, row stays `pending`; client retries on interval and manual **Retry sync** on Jobs page.

## Local development without KLFSapps

Set `VITE_FIREBASE_MOCK=true` in `.env`. Plasma skips Firebase and returns `{ ok: true, transactionId: "mock-…" }` so confirm-cut + queue + sync UI can be exercised offline.

## Related Plasma docs

- Environment variables: [`.env.example`](../.env.example) and README **KLFS inventory sync** section.
