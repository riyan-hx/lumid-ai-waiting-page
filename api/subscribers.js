// GET /api/subscribers
// Returns the waitlist signups as JSON. Protected by ADMIN_SECRET — pass it
// as either an `x-admin-secret` header or a `?key=` query param. Used by
// admin.html; not linked from anywhere public.

const { neon } = require('@neondatabase/serverless');

const CONNECTION_STRING =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.STORAGE_DATABASE_URL ||
  process.env.STORAGE_POSTGRES_URL;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const providedKey = req.headers['x-admin-secret'] || (req.query && req.query.key);
  const expectedKey = process.env.ADMIN_SECRET;

  if (!expectedKey) {
    res.status(500).json({ ok: false, error: 'ADMIN_SECRET is not configured on the server.' });
    return;
  }

  if (!providedKey || providedKey !== expectedKey) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  if (!CONNECTION_STRING) {
    res.status(500).json({ ok: false, error: 'Database is not configured yet.' });
    return;
  }

  try {
    const sql = neon(CONNECTION_STRING);
    const rows = await sql`
      SELECT id, email, source, created_at
      FROM subscribers
      ORDER BY created_at DESC
    `;
    res.status(200).json({ ok: true, count: rows.length, subscribers: rows });
  } catch (err) {
    console.error('subscribers: query failed', err);
    res.status(500).json({ ok: false, error: 'Could not load subscribers.' });
  }
};
