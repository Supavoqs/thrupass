document.addEventListener('DOMContentLoaded', function () {
  // Sticky header shadow
  var header = document.querySelector('.site-header');
  var toggleTop = function () {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  toggleTop();
  window.addEventListener('scroll', toggleTop, { passive: true });

  // Mobile nav toggle
  var navToggle = document.querySelector('.nav-toggle');
  var navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      navToggle.classList.toggle('is-open');
      navLinks.classList.toggle('is-open');
      var expanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', String(!expanded));
    });
    navLinks.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        navToggle.classList.remove('is-open');
        navLinks.classList.remove('is-open');
      });
    });
  }

  // Active nav link
  var current = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    var href = a.getAttribute('href');
    if (href === current || (current === '' && href === 'index.html')) {
      a.classList.add('active');
    }
  });

  // Back to top button
  var topBtn = document.querySelector('.float-btn.top');
  if (topBtn) {
    window.addEventListener('scroll', function () {
      topBtn.classList.toggle('show', window.scrollY > 500);
    }, { passive: true });
    topBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Footer year
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Contact form handling (AJAX via FormSubmit, graceful fallback to mailto)
  var form = document.getElementById('quoteForm');
  if (form) {
    var status = document.getElementById('formStatus');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      status.className = 'form-status show';
      status.textContent = 'Sending your enquiry…';
      var data = new FormData(form);

      fetch(form.action, {
        method: 'POST',
        body: data,
        headers: { Accept: 'application/json' }
      })
        .then(function (res) {
          if (res.ok) {
            status.className = 'form-status show ok';
            status.textContent = "Thanks! Your enquiry has been sent — we'll be in touch shortly.";
            form.reset();
          } else {
            throw new Error('Submission failed');
          }
        })
        .catch(function () {
          status.className = 'form-status show err';
          status.innerHTML = 'Something went wrong sending the form. Please email us directly at <a href="mailto:sales@popnlockwristbands.co.za">sales@popnlockwristbands.co.za</a> or call 087 821 7279.';
        });
    });
  }
});
