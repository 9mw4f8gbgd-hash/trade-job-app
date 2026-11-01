import { connect, migrate, pool } from './db.js';
import { seed } from './seed.js';
await connect(); await migrate(); await seed(); await pool.end();
