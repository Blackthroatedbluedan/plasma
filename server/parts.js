/**
 * Parts / drawing vault query helpers.
 */

export function buildPartsQuery(query = {}) {
  const { q, material, thickness, sort = 'recent' } = query;
  let sql = 'SELECT * FROM parts WHERE 1=1';
  const params = [];

  if (q && String(q).trim()) {
    const like = `%${String(q).trim()}%`;
    sql += ` AND (
      name LIKE ? OR notes LIKE ? OR revision LIKE ? OR material LIKE ? OR thickness LIKE ?
      OR customer LIKE ? OR job_ref LIKE ? OR tags LIKE ?
    )`;
    params.push(like, like, like, like, like, like, like, like);
  }
  if (material) { sql += ' AND material = ?'; params.push(material); }
  if (thickness) { sql += ' AND thickness = ?'; params.push(thickness); }

  if (sort === 'name') {
    sql += ' ORDER BY name COLLATE NOCASE ASC';
  } else {
    sql += ' ORDER BY updated_at DESC';
  }

  return { sql, params };
}

export function nextRevision(current) {
  const rev = (current || 'A').trim();
  if (/^\d+$/.test(rev)) return String(parseInt(rev, 10) + 1);
  const last = rev.slice(-1);
  if (/[A-Z]/.test(last) && last < 'Z') {
    return rev.slice(0, -1) + String.fromCharCode(last.charCodeAt(0) + 1);
  }
  return `${rev}-2`;
}
