import test from 'node:test';
import assert from 'node:assert/strict';

test('offline queue keeps a custom price and flushes the same visit once', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  globalThis.location = { hash: '#/', reload() {} };
  const nav = { onLine: false };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: nav });
  globalThis.window = { dispatchEvent() {} };
  const bodies = [];
  let failNext = true;
  globalThis.fetch = async (_url, opts) => {
    bodies.push(JSON.parse(opts.body));
    if (failNext) return { ok: false, status: 500, json: async () => ({ error: 'down' }) };
    return { ok: true, status: 200, json: async () => ({ id: 1 }) };
  };

  const { auth, saveVisit, queued, flushQueue } = await import('./api.js');
  auth.token = 'queue-token';
  const visit = {
    client_id: 'offline-custom',
    job_id: 4,
    labor_hours: 1,
    notes: 'adapter',
    photos: [],
    items: [{ name: 'Shop-made adapter', price: 42.5, qty: 2 }],
  };
  await saveVisit(visit);
  assert.equal(queued().length, 1);
  assert.equal(JSON.parse(localStorage.getItem('visitQueue'))[0].items[0].price, 42.5);
  assert.equal(bodies.length, 0);

  nav.onLine = true;
  await flushQueue();
  assert.equal(queued().length, 1);
  failNext = false;
  await flushQueue();
  assert.equal(queued().length, 0);
  await flushQueue();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].client_id, 'offline-custom');
  assert.equal(bodies[1].client_id, 'offline-custom');
  assert.deepEqual(bodies[0].items, [{ name: 'Shop-made adapter', price: 42.5, qty: 2 }]);
  assert.deepEqual(bodies[1].items, bodies[0].items);
});
