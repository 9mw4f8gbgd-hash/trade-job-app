import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { start } from './index.js';
import { q } from './db.js';
import { hashPassword } from './auth.js';
import { CATALOG } from './catalog.js';

const migrationSql = fs.readFileSync(new URL('./migrations/004_trade.sql', import.meta.url), 'utf8');

test('trade migration keeps prices and history, and tags the old catalog', async () => {
  for (const [name] of CATALOG) assert.ok(migrationSql.includes(`'${name}'`), name);
  const { newDb } = await import('pg-mem');
  const { Pool } = newDb().adapters.createPg();
  const pool = new Pool();
  const runFile = (name) => pool.query(fs.readFileSync(new URL('./migrations/' + name, import.meta.url), 'utf8'));
  await runFile('001_init.sql');
  const shop = (await pool.query("INSERT INTO shops (name, hourly_rate, tax_rate) VALUES ('Old Shop', 95, 6.5) RETURNING id")).rows[0];
  await pool.query(
    "INSERT INTO parts (shop_id, name, price) VALUES ($1, 'Kitchen faucet', 189), ($1, 'Submersible pump 1 HP', 500), ($1, 'My special fitting', 12.5)",
    [shop.id],
  );
  const job = (await pool.query('INSERT INTO jobs (shop_id, customer_name) VALUES ($1, $2) RETURNING id', [shop.id, 'Pat'])).rows[0];
  const items = JSON.stringify([{ name: 'Submersible pump 1 HP', price: 500, qty: 1 }, { name: 'Shop-made adapter', price: 42.5, qty: 2 }]);
  await pool.query(
    'INSERT INTO visits (shop_id, job_id, client_id, items, labor_hours) VALUES ($1,$2,$3,$4,1)',
    [shop.id, job.id, 'old-visit', items],
  );
  await pool.query(
    'INSERT INTO quotes (shop_id, job_id, token, items, labor_hours, hourly_rate, tax_rate, total) VALUES ($1,$2,$3,$4,1,95,6.5,123.45)',
    [shop.id, job.id, 'quote-token', items],
  );
  await pool.query(
    'INSERT INTO invoices (shop_id, job_id, token, items, labor_hours, hourly_rate, tax_rate, total, due_date) VALUES ($1,$2,$3,$4,1,95,6.5,123.45,$5)',
    [shop.id, job.id, 'invoice-token', items, '2026-12-01'],
  );

  await runFile('004_trade.sql');

  const shopAfter = (await pool.query('SELECT trade FROM shops WHERE id = $1', [shop.id])).rows[0];
  assert.equal(shopAfter.trade, 'both');
  const part = async (name) => (await pool.query('SELECT name, price, trade FROM parts WHERE shop_id = $1 AND name = $2', [shop.id, name])).rows[0];
  const faucet = await part('Kitchen faucet');
  const pump = await part('Submersible pump 1 HP');
  const custom = await part('My special fitting');
  const service = await part('Service call');
  const pull = await part('Pump pull and set');
  assert.equal(Number(faucet.price), 189);
  assert.equal(faucet.trade, 'plumbing');
  assert.equal(Number(pump.price), 500);
  assert.equal(pump.trade, 'well');
  assert.equal(Number(custom.price), 12.5);
  assert.equal(custom.trade, 'both');
  assert.equal(Number(service.price), 95);
  assert.equal(service.trade, 'both');
  assert.equal(pull.trade, 'well');
  assert.equal(Number((await pool.query('SELECT count(*) AS n FROM parts WHERE shop_id = $1 AND name = $2', [shop.id, 'Service call'])).rows[0].n), 1);
  const visit = (await pool.query('SELECT items FROM visits WHERE client_id = $1', ['old-visit'])).rows[0];
  const quote = (await pool.query('SELECT items, total FROM quotes WHERE token = $1', ['quote-token'])).rows[0];
  const invoice = (await pool.query('SELECT items, total FROM invoices WHERE token = $1', ['invoice-token'])).rows[0];
  assert.equal(visit.items, items);
  assert.equal(quote.items, items);
  assert.equal(Number(quote.total), 123.45);
  assert.equal(invoice.items, items);
  assert.equal(Number(invoice.total), 123.45);
  await pool.end();
});

