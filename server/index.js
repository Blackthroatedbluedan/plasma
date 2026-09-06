import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { v4 as uuid } from 'uuid';
import db from './db.js';
import './seed.js';
import { parseDxf, exportNestedDxf } from './dxf.js';
import { nestParts, nestPreviewSvg } from './nesting.js';
import { buildPartsQuery, nextRevision } from './parts.js';
import { diagnoseGeometry, fixGeometry, exportCleanupDxf, CLEANUP_DEFAULTS } from './cleanup.js';
import { MATERIALS, SHEET_PRESETS } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
const exportsDir = path.join(__dirname, '..', 'data', 'exports');
[uploadsDir, exportsDir].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const upload = multer({ dest: uploadsDir });

const app = express();
const PORT = process.env.PORT || 3847;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve built client in production
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// --- Config ---
app.get('/api/config', (_req, res) => {
  res.json({ materials: MATERIALS, sheetPresets: SHEET_PRESETS });
});

// --- Parts / drawing vault ---
app.get('/api/parts', (req, res) => {
  const { sql, params } = buildPartsQuery(req.query);
  const rows = db.prepare(sql).all(...params);
  const parts = rows.map(deserializePart);
  res.json({ parts, total: parts.length });
});

app.get('/api/parts/:id/dxf', (req, res) => {
  const row = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Part not found' });
  if (!row.dxf_path || !fs.existsSync(row.dxf_path)) {
    return res.status(404).json({ error: 'Original DXF file not available for this part' });
  }
  const safeName = (row.name || 'part').replace(/[^\w.-]+/g, '_');
  res.download(row.dxf_path, `${safeName}-rev${row.revision}.dxf`);
});

app.post('/api/parts/:id/revision', upload.single('dxf'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Part not found' });
    if (!req.file) return res.status(400).json({ error: 'DXF file required' });

    const content = fs.readFileSync(req.file.path, 'utf8');
    const geometry = parseDxf(content);
    const revision = req.body.revision?.trim() || nextRevision(existing.revision);

    if (existing.dxf_path && fs.existsSync(existing.dxf_path)) {
      try { fs.unlinkSync(existing.dxf_path); } catch (_) {}
    }

    db.prepare(`
      UPDATE parts SET
        revision = ?, dxf_path = ?, geometry_json = ?, bbox_width = ?, bbox_height = ?,
        notes = COALESCE(?, notes), updated_at = datetime('now')
      WHERE id = ?
    `).run(
      revision, req.file.path, JSON.stringify(geometry), geometry.bbox.width, geometry.bbox.height,
      req.body.notes || null, req.params.id
    );

    res.json(deserializePart(db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id)));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/parts/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Part not found' });
  res.json(deserializePart(row));
});

app.post('/api/parts', upload.single('dxf'), (req, res) => {
  try {
    const { name, material, thickness, notes, qty, revision, customer, job_ref, tags } = req.body;
    if (!name || !material || !thickness) {
      return res.status(400).json({ error: 'name, material, and thickness are required' });
    }

    let geometry = null;
    let dxfPath = null;
    if (req.file) {
      const content = fs.readFileSync(req.file.path, 'utf8');
      geometry = parseDxf(content);
      dxfPath = req.file.path;
    } else if (!req.body.geometry_json) {
      return res.status(400).json({ error: 'DXF file required' });
    } else {
      geometry = JSON.parse(req.body.geometry_json);
    }

    const id = uuid();
    db.prepare(`
      INSERT INTO parts (
        id, name, material, thickness, notes, qty, revision, customer, job_ref, tags,
        dxf_path, geometry_json, bbox_width, bbox_height
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name, material, thickness, notes || '', parseInt(qty) || 1, revision || 'A',
      customer || '', job_ref || '', tags || '',
      dxfPath, JSON.stringify(geometry), geometry.bbox.width, geometry.bbox.height
    );
    const part = db.prepare('SELECT * FROM parts WHERE id = ?').get(id);
    res.status(201).json(deserializePart(part));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/parts/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Part not found' });
  const { name, material, thickness, notes, qty, revision, customer, job_ref, tags } = req.body;
  db.prepare(`
    UPDATE parts SET
      name=?, material=?, thickness=?, notes=?, qty=?, revision=?,
      customer=?, job_ref=?, tags=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    name ?? existing.name, material ?? existing.material, thickness ?? existing.thickness,
    notes ?? existing.notes, qty ?? existing.qty, revision ?? existing.revision,
    customer ?? existing.customer, job_ref ?? existing.job_ref, tags ?? existing.tags,
    req.params.id
  );
  res.json(deserializePart(db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id)));
});

