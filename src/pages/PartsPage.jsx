import { useState, useEffect } from 'react';
import { api } from '../api';

function PartThumb({ geometry }) {
  if (!geometry?.polylines) return <div className="part-thumb" />;
  const bb = geometry.bbox;
  const scale = 40 / Math.max(bb.width, bb.height, 1);
  const svg = geometry.polylines.map((pl, i) => {
    const pts = pl.map(([x, y]) => `${x * scale},${y * scale}`).join(' ');
    return `<polygon points="${pts}" fill="rgba(74,158,255,0.3)" stroke="#4a9eff" stroke-width="0.5"/>`;
  }).join('');
  return (
    <div className="part-thumb">
      <svg viewBox={`0 0 ${bb.width * scale} ${bb.height * scale}`} width="48" height="48">
        <g dangerouslySetInnerHTML={{ __html: svg }} />
      </svg>
    </div>
  );
}

export default function PartsPage() {
  const [parts, setParts] = useState([]);
  const [config, setConfig] = useState({ materials: {}, sheetPresets: [] });
  const [search, setSearch] = useState('');
  const [filterMat, setFilterMat] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', material: 'Black Steel', thickness: '1/4"', notes: '', qty: 1, revision: 'A' });
  const [dxfFile, setDxfFile] = useState(null);
  const [customMat, setCustomMat] = useState('');
  const [customThick, setCustomThick] = useState('');

  const load = () => {
    const params = {};
    if (search) params.q = search;
    if (filterMat) params.material = filterMat;
    api.getParts(params).then(setParts).catch((e) => setError(e.message));
  };

  useEffect(() => {
    api.getConfig().then(setConfig);
    load();
  }, []);

  useEffect(() => { load(); }, [search, filterMat]);

  const material = customMat || form.material;
  const thickness = customThick || form.thickness;
  const gauges = config.materials[material] || [];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!dxfFile) { setError('Select a DXF file'); return; }
    const fd = new FormData();
    fd.append('dxf', dxfFile);
    fd.append('name', form.name);
    fd.append('material', material);
    fd.append('thickness', thickness);
    fd.append('notes', form.notes);
    fd.append('qty', form.qty);
    fd.append('revision', form.revision);
    try {
      await api.createPart(fd);
      setShowForm(false);
      setForm({ name: '', material: 'Black Steel', thickness: '1/4"', notes: '', qty: 1, revision: 'A' });
      setDxfFile(null);
      setCustomMat('');
      setCustomThick('');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this part?')) return;
    await api.deletePart(id);
    load();
  };

  return (
    <div>
      <h2 className="page-title">Part Library</h2>
      <p className="page-desc">Import DXF parts with material, thickness, and qty. Export nested layouts to FlashCut.</p>

      <div className="toolbar">
        <input placeholder="Search parts…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select value={filterMat} onChange={(e) => setFilterMat(e.target.value)}>
          <option value="">All materials</option>
          {Object.keys(config.materials).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Import DXF</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Import DXF Part</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <label>DXF File</label>
                <input type="file" accept=".dxf" onChange={(e) => setDxfFile(e.target.files[0])} required />
              </div>
              <div className="form-row">
                <label>Part Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="grid-2">
                <div className="form-row">
                  <label>Material</label>
                  <select value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })}>
                    {Object.keys(config.materials).map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <input placeholder="Or custom material…" value={customMat} onChange={(e) => setCustomMat(e.target.value)} style={{ marginTop: 4 }} />
                </div>
                <div className="form-row">
                  <label>Thickness</label>
                  <select value={form.thickness} onChange={(e) => setForm({ ...form, thickness: e.target.value })}>
                    {(gauges.length ? gauges : ['custom']).map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <input placeholder="Or custom thickness…" value={customThick} onChange={(e) => setCustomThick(e.target.value)} style={{ marginTop: 4 }} />
                </div>
              </div>
              <div className="grid-2">
                <div className="form-row">
                  <label>Qty</label>
                  <input type="number" min="1" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
                </div>
                <div className="form-row">
                  <label>Revision</label>
                  <input value={form.revision} onChange={(e) => setForm({ ...form, revision: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <label>Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 0.5, marginTop: 1 }}>
                <button type="submit" className="btn btn-primary">Import</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        {parts.length === 0 ? (
          <div className="empty">No parts yet. Import a DXF to get started — try the samples in <code>samples/</code>.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Name</th>
                <th>Material</th>
                <th>Thickness</th>
                <th>Size (in)</th>
                <th>Qty</th>
                <th>Rev</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id}>
                  <td><PartThumb geometry={p.geometry} /></td>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.material}</td>
                  <td>{p.thickness}</td>
                  <td>{p.bbox_width?.toFixed(2)} × {p.bbox_height?.toFixed(2)}</td>
                  <td>{p.qty}</td>
                  <td>{p.revision}</td>
                  <td style={{ color: 'var(--muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.notes}</td>
                  <td>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