describe('shop trade', { concurrency: false }, () => {
  test('filters the catalog, leaves history alone, and stays inside the shop', async () => {
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
    try {
      const token = (await send('/auth/login', { body: { email: 'owner@demo.test', password: 'demo1234' } })).json.token;
      const me = (await send('/me', { token })).json;
      assert.equal(me.shop.trade, null);
      const names = (list) => list.map((p) => p.name);
      let parts = (await send('/parts', { token })).json;
      assert.equal(parts.length, CATALOG.length);
      assert.ok(names(parts).includes('Kitchen faucet') && names(parts).includes('Submersible pump 1 HP') && names(parts).includes('Pump pull and set'));

      assert.equal((await send('/trade', { body: { trade: 'nope' }, token, method: 'PUT' })).status, 400);
      assert.equal((await send('/me', { token })).json.shop.trade, null);
      assert.equal((await send('/trade', { body: { trade: 'plumbing' }, token, method: 'PUT' })).json.trade, 'plumbing');
      parts = (await send('/parts', { token })).json;
      assert.ok(names(parts).includes('Kitchen faucet'));
      assert.ok(names(parts).includes('Service call'));
      assert.ok(names(parts).includes('Check valve 1 in'));
      assert.equal(names(parts).includes('Submersible pump 1 HP'), false);
      assert.equal(names(parts).includes('Pump pull and set'), false);
      const catalogCount = (await q('SELECT count(*) AS n FROM parts WHERE shop_id = $1', [me.shop.id]))[0].n;

      const job = (await send('/jobs', { body: { customer_name: 'Trade History' }, token })).json;
      const visit = {
        client_id: 'trade-visit',
        job_id: job.id,
        labor_hours: 1,
        items: [{ name: 'Submersible pump 1 HP', price: 21.25, qty: 1 }, { name: 'Shop-made adapter', price: 42.5, qty: 2 }],
      };
      assert.equal((await send('/visits', { body: visit, token })).status, 200);
      await send(`/jobs/${job.id}/quote`, { body: {}, token });
      const before = (await send(`/jobs/${job.id}`, { token })).json;
      const quoteTotal = before.quote.total;

      assert.equal((await send('/trade', { body: { trade: 'well' }, token, method: 'PUT' })).json.trade, 'well');
      const after = (await send(`/jobs/${job.id}`, { token })).json;
      assert.deepEqual(after.visits[0].items, before.visits[0].items);
      assert.equal(after.visits[0].items.find((i) => i.name === 'Submersible pump 1 HP').price, 21.25);
      assert.equal(after.visits[0].items.find((i) => i.name === 'Shop-made adapter').price, 42.5);
      assert.equal(after.quote.total, quoteTotal);
      assert.deepEqual(after.quote.items, before.quote.items);
      assert.equal((await q('SELECT count(*) AS n FROM parts WHERE shop_id = $1', [me.shop.id]))[0].n, catalogCount);
      parts = (await send('/parts', { token })).json;
      assert.ok(names(parts).includes('Submersible pump 1 HP'));
      assert.ok(names(parts).includes('Pump pull and set'));
      assert.equal(names(parts).includes('Kitchen faucet'), false);
      assert.equal(parts.find((p) => p.name === 'Submersible pump 1 HP').price, 789);
      assert.equal(names(parts).includes('Shop-made adapter'), false);
      const issued = (await send(`/public/quote/${before.quote.token}`)).json;
      assert.equal(issued.quote.total, quoteTotal);

      await send('/trade', { body: { trade: 'both' }, token, method: 'PUT' });
      parts = (await send('/parts', { token })).json;
      assert.ok(names(parts).includes('Kitchen faucet') && names(parts).includes('Submersible pump 1 HP'));

      const shop2 = (await q("INSERT INTO shops (name, trade) VALUES ('Plumbing Only', 'plumbing') RETURNING id"))[0];
      await q('INSERT INTO users (shop_id, email, name, password_hash) VALUES ($1,$2,$3,$4)', [shop2.id, 'plumber@demo.test', 'Plumber', hashPassword('demo1234')]);
      await q("INSERT INTO parts (shop_id, name, price, trade) VALUES ($1, 'Secret faucet', 10, 'plumbing'), ($1, 'Secret pump', 20, 'well')", [shop2.id]);
      const token2 = (await send('/auth/login', { body: { email: 'plumber@demo.test', password: 'demo1234' } })).json.token;
      const otherParts = (await send('/parts', { token: token2 })).json;
      assert.deepEqual(names(otherParts), ['Secret faucet']);
      const shop1Names = names((await send('/parts', { token })).json);
      assert.equal(shop1Names.includes('Secret faucet'), false);
      assert.equal(shop1Names.includes('Secret pump'), false);
      assert.equal((await send('/me', { token })).json.shop.trade, 'both');
      assert.equal((await send('/trade', { body: { trade: 'well' }, token: token2, method: 'PUT' })).json.trade, 'well');
      assert.equal((await send('/me', { token })).json.shop.trade, 'both');
      assert.deepEqual(names((await send('/parts', { token: token2 })).json), ['Secret pump']);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
