import test from 'node:test';
import assert from 'node:assert/strict';
import { start } from './index.js';
import { CATALOG } from './catalog.js';

test('sign-up creates an isolated shop, owner, catalog, and technician', async () => {
  delete process.env.DATABASE_URL;
  const server = await start(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const send = async (path, { body, token, method } = {}) => {
    const r = await fetch(base + path, {
      method: method || (body !== undefined ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await r.json().catch(() => ({}));
    return { status: r.status, json };
  };
  const signup = (extra) => send('/auth/signup', { body: { shop_name: 'A Wells', owner_name: 'Ada', email: 'ada@shop-a.test', password: 'secretpass', confirm: 'secretpass', trade: 'well', ...extra } });
  try {
    const demo = await send('/auth/login', { body: { email: 'owner@demo.test', password: 'demo1234' } });
    assert.equal(demo.status, 200);
    assert.ok((await send('/jobs', { token: demo.json.token })).json.some((j) => j.customer_name === 'Mary Jones'));
    const demoTech = await send('/auth/login', { body: { email: 'tech@demo.test', password: 'demo1234' } });
    assert.equal(demoTech.status, 200);
    assert.equal((await send('/me', { token: demoTech.json.token })).json.user.role, 'tech');

    assert.equal((await signup({ password: 'short', confirm: 'short' })).status, 400);
    assert.equal((await signup({ confirm: 'secretpassX' })).json.error, 'Passwords do not match');
    const a = await signup();
    assert.equal(a.status, 200);
    assert.ok(a.json.token);
    assert.equal((await signup({ shop_name: 'Other', owner_name: 'Other', email: 'Ada@shop-a.test' })).json.error, 'That email is already in use');

    const meA = (await send('/me', { token: a.json.token })).json;
    assert.equal(meA.user.role, 'owner');
    assert.equal(meA.shop.name, 'A Wells');
    assert.equal(meA.shop.trade, 'well');
    const partsA = (await send('/parts', { token: a.json.token })).json;
    assert.ok(partsA.some((p) => p.name === 'Submersible pump 1 HP'));
    assert.equal(partsA.some((p) => p.name === 'Kitchen faucet'), false);
    assert.equal(partsA.length, CATALOG.filter((row) => row[2] === 'well' || row[2] === 'both').length);
    assert.deepEqual((await send('/jobs', { token: a.json.token })).json, []);

    const job = (await send('/jobs', { body: { customer_name: 'Only A', phone: '555-0199', address: '1 Well Rd' }, token: a.json.token })).json;
    await send('/visits', { body: { client_id: 'signup-visit', job_id: job.id, labor_hours: 1, items: [{ name: 'Shop-made adapter', price: 42.5, qty: 1 }] }, token: a.json.token });
    await send(`/jobs/${job.id}/quote`, { body: {}, token: a.json.token });
    let detail = (await send(`/jobs/${job.id}`, { token: a.json.token })).json;
    await send(`/jobs/${job.id}/used`, { body: { items: detail.used.items.map((i) => ({ ...i, used: true })), labor_hours: 1 }, token: a.json.token, method: 'PUT' });
    await send(`/jobs/${job.id}/invoice`, { body: {}, token: a.json.token });
    detail = (await send(`/jobs/${job.id}`, { token: a.json.token })).json;
    assert.equal(detail.quote.items[0].price, 42.5);
    assert.ok(detail.invoice.id);

    const b = await signup({ shop_name: 'B Plumbing', owner_name: 'Bea', email: 'bea@shop-b.test', trade: 'plumbing' });
    assert.equal(b.status, 200);
    const meB = (await send('/me', { token: b.json.token })).json;
    assert.equal(meB.shop.name, 'B Plumbing');
    assert.notEqual(meB.shop.id, meA.shop.id);
    assert.deepEqual((await send('/jobs', { token: b.json.token })).json, []);
    assert.equal((await send(`/jobs/${job.id}`, { token: b.json.token })).status, 404);
    assert.equal((await send('/money', { token: b.json.token })).json.invoices.length, 0);
    const partsB = (await send('/parts', { token: b.json.token })).json;
    assert.ok(partsB.some((p) => p.name === 'Kitchen faucet'));
    assert.equal(partsB.some((p) => p.name === 'Submersible pump 1 HP'), false);
    assert.equal(partsB.some((p) => p.id === partsA[0].id), false);
    await send('/settings', { body: { name: 'A Wells Renamed', hourly_rate: 110, tax_rate: 0 }, token: a.json.token, method: 'PUT' });
    assert.equal((await send('/me', { token: b.json.token })).json.shop.name, 'B Plumbing');
    assert.equal((await send('/me', { token: a.json.token })).json.shop.name, 'A Wells Renamed');

    const tech = await send('/users', { body: { name: 'Terry', email: 'terry@shop-a.test', password: 'temppass1' }, token: a.json.token });
    assert.equal(tech.status, 200);
    assert.equal(tech.json.role, 'tech');
    const techLogin = await send('/auth/login', { body: { email: 'terry@shop-a.test', password: 'temppass1' } });
    assert.equal(techLogin.status, 200);
    assert.equal((await send('/jobs', { token: techLogin.json.token })).json[0].customer_name, 'Only A');
    assert.equal((await send('/users', { body: { name: 'Nope', email: 'nope@shop-a.test', password: 'temppass1' }, token: techLogin.json.token })).status, 403);
    assert.equal((await send('/jobs', { token: b.json.token })).json.length, 0);

    let blocked = 0;
    for (let i = 0; i < 12; i++) {
      const r = await signup({ shop_name: 'Spam', owner_name: 'Spam', email: `spam${i}@shop.test` });
      if (r.status === 429) blocked++;
    }
    assert.ok(blocked > 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
