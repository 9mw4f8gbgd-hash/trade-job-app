export const auth = { get token() { return localStorage.getItem('token'); }, set token(t) { t ? localStorage.setItem('token', t) : localStorage.removeItem('token'); } };

export async function api(path, body, method) {
  let r;
  try {
    r = await fetch('/api' + path, {
      method: method || (body ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(auth.token && { Authorization: 'Bearer ' + auth.token }) },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw new Error('You are offline. Saved visits will sync when this phone is back online.');
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.startsWith('/auth')) { auth.token = null; location.hash = '#/'; location.reload(); }
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}

// Offline queue for site visits. Each visit has a client_id so retries never duplicate.
const QK = 'visitQueue';
export const queued = () => JSON.parse(localStorage.getItem(QK) || '[]');
const save = (list) => { localStorage.setItem(QK, JSON.stringify(list)); window.dispatchEvent(new Event('queue')); };

export async function saveVisit(visit) {
  save([...queued(), visit]);
  await flushQueue();
}
let flushing = false;
export async function flushQueue() {
  if (flushing || !navigator.onLine || !auth.token) return;
  flushing = true;
  try {
    for (const v of queued()) {
      try { await api('/visits', v); save(queued().filter((x) => x.client_id !== v.client_id)); } catch { break; }
    }
  } finally { flushing = false; }
}

export const fmt = (n) => '$' + Number(n || 0).toFixed(2);
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random());
