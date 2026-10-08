// Shared helpers for the ContextVerity site. No dependencies, no tracking, no cookies.
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var GLYPHS = {
    VALID:
      '<circle r="8" fill="currentColor"/><path d="M-3.6 .2l2.5 2.6 4.8-5.2" fill="none" style="stroke:var(--knock)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    REFRESH:
      '<path d="M5.8 3.2A6.6 6.6 0 1 1 5.4-3.9" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><path d="M7.6-8.2L7.9-2.2 2-3.4Z" fill="currentColor"/>',
    DENY:
      '<rect x="-7.5" y="-7.5" width="15" height="15" rx="2.5" fill="currentColor"/><rect x="-4.3" y="-1.25" width="8.6" height="2.5" rx="1" style="fill:var(--knock)"/>',
    NONE: '<circle r="7" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="2 2.4"/>',
  };
  GLYPHS.RESOLVE_DENIED = GLYPHS.DENY;
  GLYPHS.UNSUPPORTED = GLYPHS.NONE;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function glyph(kind) {
    return '<svg class="glyph" viewBox="-10 -10 20 20" aria-hidden="true" focusable="false">' + (GLYPHS[kind] || GLYPHS.NONE) + '</svg>';
  }

  function verdict(kind, label) {
    return '<span class="verdict v-' + esc(kind) + '">' + glyph(kind) + esc(label || kind) + '</span>';
  }

  function stamp(kind, code, extraClass) {
    return (
      '<span class="stamp v-' + esc(kind) + (extraClass ? ' ' + extraClass : '') + '">' + glyph(kind) + '<b>' + esc(kind) + '</b>' +
      '<small>' + (code ? esc(code) : '&nbsp;') + '</small></span>'
    );
  }

  // Fetch a JSON file from /data/. Resolves to {ok, data, status}; never rejects.
  var cache = {};
  function load(name) {
    if (cache[name]) return cache[name];
    cache[name] = fetch('/data/' + name, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) return { ok: false, status: res.status, data: null };
        return res.json().then(
          function (data) {
            return { ok: true, status: res.status, data: data };
          },
          function () {
            return { ok: false, status: 'invalid-json', data: null };
          }
        );
      })
      .catch(function () {
        return { ok: false, status: 'unreachable', data: null };
      });
    return cache[name];
  }

  function pct(value) {
    if (typeof value !== 'number' || !isFinite(value)) return 'n/a';
    return (Math.round(value * 1000) / 10).toString() + '%';
  }

  function commitLink(sha) {
    if (!sha || sha === 'uncommitted') {
      return '<code>' + esc(sha || 'unknown') + '</code>' + (sha === 'uncommitted' ? ' <span class="muted">(working tree, not a commit)</span>' : '');
    }
    if (!/^[0-9a-f]{7,40}$/i.test(sha)) return '<code>' + esc(sha) + '</code>';
    return '<a href="https://github.com/contextverity/contextverity/commit/' + encodeURIComponent(sha) + '"><code>' + esc(String(sha).slice(0, 12)) + '</code></a>';
  }

  function fileProtocolNote() {
    return location.protocol === 'file:'
      ? ' Open the site over HTTP (for example <code>python3 -m http.server</code> in the site folder) so the browser can read <code>/data/</code>.'
      : '';
  }

  // Reveal elements (and charts) as they scroll into view.
  var io =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          function (entries) {
            entries.forEach(function (e) {
              if (e.isIntersecting) {
                e.target.classList.add('is-in');
                io.unobserve(e.target);
                if (e.target.__onReveal) e.target.__onReveal();
              }
            });
          },
          { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
        )
      : null;

  function reveal(el, cb) {
    if (!el) return;
    if (cb) el.__onReveal = cb;
    if (!io || reduceMotion) {
      el.classList.add('is-in');
      if (cb) cb();
      return;
    }
    io.observe(el);
  }

  function scanReveals(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-reveal]:not(.is-in)'), function (el) {
      reveal(el);
    });
  }

  // Animate a number from zero to its value when it scrolls into view.
  function countUp(el, target, opts) {
    opts = opts || {};
    var dec = opts.decimals || 0;
    var fmt = function (n) {
      return n.toFixed(dec);
    };
    if (reduceMotion || typeof target !== 'number') {
      el.textContent = typeof target === 'number' ? fmt(target) : String(target);
      return;
    }
    // The real value is the content until the element is revealed, so readers,
    // crawlers and previews never see a placeholder zero.
    el.textContent = fmt(target);
    reveal(el, function () {
      var start = null;
      var dur = 1300;
      function tick(t) {
        if (start === null) start = t;
        var p = Math.min(1, (t - start) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(target * eased);
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  // Shared tooltip for chart marks with data-tip.
  var tip = null;
  function showTip(text, x, y) {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.setAttribute('role', 'status');
      document.body.appendChild(tip);
    }
    tip.textContent = text;
    var w = tip.offsetWidth;
    var left = Math.min(window.innerWidth - w - 8, Math.max(8, x + 14));
    tip.style.left = left + 'px';
    tip.style.top = Math.max(8, y - 44) + 'px';
    tip.classList.add('show');
  }
  function hideTip() {
    if (tip) tip.classList.remove('show');
  }
  document.addEventListener('pointerover', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (t) showTip(t.getAttribute('data-tip'), e.clientX, e.clientY);
  });
  document.addEventListener('pointermove', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (t) showTip(t.getAttribute('data-tip'), e.clientX, e.clientY);
    else hideTip();
  });
  document.addEventListener('focusin', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip]');
    if (t) {
      var r = t.getBoundingClientRect();
      showTip(t.getAttribute('data-tip'), r.left + r.width / 2, r.top);
    }
  });
  document.addEventListener('focusout', hideTip);
  window.addEventListener('scroll', hideTip, { passive: true });

  window.CV = {
    esc: esc,
    glyph: glyph,
    verdict: verdict,
    stamp: stamp,
    load: load,
    pct: pct,
    commitLink: commitLink,
    fileProtocolNote: fileProtocolNote,
    reveal: reveal,
    scanReveals: scanReveals,
    countUp: countUp,
    reduceMotion: reduceMotion,
  };

  // Theme toggle (dark is the default; the choice is remembered on this device only).
  var themeBtn = document.querySelector('.theme-toggle');
  function syncThemeLabel() {
    if (!themeBtn) return;
    var light = document.documentElement.getAttribute('data-theme') === 'light';
    themeBtn.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
    themeBtn.setAttribute('title', light ? 'Dark theme' : 'Light theme');
  }
  if (themeBtn) {
    syncThemeLabel();
    themeBtn.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try {
        localStorage.setItem('cv-theme', next);
      } catch (e) {
        /* storage unavailable: the choice lasts for this page view */
      }
      syncThemeLabel();
      document.dispatchEvent(new CustomEvent('cv:theme'));
    });
  }

  // Mobile navigation toggle.
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      nav.classList.toggle('open', !open);
    });
  }

  // Dropdown groups: one open at a time; close on outside click or Escape.
  var groups = document.querySelectorAll('.dd');
  Array.prototype.forEach.call(groups, function (d) {
    d.addEventListener('toggle', function () {
      if (!d.open) return;
      Array.prototype.forEach.call(groups, function (o) {
        if (o !== d) o.open = false;
      });
    });
  });
  document.addEventListener('click', function (e) {
    Array.prototype.forEach.call(groups, function (d) {
      if (d.open && !d.contains(e.target)) d.open = false;
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    Array.prototype.forEach.call(groups, function (d) {
      if (d.open) {
        d.open = false;
        d.querySelector('summary').focus();
      }
    });
    if (nav && nav.classList.contains('open')) {
      toggle.setAttribute('aria-expanded', 'false');
      nav.classList.remove('open');
      toggle.focus();
    }
  });

  // Copy buttons for command blocks.
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (btn) {
    btn.hidden = !(navigator.clipboard && window.isSecureContext);
    btn.addEventListener('click', function () {
      var target = document.getElementById(btn.getAttribute('data-copy'));
      if (!target) return;
      navigator.clipboard.writeText(target.textContent.trim()).then(function () {
        var label = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(function () {
          btn.textContent = label;
        }, 1600);
      });
    });
  });

  // Live counters on any page: <dd data-count="tier:path.to.value">.
  Array.prototype.forEach.call(document.querySelectorAll('[data-count]'), function (el) {
    var spec = el.getAttribute('data-count').split(':');
    var file = spec[0];
    var path = spec[1].split('.');
    load(file).then(function (res) {
      if (!res.ok) {
        el.textContent = 'n/a';
        el.setAttribute('title', 'data/' + file + ' not yet generated');
        return;
      }
      var v = res.data;
      for (var i = 0; i < path.length && v != null; i++) v = v[path[i]];
      if (typeof v === 'number') countUp(el, v);
      else el.textContent = 'n/a';
    });
  });

  scanReveals();
})();
