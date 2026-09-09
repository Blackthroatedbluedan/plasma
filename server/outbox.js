import fs from 'fs';
import path from 'path';
import { getDataDir, ensureDataSubdir } from './paths.js';

function outboxDir() {
  return path.join(getDataDir(), 'outbox');
}

function outboxArchiveDir() {
  return path.join(outboxDir(), 'archive');
}

function sweepStateFile() {
  return path.join(getDataDir(), '.outbox-sweep.json');
}

/** Files older than this are swept from outbox back to vault custody (removed from outbox). */
const retentionDays = parseFloat(process.env.OUTBOX_RETENTION_DAYS || '3');
export const OUTBOX_RETENTION_MS = retentionDays * 24 * 60 * 60 * 1000;

export function ensureOutboxDirs() {
  ensureDataSubdir('outbox');
  ensureDataSubdir('outbox', 'archive');
}

export function listOutboxFiles() {
  ensureOutboxDirs();
  const dir = outboxDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.dxf'))
    .map((e) => {
      const fullPath = path.join(dir, e.name);
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
  const outPath = path.join(outboxDir(), outName);
  fs.writeFileSync(outPath, dxfContent);
  return { path: outPath, filename: outName };
}

export function writePartToOutbox(part, dxfContent) {
  ensureOutboxDirs();
  const safeName = (part.name || 'part').replace(/[^\w.-]+/g, '_');
  const outName = `part-${safeName}-rev${part.revision}-ready.dxf`;
  let outPath = path.join(outboxDir(), outName);
  if (fs.existsSync(outPath)) {
    outPath = path.join(outboxDir(), `part-${safeName}-rev${part.revision}-${Date.now()}-ready.dxf`);
  }
  fs.writeFileSync(outPath, dxfContent);
  return { path: outPath, filename: path.basename(outPath) };
}

function readSweepState() {
  try {
    const statePath = sweepStateFile();
    if (fs.existsSync(statePath)) {
      return JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }
  } catch (_) {}
  return { lastSweepAt: null, lastArchived: [] };
}

function writeSweepState(state) {
  const statePath = sweepStateFile();
  const dataDir = path.dirname(statePath);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
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
  const dir = outboxDir();

  for (const file of files) {
    const fullPath = path.join(dir, file.filename);
    const stat = fs.statSync(fullPath);
    const ageMs = now - stat.mtimeMs;
    if (!force && ageMs < OUTBOX_RETENTION_MS) continue;

    const archiveName = `${path.basename(file.filename, '.dxf')}-${stat.mtimeMs}.dxf`;
    const archivePath = path.join(outboxArchiveDir(), archiveName);
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
