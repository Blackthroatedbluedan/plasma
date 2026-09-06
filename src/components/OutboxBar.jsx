import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function OutboxBar() {
  const [info, setInfo] = useState({ files: [], retentionDays: 3, lastSweepAt: null });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.getOutbox()
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  if (error) return null;

  const { files, retentionDays, lastSweepAt } = info;

  return (
    <div className="outbox-bar card">
      <div className="outbox-bar-header">
        <h3>Outbox — FlashCut pickup</h3>
        <span className="panel-hint">
          Files archive after {retentionDays} day{retentionDays !== 1 ? 's' : ''}
          {lastSweepAt ? ` · last sweep ${formatDate(lastSweepAt)}` : ''}
        </span>
      </div>
      {files.length === 0 ? (
        <p className="muted-line" style={{ fontSize: '0.85rem' }}>
          No DXFs waiting in <code>data/outbox/</code>. Run a nest or use Vault → Outbox.
        </p>
      ) : (
        <ul className="outbox-file-list">
          {files.map((f) => (
            <li key={f.filename}>
              <code>{f.filename}</code>
              <span className="outbox-meta">
                {f.kind === 'nest' ? 'nest' : 'single part'} · expires in {f.expiresInDays}d
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted-line demo-hint" style={{ fontSize: '0.75rem', marginTop: '0.75rem' }}>
        Demo sweep: <code>npm run demo:sweep</code> or <code>POST /api/outbox/sweep</code> with <code>{'{"force": true}'}</code>
      </p>
    </div>
  );
}
