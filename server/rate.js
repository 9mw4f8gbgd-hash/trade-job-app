const hits = new Map();

export function rateLimit(req, bucket, max, windowMs = 15 * 60 * 1000) {
  const ip = req.ip || req.socket?.remoteAddress || 'local';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return false;
  recent.push(now);
  hits.set(key, recent);
  return true;
}
