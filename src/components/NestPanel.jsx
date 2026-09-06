import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import PartSearchModal from './PartSearchModal';
import NestCanvas from './NestCanvas';
import { checkPlacementCollisions } from '../utils/nestGeometry';

const PREVIEW_DEBOUNCE_MS = 400;

export default function NestPanel({ preselectIds = [], onPreselectConsumed }) {
  const [parts, setParts] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [selectedParts, setSelectedParts] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [sheetId, setSheetId] = useState('');
  const [kerf, setKerf] = useState(0.125);
  const [preview, setPreview] = useState(null);
  const [placements, setPlacements] = useState(null);
  const [manualLayout, setManualLayout] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const [error, setError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const debounceRef = useRef(null);
  const previewGenRef = useRef(0);

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
    setManualLayout(false);
    if (!sheetId) {
      const match = sheets.find((s) => s.material === part.material && s.thickness === part.thickness);
      if (match) setSheetId(match.id);
    }
  };

  const removePart = (id) => {
    setSelectedParts((prev) => prev.filter((p) => p.id !== id));
    setQuantities((q) => { const n = { ...q }; delete n[id]; return n; });
    setManualLayout(false);
  };

  const filteredSheets = selectedParts.length
    ? sheets.filter((s) => {
        const mats = new Set(selectedParts.map((p) => p.material));
        const thicks = new Set(selectedParts.map((p) => p.thickness));
        return mats.has(s.material) && thicks.has(s.thickness);
      })
    : sheets;

  const selectedSheet = sheets.find((s) => s.id === sheetId);
  const sheetDims = preview?.sheet || (selectedSheet
    ? { width: selectedSheet.width_in, height: selectedSheet.height_in }
    : null);

  const runPreview = useCallback(async (opts = {}) => {
    const { usePlacements = null, resetManual = false } = opts;
    if (!selectedParts.length || !sheetId) {
      setPreview(null);
      setPlacements(null);
      setPreviewError('');
      return;
    }

    const gen = ++previewGenRef.current;
    setPreviewLoading(true);
    setPreviewError('');

    try {
      const body = {
        partIds: selectedParts.map((p) => p.id),
        quantities,
        sheetId,
        kerf,
      };
      const placementPayload = resetManual ? null : (usePlacements ?? (manualLayout ? placements : null));
      if (placementPayload?.length) body.placements = placementPayload;

      const res = await api.nestPreview(body);
      if (gen !== previewGenRef.current) return;

      setPreview(res);
      setPlacements(res.placements || []);
      if (resetManual) setManualLayout(false);
      setPreviewError(res.error && !res.placements?.length ? res.error : '');
    } catch (e) {
      if (gen !== previewGenRef.current) return;
      setPreview(null);
      setPlacements(null);
      setPreviewError(e.message);
    } finally {
      if (gen === previewGenRef.current) setPreviewLoading(false);
    }
  }, [selectedParts, quantities, sheetId, kerf, manualLayout, placements]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runPreview({ resetManual: !manualLayout });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [selectedParts, quantities, sheetId, kerf]);

  const handlePlacementsChange = (next) => {
    setPlacements(next);
    setManualLayout(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runPreview({ usePlacements: next });
    }, PREVIEW_DEBOUNCE_MS);
  };

  const handleSendToOutbox = async () => {
    setError('');
    setExportResult(null);
    if (!selectedParts.length) { setError('Add at least one part'); return; }
    if (!sheetId) { setError('Select a sheet'); return; }
    if (!placements?.length) { setError('No nest layout — adjust parts or sheet'); return; }

    const collisions = checkPlacementCollisions(placements, kerf);
    if (collisions.length) {
      setError('Parts overlap — fix layout before sending to outbox');
      return;
    }

    setExportLoading(true);
    try {
      const res = await api.nest({
        partIds: selectedParts.map((p) => p.id),
        quantities,
        sheetId,
        kerf,
        placements,
      });
      setExportResult(res);
      setPreview(res);
      setPlacements(res.placements || placements);
    } catch (e) {
      setError(e.message);
    } finally {
      setExportLoading(false);
    }
  };

  const downloadDxf = () => {
    if (!exportResult?.jobId) return;
    window.open(`/api/jobs/${exportResult.jobId}/dxf`, '_blank');
  };

  const displayPlacements = placements ?? preview?.placements ?? [];
  const yieldPct = preview?.yieldPct;

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
                  onChange={(e) => {
                    setManualLayout(false);
                    setQuantities({ ...quantities, [p.id]: +e.target.value });
                  }}
                />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => removePart(p.id)}>×</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="nest-sheet-row">
        <label>Sheet</label>
        <select
          value={sheetId}
          onChange={(e) => {
            setManualLayout(false);
            setSheetId(e.target.value);
          }}
        >
          <option value="">Select sheet…</option>
          {filteredSheets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.is_remnant ? 'Remnant' : 'Sheet'} — {s.material} {s.thickness} {s.width_in}"×{s.height_in}"
            </option>
          ))}
        </select>
        <label className="kerf-label">Kerf</label>
        <input type="number" step="0.01" value={kerf} onChange={(e) => { setManualLayout(false); setKerf(+e.target.value); }} />
      </div>

      {sheetDims && displayPlacements.length > 0 && (
        <div className="nest-live-preview">
          <div className="stats compact">
            <div className="stat">
              <div className="stat-value">{yieldPct != null ? yieldPct.toFixed(1) : '—'}%</div>
              <div className="stat-label">Yield</div>
            </div>
            <div className="stat">
              <div className="stat-value">{displayPlacements.length}</div>
              <div className="stat-label">Placed</div>
            </div>
          </div>
          <NestCanvas
            sheet={sheetDims}
            placements={displayPlacements}
            kerf={kerf}
            onPlacementsChange={handlePlacementsChange}
            loading={previewLoading}
          />
          <p className="muted-line nest-hint">Drag parts to adjust. Scroll or use +/− to zoom — 1″ grid appears when zoomed in.</p>
        </div>
      )}

      {previewLoading && !displayPlacements.length && (
        <div className="empty compact">Computing nest preview…</div>
      )}

      {previewError && <div className="alert alert-error">{previewError}</div>}

      <button
        className="btn btn-primary"
        onClick={handleSendToOutbox}
        disabled={exportLoading || previewLoading || !selectedParts.length || !sheetId || !displayPlacements.length}
      >
        {exportLoading ? 'Sending…' : 'Send nest → Outbox'}
      </button>

      {error && <div className="alert alert-error">{error}</div>}

      {exportResult && (
        <div className="nest-result">
          <div className="nest-result-actions">
            <button className="btn btn-success btn-sm" onClick={downloadDxf}>Download DXF</button>
            <span className="muted-line">Written to <code>data/outbox/</code> for FlashCut</span>
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
