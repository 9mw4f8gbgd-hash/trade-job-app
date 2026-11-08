import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { start } from './index.js';
import { q } from './db.js';
import { hashPassword } from './auth.js';
import { calc } from './math.js';
import { LOGO_MAX_BYTES } from './logo.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PNG_URL = `data:image/png;base64,${PNG.toString('base64')}`;
const JPEG_URL = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')}`;

async function boot() {
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
  const { json } = await send('/auth/login', { body: { email: 'owner@demo.test', password: 'demo1234' } });
  return { server, send, token: json.token };
}

describe('job completion, visit prices, and shop logos', { concurrency: false }, () => {
  test('completing a job files it without touching an unpaid invoice', async () => {
    const { server, send, token } = await boot();
    try {
      const job = (await send('/jobs', { body: { customer_name: 'Unpaid Complete' }, token })).json;
      await send('/visits', { body: { client_id: 'complete-visit', job_id: job.id, labor_hours: 1, items: [{ name: 'Wax ring', price: 7, qty: 1 }] }, token });
      await send(`/jobs/${job.id}/quote`, { body: {}, token });
      let detail = (await send(`/jobs/${job.id}`, { token })).json;
      await send(`/jobs/${job.id}/used`, { body: { items: detail.used.items.map((i) => ({ ...i, used: true })), labor_hours: 1 }, token, method: 'PUT' });
      await send(`/jobs/${job.id}/invoice`, { body: {}, token });
      const before = (await send('/money', { token })).json;
      detail = (await send(`/jobs/${job.id}`, { token })).json;
      assert.equal(detail.job.status, 'invoiced');
      assert.equal(detail.invoice.paid_at, null);
      assert.equal(detail.invoice.status === 'paid', false);
      const total = detail.invoice.total;

      const completed = (await send(`/jobs/${job.id}/complete`, { body: {}, token })).json;
      assert.ok(completed.completed_at);
      assert.equal(completed.status, 'invoiced');
      detail = (await send(`/jobs/${job.id}`, { token })).json;
      assert.equal(detail.job.status, 'invoiced');
      assert.ok(detail.job.completed_at);
      assert.equal(detail.invoice.paid_at, null);
      assert.equal(detail.invoice.total, total);
      assert.equal(detail.invoice.status === 'paid', false);
      assert.ok(detail.visits.length === 1 && detail.quote && detail.invoice);
      const after = (await send('/money', { token })).json;
      assert.deepEqual(after.summary, before.summary);
      assert.equal(after.invoices[0].status === 'paid', false);
      assert.equal(after.invoices[0].total, before.invoices[0].total);
      const listed = (await send('/jobs', { token })).json;
      assert.ok(listed.some((j) => j.id === job.id && j.completed_at));

      const reopened = (await send(`/jobs/${job.id}/reopen`, { body: {}, token })).json;
      assert.equal(reopened.completed_at, null);
      assert.equal(reopened.status, 'invoiced');
      detail = (await send(`/jobs/${job.id}`, { token })).json;
      assert.equal(detail.job.completed_at, null);
      assert.equal(detail.invoice.total, total);
      assert.equal(detail.invoice.paid_at, null);
      assert.deepEqual((await send('/money', { token })).json.summary, before.summary);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('edited and custom visit prices flow to quote, parts used, and invoice only', async () => {
    const { server, send, token } = await boot();
    try {
      const me = (await send('/me', { token })).json;
      const catalog = (await send('/parts', { token })).json;
      const sw = catalog.find((p) => p.name === 'Pressure switch 30/50');
      assert.equal(sw.price, 38);
      const job = (await send('/jobs', { body: { customer_name: 'Price Edit' }, token })).json;
      const visit = {
        client_id: 'price-1',
        job_id: job.id,
        labor_hours: 1,
        items: [
          { name: 'Pressure switch 30/50', price: 21.25, qty: 1 },
          { name: 'Shop-made adapter', price: 42.5, qty: 2 },
          { name: 'Warranty gasket', price: 0, qty: 1 },
        ],
      };
      assert.equal((await send('/visits', { body: visit, token })).status, 200);
      const retry = await send('/visits', { body: { ...visit, items: [{ name: 'Shop-made adapter', price: 999, qty: 9 }] }, token });
      assert.equal(retry.json.duplicate, true);

      await send(`/jobs/${job.id}/quote`, { body: {}, token });
      let detail = (await send(`/jobs/${job.id}`, { token })).json;
      const lines = detail.quote.items;
      assert.equal(lines.find((i) => i.name === 'Pressure switch 30/50').price, 21.25);
      assert.equal(lines.find((i) => i.name === 'Shop-made adapter').price, 42.5);
      assert.equal(lines.find((i) => i.name === 'Shop-made adapter').qty, 2);
      assert.equal(lines.find((i) => i.name === 'Warranty gasket').price, 0);
      const expected = calc({ items: lines, laborHours: 1, hourlyRate: me.shop.hourly_rate, taxRate: me.shop.tax_rate });
      assert.equal(detail.quote.total, expected.total);
      assert.notEqual(expected.parts, 38 + 42.5 * 2);
      const partsAfter = (await send('/parts', { token })).json;
      assert.equal(partsAfter.find((p) => p.name === 'Pressure switch 30/50').price, 38);
      assert.equal(partsAfter.find((p) => p.name === 'Shop-made adapter'), undefined);
      assert.equal(detail.used.items.find((i) => i.name === 'Shop-made adapter').price, 42.5);

      await send(`/jobs/${job.id}/used`, { body: { items: detail.used.items.map((i) => ({ ...i, used: true })), labor_hours: detail.used.labor_hours }, token, method: 'PUT' });
      await send(`/jobs/${job.id}/invoice`, { body: {}, token });
      detail = (await send(`/jobs/${job.id}`, { token })).json;
      const quoteToken = detail.quote.token;
      const quoteTotal = detail.quote.total;
      const invoiceId = detail.invoice.id;
      const invoiceTotal = detail.invoice.total;
      assert.equal(detail.invoice.items.find((i) => i.name === 'Pressure switch 30/50').price, 21.25);
      assert.equal(detail.invoice.items.find((i) => i.name === 'Shop-made adapter').price, 42.5);
      assert.equal(invoiceTotal, quoteTotal);

      const extra = { client_id: 'price-2', job_id: job.id, labor_hours: 0, items: [{ name: 'Extra trip charge', price: 999, qty: 1 }] };
      await send('/visits', { body: extra, token });
      await send('/visits', { body: extra, token });
      assert.equal((await send(`/jobs/${job.id}`, { token })).json.visits.length, 2);
      await send(`/jobs/${job.id}/quote`, { body: {}, token });
      detail = (await send(`/jobs/${job.id}`, { token })).json;
      assert.equal(detail.invoice.id, invoiceId);
      assert.equal(detail.invoice.total, invoiceTotal);
      assert.equal(detail.invoice.items.find((i) => i.name === 'Extra trip charge'), undefined);
      assert.ok(detail.quote.items.find((i) => i.name === 'Extra trip charge'));
      const issued = (await send(`/public/quote/${quoteToken}`)).json;
      assert.equal(issued.quote.total, quoteTotal);
      assert.equal(issued.quote.items.find((i) => i.name === 'Extra trip charge'), undefined);
      assert.equal(issued.shop.logo, null);

      const rejected = await send('/visits', { body: { client_id: 'price-bad', job_id: job.id, labor_hours: 1, items: [{ name: 'Nope', price: -5, qty: 1 }] }, token });
      assert.equal(rejected.status, 400);
      assert.equal((await send(`/jobs/${job.id}`, { token })).json.visits.length, 2);
      assert.equal((await send('/parts', { token })).json.find((p) => p.name === 'Pressure switch 30/50').price, 38);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('logo upload is validated, replaceable, and isolated per shop', async () => {
    const { server, send, token } = await boot();
    try {
      const me = (await send('/me', { token })).json;
      assert.equal(me.shop.logo, null);
      await q('INSERT INTO users (shop_id, email, name, password_hash) VALUES ($1,$2,$3,$4)', [
        (await q("INSERT INTO shops (name) VALUES ('Other Shop') RETURNING id"))[0].id,
        'other@demo.test',
        'Other',
        hashPassword('demo1234'),
      ]);
      const token2 = (await send('/auth/login', { body: { email: 'other@demo.test', password: 'demo1234' } })).json.token;

      const uploaded = await send('/logo', { body: { logo: PNG_URL }, token: token2, method: 'PUT' });
      assert.equal(uploaded.status, 200);
      assert.ok(uploaded.json.logo.startsWith('data:image/png;base64,'));
      assert.equal((await send('/me', { token })).json.shop.logo, null);
      const rows = await q('SELECT name, logo FROM shops ORDER BY id');
      assert.equal(rows[0].logo, null);
      assert.ok(String(rows[1].logo).startsWith('data:image/png;base64,'));

      const renamed = await send('/settings', { body: { name: 'Other Shop LLC', hourly_rate: 100, tax_rate: 0 }, token: token2, method: 'PUT' });
      assert.equal(renamed.json.name, 'Other Shop LLC');
      assert.ok(renamed.json.logo.startsWith('data:image/png;base64,'));

      const job = (await send('/jobs', { body: { customer_name: 'Other Customer' }, token: token2 })).json;
      await send('/visits', { body: { client_id: 'shop2-visit', job_id: job.id, labor_hours: 0, items: [{ name: 'Custom only', price: 10, qty: 1 }] }, token: token2 });
      await send(`/jobs/${job.id}/quote`, { body: {}, token: token2 });
      await send(`/jobs/${job.id}/used`, { body: { items: [{ name: 'Custom only', price: 10, qty: 1, used: true }], labor_hours: 0 }, token: token2, method: 'PUT' });
      await send(`/jobs/${job.id}/invoice`, { body: {}, token: token2 });
      const detail = (await send(`/jobs/${job.id}`, { token: token2 })).json;
      const quote = (await send(`/public/quote/${detail.quote.token}`)).json;
      const invoice = (await send(`/public/invoice/${detail.invoice.token}?preview=1`)).json;
      assert.equal(quote.shop.name, 'Other Shop LLC');
      assert.ok(quote.shop.logo.startsWith('data:image/png;base64,'));
      assert.equal(quote.quote.items[0].price, 10);
      assert.ok(invoice.shop.logo.startsWith('data:image/png;base64,'));
      assert.equal((await send(`/jobs/${job.id}`, { token })).status, 404);

      const svg = await send('/logo', { body: { logo: 'data:image/svg+xml;base64,PHN2Zy8+' }, token: token2, method: 'PUT' });
      assert.equal(svg.status, 400);
      const big = Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES)]);
      const over = await send('/logo', { body: { logo: `data:image/png;base64,${big.toString('base64')}` }, token: token2, method: 'PUT' });
      assert.equal(over.status, 400);
      assert.ok((await send('/me', { token: token2 })).json.shop.logo.startsWith('data:image/png;base64,'));

      const replaced = await send('/logo', { body: { logo: JPEG_URL }, token: token2, method: 'PUT' });
      assert.equal(replaced.status, 200);
      assert.ok(replaced.json.logo.startsWith('data:image/jpeg;base64,'));
      const removed = await send('/logo', { body: { logo: null }, token: token2, method: 'PUT' });
      assert.equal(removed.status, 200);
      assert.equal(removed.json.logo, null);
      assert.equal((await send(`/public/quote/${detail.quote.token}`)).json.shop.logo, null);
      assert.equal((await send(`/public/invoice/${detail.invoice.token}?preview=1`)).json.shop.logo, null);
      assert.equal((await send('/me', { token })).json.shop.logo, null);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
