// Sends a "new waitlist signup" email via Resend (https://resend.com).
//
// Fully optional: if RESEND_API_KEY / NOTIFY_TO_EMAIL aren't configured yet,
// this quietly does nothing — it never blocks or breaks a real signup.
// Uses Resend's shared `onboarding@resend.dev` sender, which works
// immediately with zero domain setup (fine for an internal notification
// email; only matters if we ever email subscribers themselves, which this
// does not do).

async function notifyNewSignup({ email, source }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_TO_EMAIL;

  if (!apiKey || !to) return; // not configured yet — no-op

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Lumid AI Waitlist <onboarding@resend.dev>',
        to: [to],
        subject: `New Lumid AI signup: ${email}`,
        text: `New waitlist signup.\n\nEmail: ${email}\nSource: ${source || 'unknown'}\nTime: ${new Date().toISOString()}\n\nView the full list: https://chat.lumidai.in/admin.html`,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('notify: resend send failed', res.status, detail);
    }
  } catch (err) {
    console.error('notify: resend send threw', err);
  }
}

module.exports = { notifyNewSignup };
