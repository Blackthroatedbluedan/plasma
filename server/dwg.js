/**
 * DWG → DXF conversion via LibreDWG (WebAssembly, @mlightcad/libredwg-web).
 * No separate Autodesk install required on Windows shop laptops.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LibreDwg } from '@mlightcad/libredwg-web';

let libredwgPromise = null;
let wasmDirResolved = null;
let initError = null;

function candidateWasmDirs() {
  const dirs = [];
  if (process.env.PLASMA_LIBREDWG_WASM_DIR) {
    dirs.push(process.env.PLASMA_LIBREDWG_WASM_DIR);
  }
  try {
    const distPath = fileURLToPath(import.meta.resolve('@mlightcad/libredwg-web'));
    dirs.push(path.join(path.dirname(distPath), '../wasm'));
  } catch (_) {
    /* package missing */
  }
  const resourcesPath = process.resourcesPath;
  if (resourcesPath) {
    dirs.push(path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', '@mlightcad', 'libredwg-web', 'wasm'));
    dirs.push(path.join(resourcesPath, 'node_modules', '@mlightcad', 'libredwg-web', 'wasm'));
  }
  return dirs;
}

export function resolveLibreDwgWasmDir() {
  if (wasmDirResolved) return wasmDirResolved;
  for (const dir of candidateWasmDirs()) {
    const normalized = path.resolve(dir);
    const wasmFile = path.join(normalized, 'libredwg-web.wasm');
    if (fs.existsSync(wasmFile)) {
      wasmDirResolved = normalized + path.sep;
      return wasmDirResolved;
    }
  }
  return null;
}

export function getDwgConversionStatus() {
  if (initError) {
    return { available: false, error: initError.message };
  }
  const dir = resolveLibreDwgWasmDir();
  if (!dir) {
    return {
      available: false,
      error: 'DWG converter WASM bundle not found (reinstall Plasma or contact support).',
    };
  }
  return { available: true, wasmDir: dir };
}

async function getLibreDwg() {
  if (libredwgPromise) return libredwgPromise;
  libredwgPromise = (async () => {
    const wasmDir = resolveLibreDwgWasmDir();
    if (!wasmDir) {
      throw new Error(getDwgConversionStatus().error);
    }
    try {
      return await LibreDwg.create(wasmDir);
    } catch (e) {
      initError = e;
      libredwgPromise = null;
      throw e;
    }
  })();
  return libredwgPromise;
}

/**
 * Convert a DWG file buffer to UTF-8 DXF text.
 * @param {Buffer|Uint8Array|ArrayBuffer} fileContent
 * @returns {Promise<string>}
 */
export async function convertDwgToDxfText(fileContent) {
  const libredwg = await getLibreDwg();
  const bytes = fileContent instanceof Buffer ? fileContent : Buffer.from(fileContent);
  const out = libredwg.dwg_write_dxf(bytes);
  if (!out || out.length === 0) {
    throw new Error(
      'Could not convert DWG to DXF (unsupported or corrupt drawing). Try Save As DXF in AutoCAD, or re-export from the source CAD file.',
    );
  }
  return Buffer.from(out).toString('utf8');
}

export function isDwgFilename(filename) {
  return path.extname(filename).toLowerCase() === '.dwg';
}

export function isInboxCadFilename(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ext === '.dxf' || ext === '.dwg';
}
