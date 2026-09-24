#!/usr/bin/env node
/**
 * DWG inbox import: conversion, vault naming, and nest readiness.
 * Usage: node scripts/test-dwg-inbox.mjs
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = path.join(root, 'fixtures', 'dwg-samples');

function assert(cond, message) {
  if (!cond) {
    console.error('ASSERT:', message);
    process.exitCode = 1;
    return false;
  }
  return true;
}

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
    const shopName = `KLFS-Bracket-${name.slice(0, 6)}.dwg`;
    fs.copyFileSync(path.join(fixturesDir, name), path.join(inbox, shopName));
  }

  const { getDwgConversionStatus, convertDwgToDxfText } = await import('../server/dwg.js');
  const { parseDxf, partNameFromFilename } = await import('../server/dxf.js');
  const status = getDwgConversionStatus();
  if (!status.available) {
    console.error('DWG conversion not available:', status.error);
    process.exit(1);
  }

  console.log('DWG conversion OK (wasm:', status.wasmDir, ')');
  let failed = process.exitCode || 0;

  for (const name of dwgs) {
    const shopName = `KLFS-Bracket-${name.slice(0, 6)}.dwg`;
    assert(
      partNameFromFilename(shopName) === `KLFS-Bracket-${name.slice(0, 6)}`,
      `partNameFromFilename preserves shop basename for ${shopName}`,
    );
    const buf = fs.readFileSync(path.join(inbox, shopName));
    try {
      const dxf = await convertDwgToDxfText(buf);
      const geom = parseDxf(dxf);
      console.log(
        `  ${shopName}: bbox ${geom.bbox.width.toFixed(2)}×${geom.bbox.height.toFixed(2)} in, ${geom.polylines.length} loops`,
      );
      if (geom.bbox.width < 1e-6 || geom.bbox.height < 1e-6) {
        console.error(`  ${shopName}: invalid bbox`);
        failed = 1;
      }
    } catch (e) {
      failed = 1;
      console.error(`  ${shopName}: FAIL`, e.message);
    }
  }

  const dbMod = await import('../server/db.js');
  const db = dbMod.default;
  const { autoImportInbox } = await import('../server/inbox.js');
  const { nestParts } = await import('../server/nesting.js');
  const result = await autoImportInbox(db);
  console.log('Auto-import:', result.imported.length, 'imported,', result.errors.length, 'errors');
  if (result.errors.length) {
    for (const err of result.errors) console.error(' ', err.filename, err.error);
    failed = 1;
  }

  for (const row of result.imported) {
    const expected = partNameFromFilename(row.filename);
    if (!assert(row.name === expected, `vault name ${row.name} should be ${expected}`)) {
      failed = 1;
    }
  }

  const sheet = { width: 60, height: 120 };
  const first = db.prepare('SELECT * FROM parts ORDER BY created_at ASC LIMIT 1').get();
  if (first) {
    const geom = JSON.parse(first.geometry_json);
    const nest = nestParts(
      [{ id: first.id, name: first.name, polylines: geom.polylines, qty: 1 }],
      sheet,
      { kerf: 0.125 },
    );
    assert(nest.success, `converted DWG part "${first.name}" should nest on 60×120 sheet`);
    if (!nest.success) failed = 1;
    else console.log(`Nest OK for "${first.name}" on 60×120 (${nest.placements.length} placement)`);
  }

  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
