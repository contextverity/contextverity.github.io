// Home page flow: Backstage sources -> ContextVerity -> verdict, on a ~15 s loop.
// The scenario values are illustrative; the Results and Demo pages read real data.
(function () {
  'use strict';

  var flow = document.getElementById('flow');
  if (!flow || !window.CV) return;
  var svg = flow.querySelector('.flow-links');
  var cards = flow.querySelectorAll('.src-card');
  var rows = flow.querySelectorAll('.vrow');
  var core = flow.querySelector('.core-mark');
  var statusEl = flow.querySelector('.core-status');
  var eventEl = document.querySelector('.flow-event');
  var toggle = document.querySelector('.flow-toggle');
  var NS = 'http://www.w3.org/2000/svg';

  if (window.CV.reduceMotion) {
    flow.classList.add('static');
    return;
  }

  var leftPaths = [];
  var rightPaths = [];
  var particles = [];

  function rel(el) {
    var f = flow.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    return { l: r.left - f.left, r: r.right - f.left, t: r.top - f.top, b: r.bottom - f.top, cy: r.top - f.top + r.height / 2 };
  }

  function curve(x1, y1, x2, y2) {
    var dx = (x2 - x1) * 0.5;
    return 'M' + x1 + ' ' + y1 + 'C' + (x1 + dx) + ' ' + y1 + ' ' + (x2 - dx) + ' ' + y2 + ' ' + x2 + ' ' + y2;
  }

  function layout() {
    if (getComputedStyle(svg).display === 'none') return false;
    var f = flow.getBoundingClientRect();
    svg.setAttribute('viewBox', '0 0 ' + f.width + ' ' + f.height);
    var c = rel(core);
    var lit = {};
    leftPaths.concat(rightPaths).forEach(function (p, i) {
      lit[i] = p.getAttribute('class') || '';
    });
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    leftPaths = [];
    rightPaths = [];
    Array.prototype.forEach.call(cards, function (card) {
      var r = rel(card);
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', curve(r.r + 2, r.cy, c.l - 6, c.cy));
      svg.appendChild(p);
      leftPaths.push(p);
    });
    Array.prototype.forEach.call(rows, function (row) {
      var r = rel(row);
      var p = document.createElementNS(NS, 'path');
      p.setAttribute('d', curve(c.r + 6, c.cy, r.l - 2, r.cy));
      svg.appendChild(p);
      rightPaths.push(p);
    });
    leftPaths.concat(rightPaths).forEach(function (p, i) {
      if (lit[i]) p.setAttribute('class', lit[i]);
    });
    particles.forEach(function (pt) {
      pt.path = (pt.side === 'L' ? leftPaths : rightPaths)[pt.index];
      pt.len = pt.path ? pt.path.getTotalLength() : 0;
      svg.appendChild(pt.el);
    });
    return true;
  }

  function makeParticle(side, index, offset, speed, cls) {
    var el = document.createElementNS(NS, 'circle');
    el.setAttribute('r', side === 'L' ? 2.4 : 3);
    if (cls) el.setAttribute('class', cls);
    var pt = { side: side, index: index, t: offset, speed: speed, el: el, path: null, len: 0 };
    particles.push(pt);
    return pt;
  }

  // Continuous particles from each source towards the core.
  Array.prototype.forEach.call(cards, function (_, i) {
    makeParticle('L', i, (i * 0.19) % 1, 0.42);
    makeParticle('L', i, (i * 0.19 + 0.5) % 1, 0.42);
  });
  var verdictParticles = [];

  function setVerdictParticles(index, kind) {
    verdictParticles.forEach(function (pt) {
      if (pt.el.parentNode) pt.el.parentNode.removeChild(pt.el);
      particles.splice(particles.indexOf(pt), 1);
    });
    verdictParticles = [];
    if (index < 0) return;
    [0, 0.33, 0.66].forEach(function (o) {
      var pt = makeParticle('R', index, o, 0.55, 'c-' + kind);
      pt.path = rightPaths[index];
      pt.len = pt.path ? pt.path.getTotalLength() : 0;
      svg.appendChild(pt.el);
      verdictParticles.push(pt);
    });
  }

  var last = null;
  var raf = null;
  function frame(ts) {
    var dt = last === null ? 0 : Math.min(0.05, (ts - last) / 1000);
    last = ts;
    particles.forEach(function (pt) {
      if (!pt.path || !pt.len) return;
      pt.t = (pt.t + dt * pt.speed) % 1;
      var p = pt.path.getPointAtLength(pt.len * pt.t);
      pt.el.setAttribute('cx', p.x.toFixed(1));
      pt.el.setAttribute('cy', p.y.toFixed(1));
      pt.el.setAttribute('opacity', Math.min(1, Math.sin(Math.PI * pt.t) * 1.6).toFixed(2));
    });
    raf = requestAnimationFrame(frame);
  }

  var KIND_INDEX = { VALID: 0, REFRESH: 1, DENY: 2 };

  function text(el, s) {
    if (el) el.textContent = s;
  }

  function reset() {
    Array.prototype.forEach.call(cards, function (c) {
      c.classList.remove('flip-REFRESH', 'flip-DENY');
      var st = c.querySelector('.st');
      text(st, st.getAttribute('data-base'));
    });
    Array.prototype.forEach.call(rows, function (r) {
      r.classList.remove('lit');
    });
    leftPaths.concat(rightPaths).forEach(function (p) {
      p.removeAttribute('class');
    });
    setVerdictParticles(-1);
    if (eventEl) eventEl.className = 'flow-event';
  }

  function flip(cardIndex, kind, label, ev) {
    var c = cards[cardIndex];
    c.classList.add('flip-' + kind);
    text(c.querySelector('.st'), label);
    if (leftPaths[cardIndex]) leftPaths[cardIndex].setAttribute('class', 'lit-' + kind);
    text(eventEl, ev);
    if (eventEl) eventEl.className = 'flow-event c-' + kind;
    text(statusEl, 'verifying receipt');
  }

  function light(kind, code, status, ev) {
    var i = KIND_INDEX[kind];
    var row = rows[i];
    text(row.querySelector('.code'), code);
    row.classList.add('lit');
    if (rightPaths[i]) rightPaths[i].setAttribute('class', 'lit-' + kind);
    setVerdictParticles(i, kind);
    text(statusEl, status);
    text(eventEl, ev);
    if (eventEl) eventEl.className = 'flow-event c-' + kind;
  }

  var timeline = [
    [0, function () {
      reset();
      text(statusEl, 'receipt issued');
      text(eventEl, 'Resolve component:default/payments for incident-triage');
    }],
    [1500, function () {
      flip(0, 'REFRESH', 'team-payments → team-commerce', 'Owner: team-payments → team-commerce');
    }],
    [2700, function () {
      light('REFRESH', 'OWNER_CHANGED', 'verdict REFRESH: re-resolve', 'Verify: REFRESH (OWNER_CHANGED)');
    }],
    [5000, function () {
      reset();
      text(statusEl, 'new receipt issued');
      text(eventEl, 'Re-resolved: a fresh receipt');
    }],
    [5900, function () {
      flip(4, 'DENY', 'INTERNAL → RESTRICTED', 'Classification: INTERNAL → RESTRICTED');
    }],
    [7100, function () {
      light('DENY', 'CLASSIFICATION_RAISED', 'verdict DENY: do not use', 'Verify: DENY (CLASSIFICATION_RAISED)');
    }],
    [10000, function () {
      reset();
      text(statusEl, 'verifying receipt');
      text(eventEl, 'No relevant change');
      if (eventEl) eventEl.className = 'flow-event c-VALID';
    }],
    [11000, function () {
      light('VALID', 'no drift', 'verdict VALID at verification time', 'Verify: VALID');
    }],
  ];
  var LOOP = 15000;
  var timers = [];
  var running = false;
  var userPaused = false;
  var visible = true;

  function clear() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function run() {
    clear();
    timeline.forEach(function (e) {
      timers.push(setTimeout(e[1], e[0]));
    });
    timers.push(setTimeout(run, LOOP));
  }

  function start() {
    if (running) return;
    running = true;
    last = null;
    raf = requestAnimationFrame(frame);
    run();
  }

  function stop() {
    running = false;
    clear();
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function sync() {
    if (!userPaused && visible && !document.hidden) start();
    else stop();
  }

  layout();
  if ('ResizeObserver' in window) new ResizeObserver(layout).observe(flow);
  else window.addEventListener('resize', layout);

  if (toggle) {
    toggle.hidden = false;
    toggle.addEventListener('click', function () {
      userPaused = !userPaused;
      toggle.setAttribute('aria-pressed', String(userPaused));
      toggle.textContent = userPaused ? 'Play animation' : 'Pause animation';
      sync();
    });
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      sync();
    }).observe(flow);
  }
  document.addEventListener('visibilitychange', sync);
  sync();
})();
