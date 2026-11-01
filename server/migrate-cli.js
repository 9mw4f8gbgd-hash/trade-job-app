import { connect, migrate, pool } from './db.js';
await connect(); await migrate(); await pool.end();
