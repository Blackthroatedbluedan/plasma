const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

export const api = {
  getConfig: () => request('/config'),
  getParts: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/parts?${q}`);
  },
  getPart: (id) => request(`/parts/${id}`),
  createPart: (formData) => fetch(`${BASE}/parts`, { method: 'POST', body: formData }).then(async (r) => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d;
  }),
  uploadRevision: (id, formData) => fetch(`${BASE}/parts/${id}/revision`, { method: 'POST', body: formData }).then(async (r) => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d;
  }),
  partDxfUrl: (id) => `${BASE}/parts/${id}/dxf`,
  updatePart: (id, body) => request(`/parts/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  deletePart: (id) => request(`/parts/${id}`, { method: 'DELETE' }),
  getSheets: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/sheets?${q}`);
  },
  createSheet: (body) => request('/sheets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  updateSheet: (id, body) => request(`/sheets/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  deleteSheet: (id) => request(`/sheets/${id}`, { method: 'DELETE' }),
  nest: (body) => request('/nest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  nestPreview: (body) => request('/nest/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  getJobs: () => request('/jobs'),
  getJob: (id) => request(`/jobs/${id}`),
  confirmJob: (id, body) => request(`/jobs/${id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  getInventorySyncPending: () => request('/inventory-sync/pending'),
  completeInventorySync: (id, body) => request(`/inventory-sync/${id}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  failInventorySync: (id, body) => request(`/inventory-sync/${id}/fail`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  getInbox: () => request('/inbox'),
  importInbox: (body) => request('/inbox/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  getOutbox: () => request('/outbox'),
  sweepOutbox: (body = {}) => request('/outbox/sweep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  sendPartToOutbox: (id) => request(`/parts/${id}/outbox`, { method: 'POST' }),
  getCleanupDefaults: () => request('/cleanup/defaults'),
  cleanupDiagnose: (id, body) => request(`/parts/${id}/cleanup/diagnose`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  cleanupFix: (id, body) => request(`/parts/${id}/cleanup/fix`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  cleanupSaveRevision: (id, body) => request(`/parts/${id}/cleanup/save-revision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
};
