import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';

function formatSheetSize(w, h) {
  return `${w}"×${h}"`;
}

function sheetSizeLabel(s) {
  const size = formatSheetSize(s.width_in, s.height_in);
  if (s.is_remnant) {
    return `Remnant ${size}${s.notes ? ` — ${s.notes}` : ''}`;
  }
  if (s.width_in === 60 && s.height_in === 120) return `5×10 ft (${size})`;
  if (s.width_in === 48 && s.height_in === 96) return `4×8 ft (${size})`;
  return `Full sheet (${size})`;
}

export default function NestPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [parts, setParts] = useState([]);
  const [sheets, setSheets] = useState([]);
  const [config, setConfig] = useState({ materials: {}, sheetPresets: [] });
  const [selected, setSelected] = useState({});
  const [quantities, setQuantities] = useState({});
  const [sheetId, setSheetId] = useState('');
  const [sheetMaterial, setSheetMaterial] = useState('');
  const [sheetThickness, setSheetThickness] = useState('');
  const [showAllRemnants, setShowAllRemnants] = useState(false);
  const [kerf, setKerf] = useState(0.125);
  const [filterMat, setFilterMat] = useState('');
  const [filterThick, setFilterThick] = useState('');
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [preselectedNote, setPreselectedNote] = useState('');

  useEffect(() => {
    api.getConfig().then(setConfig);
    api.getParts().then(({ parts: list }) => {
      setParts(list);
      const fromUrl = (searchParams.get('parts') || '').split(',').filter(Boolean);
      if (fromUrl.length) {
        const nextSelected = {};
        const nextQty = {};
        for (const id of fromUrl) {
          const p = list.find((x) => x.id === id);
          if (p) {
            nextSelected[id] = true;
            nextQty[id] = p.qty || 1;
            if (!filterMat) setFilterMat(p.material);
            if (!filterThick) setFilterThick(p.thickness);
          }
        }
        setSelected(nextSelected);
        setQuantities(nextQty);
        const names = fromUrl.map((id) => list.find((x) => x.id === id)?.name).filter(Boolean);
        if (names.length) setPreselectedNote(names.join(', '));
        setSearchParams({}, { replace: true });
      }
    });
    api.getSheets({ status: 'available' }).then(setSheets);
  }, []);

  const materialFamilies = useMemo(() => {
    const fromConfig = Object.keys(config.materials || {});
    const fromSheets = sheets.map((s) => s.material);
    return [...new Set([...fromConfig, ...fromSheets])].sort();
  }, [config.materials, sheets]);

  const thicknessOptions = useMemo(() => {
    if (!sheetMaterial) return [];
    const fromConfig = config.materials?.[sheetMaterial] || [];
    const fromSheets = sheets
      .filter((s) => s.material === sheetMaterial)
      .map((s) => s.thickness);
    return [...new Set([...fromConfig, ...fromSheets])];
  }, [config.materials, sheetMaterial, sheets]);

  const filteredParts = parts.filter((p) => {
    if (filterMat && p.material !== filterMat) return false;
    if (filterThick && p.thickness !== filterThick) return false;
    return true;
  });

  const filteredSheets = useMemo(() => {
    if (showAllRemnants) {
      return sheets.filter((s) => s.is_remnant);
    }
    if (!sheetMaterial) return [];
    return sheets.filter((s) => {
      if (s.material !== sheetMaterial) return false;
      if (sheetThickness && s.thickness !== sheetThickness) return false;
      return true;
    });
  }, [sheets, sheetMaterial, sheetThickness, showAllRemnants]);

  const groupedSheets = useMemo(() => {
    const full = filteredSheets.filter((s) => !s.is_remnant);
    const remnants = filteredSheets.filter((s) => s.is_remnant);
    return { full, remnants };
  }, [filteredSheets]);

  useEffect(() => {
    if (filterMat && materialFamilies.includes(filterMat) && !sheetMaterial) {
      setSheetMaterial(filterMat);
    }
  }, [filterMat, materialFamilies, sheetMaterial]);

  useEffect(() => {
    if (sheetMaterial && filterThick && thicknessOptions.includes(filterThick) && !sheetThickness) {
      setSheetThickness(filterThick);
    }
  }, [sheetMaterial, filterThick, thicknessOptions, sheetThickness]);

  useEffect(() => {
    if (sheetId && !filteredSheets.some((s) => s.id === sheetId)) {
      setSheetId('');
    }
  }, [sheetId, filteredSheets]);

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

  const handleSheetMaterialChange = (value) => {
    setSheetMaterial(value);
    setSheetThickness('');
    setSheetId('');
    setShowAllRemnants(false);
  };

  const handleSheetThicknessChange = (value) => {
    setSheetThickness(value);
    setSheetId('');
    setShowAllRemnants(false);
  };

  const refreshPreview = useCallback(async () => {
    if (!selectedIds.length || !sheetId) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await api.nestPreview({
        partIds: selectedIds,
        quantities,
        sheetId,
        kerf,
      });
      setPreview(res);
    } catch (e) {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedIds, quantities, sheetId, kerf]);

  useEffect(() => {
    const timer = setTimeout(refreshPreview, 300);
    return () => clearTimeout(timer);
  }, [refreshPreview]);

  const handleNest = async () => {
    setError('');
    setResult(null);
    if (!selectedIds.length) { setError('Select at least one part'); return; }
    if (!sheetId) { setError('Select a sheet or remnant'); return; }
    setLoading(true);
    try {
      const res = await api.nest({
        partIds: selectedIds,
        quantities,
        sheetId,
        kerf,
      });
      setResult(res);
      setPreselectedNote('');
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

  const previewStatus = preview && !preview.success && preview.placedCount > 0
    ? `${preview.placedCount} of ${preview.requestedTotal} parts fit on this sheet`
    : preview?.success
      ? `${preview.placedCount} part${preview.placedCount === 1 ? '' : 's'} fit`
      : preview?.error || '';

  return (
    <div>
      <h2 className="page-title">Nesting</h2>
      <p className="page-desc">Select parts and a matching sheet. Preview the nest as you adjust quantities, then export DXF for FlashCut import.</p>

      {preselectedNote && (
        <div className="alert alert-info">
          From drawing vault: <strong>{preselectedNote}</strong> — pick a sheet and run nest.
        </div>
      )}

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
          <h3>Parts ({selectedIds.length} selected)</h3>
          {filteredParts.length === 0 ? (
            <div className="empty">No parts. Import DXFs in the drawing vault first.</div>
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

        <div className="card sheet-picker">
          <h3>Sheet / Remnant</h3>

          <div className="form-row">
            <label>Material family</label>
            <select value={sheetMaterial} onChange={(e) => handleSheetMaterialChange(e.target.value)}>
              <option value="">Choose material…</option>
              {materialFamilies.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {sheetMaterial && !showAllRemnants && (
            <div className="form-row">
              <label>Thickness / gauge</label>
              <select value={sheetThickness} onChange={(e) => handleSheetThicknessChange(e.target.value)}>
                <option value="">Choose thickness…</option>
                {thicknessOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          <div className="checkbox-row" style={{ marginBottom: '0.75rem' }}>
            <input
              type="checkbox"
              id="show-all-remnants"
              checked={showAllRemnants}
              onChange={(e) => {
                setShowAllRemnants(e.target.checked);
                setSheetId('');
                if (e.target.checked) {
                  setSheetThickness('');
                }
              }}
            />
            <label htmlFor="show-all-remnants">Browse all remnants</label>
          </div>

          {!sheetMaterial && !showAllRemnants ? (
            <div className="empty" style={{ padding: '1.5rem 0' }}>Pick a material family to see available sizes.</div>
          ) : !showAllRemnants && !sheetThickness ? (
            <div className="empty" style={{ padding: '1.5rem 0' }}>Pick a thickness to see matching sheets.</div>
          ) : filteredSheets.length === 0 ? (
            <div className="empty" style={{ padding: '1.5rem 0' }}>No available sheets match. Add stock in Inventory.</div>
          ) : (
            <div className="sheet-options">
              {groupedSheets.full.length > 0 && (
                <div className="sheet-group">
                  <div className="sheet-group-label">Full sheets</div>
                  {groupedSheets.full.map((s) => (
                    <div key={s.id} className="checkbox-row">
                      <input
                        type="radio" name="sheet" checked={sheetId === s.id}
                        onChange={() => setSheetId(s.id)} id={`s-${s.id}`}
                      />
                      <label htmlFor={`s-${s.id}`}>{sheetSizeLabel(s)}</label>
                    </div>
                  ))}
                </div>
              )}
              {groupedSheets.remnants.length > 0 && (
                <div className="sheet-group">
                  <div className="sheet-group-label">Remnants</div>
                  {groupedSheets.remnants.map((s) => (
                    <div key={s.id} className="checkbox-row">
                      <input
                        type="radio" name="sheet" checked={sheetId === s.id}
                        onChange={() => setSheetId(s.id)} id={`s-${s.id}`}
                      />
                      <label htmlFor={`s-${s.id}`}>{sheetSizeLabel(s)}</label>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {(selectedIds.length > 0 && sheetId) && (
        <div className="card nest-live-preview">
          <div className="nest-live-preview-header">
            <h3>Live Sheet Preview</h3>
            {previewLoading && <span className="preview-status muted">Updating…</span>}
            {!previewLoading && previewStatus && (
              <span className={`preview-status ${preview?.partial ? 'warn' : preview?.success ? 'ok' : 'muted'}`}>
                {previewStatus}
              </span>
            )}
          </div>

          {preview && (
            <div className="stats">
              <div className="stat">
                <div className="stat-value">{preview.placedCount}/{preview.requestedTotal}</div>
                <div className="stat-label">Parts fit</div>
              </div>
              <div className="stat">
                <div className="stat-value">{preview.yieldPct?.toFixed(1)}%</div>
                <div className="stat-label">Yield est.</div>
              </div>
              <div className="stat">
                <div className="stat-value">{preview.scrapPct?.toFixed(1)}%</div>
                <div className="stat-label">Scrap est.</div>
              </div>
            </div>
          )}

          {preview?.partial && (
            <div className="alert alert-info" style={{ marginBottom: '0.75rem' }}>
              Requested quantity exceeds sheet capacity. Preview shows the maximum layout that fits ({preview.placedCount} parts).
            </div>
          )}

          {preview?.previewSvg ? (
            <div className="preview-box" dangerouslySetInnerHTML={{ __html: preview.previewSvg }} />
          ) : (
            <div className="preview-box empty" style={{ minHeight: 120 }}>
              {previewLoading ? 'Calculating nest…' : 'Adjust parts or sheet to preview.'}
            </div>
          )}
        </div>
      )}

      <div style={{ margin: '1rem 0' }}>
        <button className="btn btn-primary" onClick={handleNest} disabled={loading || (preview?.partial)}>
          {loading ? 'Nesting…' : preview?.partial ? 'Reduce qty to nest' : 'Run Nest'}
        </button>
        {preview?.partial && (
          <span style={{ marginLeft: '0.75rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
            Lower quantity to {preview.placedCount} or pick a larger sheet.
          </span>
        )}
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
