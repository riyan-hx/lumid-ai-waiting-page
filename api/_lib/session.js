// Signed, HttpOnly session cookies for the admin dashboard.
//
// Previous design: the browser held the raw ADMIN_SECRET in sessionStorage
// and resent it as a plain header on every request. That's readable by any
// JS running on the page (an XSS anywhere on the origin, a malicious browser
// extension, etc.) and by anything that inspects sessionStorage in devtools
// left open on a shared machine.
//
// This design: the raw secret is only ever sent once, at login. On success
// the server issues a short-lived, HMAC-signed token in an HttpOnly, Secure,
// SameSite=Strict cookie — client-side JS can never read it (that's what
// HttpOnly means), so it can't be exfiltrated by an XSS payload, and it
// can't be forged without knowing ADMIN_SECRET (used as the HMAC key)
// because the signature is checked with a timing-safe comparison.

const crypto = require('crypto');

const COOKIE_NAME = 'lumid_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal length to avoid leaking length via
    // timing on the mismatch path.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function createSessionCookie(secret) {
  const exp = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  const sig = sign(payload, secret);
  const token = `${payload}.${sig}`;

  const attrs = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  return attrs.join('; ');
}

function clearSessionCookie() {
  return [`${COOKIE_NAME}=`, 'HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=0'].join('; ');
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

function verifySession(req, secret) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return false;

  const dot = token.lastIndexOf('.');
  if (dot === -1) return false;

  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = sign(payload, secret);

  if (!timingSafeEqualStr(sig, expectedSig)) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof exp === 'number' && Date.now() < exp;
  } catch {
    return false;
  }
}

function timingSafeEqualSecret(provided, expected) {
  return timingSafeEqualStr(provided || '', expected || '');
}

module.exports = { createSessionCookie, clearSessionCookie, verifySession, timingSafeEqualSecret };
