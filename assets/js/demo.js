// Browser-only replay of recorded ContextVerity test scenarios, read from /data/.
(function () {
  'use strict';
  var CV = window.CV;
  var esc = CV.esc;

  var CHOICES = [
    ['S01', 'No change'],
    ['S02', 'Owner changed'],
    ['S04', 'API changed'],
    ['S10', 'Permission revoked'],
    ['S09', 'Sensitivity raised'],
    ['S12', 'TTL expired'],
    ['S17', 'Entity recreated'],
    ['S13', 'Unrelated entity changed'],
    ['S21', 'Source unavailable'],
  ];
  var TIER_LABEL = {
    backstage: 'Live Backstage lab tier',
    core: 'In-process core tier',
  };

  var picker = document.getElementById('picker');
  var out = document.getElementById('replay');
  if (!picker || !out) return;

  function fmt(v) {
    if (Array.isArray(v)) return v.length ? v.map(fmt).join(', ') : '(none)';
    if (v && typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  function same(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function contextBlock(list, compareTo) {
    if (!list || !list.length) return '<p class="muted">No source records.</p>';
    var byId = {};
    (compareTo || []).forEach(function (s) {
      byId[s.sourceId] = s;
    });
    return list.map(function (src) {
      var prev = compareTo ? byId[src.sourceId] : null;
      var keys = Object.keys(src.fields || {}).sort();
      var classChanged = prev && prev.classification !== src.classification;
      return (
        '<div class="ctx-source"><div class="sid">' + esc(src.sourceId) + '</div><dl>' +
        '<dt>classification</dt><dd>' + (classChanged ? '<mark>' + esc(src.classification) + '</mark>' : esc(src.classification)) + '</dd>' +
        keys.map(function (k) {
          var v = src.fields[k];
          var changed = compareTo && (!prev || !prev.fields || !same(prev.fields[k], v));
          return '<dt>' + esc(k) + '</dt><dd>' + (changed ? '<mark>' + esc(fmt(v)) + '</mark>' : esc(fmt(v))) + '</dd>';
        }).join('') +
        '</dl></div>'
      );
    }).join('');
  }

  function receipt(title, sub, inner) {
    return (
      '<div class="receipt-shell"><div class="receipt"><div class="receipt-head"><strong>' + esc(title) + '</strong><span class="muted">' +
      esc(sub) + '</span></div>' + inner + '</div></div>'
    );
  }

  function diffTable(drift) {
    if (!drift || !drift.length)
      return '<p class="empty">No drift items. Every recorded value, permission and policy check still matched at verification time.</p>';
    return (
      '<div class="table-wrap"><table><thead><tr><th scope="col">Drift code</th><th scope="col">Effect</th><th scope="col">Source and field</th><th scope="col">Before → after</th></tr></thead><tbody>' +
      drift.map(function (d, i) {
        var ba =
          d.before !== undefined || d.after !== undefined
            ? '<code>' + esc(fmt(d.before)) + '</code><span class="diff-arrow" aria-label="changed to">→</span><code>' + esc(fmt(d.after)) + '</code>'
            : '<span class="muted">n/a</span>';
        return (
          '<tr class="diff-row" style="--i:' + i + '"><td><code><strong>' + esc(d.code) + '</strong></code>' + (d.detail ? '<br><span class="muted">' + esc(d.detail) + '</span>' : '') +
          '</td><td>' + CV.verdict(d.effect) + '</td><td><code>' + esc(d.sourceId || 'receipt') + '</code>' +
          (d.field ? '<br><code>' + esc(d.field) + '</code>' : '') + '</td><td>' + ba + '</td></tr>'
        );
      }).join('') +
      '</tbody></table></div>'
    );
  }

  var playTimers = [];
  function stopPlay() {
    playTimers.forEach(clearTimeout);
    playTimers = [];
  }

  function render(id, label, picked) {
    stopPlay();
    var sc = picked.scenario;
    var r = sc.replay;
    var codes = (r.drift || []).filter(function (d) {
      return d.effect === r.verdict;
    }).map(function (d) {
      return d.code;
    });
    var uniq = codes.filter(function (c, i) {
      return codes.indexOf(c) === i;
    });
    var stampCode = uniq.join(', ') || (r.verdict === 'VALID' ? 'no drift' : '');
    var steps = (r.steps || []).map(function (s, i, all) {
      var isChange = i > 0 && i < all.length - 1;
      return '<li' + (isChange ? ' class="change"' : '') + '>' + esc(s) + '</li>';
    }).join('');
    var cur = r.current || {};
    var currentHtml = cur.ok
      ? receipt('Current context', 're-fetched at verify', contextBlock(cur.context, r.issued))
      : receipt('Current context', 're-resolution refused', '<div class="ctx-denied"><p>' + CV.verdict('DENY', cur.code || 'refused') +
          '</p><p class="muted" style="font-family:var(--sans)">Resolving the same request now is refused, so there is no current context to compare.</p></div>');
    var obs = sc.observed || {};
    var rail = ['Issued', 'Change', 'Current', 'Diff', 'Verdict'];
    out.innerHTML =
      '<div class="replay-head"><div><h3>' + esc(label) + '</h3>' +
      '<p class="replay-meta"><span class="tier-tag">' + esc(TIER_LABEL[picked.tier] || picked.tier) + '</span>' +
      '<code>' + esc(sc.id) + '</code> ' + esc(sc.title) + '</p>' +
      '<p class="replay-meta">Subject <code>' + esc(r.subject) + '</code>, purpose <code>' + esc(r.purpose) + '</code>, actor <code>' + esc(r.actor) + '</code></p>' +
      (picked.note ? '<p class="replay-meta">' + esc(picked.note) + '</p>' : '') +
      '</div><div class="stage" data-stage="5" aria-label="Verdict" style="min-height:4.2rem"><span class="verdict-slot"></span></div></div>' +
      '<ol class="rail" aria-hidden="true">' + rail.map(function (x, i) {
        return '<li data-rail="' + (i + 1) + '">' + x + '</li>';
      }).join('') + '</ol>' +
      '<div class="stage" data-stage="2"><h4>What changed</h4><ol class="replay-steps">' + steps + '</ol></div>' +
      '<div class="replay-grid"><div class="stage" data-stage="1"><h4>Issued context</h4>' + receipt('ContextReceipt', 'recorded at resolve', contextBlock(r.issued)) + '</div>' +
      '<div class="stage" data-stage="3"><h4>Current context</h4>' + currentHtml + '<p class="note" style="margin-top:.6rem">Highlighted values differ from the issued context.</p></div></div>' +
      '<div class="stage" data-stage="4"><h4>Diff</h4>' + diffTable(r.drift) + '</div>' +
      '<div class="replay-foot"><p class="note">Expected ' + esc((sc.expect && sc.expect.outcome) || 'n/a') + ', observed ' + esc(obs.outcome || r.verdict) +
      ', scenario status <span class="status-' + esc(sc.status) + '">' + esc(sc.status) + '</span>. Duration in the test run: ' +
      esc(typeof sc.durationMs === 'number' ? sc.durationMs.toFixed(1) + ' ms' : 'n/a') + '.</p>' +
      '<button type="button" class="btn btn-secondary btn-small replay-again">Replay steps</button></div>';
    out.setAttribute('aria-busy', 'false');
    out.querySelector('.replay-again').addEventListener('click', function () {
      play(r.verdict, stampCode);
    });
    play(r.verdict, stampCode);
  }

  function play(kind, code) {
    stopPlay();
    var stages = out.querySelectorAll('.stage');
    var rails = out.querySelectorAll('[data-rail]');
    var slot = out.querySelector('.verdict-slot');
    function on(n) {
      Array.prototype.forEach.call(stages, function (st) {
        if (Number(st.getAttribute('data-stage')) === n) st.classList.add('on');
      });
      Array.prototype.forEach.call(rails, function (li) {
        if (Number(li.getAttribute('data-rail')) <= n) li.classList.add('on');
        if (n === 5) li.classList.add('v-' + kind);
      });
      if (n === 5) slot.innerHTML = CV.stamp(kind, code, CV.reduceMotion ? '' : 'slam');
    }
    Array.prototype.forEach.call(stages, function (st) {
      st.classList.remove('on');
    });
    Array.prototype.forEach.call(rails, function (li) {
      li.className = '';
    });
    slot.innerHTML = '';
    if (CV.reduceMotion) {
      [1, 2, 3, 4, 5].forEach(on);
      return;
    }
    out.classList.add('playing');
    [[1, 120], [2, 800], [3, 1500], [4, 2200], [5, 3000]].forEach(function (s) {
      playTimers.push(setTimeout(function () {
        on(s[0]);
      }, s[1]));
    });
    playTimers.push(setTimeout(function () {
      out.classList.remove('playing');
    }, 3800));
  }

  function pick(data, id) {
    var b = data.backstage && find(data.backstage, id);
    if (b && b.status === 'PASS' && b.replay) return { tier: 'backstage', scenario: b };
    var c = data.core && find(data.core, id);
    if (c && c.replay) {
      var note = b
        ? b.status === 'UNSUPPORTED'
          ? 'Shown from the core tier: this scenario is unsupported in the live Backstage lab (' + (b.unsupportedReason || 'no reason given') + ').'
          : 'Shown from the core tier: the live Backstage lab run did not pass this scenario.'
        : 'Shown from the core tier: live Backstage lab data is not available.';
      return { tier: 'core', scenario: c, note: note };
    }
    return null;
  }

  function find(doc, id) {
    var list = (doc && doc.scenarios) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  Promise.all([CV.load('scenarios-backstage.json'), CV.load('scenarios-core.json')]).then(function (res) {
    var data = { backstage: res[0].ok ? res[0].data : null, core: res[1].ok ? res[1].data : null };
    if (!data.backstage && !data.core) {
      out.innerHTML = '<p class="empty"><strong>Scenario data not yet generated.</strong> The replay reads <code>data/scenarios-backstage.json</code> and <code>data/scenarios-core.json</code>; neither is present in this build.' + CV.fileProtocolNote() + '</p>';
      out.setAttribute('aria-busy', 'false');
      return;
    }
    var buttons = [];
    CHOICES.forEach(function (c) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-controls', 'replay');
      btn.innerHTML = '<span class="sid">' + esc(c[0]) + '</span>' + esc(c[1]);
      var available = !!pick(data, c[0]);
      btn.disabled = !available;
      if (!available) btn.title = 'Not present in the synced data';
      btn.addEventListener('click', function () {
        select(c[0]);
        if (history.replaceState) history.replaceState(null, '', '#' + c[0]);
      });
      li.appendChild(btn);
      picker.appendChild(li);
      buttons.push([c, btn]);
    });

    function select(id) {
      buttons.forEach(function (pair) {
        pair[1].setAttribute('aria-pressed', String(pair[0][0] === id));
      });
      var choice = CHOICES.filter(function (c) {
        return c[0] === id;
      })[0];
      var picked = pick(data, id);
      if (choice && picked) render(id, choice[1], picked);
    }

    var initial = (location.hash || '').replace('#', '').toUpperCase();
    var valid = CHOICES.some(function (c) {
      return c[0] === initial;
    });
    select(valid ? initial : 'S02');
  });
})();
