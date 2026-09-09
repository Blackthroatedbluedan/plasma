import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function PartSearchModal({ open, onClose, onSelect, excludeIds = [] }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!open) return;
    setLoading(true);
    const params = { sort: 'name' };
    if (debouncedSearch) params.q = debouncedSearch;
    api.getParts(params)
      .then(({ parts: list }) => setParts(list.filter((p) => !excludeIds.includes(p.id))))
      .catch(() => setParts([]))
      .finally(() => setLoading(false));
  }, [open, debouncedSearch, excludeIds]);

  useEffect(() => { load(); }, [load]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Add part to nest</h2>
        <input
          className="search-input"
          style={{ width: '100%', marginBottom: '1rem' }}
          placeholder="Search drawings…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div className="part-search-list">
          {loading ? (
            <div className="empty compact">Searching…</div>
          ) : parts.length === 0 ? (
            <div className="empty compact">No drawings found</div>
          ) : (
            parts.slice(0, 20).map((p) => (
              <button
                key={p.id}
                type="button"
                className="part-search-row"
                onClick={() => { onSelect(p); onClose(); }}
              >
                <strong>{p.name}</strong>
                <span>{p.material} {p.thickness} · {p.bbox_width?.toFixed(1)}"×{p.bbox_height?.toFixed(1)}"</span>
              </button>
            ))
          )}
        </div>
        <div style={{ marginTop: '1rem' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
