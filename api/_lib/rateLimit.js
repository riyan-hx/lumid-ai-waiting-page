// Atomic, DB-backed sliding-window rate limiter. Plain in-memory counters
// don't work here — serverless functions don't share memory between
// invocations (and often not even between two requests hitting the same
// warm instance) — so the counter has to live somewhere durable. Reuses the
// same Postgres database as everything else via one UPSERT per check, which
// stays correct under concurrent requests because the increment happens
// inside the UPSERT itself rather than as a separate read-then-write.

let schemaReady = null;

async function ensureSchema(sql) {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS rate_limits (
        bucket TEXT NOT NULL,
        identifier TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 1,
        window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (bucket, identifier)
      )
    `;
  }
  await schemaReady;
}

/**
 * @returns {Promise<{allowed: boolean, remaining: number, retryAfter: number}>}
 */
async function checkRateLimit(sql, { bucket, identifier, limit, windowSeconds }) {
  await ensureSchema(sql);

  const rows = await sql`
    INSERT INTO rate_limits (bucket, identifier, count, window_start)
    VALUES (${bucket}, ${identifier}, 1, now())
    ON CONFLICT (bucket, identifier) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
          THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
          THEN now()
        ELSE rate_limits.window_start
      END
    RETURNING count, window_start
  `;

  const row = rows[0];
  const count = row ? row.count : 1;
  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);
  const elapsedSeconds = row ? (Date.now() - new Date(row.window_start).getTime()) / 1000 : 0;
  const retryAfter = Math.max(1, Math.ceil(windowSeconds - elapsedSeconds));

  return { allowed, remaining, retryAfter };
}

module.exports = { checkRateLimit };
