import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function PartThumb({ geometry }) {
  if (!geometry?.polylines) return <div className="part-thumb" />;
  const bb = geometry.bbox;
  const scale = 40 / Math.max(bb.width, bb.height, 1);
  const svg = geometry.polylines.map((pl) => {
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

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function PartsPage() {
  const navigate = useNavigate();
  const [parts, setParts] = useState([]);
  const [total, setTotal] = useState(0);
  const [config, setConfig] = useState({ materials: {}, sheetPresets: [] });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [filterMat, setFilterMat] = useState('');
  const [sort, setSort] = useState('recent');
  const [selected, setSelected] = useState({});
  const [showForm, setShowForm] = useState(false);
  const [revisePart, setRevisePart] = useState(null);
  const [error, setError] = useState('');
  const [highlightId, setHighlightId] = useState(null);
  const [form, setForm] = useState({
    name: '', material: 'Black Steel', thickness: '1/4"', notes: '', qty: 1, revision: 'A',
    customer: '', job_ref: '', tags: '',
  });
  const [dxfFile, setDxfFile] = useState(null);
  const [revDxfFile, setRevDxfFile] = useState(null);
  const [revRevision, setRevRevision] = useState('');
  const [customMat, setCustomMat] = useState('');
  const [customThick, setCustomThick] = useState('');

  const load = useCallback(() => {
    const params = { sort };
    if (debouncedSearch) params.q = debouncedSearch;
    if (filterMat) params.material = filterMat;
    api.getParts(params)
      .then(({ parts: list, total: count }) => {
        setParts(list);
        setTotal(count);
      })
      .catch((e) => setError(e.message));
  }, [debouncedSearch, filterMat, sort]);

  useEffect(() => {
    api.getConfig().then(setConfig);
  }, []);

  useEffect(() => { load(); }, [load]);

  const material = customMat || form.material;
  const thickness = customThick || form.thickness;
  const gauges = config.materials[material] || [];

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);

  const toggleSelect = (id) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleSelectAll = () => {
    if (selectedIds.length === parts.length) {
      setSelected({});
    } else {
      setSelected(Object.fromEntries(parts.map((p) => [p.id, true])));
    }
  };

  const goToNest = (ids) => {
    if (!ids.length) return;
    navigate(`/nest?parts=${ids.join(',')}`);
  };

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
    fd.append('customer', form.customer);
    fd.append('job_ref', form.job_ref);
    fd.append('tags', form.tags);
    try {
      const part = await api.createPart(fd);
      setShowForm(false);
      setForm({
        name: '', material: 'Black Steel', thickness: '1/4"', notes: '', qty: 1, revision: 'A',
        customer: '', job_ref: '', tags: '',
      });
      setDxfFile(null);
      setCustomMat('');
      setCustomThick('');
      setSearch('');
      setHighlightId(part.id);
      load();
      setTimeout(() => setHighlightId(null), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRevision = async (e) => {
    e.preventDefault();
    setError('');
    if (!revDxfFile) { setError('Select a DXF file'); return; }
    const fd = new FormData();
    fd.append('dxf', revDxfFile);
    if (revRevision) fd.append('revision', revRevision);
    try {
      await api.uploadRevision(revisePart.id, fd);
      setRevisePart(null);
      setRevDxfFile(null);
      setRevRevision('');
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this drawing from the vault?')) return;
    await api.deletePart(id);
    setSelected((prev) => { const n = { ...prev }; delete n[id]; return n; });
    load();
  };

  return (
    <div>
      <h2 className="page-title">Drawing Vault</h2>
      <p className="page-desc">
        Search every shop DXF by name, material, customer, job, or tags — then nest and export without hunting folders.
      </p>

      <div className="toolbar vault-toolbar">
        <input
          className="search-input"
          placeholder="Search drawings (name, material, gauge, customer, job, tags…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <select value={filterMat} onChange={(e) => setFilterMat(e.target.value)}>
          <option value="">All materials</option>
          {Object.keys(config.materials).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Sort: Recent</option>
          <option value="name">Sort: Name</option>
        </select>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>+ Import DXF</button>
      </div>

      <div className="vault-meta">
        <span>{total} drawing{total !== 1 ? 's' : ''}{debouncedSearch ? ` matching “${debouncedSearch}”` : ''}</span>
        {selectedIds.length > 0 && (
          <div className="bulk-bar">
            <span>{selectedIds.length} selected</span>
            <button className="btn btn-primary btn-sm" onClick={() => goToNest(selectedIds)}>Nest selected</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected({})}>Clear</button>
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <h2>Import DXF</h2>
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
                  <label>Customer</label>
                  <input value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} placeholder="Optional" />
                </div>
                <div className="form-row">
                  <label>Job</label>
                  <input value={form.job_ref} onChange={(e) => setForm({ ...form, job_ref: e.target.value })} placeholder="e.g. JOB-2401" />
                </div>
              </div>
              <div className="form-row">
                <label>Tags</label>
                <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="comma-separated: bracket, galv, …" />
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
                <button type="submit" className="btn btn-primary">Import to vault</button>
                <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {revisePart && (
        <div className="modal-overlay" onClick={() => setRevisePart(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New revision — {revisePart.name}</h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 1 }}>
              Current rev {revisePart.revision}. Leave revision blank to auto-bump.
            </p>
            <form onSubmit={handleRevision}>
              <div className="form-row">
                <label>DXF File</label>
                <input type="file" accept=".dxf" onChange={(e) => setRevDxfFile(e.target.files[0])} required />
              </div>
              <div className="form-row">
                <label>Revision (optional)</label>
                <input value={revRevision} onChange={(e) => setRevRevision(e.target.value)} placeholder="Auto" />
              </div>
              <div style={{ display: 'flex', gap: 0.5, marginTop: 1 }}>
                <button type="submit" className="btn btn-primary">Upload revision</button>
                <button type="button" className="btn btn-ghost" onClick={() => setRevisePart(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        {parts.length === 0 ? (
          <div className="empty">
            {debouncedSearch
              ? `No drawings match “${debouncedSearch}”. Try a shorter fragment or clear the search.`
              : 'No drawings yet. Import a DXF — try the samples in samples/.'}
          </div>
        ) : (
          <table className="vault-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={parts.length > 0 && selectedIds.length === parts.length} onChange={toggleSelectAll} title="Select all" />
                </th>
                <th style={{ width: 52 }}></th>
                <th>Name</th>
                <th>Material</th>
                <th>Thickness</th>
                <th>Rev</th>
                <th>Customer / Job</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id} className={highlightId === p.id ? 'row-highlight' : ''}>
                  <td>
                    <input type="checkbox" checked={!!selected[p.id]} onChange={() => toggleSelect(p.id)} />
                  </td>
                  <td><PartThumb geometry={p.geometry} /></td>
                  <td>
                    <strong>{p.name}</strong>
                    {p.tags && <div className="tag-line">{p.tags}</div>}
                    {p.notes && <div className="muted-line">{p.notes}</div>}
                  </td>
                  <td>{p.material}</td>
                  <td>{p.thickness}</td>
                  <td>{p.revision}</td>
                  <td>
                    {p.customer || p.job_ref
                      ? <span>{[p.customer, p.job_ref].filter(Boolean).join(' · ')}</span>
                      : <span className="muted-line">—</span>}
                  </td>
                  <td>{formatDate(p.updated_at)}</td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-primary btn-sm" onClick={() => goToNest([p.id])} title="Open Nest with this part">Nest</button>
                      <a className="btn btn-ghost btn-sm" href={api.partDxfUrl(p.id)} download title="Download original DXF">DXF</a>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setRevisePart(p); setRevRevision(''); setRevDxfFile(null); }}>Rev</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>Del</button>
                    </div>
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
