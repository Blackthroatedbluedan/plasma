#!/usr/bin/env node
/**
 * Convert fixture DWGs to DXF and run inbox import against a temp data dir.
 * Usage: node scripts/test-dwg-inbox.mjs
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = path.join(root, 'fixtures', 'dwg-samples');

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plasma-dwg-test-'));
  process.env.PLASMA_DATA_DIR = dataDir;

  const inbox = path.join(dataDir, 'inbox');
  fs.mkdirSync(inbox, { recursive: true });

  const dwgs = fs.readdirSync(fixturesDir).filter((f) => f.endsWith('.dwg'));
  if (!dwgs.length) {
    console.error('No .dwg fixtures in', fixturesDir);
    process.exit(1);
  }

  for (const name of dwgs) {
    fs.copyFileSync(path.join(fixturesDir, name), path.join(inbox, name));
  }

  const { getDwgConversionStatus, convertDwgToDxfText } = await import('../server/dwg.js');
  const { parseDxf } = await import('../server/dxf.js');
  const status = getDwgConversionStatus();
  if (!status.available) {
    console.error('DWG conversion not available:', status.error);
    process.exit(1);
  }

  console.log('DWG conversion OK (wasm:', status.wasmDir, ')');
  let failed = 0;
  for (const name of dwgs) {
    const buf = fs.readFileSync(path.join(inbox, name));
    try {
      const dxf = await convertDwgToDxfText(buf);
      const geom = parseDxf(dxf);
      console.log(`  ${name}: DXF ${dxf.length} chars, bbox ${geom.bbox.width.toFixed(2)}×${geom.bbox.height.toFixed(2)}`);
    } catch (e) {
      failed += 1;
      console.error(`  ${name}: FAIL`, e.message);
    }
  }

  const dbMod = await import('../server/db.js');
  const db = dbMod.default;
  const { autoImportInbox } = await import('../server/inbox.js');
  const result = await autoImportInbox(db);
  console.log('Auto-import:', result.imported.length, 'imported,', result.errors.length, 'errors');
  if (result.errors.length) {
    for (const err of result.errors) console.error(' ', err.filename, err.error);
    failed += result.errors.length;
  }

  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
