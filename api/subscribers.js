// GET /api/subscribers
// Returns the waitlist signups as JSON. Requires a valid admin session
// cookie (set by /api/admin-login) — no more accepting the raw secret as a
// header/query param, so nothing sensitive has to be handled by client-side
// JS after the initial login.

const { getSql } = require('./_lib/db');
const { verifySession } = require('./_lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const expectedKey = process.env.ADMIN_SECRET;
  if (!expectedKey) {
    res.status(500).json({ ok: false, error: 'ADMIN_SECRET is not configured on the server.' });
    return;
  }

  if (!verifySession(req, expectedKey)) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  const sql = getSql();
  if (!sql) {
    res.status(500).json({ ok: false, error: 'Database is not configured yet.' });
    return;
  }

  try {
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
