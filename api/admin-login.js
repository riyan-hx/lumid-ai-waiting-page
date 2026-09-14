// POST /api/admin-login
// Verifies the admin key (timing-safe comparison) and, on success, issues a
// signed HttpOnly session cookie instead of handing the raw secret back to
// the browser. Rate-limited per IP (DB-backed, survives cold starts) so the
// key can't be brute-forced by hammering this endpoint — 8 attempts per 15
// minutes, then a 429 until the window clears.

const { getSql, getClientIp } = require('./_lib/db');
const { checkRateLimit } = require('./_lib/rateLimit');
const { createSessionCookie, timingSafeEqualSecret } = require('./_lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const expectedKey = process.env.ADMIN_SECRET;
  if (!expectedKey) {
    res.status(500).json({ ok: false, error: 'ADMIN_SECRET is not configured on the server.' });
    return;
  }

  const sql = getSql();
  if (!sql) {
    res.status(500).json({ ok: false, error: 'Database is not configured yet.' });
    return;
  }

  const ip = getClientIp(req);

  try {
    const { allowed, retryAfter } = await checkRateLimit(sql, {
      bucket: 'admin_login',
      identifier: ip,
      limit: 8,
      windowSeconds: 15 * 60,
    });

    if (!allowed) {
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ ok: false, error: 'Too many attempts. Try again later.' });
      return;
    }
  } catch (err) {
    console.error('admin-login: rate limit check failed', err);
    // Fail closed would lock out real admins if the DB hiccups; fail open
    // here since the login is still gated by the secret comparison below.
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  const providedKey = String(body.key || '');

  if (!timingSafeEqualSecret(providedKey, expectedKey)) {
    res.status(401).json({ ok: false, error: 'Wrong admin key.' });
    return;
  }

  res.setHeader('Set-Cookie', createSessionCookie(expectedKey));
  res.status(200).json({ ok: true });
};
