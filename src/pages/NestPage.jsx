import { useState, useEffect } from 'react';
import { api } from '../api';

export default function NestPage() {
  const [parts, setParts] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [selected, setSelected] = useState({});
  const [quantities, setQuantities] = useState({});
  const [sheetId, setSheetId] = useState('');
  const [kerf, setKerf] = useState(0.125);
  const [filterMat, setFilterMat] = useState('');
  const [filterThick, setFilterThick] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getParts().then(setParts);
    api.getSheets({ status: 'available' }).then(setSheets);
  }, []);

  const filteredParts = parts.filter((p) => {
    if (filterMat && p.material !== filterMat) return false;
    if (filterThick && p.thickness !== filterThick) return false;
    return true;
  });

  const filteredSheets = sheets.filter((s) => {
    if (filterMat && s.material !== filterMat) return false;
    if (filterThick && s.thickness !== filterThick) return false;
    return true;
  });

  const togglePart = (id) => {
    setSelected((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (next[id] && !quantities[id]) {
        const p = parts.find((x) => x.id === id);
        setQuantities((q) => ({ ...q, [id]: p?.qty || 1 }));
      }
      return next;
    });
  };

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);

  const handleNest = async () => {
    setError('');
    setResult(null);
    if (!selectedIds.length) { setError('Select at least one part'); return; }
    if (!sheetId) { setError('Select a sheet or remnant'); return; }
    setLoading(true);
    try {
      const res = await api.nest({
        partIds: selectedIds,
        quantities: quantities,
        sheetId,
        kerf,
      });
      setResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadDxf = () => {
    if (!result?.jobId) return;
    window.open(`/api/jobs/${result.jobId}/dxf`, '_blank');
  };

  return (
    <div>
      <h2 className="page-title">Nesting</h2>
      <p className="page-desc">Select parts and a matching sheet. Preview the nest, export DXF for FlashCut import.</p>

      <div className="toolbar">
        <select value={filterMat} onChange={(e) => { setFilterMat(e.target.value); setSheetId(''); }}>
          <option value="">Filter material…</option>
          {[...new Set(parts.map((p) => p.material))].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filterThick} onChange={(e) => { setFilterThick(e.target.value); setSheetId(''); }}>
          <option value="">Filter thickness…</option>
          {[...new Set(parts.map((p) => p.thickness))].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="form-row" style={{ margin: 0 }}>
          <label style={{ display: 'inline', marginRight: 4 }}>Kerf/gap:</label>
          <input type="number" step="0.01" value={kerf} onChange={(e) => setKerf(+e.target.value)} style={{ width: 70 }} /> in
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Parts</h3>
          {filteredParts.length === 0 ? (
            <div className="empty">No parts. Import DXFs first.</div>
          ) : (
            filteredParts.map((p) => (
              <div key={p.id} className="checkbox-row">
                <input type="checkbox" checked={!!selected[p.id]} onChange={() => togglePart(p.id)} id={`p-${p.id}`} />
                <label htmlFor={`p-${p.id}`}>
                  <strong>{p.name}</strong> — {p.material} {p.thickness} ({p.bbox_width?.toFixed(1)}"×{p.bbox_height?.toFixed(1)}")
                </label>
                {selected[p.id] && (
                  <input
                    type="number" min="1" value={quantities[p.id] || 1}
                    onChange={(e) => setQuantities({ ...quantities, [p.id]: +e.target.value })}
                    style={{ width: 50, marginLeft: 'auto' }}
                  />
                )}
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h3>Sheet / Remnant</h3>
          {filteredSheets.length === 0 ? (
            <div className="empty">No available sheets match. Add stock in Inventory.</div>
          ) : (
            filteredSheets.map((s) => (
              <div key={s.id} className="checkbox-row">
                <input
                  type="radio" name="sheet" checked={sheetId === s.id}
                  onChange={() => setSheetId(s.id)} id={`s-${s.id}`}
                />
                <label htmlFor={`s-${s.id}`}>
                  {s.is_remnant ? '📐 ' : '📋 '}
                  {s.material} {s.thickness} — {s.width_in}"×{s.height_in}"
                  {s.notes && <span style={{ color: 'var(--muted)' }}> ({s.notes})</span>}
                </label>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ margin: '1rem 0' }}>
        <button className="btn btn-primary" onClick={handleNest} disabled={loading}>
          {loading ? 'Nesting…' : 'Run Nest'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {result && (
        <div className="card">
          <h3>Nest Result</h3>
          <div className="stats">
            <div className="stat">
              <div className="stat-value">{result.yieldPct?.toFixed(1)}%</div>
              <div className="stat-label">Yield</div>
            </div>
            <div className="stat">
              <div className="stat-value">{result.scrapPct?.toFixed(1)}%</div>
              <div className="stat-label">Scrap est.</div>
            </div>
            <div className="stat">
              <div className="stat-value">{result.placements?.length}</div>
              <div className="stat-label">Parts placed</div>
            </div>
          </div>
          <div className="preview-box" dangerouslySetInnerHTML={{ __html: result.previewSvg }} />
          <div style={{ marginTop: 1, display: 'flex', gap: 0.5 }}>
            <button className="btn btn-success" onClick={downloadDxf}>Download DXF for FlashCut</button>
            <a href="/jobs" className="btn btn-ghost">Go to Jobs to confirm cut →</a>
          </div>
          <div className="alert alert-info" style={{ marginTop: 1 }}>
            Import the DXF into FlashCut for lead-ins, kerf compensation, and torch control. Job saved as pending — confirm cut in Jobs when complete.
          </div>
        </div>
      )}
    </div>
  );
}
