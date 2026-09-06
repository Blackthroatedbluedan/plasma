import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import OutboxBar from '../components/OutboxBar';

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

export default function VaultPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [parts, setParts] = useState([]);
  const [total, setTotal] = useState(0);
  const [config, setConfig] = useState({ materials: {}, sheetPresets: [] });
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const debouncedSearch = useDebounced(search);
  const [filterMat, setFilterMat] = useState('');
  const [sort, setSort] = useState('recent');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [highlightId, setHighlightId] = useState(null);
  const [revisePart, setRevisePart] = useState(null);
  const [revDxfFile, setRevDxfFile] = useState(null);
  const [revRevision, setRevRevision] = useState('');
  const [outboxLoading, setOutboxLoading] = useState(null);

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

  const goToNest = (ids) => {
    if (!ids.length) return;
    navigate(`/?nest=${ids.join(',')}`);
  };

  const handleSendToOutbox = async (part) => {
    setError('');
    setSuccess('');
    setOutboxLoading(part.id);
    try {
      const result = await api.sendPartToOutbox(part.id);
      setSuccess(`${part.name} → ${result.filename} in outbox for FlashCut pickup`);
      setHighlightId(part.id);
      setTimeout(() => setHighlightId(null), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setOutboxLoading(null);
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
    load();
  };

  return (
    <div>
      <h2 className="page-title">Vault</h2>
      <p className="page-desc">
        Search every shop DXF. Send a single part to <code>data/outbox/</code> for FlashCut, or open Home to nest multiple parts.
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
      </div>

      <div className="vault-meta">
        <span>{total} drawing{total !== 1 ? 's' : ''}{debouncedSearch ? ` matching “${debouncedSearch}”` : ''}</span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

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
              : 'No drawings yet. Drop a DXF in data/inbox/ or try the samples in samples/.'}
          </div>
        ) : (
          <table className="vault-table">
            <thead>
              <tr>
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
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handleSendToOutbox(p)}
                        disabled={outboxLoading === p.id}
                        title="Copy single-part DXF to data/outbox/ for FlashCut pickup"
                      >
                        {outboxLoading === p.id ? '…' : 'Outbox'}
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={() => goToNest([p.id])} title="Add to nest on Home">Nest</button>
                      <a className="btn btn-ghost btn-sm" href={api.partDxfUrl(p.id)} download title="Download original DXF">DXF</a>
                      <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/cleanup/${p.id}`)} title="Optional geometry cleanup">Cleanup</button>
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

      <OutboxBar />
    </div>
  );
}
