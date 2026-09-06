import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function InboxPage() {
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [importing, setImporting] = useState(false);

  const load = useCallback(() => {
    api.getInbox()
      .then(({ files: list }) => setFiles(list))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedNames = Object.keys(selected).filter((f) => selected[f]);

  const toggleSelect = (filename) => setSelected((prev) => ({ ...prev, [filename]: !prev[filename] }));
  const toggleSelectAll = () => {
    if (selectedNames.length === files.length) {
      setSelected({});
    } else {
      setSelected(Object.fromEntries(files.map((f) => [f.filename, true])));
    }
  };

  const handleImport = async (filenames) => {
    if (!filenames.length) return;
    setError('');
    setSuccess('');
    setImporting(true);
    try {
      const result = await api.importInbox({ filenames, moveAfter: true });
      const count = result.imported?.length ?? 0;
      setSuccess(`Imported ${count} drawing${count !== 1 ? 's' : ''} to vault. Files moved to data/inbox/processed/.`);
      setSelected({});
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <h2 className="page-title">Inbox</h2>
      <p className="page-desc">
        Drop dirty DXFs in <code>data/inbox/</code> — import them into the drawing vault (Black Steel 1/4&quot; default).
        Finished nests land in <code>data/outbox/</code> for FlashCut pickup.
      </p>

      <div className="toolbar">
        <button
          className="btn btn-primary"
          disabled={importing || selectedNames.length === 0}
          onClick={() => handleImport(selectedNames)}
        >
          Import selected ({selectedNames.length})
        </button>
        <button
          className="btn btn-ghost"
          disabled={importing || files.length === 0}
          onClick={() => handleImport(files.map((f) => f.filename))}
        >
          Import all
        </button>
        <button className="btn btn-ghost" onClick={load} disabled={importing}>Refresh</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-info">{success}</div>}

      <div className="card">
        {files.length === 0 ? (
          <div className="empty">
            No DXFs waiting in <code>data/inbox/</code>. Copy a file there (try <code>samples/plate-12x12-dirty.dxf</code>) and refresh.
          </div>
        ) : (
          <table className="vault-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={files.length > 0 && selectedNames.length === files.length}
                    onChange={toggleSelectAll}
                    title="Select all"
                  />
                </th>
                <th>Filename</th>
                <th>Vault name</th>
                <th>Size</th>
                <th>Modified</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.filename}>
                  <td>
                    <input type="checkbox" checked={!!selected[f.filename]} onChange={() => toggleSelect(f.filename)} />
                  </td>
                  <td><code>{f.filename}</code></td>
                  <td>{f.name}</td>
                  <td>{formatSize(f.size)}</td>
                  <td>{formatDate(f.modifiedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
