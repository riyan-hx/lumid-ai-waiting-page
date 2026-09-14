// Lumid AI waiting page — interaction layer.
// Waitlist forms POST to /api/subscribe (Vercel serverless function backed
// by Neon Postgres — see api/subscribe.js). That route only exists once
// deployed to Vercel; running index.html off the local static file server
// will validate the email client-side but the POST itself will 404.

function wireWaitlistForm(form, source) {
  if (!form) return;

  const note = form.querySelector('[id^="formNote"]') || form.parentElement?.querySelector('[id^="formNote"]');
  const input = form.querySelector('input[type="email"]');
  const button = form.querySelector('button[type="submit"]');
  if (!input) return;

  const defaultNote = note ? note.textContent : '';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = input.value.trim();
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!isValid) {
      if (note) {
        note.textContent = 'Please enter a valid email address.';
        note.classList.remove('success');
      }
      input.focus();
      return;
    }

    if (button) button.disabled = true;
    if (note) {
      note.textContent = 'Adding you to the list…';
      note.classList.remove('success');
    }

    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      if (note) {
        note.textContent = "You're on the list — we'll be in touch soon.";
        note.classList.add('success');
      }
      form.reset();
    } catch (err) {
      if (note) {
        note.textContent = err.message || 'Something went wrong. Please try again.';
        note.classList.remove('success');
      }
    } finally {
      if (button) button.disabled = false;
    }
  });

  input.addEventListener('input', () => {
    if (!note) return;
    if (note.classList.contains('success') || note.textContent !== defaultNote) {
      note.textContent = defaultNote;
      note.classList.remove('success');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Desktop form + both mobile forms (hero + post-demo repeat) all get the
  // same validated submit behavior; `source` just tags which form a given
  // signup came from in the subscribers table.
  wireWaitlistForm(document.getElementById('waitlistForm'), 'desktop');
  wireWaitlistForm(document.getElementById('waitlistFormMobile'), 'mobile-hero');
  wireWaitlistForm(document.getElementById('waitlistFormMobile2'), 'mobile-demo');

  // ---- Mobile: lazy-load the demo video ---------------------------------
  // A ~10MB autoplaying video has no business downloading on first paint on
  // a phone. It only starts loading (and playing) once the demo section
  // actually scrolls into view; if it's never scrolled to, it's never
  // fetched at all.
  const mobileVideo = document.getElementById('mobilePreviewVideo');
  if (mobileVideo && mobileVideo.dataset.src) {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              mobileVideo.src = mobileVideo.dataset.src;
              mobileVideo.load();
              mobileVideo.play().catch(() => {
                /* Autoplay can be blocked — the poster frame still shows, which is fine. */
              });
              io.unobserve(mobileVideo);
            }
          });
        },
        { rootMargin: '200px 0px' }
      );
      io.observe(mobileVideo);
    } else {
      // No IntersectionObserver support: fall back to loading it outright.
      mobileVideo.src = mobileVideo.dataset.src;
    }
  }

  // ---- Mobile: "See it in action" scroll cue -----------------------------
  document.querySelectorAll('[data-scroll-target]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.scrollTarget);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
});
