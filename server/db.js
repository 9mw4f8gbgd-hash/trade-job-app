import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
export let pool;
export let inMemory = false;

export async function connect() {
  if (process.env.DATABASE_URL) {
    const pg = (await import('pg')).default;
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL ? { rejectUnauthorized: false } : undefined });
  } else {
    // Dev fallback: in-memory Postgres emulation. Data resets on restart.
    const { newDb } = await import('pg-mem');
    const { Pool } = newDb().adapters.createPg();
    pool = new Pool();
    inMemory = true;
  }
  return pool;
}

export const q = async (sql, params) => (await pool.query(sql, params)).rows;
export const one = async (sql, params) => (await q(sql, params))[0];

export async function migrate() {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)');
  const done = new Set((await q('SELECT name FROM schema_migrations')).map((r) => r.name));
  const files = fs.readdirSync(path.join(dir, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    await pool.query(fs.readFileSync(path.join(dir, 'migrations', f), 'utf8'));
    await q('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
    console.log('migrated', f);
  }
}
