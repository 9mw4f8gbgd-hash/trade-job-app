import { q, one } from './db.js';
import { hashPassword } from './auth.js';

export const STARTER_PARTS = [
  ['Pressure tank 20 gal', 289], ['Pressure tank 44 gal', 449], ['Pressure tank 86 gal', 689],
  ['Pressure switch 30/50', 38], ['Pressure switch 40/60', 38], ['Pressure gauge', 12],
  ['Submersible pump 1/2 HP', 545], ['Submersible pump 3/4 HP', 649], ['Submersible pump 1 HP', 789],
  ['Pump control box', 185], ['Check valve 1 in', 24], ['Pitless adapter 1 in', 79],
  ['Well cap 6 in', 45], ['Torque arrestor', 18], ['Submersible wire 12/2 per ft', 1.6],
  ['Splice kit', 14], ['Poly pipe 1 in per ft', 1.1], ['PEX pipe 3/4 in per ft', 0.9],
  ['Copper pipe 3/4 in per ft', 6.5], ['Brass tank tee', 42], ['Boiler drain', 9],
  ['Relief valve 100 psi', 16], ['Fittings misc', 15], ['Shark bite 3/4 in', 11],
  ['Ball valve shutoff 3/4 in', 19], ['Angle stop shutoff', 9], ['Supply line faucet', 8],
  ['Supply line toilet', 8], ['Kitchen faucet', 189], ['Bathroom faucet', 129],
  ['Toilet fill valve', 18], ['Toilet flapper', 9], ['Wax ring', 7],
  ['Water heater element', 28], ['Water heater thermostat', 32], ['Anode rod', 39],
  ['T and P valve', 24], ['Thermocouple', 14], ['Gas water heater 40 gal', 899],
  ['Expansion tank', 59], ['Sediment filter housing', 69], ['P trap 1 1/2 in', 12],
];

export async function seed({ demo = true } = {}) {
  if (await one('SELECT id FROM shops LIMIT 1')) return console.log('seed skipped, data exists');
  const shop = await one("INSERT INTO shops (name, hourly_rate, tax_rate) VALUES ('Demo Well and Plumbing', 95, 6.5) RETURNING id");
  for (const [email, name] of [['owner@demo.test', 'Owner'], ['tech@demo.test', 'Tech'], ['office@demo.test', 'Office']])
    await q('INSERT INTO users (shop_id, email, name, password_hash) VALUES ($1,$2,$3,$4)', [shop.id, email, name, hashPassword('demo1234')]);
  for (const [name, price] of STARTER_PARTS) await q('INSERT INTO parts (shop_id, name, price) VALUES ($1,$2,$3)', [shop.id, name, price]);
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
