import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';

const ALL_ACTIONS = [
  { id: 'strip_tiny', label: 'Strip tiny fragments' },
  { id: 'remove_duplicates', label: 'Remove duplicate edges' },
  { id: 'join_gaps', label: 'Join endpoints within tolerance' },
  { id: 'close_gaps', label: 'Close near-gaps on contours' },
];

export default function CleanupPage() {
  const { id } = useParams();
  const [part, setPart] = useState(null);
  const [snapTolerance, setSnapTolerance] = useState(0.02);
  const [minSegmentLength, setMinSegmentLength] = useState(0.05);
  const [actions, setActions] = useState(ALL_ACTIONS.map((a) => a.id));
  const [diagnosis, setDiagnosis] = useState(null);
  const [fixResult, setFixResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const settings = { snapTolerance, minSegmentLength };

  const runDiagnose = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const result = await api.cleanupDiagnose(id, settings);
      setDiagnosis(result);
      setFixResult(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, snapTolerance, minSegmentLength]);

  useEffect(() => {
    api.getPart(id).then(setPart).catch((e) => setError(e.message));
    api.getCleanupDefaults().then((d) => {
      setSnapTolerance(d.snapTolerance);
      setMinSegmentLength(d.minSegmentLength);
    });
  }, [id]);

  useEffect(() => {
    if (part) runDiagnose();
  }, [part, runDiagnose]);

  const runFix = async () => {
    setError('');
    setLoading(true);
    try {
      const result = await api.cleanupFix(id, { ...settings, actions });
      setFixResult(result);
      setDiagnosis(result.afterDiagnosis);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadCleaned = () => {
    if (!fixResult?.dxf) return;
    const blob = new Blob([fixResult.dxf], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(part?.name || 'part').replace(/[^\w.-]+/g, '_')}-cleaned.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveRevision = async () => {
    if (!fixResult?.dxf) return;
    setError('');
    setLoading(true);
    try {
      const updated = await api.cleanupSaveRevision(id, { dxfContent: fixResult.dxf });
      setPart(updated);
      setFixResult(null);
      await runDiagnose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleAction = (actionId) => {
    setActions((prev) =>
      prev.includes(actionId) ? prev.filter((a) => a !== actionId) : [...prev, actionId]
    );
  };

  const issueCount = diagnosis?.issues?.length ?? 0;

  return (
    <div>
      <div className="cleanup-header">
        <div>
          <span className="badge badge-experimental">Experimental add-on</span>
          <h2 className="page-title">Geometry Cleanup</h2>
          <p className="page-desc">
            Optional — nest and export work without running cleanup. Diagnose open contours, gaps, and junk; fix when you choose.
          </p>
        </div>
        <Link to="/" className="btn btn-ghost">← Back to Drawings</Link>
      </div>

      {part && (
        <div className="card">
          <strong>{part.name}</strong> — {part.material} {part.thickness} · Rev {part.revision}
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid-2">
        <div className="card">
          <h3>Settings</h3>
          <div className="form-row">
            <label>Snap / join tolerance (in)</label>
            <input type="number" step="0.005" min="0.001" value={snapTolerance} onChange={(e) => setSnapTolerance(+e.target.value)} />
          </div>
          <div className="form-row">
            <label>Min segment length to keep (in)</label>
            <input type="number" step="0.01" min="0" value={minSegmentLength} onChange={(e) => setMinSegmentLength(+e.target.value)} />
          </div>
          <button className="btn btn-ghost" onClick={runDiagnose} disabled={loading}>Re-diagnose</button>

          <h3 style={{ marginTop: '1.25rem' }}>Fix actions</h3>
          {ALL_ACTIONS.map((a) => (
            <div key={a.id} className="checkbox-row">
              <input type="checkbox" id={a.id} checked={actions.includes(a.id)} onChange={() => toggleAction(a.id)} />
              <label htmlFor={a.id}>{a.label}</label>
            </div>
          ))}
          <button className="btn btn-primary" onClick={runFix} disabled={loading || !actions.length} style={{ marginTop: 0.75 }}>
            Apply fixes (preview)
          </button>
        </div>

        <div className="card">
          <h3>Diagnosis {issueCount ? `(${issueCount} issues)` : '(clean)'}</h3>
          {diagnosis?.summary && (
            <div className="cleanup-summary">
              <span>Open: {diagnosis.summary.openContours}</span>
              <span>Gaps: {diagnosis.summary.endpointGaps + diagnosis.summary.joinableEndpoints}</span>
              <span>Tiny: {diagnosis.summary.tinySegments}</span>
              <span>Dupes: {diagnosis.summary.duplicateEdges}</span>
            </div>
          )}
          {diagnosis?.issues?.length ? (
            <ul className="issue-list">
              {diagnosis.issues.map((issue, i) => (
                <li key={i} className={`issue-${issue.severity}`}>{issue.message}</li>
              ))}
            </ul>
          ) : diagnosis ? (
            <p className="muted-line">No issues detected at current settings.</p>
          ) : null}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Before</h3>
          <div className="preview-box" dangerouslySetInnerHTML={{ __html: diagnosis?.previewSvg || fixResult?.beforeDiagnosis?.previewSvg || '' }} />
        </div>
        <div className="card">
          <h3>After {fixResult ? '(preview)' : ''}</h3>
          <div className="preview-box">
            {fixResult?.previewSvg
              ? <div dangerouslySetInnerHTML={{ __html: fixResult.previewSvg }} />
              : <p className="muted-line" style={{ padding: '2rem', textAlign: 'center' }}>Run “Apply fixes” to preview</p>}
          </div>
          {fixResult && (
            <div style={{ marginTop: 0.75, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {fixResult.fixed?.length > 0 && (
                <div className="alert alert-success" style={{ flex: '1 1 100%', marginBottom: 0 }}>
                  {fixResult.fixed.join(' · ')}
                </div>
              )}
              <button className="btn btn-success" onClick={downloadCleaned}>Download cleaned DXF</button>
              <button className="btn btn-primary" onClick={saveRevision}>Save as new revision</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
