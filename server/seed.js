import { q, one } from './db.js';
import { hashPassword } from './auth.js';
import { CATALOG } from './catalog.js';

export const STARTER_PARTS = CATALOG.map(([name, price]) => [name, price]);

export async function seed({ demo = true } = {}) {
  if (await one('SELECT id FROM shops LIMIT 1')) return console.log('seed skipped, data exists');
  const shop = await one("INSERT INTO shops (name, hourly_rate, tax_rate) VALUES ('Demo Well and Plumbing', 95, 6.5) RETURNING id");
  for (const [email, name] of [['owner@demo.test', 'Owner'], ['tech@demo.test', 'Tech'], ['office@demo.test', 'Office']])
    await q('INSERT INTO users (shop_id, email, name, password_hash) VALUES ($1,$2,$3,$4)', [shop.id, email, name, hashPassword('demo1234')]);
  for (const [name, price, trade] of CATALOG) await q('INSERT INTO parts (shop_id, name, price, trade) VALUES ($1,$2,$3,$4)', [shop.id, name, price, trade]);
  if (demo) {
    const day = (d, h) => { const t = new Date(); t.setDate(t.getDate() + d); t.setHours(h, 0, 0, 0); return t.toISOString(); };
    const jobs = [
      ['Mary Jones', '555-0101', '12 Oak Rd', 'No water, pump runs constantly', 'scheduled', day(0, 9)],
      ['Bob Smith', '555-0102', '88 Mill St', 'Water heater leaking', 'scheduled', day(0, 13)],
      ['Lee Carter', '555-0103', '4 Ridge Ln', 'Low pressure, check tank', 'new', day(1, 10)],
    ];
    for (const j of jobs) await q('INSERT INTO jobs (shop_id, customer_name, phone, address, notes, status, scheduled_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [shop.id, ...j]);
  }
  console.log('seeded demo shop. Login: owner@demo.test / demo1234');
}
