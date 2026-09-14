// Shared Postgres client + client-IP helper for every API route.

const { neon } = require('@neondatabase/serverless');

const CONNECTION_STRING =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.STORAGE_DATABASE_URL ||
  process.env.STORAGE_POSTGRES_URL;

function getSql() {
  if (!CONNECTION_STRING) return null;
  return neon(CONNECTION_STRING);
}

// Vercel sits in front of every function as a proxy, so the real client IP
// arrives via x-forwarded-for (first entry in the chain) rather than the
// socket address. Used for rate limiting, not for anything security-critical
// on its own (headers can be spoofed by the client if not behind a proxy,
// but on Vercel this header is proxy-set and trustworthy).
function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  if (req.headers['x-real-ip']) return String(req.headers['x-real-ip']);
  return req.socket?.remoteAddress || 'unknown';
}

module.exports = { getSql, getClientIp };
