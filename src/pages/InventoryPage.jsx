import { useState, useEffect } from 'react';
import { api } from '../api';

export default function InventoryPage() {
  const [sheets, setSheets] = useState([]);
  const [config, setConfig] = useState({ materials: {}, sheetPresets: [] });
  const [filterMat, setFilterMat] = useState('');
  const [filterThick, setFilterThick] = useState('');
  const [filterStatus, setFilterStatus] = useState('available');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    material: 'Black Steel', thickness: '1/4"', width_in: 60, height_in: 120, is_remnant: false, notes: '',
  });
  const [customMat, setCustomMat] = useState('');
  const [customThick, setCustomThick] = useState('');
  const [useCustomSize, setUseCustomSize] = useState(false);

  const load = () => {
    const params = {};
    if (filterMat) params.material = filterMat;
    if (filterThick) params.thickness = filterThick;
    if (filterStatus) params.status = filterStatus;
    api.getSheets(params).then(setSheets);
  };

  useEffect(() => {
    api.getConfig().then(setConfig);
    load();
  }, []);

  useEffect(() => { load(); }, [filterMat, filterThick, filterStatus]);

  const applyPreset = (preset) => {
    setForm({ ...form, width_in: preset.width, height_in: preset.height });
    setUseCustomSize(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.createSheet({
      ...form,
      material: customMat || form.material,
      thickness: customThick || form.thickness,
    });
    setShowForm(false);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this sheet from inventory?')) return;
    await api.deleteSheet(id);
    load();
  };

  const gauges = config.materials[form.material] || [];

  return (
    <div>
      <h2 className="page-title">Sheet &amp; Remnant Inventory</h2>
      <p className="page-desc">Full sheets and rectangular remnants. Presets are shortcuts — any custom W×L is allowed.</p>

      <div className="toolbar">
        <select value={filterMat} onChange={(e) => setFilterMat(e.target.value)}>
          <option value="">All materials</option>
          {Object.keys(config.materials).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filterThick} onChange={(e) => setFilterThick(e.target.value)}>
          <option value="">All thicknesses</option>
          {[...new Set(Object.values(config.materials).flat())].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All status</option>
          <option value="available">Available</option>
          <option value="consumed">Consumed</option>
        </select>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Add Stock</button>
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add Sheet / Remnant</h2>
            <form onSubmit={handleSubmit}>
              <div className="grid-2">
                <div className="form-row">
                  <label>Material</label>
                  <select value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })}>
                    {Object.keys(config.materials).map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <input placeholder="Or custom…" value={customMat} onChange={(e) => setCustomMat(e.target.value)} style={{ marginTop: 4 }} />
                </div>
                <div className="form-row">
                  <label>Thickness</label>
                  <select value={form.thickness} onChange={(e) => setForm({ ...form, thickness: e.target.value })}>
                    {gauges.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <input placeholder="Or custom…" value={customThick} onChange={(e) => setCustomThick(e.target.value)} style={{ marginTop: 4 }} />
                </div>
              </div>
              <div className="form-row">
                <label>Size Preset</label>
                <div style={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {config.sheetPresets?.map((p) => (
                    <button key={p.label} type="button" className="btn btn-ghost btn-sm" onClick={() => applyPreset(p)}>
                      {p.label} ({p.width}"×{p.height}")
                    </button>
                  ))}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUseCustomSize(true)}>Custom</button>
                </div>
              </div>
              {(useCustomSize || true) && (
                <div className="form-inline">
                  <div className="form-row">
                    <label>Width (in)</label>
                    <input type="number" step="0.125" value={form.width_in} onChange={(e) => setForm({ ...form, width_in: +e.target.value })} />
                  </div>
                  <div className="form-row">
                    <label>Height (in)</label>
                    <input type="number" step="0.125" value={form.height_in} onChange={(e) => setForm({ ...form, height_in: +e.target.value })} />
                  </div>
                </div>
              )}
              <div className="checkbox-row">
                <input type="checkbox" id="remnant" checked={form.is_remnant} onChange={(e) => setForm({ ...form, is_remnant: e.target.checked })} />
                <label htmlFor="remnant">This is a remnant</label>
              </div>
              <div className="form-row">
                <label>Notes</label>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 0.5, marginTop: 1 }}>
                <button type="submit" className="btn btn-primary">Add</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Material</th>
              <th>Thickness</th>
              <th>Size (W×H in)</th>
              <th>Type</th>
              <th>Status</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sheets.map((s) => (
              <tr key={s.id}>
                <td>{s.material}</td>
                <td>{s.thickness}</td>
                <td>{s.width_in}" × {s.height_in}"</td>
                <td>
                  {s.is_remnant ? <span className="badge badge-remnant">Remnant</span> : <span className="badge">Full Sheet</span>}
                </td>
                <td>
                  <span className={`badge badge-${s.status}`}>{s.status}</span>
                </td>
                <td style={{ color: 'var(--muted)' }}>{s.notes}</td>
                <td>
                  {s.status === 'available' && (
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>Remove</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sheets.length === 0 && <div className="empty">No sheets match filters.</div>}
      </div>
    </div>
  );
}
