#!/usr/bin/env node
/**
 * Unit checks for desktop link helpers (junction path matching; runs on Linux CI).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  junctionPointsAt,
  pathsEqual,
} = require('../electron/desktop-links.cjs');

const root = path.dirname(fileURLToPath(import.meta.url));

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plasma-links-'));
const target = path.join(tmp, 'inbox-real');
fs.mkdirSync(target, { recursive: true });
const link = path.join(tmp, 'Plasma Inbox');

assert(pathsEqual('/tmp/A', '/tmp/a') === true, 'pathsEqual case-insensitive');

fs.symlinkSync(target, link, 'dir');
assert(junctionPointsAt(link, target) === true, 'junctionPointsAt matches correct target');
assert(junctionPointsAt(link, path.join(tmp, 'other')) === false, 'junctionPointsAt rejects wrong target');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('test-desktop-links: OK');
