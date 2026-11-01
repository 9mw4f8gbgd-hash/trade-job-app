import test from 'node:test';
import assert from 'node:assert/strict';
import { start } from './index.js';

test('end to end: visit, quote, approve, parts used, invoice, paid', async () => {
  delete process.env.DATABASE_URL;
  const server = await start(0);
  const base = `http://localhost:${server.address().port}/api`;
  const call = async (p, body, token, method) => {
    const r = await fetch(base + p, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) });
    return r.json();
  };
  const { token } = await call('/auth/login', { email: 'owner@demo.test', password: 'demo1234' });
  assert.ok(token);
  const parts = await call('/parts', null, token);
  assert.ok(parts.length >= 40);
  const job = await call('/jobs', { customer_name: 'Test' }, token);
  const visit = { client_id: 'abc', job_id: job.id, labor_hours: 2, notes: 'replace switch', items: [{ name: 'Pressure switch 30/50', price: 38, qty: 1 }, { name: 'Fittings misc', price: 15, qty: 2 }] };
  await call('/visits', visit, token);
  assert.equal((await call('/visits', visit, token)).duplicate, true); // offline retry is safe
  await call(`/jobs/${job.id}/quote`, {}, token);
  let d = await call(`/jobs/${job.id}`, null, token);
  assert.equal(d.quote.total, Math.round((38 + 30 + 190) * 1.065 * 100) / 100);
  await call(`/public/quote/${d.quote.token}/approve`, {});
  const items = d.used.items.map((i) => ({ ...i, used: i.name !== 'Fittings misc' }));
  await call(`/jobs/${job.id}/used`, { items, labor_hours: 1.5 }, token, 'PUT');
  await call(`/jobs/${job.id}/invoice`, {}, token);
  d = await call(`/jobs/${job.id}`, null, token);
  assert.equal(d.job.status, 'invoiced');
  assert.equal(d.invoice.total, Math.round((38 + 142.5) * 1.065 * 100) / 100);
  assert.deepEqual(d.diff.find((x) => x.name === 'Fittings misc'), { name: 'Fittings misc', quoted: 2, used: 0, delta: -2 });
  const pub = await call(`/public/invoice/${d.invoice.token}`);
  assert.equal(pub.invoice.status, 'viewed');
  assert.equal(pub.payments, false);
  await call(`/invoices/${d.invoice.id}/paid`, { method: 'check', note: '#1042' }, token);
  const m = await call('/money', null, token);
  assert.equal(m.summary.paid.count, 1);
  assert.equal(m.invoices[0].paid_method, 'check');
  assert.equal(m.invoices[0].paid_note, '#1042');
  server.close();
});
