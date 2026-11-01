import crypto from 'node:crypto';
import { one } from './db.js';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
}
export function checkPassword(pw, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.scryptSync(pw, salt, 32));
}
export const newToken = () => crypto.randomBytes(24).toString('hex');

export async function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const s = token && (await one('SELECT user_id, shop_id FROM sessions WHERE token = $1', [token]));
  if (!s) return res.status(401).json({ error: 'Please log in' });
  req.userId = s.user_id;
  req.shopId = s.shop_id;
  next();
}
