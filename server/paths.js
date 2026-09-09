import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Root data directory: plasma.db, inbox/, outbox/, uploads/, exports/.
 * Override with PLASMA_DATA_DIR (Electron sets this to %APPDATA%/Plasma/data).
 */
export function getDataDir() {
  if (process.env.PLASMA_DATA_DIR) {
    return path.resolve(process.env.PLASMA_DATA_DIR);
  }
  return path.join(__dirname, '..', 'data');
}

export function getProjectRoot() {
  return path.join(__dirname, '..');
}

export function getDistPath() {
  return path.join(getProjectRoot(), 'dist');
}

export function ensureDataSubdir(...parts) {
  const dir = path.join(getDataDir(), ...parts);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
