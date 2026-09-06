import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';
import { parseDxf } from './dxf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const MATERIALS = {
  'Galvanized': ['10ga', '12ga', '14ga'],
  'Black Steel': ['3/4"', '1/2"', '3/8"', '1/4"', '3/16"', '10ga'],
  'Checker Plate': ['3/16"', '10ga'],
};

export const SHEET_PRESETS = [
  { label: '5×10 ft', width: 60, height: 120 },
  { label: '4×8 ft', width: 48, height: 96 },
];

function seedSheets() {
  const count = db.prepare('SELECT COUNT(*) as c FROM sheets').get().c;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO sheets (id, material, thickness, width_in, height_in, is_remnant, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, 'available', ?)
  `);

  const sheets = [
    // Galvanized 5×10
    ...['10ga', '12ga', '14ga'].flatMap((t) =>
      Array.from({ length: t === '12ga' ? 4 : 2 }, () => ({
        material: 'Galvanized', thickness: t, w: 60, h: 120,
      }))
    ),
    // Black Steel 5×10 common gauges
    ...['1/4"', '3/16"', '10ga', '3/8"', '1/2"'].flatMap((t) =>
      Array.from({ length: t === '1/4"' ? 5 : t === '3/16"' ? 4 : 2 }, () => ({
        material: 'Black Steel', thickness: t, w: 60, h: 120,
      }))
    ),
    // Black Steel 3/4" — fewer full sheets
    { material: 'Black Steel', thickness: '3/4"', w: 60, h: 120 },
    { material: 'Black Steel', thickness: '3/4"', w: 60, h: 120 },
    // Checker Plate
    { material: 'Checker Plate', thickness: '3/16"', w: 60, h: 120 },
    { material: 'Checker Plate', thickness: '3/16"', w: 60, h: 120 },
    { material: 'Checker Plate', thickness: '10ga', w: 60, h: 120 },
    // Rare 4×8
    { material: 'Black Steel', thickness: '1/4"', w: 48, h: 96 },
    { material: 'Galvanized', thickness: '12ga', w: 48, h: 96 },
    // Remnants
    { material: 'Black Steel', thickness: '1/4"', w: 36, h: 48, remnant: true, notes: 'Off 5×10 — good for brackets' },
    { material: 'Black Steel', thickness: '3/16"', w: 24, h: 60, remnant: true, notes: 'Strip remnant' },
    { material: 'Galvanized', thickness: '12ga', w: 30, h: 40, remnant: true, notes: 'Galv remnant' },
    { material: 'Black Steel', thickness: '10ga', w: 18, h: 42, remnant: true, notes: 'Small remnant' },
    { material: 'Black Steel', thickness: '1/4"', w: 48, h: 30, remnant: true, notes: 'Half-width remnant' },
  ];

  const tx = db.transaction(() => {
    for (const s of sheets) {
      insert.run(
        uuid(),
        s.material,
        s.thickness,
        s.w,
        s.h,
        s.remnant ? 1 : 0,
        s.notes || ''
      );
    }
  });
  tx();
  console.log(`Seeded ${sheets.length} sheets/remnants`);
}

function seedDemoParts() {
  const count = db.prepare('SELECT COUNT(*) as c FROM parts').get().c;
  if (count > 0) return;

  const samples = [
    { file: 'bracket-6x4.dxf', name: 'Bracket 6×4', material: 'Black Steel', thickness: '1/4"', qty: 4, revision: 'A' },
    { file: 'plate-8x8.dxf', name: 'Plate 8×8', material: 'Black Steel', thickness: '1/4"', qty: 2, revision: 'B' },
    { file: 'gusset-pair.dxf', name: 'Gusset Pair', material: 'Black Steel', thickness: '3/16"', qty: 6, revision: 'A' },
    { file: 'washer-4in.dxf', name: 'Washer 4"', material: 'Black Steel', thickness: '1/4"', qty: 12, revision: 'A' },
  ];

  const insert = db.prepare(`
    INSERT INTO parts (id, name, material, thickness, notes, qty, revision, geometry_json, bbox_width, bbox_height)
    VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?)
  `);

  const samplesDir = path.join(__dirname, '..', 'samples');
  const tx = db.transaction(() => {
    for (const s of samples) {
      const filePath = path.join(samplesDir, s.file);
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      const geometry = parseDxf(content);
      insert.run(
        uuid(), s.name, s.material, s.thickness, s.qty, s.revision,
        JSON.stringify(geometry), geometry.bbox.width, geometry.bbox.height
      );
    }
  });
  tx();
  console.log('Seeded demo parts from samples/');
}

seedSheets();
seedDemoParts();
