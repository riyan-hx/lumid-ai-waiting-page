// Lumid AI waiting page — interaction layer.
// No backend is wired up yet: this just gives every waitlist form a real,
// validated submit experience until you tell me where signups should go
// (an API endpoint, Mailchimp/ConvertKit, Supabase, etc.).

function wireWaitlistForm(form) {
  if (!form) return;

  const note = form.querySelector('[id^="formNote"]') || form.parentElement?.querySelector('[id^="formNote"]');
  const input = form.querySelector('input[type="email"]');
  if (!input) return;

  const defaultNote = note ? note.textContent : '';

  form.addEventListener('submit', (event) => {
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

    // TODO: wire this up to a real endpoint / email service.
    console.log('Waitlist signup:', email);

    if (note) {
      note.textContent = "You're on the list — we'll be in touch soon.";
      note.classList.add('success');
    }
    form.reset();
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
  // same validated submit behavior.
  document
    .querySelectorAll('#waitlistForm, #waitlistFormMobile, #waitlistFormMobile2')
    .forEach(wireWaitlistForm);

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
