// POST /api/subscribe
// Stores a waitlist signup (email + timestamp + light metadata) in Postgres.
// Uses whichever pooled connection string Vercel's Neon integration injected
// (checked in this order since the exact name can vary by integration
// version) — no manual configuration needed beyond connecting the database
// in the Vercel dashboard.

const { neon } = require('@neondatabase/serverless');

const CONNECTION_STRING =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.STORAGE_DATABASE_URL ||
  process.env.STORAGE_POSTGRES_URL;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (!CONNECTION_STRING) {
    console.error('subscribe: no database connection string configured');
    res.status(500).json({ ok: false, error: 'Server is not configured yet. Try again shortly.' });
    return;
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

  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
    return;
  }

  try {
    const sql = neon(CONNECTION_STRING);
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
