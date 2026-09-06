import fs from 'fs';
import path from 'path';

export const OUTBOX_DIR = path.join(process.cwd(), 'data', 'outbox');
export const OUTBOX_ARCHIVE_DIR = path.join(OUTBOX_DIR, 'archive');
const SWEEP_STATE_FILE = path.join(process.cwd(), 'data', '.outbox-sweep.json');

/** Files older than this are swept from outbox back to vault custody (removed from outbox). */
export const OUTBOX_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

export function ensureOutboxDirs() {
  [OUTBOX_DIR, OUTBOX_ARCHIVE_DIR].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

export function listOutboxFiles() {
  ensureOutboxDirs();
  if (!fs.existsSync(OUTBOX_DIR)) return [];
  return fs.readdirSync(OUTBOX_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.dxf'))
    .map((e) => {
      const fullPath = path.join(OUTBOX_DIR, e.name);
      const stat = fs.statSync(fullPath);
      const ageMs = Date.now() - stat.mtimeMs;
      return {
        filename: e.name,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        ageDays: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
        expiresInDays: Math.max(0, Math.ceil((OUTBOX_RETENTION_MS - ageMs) / (24 * 60 * 60 * 1000))),
        kind: e.name.startsWith('nest-') ? 'nest' : e.name.startsWith('part-') ? 'part' : 'other',
      };
    })
    .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
}

export function writeNestToOutbox(jobId, dxfContent) {
  ensureOutboxDirs();
  const outName = `nest-${jobId.slice(0, 8)}-ready.dxf`;
  const outPath = path.join(OUTBOX_DIR, outName);
  fs.writeFileSync(outPath, dxfContent);
  return { path: outPath, filename: outName };
}

export function writePartToOutbox(part, dxfContent) {
  ensureOutboxDirs();
  const safeName = (part.name || 'part').replace(/[^\w.-]+/g, '_');
  const outName = `part-${safeName}-rev${part.revision}-ready.dxf`;
  let outPath = path.join(OUTBOX_DIR, outName);
  if (fs.existsSync(outPath)) {
    outPath = path.join(OUTBOX_DIR, `part-${safeName}-rev${part.revision}-${Date.now()}-ready.dxf`);
  }
  fs.writeFileSync(outPath, dxfContent);
  return { path: outPath, filename: path.basename(outPath) };
}

function readSweepState() {
  try {
    if (fs.existsSync(SWEEP_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(SWEEP_STATE_FILE, 'utf8'));
    }
  } catch (_) {}
  return { lastSweepAt: null, lastArchived: [] };
}

function writeSweepState(state) {
  const dataDir = path.dirname(SWEEP_STATE_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(SWEEP_STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Remove outbox DXFs older than OUTBOX_RETENTION_MS.
 * Vault already holds originals; nest jobs are logged in jobs table.
 * Archived copies land in data/outbox/archive/ for audit.
 */
export function sweepOutbox({ force = false } = {}) {
  ensureOutboxDirs();
  const now = Date.now();
  const state = readSweepState();
  const files = listOutboxFiles();
  const archived = [];

  for (const file of files) {
    const fullPath = path.join(OUTBOX_DIR, file.filename);
    const stat = fs.statSync(fullPath);
    const ageMs = now - stat.mtimeMs;
    if (!force && ageMs < OUTBOX_RETENTION_MS) continue;

    const archiveName = `${path.basename(file.filename, '.dxf')}-${stat.mtimeMs}.dxf`;
    const archivePath = path.join(OUTBOX_ARCHIVE_DIR, archiveName);
    fs.renameSync(fullPath, archivePath);
    archived.push({ filename: file.filename, archivedAs: archiveName, kind: file.kind });
  }

  const nextState = {
    lastSweepAt: new Date().toISOString(),
    lastArchived: archived,
    retentionDays: OUTBOX_RETENTION_MS / (24 * 60 * 60 * 1000),
  };
  writeSweepState(nextState);
  return { archived, state: nextState, remaining: listOutboxFiles().length };
}

export function getOutboxSweepInfo() {
  const state = readSweepState();
  return {
    retentionDays: OUTBOX_RETENTION_MS / (24 * 60 * 60 * 1000),
    lastSweepAt: state.lastSweepAt,
    files: listOutboxFiles(),
  };
}

const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly check; safe if app was off (mtime-based)

export function startOutboxSweepScheduler() {
  ensureOutboxDirs();
  try {
    const result = sweepOutbox();
    if (result.archived.length) {
      console.log(`[outbox] sweep on boot: archived ${result.archived.length} file(s)`);
    }
  } catch (e) {
    console.error('[outbox] sweep on boot failed:', e.message);
  }
  return setInterval(() => {
    try {
      const result = sweepOutbox();
      if (result.archived.length) {
        console.log(`[outbox] scheduled sweep: archived ${result.archived.length} file(s)`);
      }
    } catch (e) {
      console.error('[outbox] scheduled sweep failed:', e.message);
    }
  }, SWEEP_INTERVAL_MS);
}
