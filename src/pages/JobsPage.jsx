import { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../firebase/auth.jsx';
import { useInventorySync } from '../firebase/useInventorySync.jsx';
import { canSyncInventory } from '../firebase/inventorySync.js';

function syncStatusLabel(status) {
  switch (status) {
    case 'synced': return 'KLFS synced';
    case 'pending': return 'KLFS pending';
    case 'failed': return 'KLFS sync failed';
    default: return null;
  }
}

export default function JobsPage() {
  const [jobs, setJobs] = useState([]);
  const [confirming, setConfirming] = useState(null);
  const [remnants, setRemnants] = useState([{ width_in: '', height_in: '' }]);
  const [error, setError] = useState('');
  const [syncNotice, setSyncNotice] = useState('');
  const { isSignedIn, configured, mockMode } = useAuth();
  const { summary, syncing, syncNow, refreshSummary } = useInventorySync();

  const load = () => api.getJobs().then(setJobs);

  useEffect(() => { load(); }, []);

  const openConfirm = (job) => {
    setConfirming(job);
    setRemnants([{ width_in: '', height_in: '' }]);
    setError('');
    setSyncNotice('');
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
      await load();
      await refreshSummary();

      if (canSyncInventory(isSignedIn)) {
        setSyncNotice('Cut confirmed locally. Syncing material use to KLFS inventory…');
        const result = await syncNow();
        if (result?.synced) {
          setSyncNotice(`KLFS inventory updated (${result.synced} item${result.synced === 1 ? '' : 's'} synced).`);
        } else if (result?.failed) {
          setSyncNotice('Cut confirmed locally. KLFS sync failed — will retry when online.');
        }
        await load();
      } else if (mockMode || configured) {
        setSyncNotice('Cut confirmed locally. Sign in with Google to sync KLFS inventory.');
      } else {
        setSyncNotice('Cut confirmed locally. Configure Firebase env vars to sync KLFS inventory.');
      }
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div>
      <h2 className="page-title">Job &amp; Yield Log</h2>
      <p className="page-desc">
        Confirm cuts to consume local sheets and optionally log remnants. Material use is queued for KLFSapps inventory sync (best-effort when online).
      </p>

      {(summary.pending > 0 || syncNotice) && (
        <div className={`alert ${summary.pending > 0 ? 'alert-warn' : 'alert-success'}`} style={{ marginBottom: '1rem' }}>
          {syncNotice || `${summary.pending} inventory sync item${summary.pending === 1 ? '' : 's'} pending`}
          {summary.pending > 0 && canSyncInventory(isSignedIn) && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: '0.75rem' }} disabled={syncing} onClick={() => syncNow()}>
              {syncing ? 'Syncing…' : 'Retry sync'}
            </button>
          )}
        </div>
      )}

      {confirming && (
        <div className="modal-overlay" onClick={() => setConfirming(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Confirm Cut</h2>
            <p style={{ marginBottom: 1, color: 'var(--muted)', fontSize: '0.9rem' }}>
              Sheet: {confirming.material} {confirming.thickness} — {confirming.sheet_width_in}"×{confirming.sheet_height_in}"
              <br />Yield: {confirming.yield_pct?.toFixed(1)}% | Scrap est.: {confirming.scrap_pct?.toFixed(1)}%
              <br />KLFS use: {((confirming.sheet_width_in * confirming.sheet_height_in) / 144).toFixed(2)} ft²
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
              <th>KLFS</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const klfs = syncStatusLabel(j.inventory_sync_status);
              return (
                <tr key={j.id}>
                  <td>{new Date(j.created_at).toLocaleString()}</td>
                  <td>{j.material}</td>
                  <td>{j.thickness}</td>
                  <td>{j.sheet_width_in}"×{j.sheet_height_in}"</td>
                  <td>{j.yield_pct?.toFixed(1)}%</td>
                  <td>{j.scrap_pct?.toFixed(1)}%</td>
                  <td><span className={`badge badge-${j.status}`}>{j.status}</span></td>
                  <td>
                    {klfs ? (
                      <span className={`badge badge-klfs-${j.inventory_sync_status}`}>{klfs}</span>
                    ) : (
                      <span className="badge badge-muted">—</span>
                    )}
                  </td>
                  <td className="actions">
                    <a href={`/api/jobs/${j.id}/dxf`} className="btn btn-ghost btn-sm" download>DXF</a>
                    {j.status === 'pending' && (
                      <button className="btn btn-success btn-sm" onClick={() => openConfirm(j)}>Confirm Cut</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {jobs.length === 0 && <div className="empty">No jobs yet. Run a nest to create one.</div>}
      </div>
    </div>
  );
}
