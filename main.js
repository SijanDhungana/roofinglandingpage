/* ============================================================
   Optima Roofing — shared behaviour
   Vanilla JS, no dependencies. Progressive enhancement:
   every form still submits (and every phone link still dials)
   with JavaScript disabled.
   ============================================================ */
(function () {
  'use strict';

  var prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Google Ads config is injected per-page as window.OPTIMA_ADS.
     Falls back to no-op if the placeholder IDs haven't been filled in. */
  var ADS = window.OPTIMA_ADS || {};
  function fireConversion(label) {
    if (typeof window.gtag !== 'function') return;
    if (!ADS.id || !label || /CONVERSION_ID|_LABEL/.test(ADS.id + label)) return; // placeholder guard
    window.gtag('event', 'conversion', { send_to: ADS.id + '/' + label });
  }

  /* ─────────────────────────────────────────────
     1. CALL TRACKING — fire a conversion on every tel: tap
     ───────────────────────────────────────────── */
  document.querySelectorAll('a[href^="tel:"]').forEach(function (el) {
    el.addEventListener('click', function () {
      fireConversion(ADS.callLabel);
    });
  });

  /* Dynamic Number Insertion hook: if a Google forwarding number is
     provided (window.OPTIMA_DNI), swap every .js-phone element's text
     and href. Real number stays in data-real-number as the no-JS/organic
     fallback. */
  (function dni() {
    var swap = window.OPTIMA_DNI; // { display: '(647) …', tel: '647…' }
    if (!swap || !swap.tel) return;
    document.querySelectorAll('.js-phone').forEach(function (el) {
      if (el.tagName === 'A') el.setAttribute('href', 'tel:' + swap.tel);
      if (swap.display && el.dataset.phoneText !== 'keep') {
        // only replace a text node that is the visible number
        el.querySelectorAll('.js-phone-text').forEach(function (t) { t.textContent = swap.display; });
      }
    });
  })();

  /* ─────────────────────────────────────────────
     2. FORMS — validation, phone/postal formatting,
        photo compression, submit with tracking redirect
     ───────────────────────────────────────────── */
  function tenDigits(v) {
    var d = v.replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1); // tolerate leading country code
    return d.slice(0, 10);
  }
  function formatPhone(v) {
    var d = tenDigits(v);
    if (d.length === 0) return '';
    if (d.length < 4) return '(' + d;
    if (d.length < 7) return '(' + d.slice(0, 3) + ') ' + d.slice(3);
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }
  var POSTAL_RE = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i;

  function setError(group, on) {
    if (!group) return;
    group.classList.toggle('invalid', !!on);
  }

  function validateField(field) {
    var group = field.closest('.form-group');
    var val = field.value.trim();
    if (field.hasAttribute('required') && !val) { setError(group, true); return false; }
    if (field.type === 'tel' && val) {
      if (tenDigits(val).length !== 10) { setError(group, true); return false; }
    }
    if (field.dataset.validate === 'postal' && val) {
      if (!POSTAL_RE.test(val)) { setError(group, true); return false; }
    }
    if (field.type === 'email' && val) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { setError(group, true); return false; }
    }
    setError(group, false);
    return true;
  }

  document.querySelectorAll('[data-form]').forEach(function (form) {
    var submitBtn = form.querySelector('.btn-submit');
    var errorEl = form.querySelector('.form-submit-error');
    var compressed = []; // {name, blob}

    // Progressive enhancement: with JS on, suppress native validation so our
    // custom inline messages own the UX. With JS off, native `required` still guards.
    form.noValidate = true;

    // phone auto-format + inline validation on blur
    form.querySelectorAll('input, select, textarea').forEach(function (field) {
      if (field.type === 'tel') {
        field.addEventListener('input', function () { field.value = formatPhone(field.value); });
      }
      if (field.dataset.validate === 'postal') {
        field.addEventListener('input', function () { field.value = field.value.toUpperCase(); });
      }
      if (field.type !== 'file' && field.name.charAt(0) !== '_') {
        field.addEventListener('blur', function () { validateField(field); });
      }
    });

    // ── photo upload: preview + client-side compression ──
    var fileInput = form.querySelector('input[type="file"]');
    var previews = form.querySelector('.file-previews');
    if (fileInput && previews) {
      fileInput.addEventListener('change', function () {
        var files = Array.prototype.slice.call(fileInput.files).slice(0, 3);
        compressed = [];
        previews.innerHTML = '';
        files.forEach(function (file) {
          if (!/^image\//.test(file.type)) return;
          // Immediate feedback while compression runs (Doherty Threshold).
          var wrap = document.createElement('div');
          wrap.className = 'file-preview loading';
          wrap.innerHTML = '<span class="mini-spin" aria-hidden="true"></span>';
          previews.appendChild(wrap);
          var item = { name: file.name.replace(/\.\w+$/, '') + '.jpg', blob: null };
          compressed.push(item);
          compressImage(file, function (blob, dataUrl) {
            item.blob = blob;
            wrap.classList.remove('loading');
            wrap.innerHTML = '<img alt="Selected photo preview" src="' + dataUrl + '">' +
              '<button type="button" aria-label="Remove photo">&times;</button>';
            wrap.querySelector('button').addEventListener('click', function () {
              var i = compressed.indexOf(item);
              if (i > -1) compressed.splice(i, 1);
              wrap.remove();
            });
          });
        });
      });
    }

    function compressImage(file, cb) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var max = 1600;
          var w = img.width, h = img.height;
          if (w > max || h > max) {
            if (w > h) { h = Math.round(h * max / w); w = max; }
            else { w = Math.round(w * max / h); h = max; }
          }
          var canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          canvas.toBlob(function (blob) {
            cb(blob || file, canvas.toDataURL('image/jpeg', 0.5));
          }, 'image/jpeg', 0.8);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    // ── submit ──
    form.addEventListener('submit', function (e) {
      // honeypot (Formspree native) — if filled, bail silently
      var hp = form.querySelector('[name="_gotcha"]');
      if (hp && hp.value) { e.preventDefault(); return; }

      // validate all
      var ok = true;
      form.querySelectorAll('input, select, textarea').forEach(function (field) {
        if (field.type === 'file' || field.name.charAt(0) === '_') return;
        if (!validateField(field)) ok = false;
      });
      if (!ok) {
        e.preventDefault();
        var firstBad = form.querySelector('.form-group.invalid input, .form-group.invalid select, .form-group.invalid textarea');
        if (firstBad) firstBad.focus();
        return;
      }

      // If fetch/canvas unavailable, let the native POST proceed (no-JS path handles redirect via _next).
      if (!window.fetch || !window.FormData) return;

      e.preventDefault();
      if (submitBtn.classList.contains('loading')) return; // no double-submit
      submitBtn.classList.add('loading');
      submitBtn.disabled = true;
      if (errorEl) errorEl.style.display = 'none';

      var data = new FormData(form);
      // replace raw files with compressed versions
      if (fileInput) {
        data.delete(fileInput.name);
        var attached = 0;
        compressed.forEach(function (c) { if (c.blob) { data.append(fileInput.name, c.blob, c.name); attached++; } });
        if (attached) fireConversion(ADS.photoLabel); // micro-conversion
      }
      // put postal code into the email subject so urgency is visible at a glance
      var postal = (form.querySelector('[data-validate="postal"]') || {}).value;
      var page = document.body.dataset.page || 'site';
      data.set('_subject', 'New ' + page + ' lead' + (postal ? ' — ' + postal.toUpperCase() : '') + ' — Optima Roofing');

      var src = document.body.dataset.page || 'site';
      var thankyou = '/thank-you/?src=' + encodeURIComponent(src);

      fetch(form.action, { method: 'POST', body: data, headers: { Accept: 'application/json' } })
        .then(function (res) {
          if (res.ok) { window.location.href = thankyou; }
          else { showFormError(); }
        })
        .catch(showFormError);

      function showFormError() {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        if (errorEl) {
          errorEl.innerHTML = 'Something went wrong on our end. Call us at ' +
            '<a href="tel:6473702476">(647) 370-2476</a> and we’ll take your details directly.';
          errorEl.style.display = 'block';
        }
      }
    });
  });

  /* ─────────────────────────────────────────────
     2b. MOBILE NAV MENU (Jakob's Law + Fitts's Law)
     ───────────────────────────────────────────── */
  (function mobileNav() {
    var toggle = document.querySelector('.nav-toggle');
    var menu = document.getElementById('primary-nav');
    if (!toggle || !menu) return;
    function close() { menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }
    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', close); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('open')) { close(); toggle.focus(); }
    });
  })();

  /* ─────────────────────────────────────────────
     3. FAQ ACCORDION
     ───────────────────────────────────────────── */
  document.querySelectorAll('.faq-question').forEach(function (btn) {
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', function () {
      var answer = btn.nextElementSibling;
      var isOpen = btn.classList.contains('open');
      document.querySelectorAll('.faq-question.open').forEach(function (q) {
        q.classList.remove('open');
        q.setAttribute('aria-expanded', 'false');
        q.nextElementSibling.classList.remove('open');
      });
      if (!isOpen) {
        btn.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        answer.classList.add('open');
      }
    });
  });

  /* ─────────────────────────────────────────────
     4. BEFORE / AFTER SLIDER (reduced-motion aware)
     ───────────────────────────────────────────── */
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function initSlider(slider) {
    var afterImg = slider.querySelector('.ba-slider-after');
    var line = slider.querySelector('.ba-slider-line');
    var btn = slider.querySelector('.ba-slider-btn');
    if (!afterImg || !line || !btn) return;
    var pos = 50, raf = null;

    function setPos(pct) {
      pos = Math.max(2, Math.min(98, pct));
      afterImg.style.clipPath = 'polygon(0 0,' + pos + '% 0,' + pos + '% 100%,0 100%)';
      line.style.left = pos + '%';
      btn.style.left = pos + '%';
    }
    function getPct(clientX) {
      var rect = slider.getBoundingClientRect();
      return (clientX - rect.left) / rect.width * 100;
    }
    function animateTo(from, to, duration, easing, done) {
      if (prefersReduced) { setPos(to); if (done) done(); return; }
      if (raf) cancelAnimationFrame(raf);
      var start = null;
      raf = requestAnimationFrame(function tick(ts) {
        if (start === null) start = ts;
        var t = Math.min(1, (ts - start) / duration);
        setPos(from + (to - from) * easing(t));
        if (t < 1) raf = requestAnimationFrame(tick);
        else { raf = null; if (done) done(); }
      });
    }
    function snapBack() { animateTo(pos, 50, 600, easeOut); }
    function wiggle() {
      if (prefersReduced) return;
      animateTo(50, 32, 380, easeInOut, function () {
        animateTo(32, 68, 520, easeInOut, function () { animateTo(68, 50, 440, easeOut); });
      });
    }

    slider.addEventListener('mousedown', function (e) {
      e.preventDefault();
      if (raf) cancelAnimationFrame(raf);
      slider.classList.add('dragging', 'interacted');
      setPos(getPct(e.clientX));
      function move(ev) { setPos(getPct(ev.clientX)); }
      function up() {
        slider.classList.remove('dragging'); snapBack();
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    slider.addEventListener('touchstart', function (e) {
      if (raf) cancelAnimationFrame(raf);
      slider.classList.add('dragging', 'interacted');
      setPos(getPct(e.touches[0].clientX));
      function move(ev) { setPos(getPct(ev.touches[0].clientX)); }
      function end() {
        slider.classList.remove('dragging'); snapBack();
        slider.removeEventListener('touchmove', move);
        slider.removeEventListener('touchend', end);
      }
      slider.addEventListener('touchmove', move, { passive: true });
      slider.addEventListener('touchend', end);
    }, { passive: true });

    var fired = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (!fired && entries[0].isIntersecting) { fired = true; setTimeout(wiggle, 500); }
      }, { threshold: 0.6 }).observe(slider);
    }
  }

  var ric = window.requestIdleCallback || function (fn) { setTimeout(fn, 1); };
  ric(function () { document.querySelectorAll('.ba-slider').forEach(initSlider); });

  /* ─────────────────────────────────────────────
     5. STICKY MOBILE BAR (homepage variant hides until scroll)
     ───────────────────────────────────────────── */
  var bar = document.querySelector('.mobile-cta-bar.hide-until-scroll');
  if (bar) {
    var hero = document.querySelector('.hero');
    function update() {
      var threshold = hero ? hero.offsetHeight * 0.75 : window.innerHeight * 0.75;
      bar.classList.toggle('visible', window.scrollY > threshold);
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* ─────────────────────────────────────────────
     6. MICRO-CONVERSIONS: 75% scroll + 45s dwell
     ───────────────────────────────────────────── */
  ric(function () {
    var scrolled = false;
    window.addEventListener('scroll', function () {
      if (scrolled) return;
      var pct = (window.scrollY + window.innerHeight) / document.body.scrollHeight;
      if (pct >= 0.75) { scrolled = true; fireConversion(ADS.scrollLabel); }
    }, { passive: true });
    setTimeout(function () { fireConversion(ADS.dwellLabel); }, 45000);
  });

  /* ─────────────────────────────────────────────
     7. NAV ACTIVE-LINK ON SCROLL (homepage)
     ───────────────────────────────────────────── */
  ric(function () {
    var navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
    if (!navLinks.length) return;
    var sections = document.querySelectorAll('section[id]');
    window.addEventListener('scroll', function () {
      var current = '';
      sections.forEach(function (s) { if (window.scrollY >= s.offsetTop - 120) current = s.id; });
      navLinks.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + current); });
    }, { passive: true });
  });
})();
