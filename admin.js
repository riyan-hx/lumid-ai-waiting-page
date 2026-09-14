// Lumid AI — waitlist admin dashboard.
//
// The admin key is only ever sent once, at login (/api/admin-login), over
// HTTPS. The server replies with an HttpOnly session cookie — this script
// never sees, stores, or resends the raw key again. Every later request
// (/api/subscribers) authenticates via that cookie automatically
// (`credentials: 'include'`); nothing sensitive lives in localStorage,
// sessionStorage, or a JS-readable variable at any point.

const gate = document.getElementById('gate');
const app = document.getElementById('app');
const keyInput = document.getElementById('key');
const gateError = document.getElementById('gateError');
const unlockBtn = document.getElementById('unlockBtn');
const refreshBtn = document.getElementById('refreshBtn');
const csvBtn = document.getElementById('csvBtn');
const logoutBtn = document.getElementById('logoutBtn');
const results = document.getElementById('results');
const countEl = document.getElementById('count');

let currentRows = [];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function showApp() {
  gate.style.display = 'none';
  app.style.display = 'block';
  logoutBtn.hidden = false;
}

function showGate() {
  gate.style.display = 'block';
  app.style.display = 'none';
  logoutBtn.hidden = true;
}

function renderRows(rows) {
  currentRows = rows;
  countEl.innerHTML = `<strong>${rows.length}</strong> signup${rows.length === 1 ? '' : 's'}`;

  if (!rows.length) {
    results.innerHTML = '<div class="empty">No signups yet.</div>';
    return;
  }

  const body = rows
    .map(
      (r) => `
        <tr>
          <td>${escapeHtml(r.email)}</td>
          <td>${escapeHtml(r.source || '—')}</td>
          <td>${new Date(r.created_at).toLocaleString()}</td>
        </tr>`
    )
    .join('');

  results.innerHTML = `
    <table>
      <thead><tr><th>Email</th><th>Source</th><th>Registered</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

async function loadSubscribers() {
  results.innerHTML = '<div class="loading">Loading…</div>';
  const res = await fetch('/api/subscribers', { credentials: 'include' });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  renderRows(data.subscribers || []);
}

async function unlock() {
  const key = keyInput.value.trim();
  if (!key) return;

  unlockBtn.disabled = true;
  gateError.style.display = 'none';

  try {
    const res = await fetch('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ key }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Wrong admin key.');
    }

    keyInput.value = ''; // never hold onto it longer than the request itself
    await loadSubscribers();
    showApp();
  } catch (err) {
    gateError.textContent = err.message;
    gateError.style.display = 'block';
  } finally {
    unlockBtn.disabled = false;
  }
}

async function logout() {
  try {
    await fetch('/api/admin-logout', { method: 'POST', credentials: 'include' });
  } catch {
    /* best effort */
  }
  showGate();
}

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv() {
  const header = ['email', 'source', 'created_at'];
  const lines = [header.join(',')].concat(
    currentRows.map((r) => [csvEscape(r.email), csvEscape(r.source), csvEscape(r.created_at)].join(','))
  );
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lumid-waitlist.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

unlockBtn.addEventListener('click', unlock);
keyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') unlock();
});
refreshBtn.addEventListener('click', () => loadSubscribers().catch((err) => alert(err.message)));
csvBtn.addEventListener('click', downloadCsv);
logoutBtn.addEventListener('click', logout);

// If a valid session cookie already exists (e.g. page reload within the
// 12h session window), skip straight to the dashboard.
loadSubscribers()
  .then(showApp)
  .catch(showGate);
