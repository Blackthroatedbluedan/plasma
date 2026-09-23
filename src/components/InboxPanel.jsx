import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function InboxPanel() {
  const [files, setFiles] = useState([]);
  const [recentProcessed, setRecentProcessed] = useState([]);
  const [error, setError] = useState('');
  const [dwgConversion, setDwgConversion] = useState(null);
  const [justImported, setJustImported] = useState(null);
  const prevRecentRef = useRef([]);

  const load = useCallback(() => {
    api.getInbox()
      .then(({ files: list, recentProcessed: recent, dwgConversion: dwg }) => {
        setFiles(list);
        setDwgConversion(dwg || null);
        const prev = prevRecentRef.current;
        if (recent?.length && recent[0]?.filename !== prev[0]?.filename) {
          setJustImported(recent[0]);
          setTimeout(() => setJustImported(null), 8000);
        }
        prevRecentRef.current = recent || [];
        setRecentProcessed(recent || []);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="home-panel inbox-panel">
      <div className="panel-header">
        <h3>Inbox</h3>
        <span className="panel-hint">Drop DWG or DXF in <code>data/inbox/</code> (or Desktop Plasma Inbox on Windows) — auto-imports to vault</span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {dwgConversion && dwgConversion.available === false && (
        <div className="alert alert-error">
          DWG import unavailable: {dwgConversion.error}
        </div>
      )}
      {justImported && (
        <div className="alert alert-success">
          Imported <strong>{justImported.name}</strong> →{' '}
          <Link to={`/vault?q=${encodeURIComponent(justImported.name)}`}>open in Vault</Link>
        </div>
      )}

      <div className="inbox-section">
        <h4>Waiting</h4>
        {files.length === 0 ? (
          <div className="empty compact">No files waiting — drop a DWG or DXF in <code>data/inbox/</code></div>
        ) : (
          <ul className="inbox-list">
            {files.map((f) => (
              <li key={f.filename}>
                <span className="inbox-name">{f.name}</span>
                <span className="inbox-meta">
                  {f.format?.toUpperCase() || 'DXF'} · {formatSize(f.size)} · {formatDate(f.modifiedAt)}
                </span>
                {f.importError && (
                  <span className="inbox-meta alert-error" style={{ display: 'block' }}>{f.importError}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {recentProcessed.length > 0 && (
        <div className="inbox-section">
          <h4>Recently imported</h4>
          <ul className="inbox-list muted">
            {recentProcessed.map((f) => (
              <li key={f.filename}>
                <Link to={`/vault?q=${encodeURIComponent(f.name)}`} className="inbox-name inbox-link">
                  {f.name}
                </Link>
                <span className="inbox-meta">{formatDate(f.processedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