app.delete('/api/parts/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Part not found' });
  if (existing.dxf_path && fs.existsSync(existing.dxf_path)) fs.unlinkSync(existing.dxf_path);
  db.prepare('DELETE FROM parts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Geometry cleanup (optional add-on; does not gate nest/export) ---
function loadPartDxfContent(row) {
  if (row.dxf_path && fs.existsSync(row.dxf_path)) {
    return fs.readFileSync(row.dxf_path, 'utf8');
  }
  if (row.geometry_json) {
    const geom = JSON.parse(row.geometry_json);
    if (geom.polylines?.length) {
      return exportCleanupDxf(geom.polylines);
    }
  }
  return null;
}

app.get('/api/cleanup/defaults', (_req, res) => {
  res.json(CLEANUP_DEFAULTS);
});

app.post('/api/parts/:id/cleanup/diagnose', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Part not found' });
    const content = loadPartDxfContent(row);
    if (!content) return res.status(400).json({ error: 'No DXF geometry available for this part' });
    const { snapTolerance, minSegmentLength } = req.body || {};
    res.json(diagnoseGeometry(content, { snapTolerance, minSegmentLength }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/parts/:id/cleanup/fix', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Part not found' });
    const content = loadPartDxfContent(row);
    if (!content) return res.status(400).json({ error: 'No DXF geometry available for this part' });
    const { snapTolerance, minSegmentLength, actions } = req.body || {};
    const result = fixGeometry(content, { snapTolerance, minSegmentLength, actions });
    res.json({
      ...result,
      beforeDiagnosis: diagnoseGeometry(content, { snapTolerance, minSegmentLength }),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/parts/:id/cleanup/save-revision', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Part not found' });
    const { dxfContent, revision } = req.body || {};
    if (!dxfContent) return res.status(400).json({ error: 'dxfContent is required' });

    const geometry = parseDxf(dxfContent);
    const newRev = revision?.trim() || nextRevision(existing.revision);
    const destPath = path.join(uploadsDir, `${uuid()}.dxf`);
    fs.writeFileSync(destPath, dxfContent);

    if (existing.dxf_path && fs.existsSync(existing.dxf_path)) {
      try { fs.unlinkSync(existing.dxf_path); } catch (_) {}
    }

    db.prepare(`
      UPDATE parts SET
        revision = ?, dxf_path = ?, geometry_json = ?, bbox_width = ?, bbox_height = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      newRev, destPath, JSON.stringify(geometry), geometry.bbox.width, geometry.bbox.height,
      req.params.id
    );

    res.json(deserializePart(db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id)));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// --- Sheets ---
app.get('/api/sheets', (req, res) => {
  const { material, thickness, status, remnant } = req.query;
  let sql = 'SELECT * FROM sheets WHERE 1=1';
  const params = [];
  if (material) { sql += ' AND material = ?'; params.push(material); }
  if (thickness) { sql += ' AND thickness = ?'; params.push(thickness); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (remnant === 'true') sql += ' AND is_remnant = 1';
  if (remnant === 'false') sql += ' AND is_remnant = 0';
  sql += ' ORDER BY is_remnant DESC, material, thickness, width_in DESC';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/sheets', (req, res) => {
  const { material, thickness, width_in, height_in, is_remnant, notes } = req.body;
  if (!material || !thickness || !width_in || !height_in) {
    return res.status(400).json({ error: 'material, thickness, width_in, height_in required' });
  }
  const id = uuid();
  db.prepare(`
    INSERT INTO sheets (id, material, thickness, width_in, height_in, is_remnant, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, material, thickness, width_in, height_in, is_remnant ? 1 : 0, notes || '');
  res.status(201).json(db.prepare('SELECT * FROM sheets WHERE id = ?').get(id));
});

app.put('/api/sheets/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM sheets WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Sheet not found' });
  const { material, thickness, width_in, height_in, is_remnant, status, notes } = req.body;
  db.prepare(`
    UPDATE sheets SET material=?, thickness=?, width_in=?, height_in=?, is_remnant=?, status=?, notes=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    material ?? existing.material, thickness ?? existing.thickness,
    width_in ?? existing.width_in, height_in ?? existing.height_in,
    is_remnant !== undefined ? (is_remnant ? 1 : 0) : existing.is_remnant,
    status ?? existing.status, notes ?? existing.notes, req.params.id
  );
  res.json(db.prepare('SELECT * FROM sheets WHERE id = ?').get(req.params.id));
});

app.delete('/api/sheets/:id', (req, res) => {
  db.prepare('DELETE FROM sheets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// --- Nesting ---
app.post('/api/nest', (req, res) => {
  try {
    const { partIds, quantities, sheetId, kerf, customSheet } = req.body;
    if (!partIds?.length) return res.status(400).json({ error: 'Select at least one part' });

    let sheet;
    if (sheetId) {
      const s = db.prepare('SELECT * FROM sheets WHERE id = ? AND status = ?').get(sheetId, 'available');
      if (!s) return res.status(400).json({ error: 'Sheet not available' });
      sheet = { id: s.id, width: s.width_in, height: s.height_in, material: s.material, thickness: s.thickness };
    } else if (customSheet) {
      sheet = { width: customSheet.width, height: customSheet.height, material: customSheet.material, thickness: customSheet.thickness };
    } else {
      return res.status(400).json({ error: 'Select a sheet or provide custom dimensions' });
    }

    const parts = [];
    for (const pid of partIds) {
      const row = db.prepare('SELECT * FROM parts WHERE id = ?').get(pid);
      if (!row) continue;
      const geom = JSON.parse(row.geometry_json);
      parts.push({
        id: row.id,
        name: row.name,
        polylines: geom.polylines,
        qty: quantities?.[pid] ?? row.qty ?? 1,
      });
    }

    const result = nestParts(parts, sheet, { kerf: kerf ?? 0.125 });
    if (!result.success) return res.status(400).json(result);

    const previewSvg = nestPreviewSvg(result, sheet);
    const jobId = uuid();
    const nestedDxf = exportNestedDxf(result, {
      sheetWidth: sheet.width,
      sheetHeight: sheet.height,
      includeSheetOutline: true,
      kerf: kerf ?? 0.125,
    });
    const dxfPath = path.join(exportsDir, `${jobId}.dxf`);
    fs.writeFileSync(dxfPath, nestedDxf);

    db.prepare(`
      INSERT INTO jobs (id, sheet_id, material, thickness, sheet_width_in, sheet_height_in, parts_json, nest_json, yield_pct, scrap_pct, status, nested_dxf_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      jobId, sheet.id || null, sheet.material || parts[0]?.material, sheet.thickness || parts[0]?.thickness,
      sheet.width, sheet.height, JSON.stringify(partIds.map((id) => ({ id, qty: quantities?.[id] }))),
      JSON.stringify(result), result.yieldPct, result.scrapPct, dxfPath
    );

    res.json({ ...result, jobId, previewSvg, dxfUrl: `/api/jobs/${jobId}/dxf` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Jobs ---
app.get('/api/jobs', (_req, res) => {
  const rows = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 100').all();
  res.json(rows.map((j) => ({ ...j, parts: JSON.parse(j.parts_json), nest: j.nest_json ? JSON.parse(j.nest_json) : null })));
});

app.get('/api/jobs/:id', (req, res) => {
  const j = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!j) return res.status(404).json({ error: 'Job not found' });
  const remnants = db.prepare('SELECT * FROM job_remnants WHERE job_id = ?').all(req.params.id);
  res.json({ ...j, parts: JSON.parse(j.parts_json), nest: JSON.parse(j.nest_json), remnants });
});

app.get('/api/jobs/:id/dxf', (req, res) => {
  const j = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!j?.nested_dxf_path) return res.status(404).json({ error: 'DXF not found' });
  res.download(j.nested_dxf_path, `plasma-nest-${req.params.id.slice(0, 8)}.dxf`);
});

app.post('/api/jobs/:id/confirm', (req, res) => {
  const j = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!j) return res.status(404).json({ error: 'Job not found' });
  if (j.status === 'completed') return res.status(400).json({ error: 'Job already completed' });

  const { remnants } = req.body || {};

  const tx = db.transaction(() => {
    if (j.sheet_id) {
      db.prepare("UPDATE sheets SET status='consumed', updated_at=datetime('now') WHERE id=?").run(j.sheet_id);
    }
    if (remnants?.length) {
      const insert = db.prepare(`
        INSERT INTO job_remnants (id, job_id, width_in, height_in, material, thickness, sheet_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const sheetInsert = db.prepare(`
        INSERT INTO sheets (id, material, thickness, width_in, height_in, is_remnant, status, notes)
        VALUES (?, ?, ?, ?, ?, 1, 'available', ?)
      `);
      for (const r of remnants) {
        const rid = uuid();
        insert.run(rid, j.id, r.width_in, r.height_in, j.material, j.thickness, j.sheet_id);
        const sid = uuid();
        sheetInsert.run(sid, j.material, j.thickness, r.width_in, r.height_in, `Remnant from job ${j.id.slice(0, 8)}`);
      }
    }
    db.prepare("UPDATE jobs SET status='completed', completed_at=datetime('now') WHERE id=?").run(j.id);
  });
  tx();

  res.json(db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id));
});

function deserializePart(row) {
  return {
    ...row,
    geometry: row.geometry_json ? JSON.parse(row.geometry_json) : null,
  };
}

// SPA fallback
if (fs.existsSync(distPath)) {
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Plasma server running on http://localhost:${PORT}`);
});
