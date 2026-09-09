import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { parseDxf } from './dxf.js';
import { ensureOutboxDirs } from './outbox.js';
import { getDataDir, ensureDataSubdir } from './paths.js';

function inboxDir() {
  return path.join(getDataDir(), 'inbox');
}

function inboxProcessedDir() {
  return path.join(inboxDir(), 'processed');
}
export const INBOX_POLL_MS = 5000;

export function ensureInboxOutboxDirs() {
  ensureOutboxDirs();
  ensureDataSubdir('inbox');
  ensureDataSubdir('inbox', 'processed');
}

export function listInboxFiles() {
  ensureInboxOutboxDirs();
  const dir = inboxDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.dxf'))
    .map((e) => {
      const fullPath = path.join(dir, e.name);
      const stat = fs.statSync(fullPath);
      return {
        filename: e.name,
        name: nameFromFilename(e.name),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

export function nameFromFilename(filename) {
  return path.basename(filename, path.extname(filename))
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function moveToProcessed(filename) {
  const src = path.join(inboxDir(), filename);
  if (!fs.existsSync(src)) return;
  ensureInboxOutboxDirs();
  const dest = path.join(inboxProcessedDir(), filename);
  let finalDest = dest;
  if (fs.existsSync(dest)) {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    finalDest = path.join(inboxProcessedDir(), `${base}-${Date.now()}${ext}`);
  }
  fs.renameSync(src, finalDest);
}

export function importInboxFile(db, filename, { material = 'Black Steel', thickness = '1/4"', moveAfter = true } = {}) {
  const src = path.join(inboxDir(), filename);
  if (!fs.existsSync(src)) {
    throw new Error(`File not found in inbox: ${filename}`);
  }
  if (!filename.toLowerCase().endsWith('.dxf')) {
    throw new Error('Only .dxf files can be imported');
  }

  const content = fs.readFileSync(src, 'utf8');
  const geometry = parseDxf(content);
  const name = nameFromFilename(filename);
  const id = uuid();
  const destPath = path.join(ensureDataSubdir('uploads'), `${id}.dxf`);
  fs.copyFileSync(src, destPath);

  db.prepare(`
    INSERT INTO parts (
      id, name, material, thickness, notes, qty, revision, customer, job_ref, tags,
      dxf_path, geometry_json, bbox_width, bbox_height
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, name, material, thickness, `Imported from inbox: ${filename}`, 1, 'A',
    '', '', 'inbox',
    destPath, JSON.stringify(geometry), geometry.bbox.width, geometry.bbox.height
  );

  if (moveAfter) {
    try { moveToProcessed(filename); } catch (_) {}
  }

  return db.prepare('SELECT * FROM parts WHERE id = ?').get(id);
}

export function listRecentProcessed(limit = 10) {
  ensureInboxOutboxDirs();
  const processedDir = inboxProcessedDir();
  if (!fs.existsSync(processedDir)) return [];
  return fs.readdirSync(processedDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.dxf'))
    .map((e) => {
      const fullPath = path.join(processedDir, e.name);
      const stat = fs.statSync(fullPath);
      return {
        filename: e.name,
        name: nameFromFilename(e.name),
        size: stat.size,
        processedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt))
    .slice(0, limit);
}

/**
 * Auto-import every DXF sitting in data/inbox/. Called on poll interval and app boot.
 */
export function autoImportInbox(db, { material = 'Black Steel', thickness = '1/4"' } = {}) {
  const pending = listInboxFiles();
  const imported = [];
  const errors = [];

  for (const { filename } of pending) {
    try {
      const row = importInboxFile(db, filename, { material, thickness, moveAfter: true });
      imported.push({
        filename,
        partId: row.id,
        name: row.name,
      });
    } catch (e) {
      errors.push({ filename, error: e.message });
    }
  }

  return { imported, errors, pending: listInboxFiles() };
}

export function startInboxWatcher(db) {
  ensureInboxOutboxDirs();
  autoImportInbox(db);
  return setInterval(() => {
    try {
      autoImportInbox(db);
    } catch (e) {
      console.error('[inbox] auto-import error:', e.message);
    }
  }, INBOX_POLL_MS);
}
