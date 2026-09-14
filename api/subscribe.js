// POST /api/subscribe
// Stores a waitlist signup (email + timestamp + light metadata) in Postgres.
// Rate-limited per IP (DB-backed, survives cold starts) so this can't be
// used to flood the table with junk signups — 8 submissions per hour per IP,
// which comfortably covers a real visitor retrying a typo but blocks a bot
// hammering the endpoint.

const { getSql, getClientIp } = require('./_lib/db');
const { checkRateLimit } = require('./_lib/rateLimit');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254; // RFC 5321

let schemaReady = null;

async function ensureSchema(sql) {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS subscribers (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        source TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
  }
  await schemaReady;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const sql = getSql();
  if (!sql) {
    console.error('subscribe: no database connection string configured');
    res.status(500).json({ ok: false, error: 'Server is not configured yet. Try again shortly.' });
    return;
  }

  const ip = getClientIp(req);

  try {
    const { allowed, retryAfter } = await checkRateLimit(sql, {
      bucket: 'subscribe',
      identifier: ip,
      limit: 8,
      windowSeconds: 60 * 60,
    });

    if (!allowed) {
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({ ok: false, error: 'Too many attempts. Please try again later.' });
      return;
    }
  } catch (err) {
    console.error('subscribe: rate limit check failed', err);
    // Don't block a real signup just because the rate-limit table had a
    // hiccup — the unique constraint on email still prevents duplicate
    // spam of the same address either way.
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

  const email = String(body.email || '').trim().toLowerCase();
  const source = String(body.source || 'unknown').slice(0, 40);

  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(email)) {
    res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
    return;
  }

  try {
    await ensureSchema(sql);

    const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);

    await sql`
      INSERT INTO subscribers (email, source, user_agent)
      VALUES (${email}, ${source}, ${userAgent})
      ON CONFLICT (email) DO NOTHING
    `;

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('subscribe: insert failed', err);
    res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
};
