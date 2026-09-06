import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'plasma.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS parts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    material TEXT NOT NULL,
    thickness TEXT NOT NULL,
    notes TEXT DEFAULT '',
    qty INTEGER DEFAULT 1,
    revision TEXT DEFAULT 'A',
    dxf_path TEXT,
    geometry_json TEXT,
    bbox_width REAL,
    bbox_height REAL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sheets (
    id TEXT PRIMARY KEY,
    material TEXT NOT NULL,
    thickness TEXT NOT NULL,
    width_in REAL NOT NULL,
    height_in REAL NOT NULL,
    is_remnant INTEGER DEFAULT 0,
    status TEXT DEFAULT 'available',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    sheet_id TEXT,
    material TEXT NOT NULL,
    thickness TEXT NOT NULL,
    sheet_width_in REAL NOT NULL,
    sheet_height_in REAL NOT NULL,
    parts_json TEXT NOT NULL,
    nest_json TEXT,
    yield_pct REAL,
    scrap_pct REAL,
    status TEXT DEFAULT 'pending',
    nested_dxf_path TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY (sheet_id) REFERENCES sheets(id)
  );

  CREATE TABLE IF NOT EXISTS job_remnants (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    width_in REAL NOT NULL,
    height_in REAL NOT NULL,
    material TEXT NOT NULL,
    thickness TEXT NOT NULL,
    sheet_id TEXT,
    FOREIGN KEY (job_id) REFERENCES jobs(id),
    FOREIGN KEY (sheet_id) REFERENCES sheets(id)
  );
`);

export default db;
