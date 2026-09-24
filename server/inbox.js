import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { parseDxf, partNameFromFilename } from './dxf.js';
import { ensureOutboxDirs } from './outbox.js';
import { getDataDir, ensureDataSubdir } from './paths.js';
import {
  convertDwgToDxfText,
  getDwgConversionStatus,
  isDwgFilename,
  isInboxCadFilename,
} from './dwg.js';

function inboxDir() {
  return path.join(getDataDir(), 'inbox');
}

function inboxProcessedDir() {
  return path.join(inboxDir(), 'processed');
}
export const INBOX_POLL_MS = 5000;

/** Last auto-import errors (filename → message) for UI surfacing */
let lastImportErrors = [];

export function getLastImportErrors() {
  return lastImportErrors;
}

export function ensureInboxOutboxDirs() {
  ensureOutboxDirs();
  ensureDataSubdir('inbox');
  ensureDataSubdir('inbox', 'processed');
}

export function listInboxFiles() {
  ensureInboxOutboxDirs();
  const dir = inboxDir();
  if (!fs.existsSync(dir)) return [];
  const errorByFile = new Map(lastImportErrors.map((e) => [e.filename, e.error]));
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && isInboxCadFilename(e.name))
    .map((e) => {
      const fullPath = path.join(dir, e.name);
      const stat = fs.statSync(fullPath);
      const ext = path.extname(e.name).toLowerCase();
      return {
        filename: e.name,
        name: nameFromFilename(e.name),
        format: ext === '.dwg' ? 'dwg' : 'dxf',
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        importError: errorByFile.get(e.name) || null,
      };
    })
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

/** @deprecated Use partNameFromFilename from dxf.js */
export function nameFromFilename(filename) {
  return partNameFromFilename(filename);
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

async function readInboxDxfContent(filename) {
  const src = path.join(inboxDir(), filename);
  if (!filename.toLowerCase().endsWith('.dxf') && !isDwgFilename(filename)) {
    throw new Error('Only .dwg and .dxf files can be imported');
  }
  if (isDwgFilename(filename)) {
    const status = getDwgConversionStatus();
    if (!status.available) {
      throw new Error(status.error || 'DWG conversion is not available on this system');
    }
    const buf = fs.readFileSync(src);
    return {
      dxfText: await convertDwgToDxfText(buf),
      sourceNote: `${filename} (converted from DWG)`,
    };
  }
  return {
    dxfText: fs.readFileSync(src, 'utf8'),
    sourceNote: filename,
  };
}

export async function importInboxFile(db, filename, { material = 'Black Steel', thickness = '1/4"', moveAfter = true } = {}) {
  const src = path.join(inboxDir(), filename);
  if (!fs.existsSync(src)) {
    throw new Error(`File not found in inbox: ${filename}`);
  }
  if (!isInboxCadFilename(filename)) {
    throw new Error('Only .dwg and .dxf files can be imported');
  }

  const { dxfText, sourceNote } = await readInboxDxfContent(filename);
  const geometry = parseDxf(dxfText);
  const name = partNameFromFilename(filename);
  const id = uuid();
  const destPath = path.join(ensureDataSubdir('uploads'), `${id}.dxf`);
  fs.writeFileSync(destPath, dxfText, 'utf8');

  db.prepare(`
    INSERT INTO parts (
      id, name, material, thickness, notes, qty, revision, customer, job_ref, tags,
      dxf_path, geometry_json, bbox_width, bbox_height
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, name, material, thickness, `Imported from inbox: ${sourceNote}`, 1, 'A',
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
    .filter((e) => e.isFile() && isInboxCadFilename(e.name))
    .map((e) => {
      const fullPath = path.join(processedDir, e.name);
      const stat = fs.statSync(fullPath);
      const ext = path.extname(e.name).toLowerCase();
      return {
        filename: e.name,
        name: nameFromFilename(e.name),
        format: ext === '.dwg' ? 'dwg' : 'dxf',
        size: stat.size,
        processedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.processedAt) - new Date(a.processedAt))
    .slice(0, limit);
}

/**
 * Auto-import every DWG/DXF sitting in data/inbox/. Called on poll interval and app boot.
 */
export async function autoImportInbox(db, { material = 'Black Steel', thickness = '1/4"' } = {}) {
  const pending = listInboxFiles();
  const imported = [];
  const errors = [];

  for (const { filename } of pending) {
    try {
      const row = await importInboxFile(db, filename, { material, thickness, moveAfter: true });
      imported.push({
        filename,
        partId: row.id,
        name: row.name,
      });
    } catch (e) {
      errors.push({ filename, error: e.message });
    }
  }

  lastImportErrors = errors;
  return { imported, errors, pending: listInboxFiles() };
}

export function startInboxWatcher(db) {
  ensureInboxOutboxDirs();
  autoImportInbox(db).catch((e) => {
    console.error('[inbox] auto-import error:', e.message);
  });
  return setInterval(() => {
    autoImportInbox(db).catch((e) => {
      console.error('[inbox] auto-import error:', e.message);
    });
  }, INBOX_POLL_MS);
}
