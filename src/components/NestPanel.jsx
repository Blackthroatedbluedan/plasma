import { useState, useEffect } from 'react';
import { api } from '../api';
import PartSearchModal from './PartSearchModal';

export default function NestPanel({ preselectIds = [], onPreselectConsumed }) {
  const [parts, setParts] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [selectedParts, setSelectedParts] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [sheetId, setSheetId] = useState('');
  const [kerf, setKerf] = useState(0.125);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    api.getParts().then(({ parts: list }) => setParts(list));
    api.getSheets({ status: 'available' }).then(setSheets);
  }, []);

  useEffect(() => {
    if (!preselectIds.length || !parts.length) return;
    const toAdd = parts.filter((p) => preselectIds.includes(p.id));
    if (!toAdd.length) return;
    setSelectedParts(toAdd);
    const qty = {};
    for (const p of toAdd) qty[p.id] = p.qty || 1;
    setQuantities(qty);
    onPreselectConsumed?.();
  }, [parts, preselectIds, onPreselectConsumed]);

  const addPart = (part) => {
    if (selectedParts.some((p) => p.id === part.id)) return;
    setSelectedParts((prev) => [...prev, part]);
    setQuantities((q) => ({ ...q, [part.id]: part.qty || 1 }));
    if (!sheetId) {
      const match = sheets.find((s) => s.material === part.material && s.thickness === part.thickness);
      if (match) setSheetId(match.id);
    }
  };

  const removePart = (id) => {
    setSelectedParts((prev) => prev.filter((p) => p.id !== id));
    setQuantities((q) => { const n = { ...q }; delete n[id]; return n; });
  };

  const filteredSheets = selectedParts.length
    ? sheets.filter((s) => {
        const mats = new Set(selectedParts.map((p) => p.material));
        const thicks = new Set(selectedParts.map((p) => p.thickness));
        return mats.has(s.material) && thicks.has(s.thickness);
      })
    : sheets;

  const handleNest = async () => {
    setError('');
    setResult(null);
    if (!selectedParts.length) { setError('Add at least one part'); return; }
    if (!sheetId) { setError('Select a sheet'); return; }
    setLoading(true);
    try {
      const res = await api.nest({
        partIds: selectedParts.map((p) => p.id),
        quantities,
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
    <div className="home-panel nest-panel">
      <div className="panel-header">
        <h3>Nest</h3>
        <div className="panel-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowSearch(true)}>+ Add part</button>
        </div>
      </div>

      {selectedParts.length === 0 ? (
        <div className="empty compact">Add parts from the vault to build a nest</div>
      ) : (
        <ul className="nest-part-list">
          {selectedParts.map((p) => (
            <li key={p.id}>
              <span><strong>{p.name}</strong> <span className="muted-line">{p.material} {p.thickness}</span></span>
              <div className="nest-part-controls">
                <input
                  type="number" min="1" value={quantities[p.id] || 1}
                  onChange={(e) => setQuantities({ ...quantities, [p.id]: +e.target.value })}
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removePart(p.id)}>×</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="nest-sheet-row">
        <label>Sheet</label>
        <select value={sheetId} onChange={(e) => setSheetId(e.target.value)}>
          <option value="">Select sheet…</option>
          {filteredSheets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.is_remnant ? 'Remnant' : 'Sheet'} — {s.material} {s.thickness} {s.width_in}"×{s.height_in}"
            </option>
          ))}
        </select>
        <label className="kerf-label">Kerf</label>
        <input type="number" step="0.01" value={kerf} onChange={(e) => setKerf(+e.target.value)} />
      </div>

      <button className="btn btn-primary" onClick={handleNest} disabled={loading || !selectedParts.length}>
        {loading ? 'Nesting…' : 'Run nest → Outbox'}
      </button>

      {error && <div className="alert alert-error">{error}</div>}

      {result && (
        <div className="nest-result">
          <div className="stats compact">
            <div className="stat">
              <div className="stat-value">{result.yieldPct?.toFixed(1)}%</div>
              <div className="stat-label">Yield</div>
            </div>
            <div className="stat">
              <div className="stat-value">{result.placements?.length}</div>
              <div className="stat-label">Placed</div>
            </div>
          </div>
          <div className="preview-box nest-preview" dangerouslySetInnerHTML={{ __html: result.previewSvg }} />
          <div className="nest-result-actions">
            <button className="btn btn-success btn-sm" onClick={downloadDxf}>Download DXF</button>
            <span className="muted-line">Also in <code>data/outbox/</code> for FlashCut</span>
          </div>
        </div>
      )}

      <PartSearchModal
        open={showSearch}
        onClose={() => setShowSearch(false)}
        onSelect={addPart}
        excludeIds={selectedParts.map((p) => p.id)}
      />
    </div>
  );
}
