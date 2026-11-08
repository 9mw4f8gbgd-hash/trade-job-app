import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { connect, migrate, q, one, inMemory } from './db.js';
import { requireAuth, checkPassword, hashPassword, newToken } from './auth.js';
import { calc, mergeItems, diffParts, invoiceStatus } from './math.js';
import { paymentsConfigured, createCheckout } from './stripe.js';
import { seed } from './seed.js';
import { parseLogo } from './logo.js';

const app = express();
app.use(express.json({ limit: '15mb' }));
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  const status = e.status || 500;
  if (status >= 500) console.error(e);
  res.status(status).json({ error: e.message });
});
const fail = (status, message) => Object.assign(new Error(message), { status });
const J = (s) => JSON.parse(s || '[]');
const baseUrl = (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
const getShop = (id) => one('SELECT * FROM shops WHERE id = $1', [id]);
const publicShop = (shop) => ({ name: shop.name, logo: shop.logo || null });
const money = (row) => row && { ...row, items: J(row.items), ...calc({ items: J(row.items), laborHours: row.labor_hours, hourlyRate: row.hourly_rate, taxRate: row.tax_rate }) };
const withStatus = (inv) => inv && { ...money(inv), status: invoiceStatus(inv) };

// ---- auth ----
app.post('/api/auth/login', wrap(async (req, res) => {
  const u = await one('SELECT * FROM users WHERE email = $1', [String(req.body.email || '').toLowerCase().trim()]);
  if (!u || !checkPassword(req.body.password || '', u.password_hash)) throw fail(401, 'Wrong email or password');
  const token = newToken();
  await q('INSERT INTO sessions (token, user_id, shop_id) VALUES ($1,$2,$3)', [token, u.id, u.shop_id]);
  res.json({ token });
}));
// Magic link stub: logs link to server console instead of emailing.
app.post('/api/auth/magic', wrap(async (req, res) => {
  const u = await one('SELECT * FROM users WHERE email = $1', [String(req.body.email || '').toLowerCase().trim()]);
  if (u) {
    const token = newToken();
    await q('INSERT INTO sessions (token, user_id, shop_id) VALUES ($1,$2,$3)', [token, u.id, u.shop_id]);
    console.log(`[magic link stub] ${baseUrl(req)}/#/magic/${token}`);
  }
  res.json({ ok: true, message: 'If that email exists, a login link was created (see server log).' });
}));
app.get('/api/config', (req, res) => res.json({ payments: paymentsConfigured(), inMemory }));

const api = express.Router();
api.use(requireAuth);

api.get('/me', wrap(async (req, res) => {
  res.json({ user: await one('SELECT id, email, name FROM users WHERE id = $1', [req.userId]), shop: await getShop(req.shopId) });
}));
api.put('/settings', wrap(async (req, res) => {
  const { name, hourly_rate, tax_rate } = req.body;
  await q('UPDATE shops SET name = $1, hourly_rate = $2, tax_rate = $3 WHERE id = $4', [name, Number(hourly_rate) || 0, Number(tax_rate) || 0, req.shopId]);
  res.json(await getShop(req.shopId));
}));
api.put('/logo', wrap(async (req, res) => {
  const incoming = req.body.logo;
  if (incoming == null || incoming === '') {
    await q('UPDATE shops SET logo = NULL WHERE id = $1', [req.shopId]);
  } else {
    const parsed = parseLogo(incoming);
    if (parsed.error) throw fail(400, parsed.error);
    await q('UPDATE shops SET logo = $1 WHERE id = $2', [parsed.dataUrl, req.shopId]);
  }
  res.json(await getShop(req.shopId));
}));
api.get('/users', wrap(async (req, res) => res.json(await q('SELECT id, email, name FROM users WHERE shop_id = $1 ORDER BY id', [req.shopId]))));
api.post('/users', wrap(async (req, res) => {
  const { email, name, password } = req.body;
  if (!email || !password) throw fail(400, 'Email and password are required');
  res.json(await one('INSERT INTO users (shop_id, email, name, password_hash) VALUES ($1,$2,$3,$4) RETURNING id, email, name', [req.shopId, email.toLowerCase().trim(), name || '', hashPassword(password)]));
}));

// ---- parts ----
api.get('/parts', wrap(async (req, res) => res.json((await q('SELECT * FROM parts WHERE shop_id = $1 ORDER BY name', [req.shopId])).map((p) => ({ ...p, price: Number(p.price) })))));
api.post('/parts', wrap(async (req, res) => res.json(await one('INSERT INTO parts (shop_id, name, price) VALUES ($1,$2,$3) RETURNING *', [req.shopId, req.body.name, Number(req.body.price) || 0]))));

// ---- jobs ----
const jobFields = ['customer_name', 'phone', 'address', 'notes', 'status', 'scheduled_at'];
api.get('/jobs', wrap(async (req, res) => res.json(await q('SELECT * FROM jobs WHERE shop_id = $1 ORDER BY scheduled_at NULLS LAST, id DESC', [req.shopId]))));
api.post('/jobs', wrap(async (req, res) => {
  const b = req.body;
  if (!b.customer_name) throw fail(400, 'Customer name is required');
  res.json(await one('INSERT INTO jobs (shop_id, customer_name, phone, address, notes, status, scheduled_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [req.shopId, b.customer_name, b.phone || '', b.address || '', b.notes || '', b.status || 'new', b.scheduled_at || null]));
}));
async function loadJob(shopId, id) {
  const job = await one('SELECT * FROM jobs WHERE id = $1 AND shop_id = $2', [id, shopId]);
  if (!job) throw fail(404, 'Job not found');
  return job;
}
api.get('/jobs/:id', wrap(async (req, res) => {
  const job = await loadJob(req.shopId, req.params.id);
  const visits = (await q('SELECT * FROM visits WHERE job_id = $1 ORDER BY id', [job.id])).map((v) => ({ ...v, items: J(v.items), photos: J(v.photos) }));
  const quote = money(await one('SELECT * FROM quotes WHERE job_id = $1 ORDER BY id DESC LIMIT 1', [job.id]));
  const usedRow = await one('SELECT * FROM parts_used WHERE job_id = $1', [job.id]);
  const used = usedRow && { items: J(usedRow.items), labor_hours: Number(usedRow.labor_hours) };
  const invoice = withStatus(await one('SELECT * FROM invoices WHERE job_id = $1 ORDER BY id DESC LIMIT 1', [job.id]));
  const diff = quote && used ? diffParts(quote.items, used.items.filter((i) => i.used)) : null;
  res.json({ job, visits, quote, used, diff, invoice });
}));
api.put('/jobs/:id', wrap(async (req, res) => {
  const job = await loadJob(req.shopId, req.params.id);
  const v = jobFields.map((f) => (req.body[f] !== undefined ? req.body[f] : job[f]));
  res.json(await one('UPDATE jobs SET customer_name=$1, phone=$2, address=$3, notes=$4, status=$5, scheduled_at=$6 WHERE id=$7 RETURNING *', [...v, job.id]));
}));
// Filing a job away is separate from invoice and payment state.
api.post('/jobs/:id/complete', wrap(async (req, res) => {
  const job = await loadJob(req.shopId, req.params.id);
  res.json(await one('UPDATE jobs SET completed_at = COALESCE(completed_at, now()) WHERE id = $1 RETURNING *', [job.id]));
}));
api.post('/jobs/:id/reopen', wrap(async (req, res) => {
  const job = await loadJob(req.shopId, req.params.id);
  res.json(await one('UPDATE jobs SET completed_at = NULL WHERE id = $1 RETURNING *', [job.id]));
}));

function visitItems(list) {
  const out = [];
  for (const raw of list || []) {
    const qty = Number(raw?.qty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const name = String(raw?.name ?? '').trim();
    const priceNum = Number(raw?.price);
    if (!name) throw fail(400, 'Item name is required');
    if (!Number.isFinite(priceNum) || priceNum < 0) throw fail(400, 'Unit price must be zero or more');
    out.push({ name, price: Math.round(priceNum * 100) / 100, qty });
  }
  return out;
}
function cleanUsedItems(list) {
  if (!Array.isArray(list)) throw fail(400, 'Items are required');
  return list.map((raw) => {
    const name = String(raw?.name ?? '').trim();
    const qty = Number(raw?.qty);
    const priceNum = Number(raw?.price);
    if (!name) throw fail(400, 'Item name is required');
    if (!Number.isFinite(qty) || qty < 0) throw fail(400, 'Quantity must be zero or more');
    if (!Number.isFinite(priceNum) || priceNum < 0) throw fail(400, 'Unit price must be zero or more');
    return { name, price: Math.round(priceNum * 100) / 100, qty, used: !!raw.used };
  });
}

// ---- site visits (idempotent by client_id so offline queue can retry safely) ----
api.post('/visits', wrap(async (req, res) => {
  const b = req.body;
  const existing = await one('SELECT id FROM visits WHERE client_id = $1', [b.client_id]);
  if (existing) return res.json({ id: existing.id, duplicate: true });
  await loadJob(req.shopId, b.job_id);
  const items = visitItems(b.items);
  const v = await one('INSERT INTO visits (shop_id, job_id, client_id, notes, labor_hours, items, photos) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
    [req.shopId, b.job_id, b.client_id, b.notes || '', Number(b.labor_hours) || 0, JSON.stringify(items), JSON.stringify(b.photos || [])]);
  res.json(v);
}));

// ---- quote: drafted from all visits on the job ----
api.post('/jobs/:id/quote', wrap(async (req, res) => {
  const job = await loadJob(req.shopId, req.params.id);
  const shop = await getShop(req.shopId);
  const visits = await q('SELECT * FROM visits WHERE job_id = $1', [job.id]);
  if (!visits.length) throw fail(400, 'Add a site visit first');
  const items = mergeItems(visits.map((v) => J(v.items)));
  const labor = visits.reduce((s, v) => s + Number(v.labor_hours), 0);
  const notes = visits.map((v) => v.notes).filter(Boolean).join('\n');
  const t = calc({ items, laborHours: labor, hourlyRate: shop.hourly_rate, taxRate: shop.tax_rate });
  await one('INSERT INTO quotes (shop_id, job_id, token, items, labor_hours, hourly_rate, tax_rate, total, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    [req.shopId, job.id, newToken(), JSON.stringify(items), labor, shop.hourly_rate, shop.tax_rate, t.total, notes]);
  // start the parts-used checklist from the quote
  const usedItems = JSON.stringify(items.map((i) => ({ ...i, used: false })));
  if (await one('SELECT id FROM parts_used WHERE job_id = $1', [job.id])) await q('UPDATE parts_used SET items = $1, labor_hours = $2 WHERE job_id = $3', [usedItems, labor, job.id]);
  else await q('INSERT INTO parts_used (shop_id, job_id, items, labor_hours) VALUES ($1,$2,$3,$4)', [req.shopId, job.id, usedItems, labor]);
  await q("UPDATE jobs SET status = 'quoted' WHERE id = $1", [job.id]);
  res.json({ ok: true });
}));

// ---- parts used ----
api.put('/jobs/:id/used', wrap(async (req, res) => {
  const job = await loadJob(req.shopId, req.params.id);
  const items = cleanUsedItems(req.body.items);
  const labor = Number(req.body.labor_hours) || 0;
  if (await one('SELECT id FROM parts_used WHERE job_id = $1', [job.id])) await q('UPDATE parts_used SET items = $1, labor_hours = $2 WHERE job_id = $3', [JSON.stringify(items), labor, job.id]);
  else await q('INSERT INTO parts_used (shop_id, job_id, items, labor_hours) VALUES ($1,$2,$3,$4)', [req.shopId, job.id, JSON.stringify(items), labor]);
  res.json({ ok: true });
}));

// ---- invoice: built from checked parts + final labor ----
api.post('/jobs/:id/invoice', wrap(async (req, res) => {
  const job = await loadJob(req.shopId, req.params.id);
  const shop = await getShop(req.shopId);
  const used = await one('SELECT * FROM parts_used WHERE job_id = $1', [job.id]);
  if (!used) throw fail(400, 'Make a quote or record parts used first');
  const items = J(used.items).filter((i) => i.used).map(({ name, price, qty }) => ({ name, price, qty }));
  const t = calc({ items, laborHours: used.labor_hours, hourlyRate: shop.hourly_rate, taxRate: shop.tax_rate });
  const due = new Date(Date.now() + (Number(req.body.days) || 14) * 864e5).toISOString().slice(0, 10);
  await q('INSERT INTO invoices (shop_id, job_id, token, items, labor_hours, hourly_rate, tax_rate, total, due_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [req.shopId, job.id, newToken(), JSON.stringify(items), used.labor_hours, shop.hourly_rate, shop.tax_rate, t.total, due]);
  await q("UPDATE jobs SET status = 'invoiced' WHERE id = $1", [job.id]);
  res.json({ ok: true });
}));
api.post('/invoices/:id/paid', wrap(async (req, res) => {
  const inv = await one('SELECT * FROM invoices WHERE id = $1 AND shop_id = $2', [req.params.id, req.shopId]);
  if (!inv) throw fail(404, 'Invoice not found');
  const method = ['check', 'cash', 'venmo', 'card', 'other'].includes(req.body.method) ? req.body.method : 'other';
  await q('UPDATE invoices SET paid_at = now(), paid_method = $1, paid_note = $2 WHERE id = $3', [method, String(req.body.note || '').slice(0, 200), inv.id]);
  await q("UPDATE jobs SET status = 'paid' WHERE id = $1", [inv.job_id]);
  res.json({ ok: true });
}));

// ---- money dashboard ----
api.get('/money', wrap(async (req, res) => {
  const rows = await q('SELECT i.*, j.customer_name FROM invoices i JOIN jobs j ON j.id = i.job_id WHERE i.shop_id = $1 ORDER BY i.id DESC', [req.shopId]);
  const invoices = rows.map((r) => ({ id: r.id, job_id: r.job_id, customer_name: r.customer_name, total: Number(r.total), due_date: r.due_date, status: invoiceStatus(r), paid_method: r.paid_method, paid_note: r.paid_note }));
  const summary = {};
  for (const s of ['unpaid', 'viewed', 'overdue', 'paid']) {
    const list = invoices.filter((i) => i.status === s);
    summary[s] = { count: list.length, amount: Math.round(list.reduce((a, i) => a + i.total, 0) * 100) / 100 };
  }
  res.json({ summary, invoices });
}));

// ---- public customer links (no login) ----
const pub = express.Router();
pub.get('/quote/:token', wrap(async (req, res) => {
  const qt = await one('SELECT * FROM quotes WHERE token = $1', [req.params.token]);
  if (!qt) throw fail(404, 'Quote not found');
  const job = await one('SELECT customer_name, address FROM jobs WHERE id = $1', [qt.job_id]);
  res.json({ quote: money(qt), job, shop: publicShop(await getShop(qt.shop_id)) });
}));
pub.post('/quote/:token/approve', wrap(async (req, res) => {
  const qt = await one('SELECT * FROM quotes WHERE token = $1', [req.params.token]);
  if (!qt) throw fail(404, 'Quote not found');
  if (!qt.approved_at) {
    await q('UPDATE quotes SET approved_at = now() WHERE id = $1', [qt.id]);
    await q("UPDATE jobs SET status = 'approved' WHERE id = $1", [qt.job_id]);
  }
  res.json({ ok: true });
}));
pub.get('/invoice/:token', wrap(async (req, res) => {
  let inv = await one('SELECT * FROM invoices WHERE token = $1', [req.params.token]);
  if (!inv) throw fail(404, 'Invoice not found');
  if (!inv.viewed_at && req.query.preview !== '1') { await q('UPDATE invoices SET viewed_at = now() WHERE id = $1', [inv.id]); inv = { ...inv, viewed_at: new Date() }; }
  const job = await one('SELECT customer_name, address FROM jobs WHERE id = $1', [inv.job_id]);
  res.json({ invoice: withStatus(inv), job, shop: publicShop(await getShop(inv.shop_id)), payments: paymentsConfigured() });
}));
pub.post('/invoice/:token/pay', wrap(async (req, res) => {
  if (!paymentsConfigured()) throw fail(400, 'Online payments are not set up yet');
  const inv = await one('SELECT * FROM invoices WHERE token = $1', [req.params.token]);
  if (!inv) throw fail(404, 'Invoice not found');
  res.json({ url: await createCheckout({ invoice: inv, shopName: (await getShop(inv.shop_id)).name, baseUrl: baseUrl(req) }) });
}));
app.use('/api/public', pub);
app.use('/api', api);

// ---- serve built web app ----
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../web/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

export async function start(port = process.env.PORT || 3001) {
  await connect();
  await migrate();
  if (inMemory || process.env.SEED_ON_START) await seed();
  return app.listen(port, () => console.log(`API on :${port}${inMemory ? ' (in-memory DB, set DATABASE_URL for Postgres)' : ''}`));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) start();
export default app;
