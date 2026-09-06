import { v4 as uuid } from 'uuid';
import db from './db.js';

/** Full sheet area consumed on confirm cut, in ft². */
export function sheetQuantitySqFt(job) {
  return Math.round(((job.sheet_width_in * job.sheet_height_in) / 144) * 1000) / 1000;
}

/**
 * Build the KLFSapps `recordPlasmaMaterialUse` callable payload from a completed job.
 * Only the first valid remnant is included; additional remnants stay in Plasma local inventory
 * until KLFSapps extends the contract (see docs/klfsapps-inventory-callable.md).
 */
export function buildInventorySyncPayload(job, remnants = []) {
  const payload = {
    jobId: job.id,
    material: job.material,
    gauge: job.thickness,
    quantitySqFt: sheetQuantitySqFt(job),
  };

  const first = remnants.filter((r) => r.width_in > 0 && r.height_in > 0)[0];
  if (first) {
    payload.remnant = {
      material: job.material,
      gauge: job.thickness,
      widthIn: first.width_in,
      lengthIn: first.height_in,
      notes: `Plasma job ${job.id.slice(0, 8)}`,
    };
  }

  return payload;
}

export function enqueueInventorySync(jobId, payload) {
  const id = uuid();
  db.prepare(`
    INSERT INTO inventory_sync_queue (id, job_id, payload_json, status)
    VALUES (?, ?, ?, 'pending')
  `).run(id, jobId, JSON.stringify(payload));
  db.prepare(`
    UPDATE jobs SET inventory_sync_status = 'pending' WHERE id = ?
  `).run(jobId);
  return id;
}

export function listPendingInventorySync() {
  return db.prepare(`
    SELECT id, job_id, payload_json, status, attempts, last_error, transaction_id, created_at, synced_at
    FROM inventory_sync_queue
    WHERE status = 'pending'
    ORDER BY created_at ASC
  `).all().map((row) => ({
    ...row,
    payload: JSON.parse(row.payload_json),
  }));
}

export function markInventorySyncComplete(queueId, transactionId) {
  const row = db.prepare('SELECT job_id FROM inventory_sync_queue WHERE id = ?').get(queueId);
  if (!row) return null;

  db.prepare(`
    UPDATE inventory_sync_queue
    SET status = 'synced', transaction_id = ?, synced_at = datetime('now'), last_error = NULL
    WHERE id = ?
  `).run(transactionId, queueId);

  db.prepare(`
    UPDATE jobs SET inventory_sync_status = 'synced' WHERE id = ?
  `).run(row.job_id);

  return db.prepare('SELECT * FROM inventory_sync_queue WHERE id = ?').get(queueId);
}

export function markInventorySyncFailed(queueId, error) {
  const row = db.prepare('SELECT job_id FROM inventory_sync_queue WHERE id = ?').get(queueId);
  if (!row) return null;

  db.prepare(`
    UPDATE inventory_sync_queue
    SET status = 'pending', attempts = attempts + 1, last_error = ?
    WHERE id = ?
  `).run(String(error).slice(0, 500), queueId);

  db.prepare(`
    UPDATE jobs SET inventory_sync_status = 'failed' WHERE id = ?
  `).run(row.job_id);

  return db.prepare('SELECT * FROM inventory_sync_queue WHERE id = ?').get(queueId);
}

export function getInventorySyncSummary() {
  const counts = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM inventory_sync_queue
    GROUP BY status
  `).all();
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c.count]));
  return {
    pending: byStatus.pending || 0,
    synced: byStatus.synced || 0,
    failed: byStatus.failed || 0,
  };
}
