import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { parseDxf } from './dxf.js';

export const INBOX_DIR = path.join(process.cwd(), 'data', 'inbox');
export const INBOX_PROCESSED_DIR = path.join(INBOX_DIR, 'processed');
export const OUTBOX_DIR = path.join(process.cwd(), 'data', 'outbox');

export function ensureInboxOutboxDirs() {
  [INBOX_DIR, INBOX_PROCESSED_DIR, OUTBOX_DIR].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

export function listInboxFiles() {
  ensureInboxOutboxDirs();
  if (!fs.existsSync(INBOX_DIR)) return [];
  return fs.readdirSync(INBOX_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.dxf'))
    .map((e) => {
      const fullPath = path.join(INBOX_DIR, e.name);
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
  const src = path.join(INBOX_DIR, filename);
  if (!fs.existsSync(src)) return;
  ensureInboxOutboxDirs();
  const dest = path.join(INBOX_PROCESSED_DIR, filename);
  let finalDest = dest;
  if (fs.existsSync(dest)) {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    finalDest = path.join(INBOX_PROCESSED_DIR, `${base}-${Date.now()}${ext}`);
  }
  fs.renameSync(src, finalDest);
}

export function importInboxFile(db, filename, { material = 'Black Steel', thickness = '1/4"', moveAfter = true } = {}) {
  const src = path.join(INBOX_DIR, filename);
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
  const destPath = path.join(process.cwd(), 'data', 'uploads', `${id}.dxf`);
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

export function writeToOutbox(jobId, dxfContent) {
  ensureInboxOutboxDirs();
  const outName = `nest-${jobId.slice(0, 8)}-ready.dxf`;
  const outPath = path.join(OUTBOX_DIR, outName);
  fs.writeFileSync(outPath, dxfContent);
  return { path: outPath, filename: outName };
}
