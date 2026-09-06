import { useState, useEffect } from 'react';
import { api } from '../api';

export default function JobsPage() {
  const [jobs, setJobs] = useState([]);
  const [confirming, setConfirming] = useState(null);
  const [remnants, setRemnants] = useState([{ width_in: '', height_in: '' }]);
  const [error, setError] = useState('');

  const load = () => api.getJobs().then(setJobs);

  useEffect(() => { load(); }, []);

  const openConfirm = (job) => {
    setConfirming(job);
    setRemnants([{ width_in: '', height_in: '' }]);
    setError('');
  };

  const addRemnant = () => setRemnants([...remnants, { width_in: '', height_in: '' }]);

  const updateRemnant = (i, field, val) => {
    const next = [...remnants];
    next[i] = { ...next[i], [field]: val };
    setRemnants(next);
  };

  const handleConfirm = async () => {
    const valid = remnants.filter((r) => r.width_in > 0 && r.height_in > 0);
    try {
      await api.confirmJob(confirming.id, { remnants: valid });
      setConfirming(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <h2 className="page-title">Job &amp; Yield Log</h2>
      <p className="page-desc">Confirm cuts to consume sheets and optionally log remnant rectangles back to inventory.</p>

      {confirming && (
        <div className="modal-overlay" onClick={() => setConfirming(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Confirm Cut</h2>
            <p style={{ marginBottom: 1, color: 'var(--muted)', fontSize: '0.9rem' }}>
              Sheet: {confirming.material} {confirming.thickness} — {confirming.sheet_width_in}"×{confirming.sheet_height_in}"
              <br />Yield: {confirming.yield_pct?.toFixed(1)}% | Scrap est.: {confirming.scrap_pct?.toFixed(1)}%
            </p>
            {error && <div className="alert alert-error">{error}</div>}
            <h3 style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 0.5 }}>Remnants to save (optional)</h3>
            {remnants.map((r, i) => (
              <div key={i} className="form-inline" style={{ marginBottom: 0.5 }}>
                <div className="form-row">
                  <label>W (in)</label>
                  <input type="number" step="0.125" value={r.width_in} onChange={(e) => updateRemnant(i, 'width_in', +e.target.value)} />
                </div>
                <div className="form-row">
                  <label>H (in)</label>
                  <input type="number" step="0.125" value={r.height_in} onChange={(e) => updateRemnant(i, 'height_in', +e.target.value)} />
                </div>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={addRemnant} style={{ marginBottom: 1 }}>+ Add remnant</button>
            <div style={{ display: 'flex', gap: 0.5 }}>
              <button className="btn btn-success" onClick={handleConfirm}>Confirm Cut</button>
              <button className="btn btn-ghost" onClick={() => setConfirming(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Material</th>
              <th>Thickness</th>
              <th>Sheet</th>
              <th>Yield</th>
              <th>Scrap</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td>{new Date(j.created_at).toLocaleString()}</td>
                <td>{j.material}</td>
                <td>{j.thickness}</td>
                <td>{j.sheet_width_in}"×{j.sheet_height_in}"</td>
                <td>{j.yield_pct?.toFixed(1)}%</td>
                <td>{j.scrap_pct?.toFixed(1)}%</td>
                <td><span className={`badge badge-${j.status}`}>{j.status}</span></td>
                <td className="actions">
                  <a href={`/api/jobs/${j.id}/dxf`} className="btn btn-ghost btn-sm" download>DXF</a>
                  {j.status === 'pending' && (
                    <button className="btn btn-success btn-sm" onClick={() => openConfirm(j)}>Confirm Cut</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {jobs.length === 0 && <div className="empty">No jobs yet. Run a nest to create one.</div>}
      </div>
    </div>
  );
}
