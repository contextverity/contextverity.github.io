// Renders /results/ from the JSON files in /data/. No result numbers are hard-coded.
(function () {
  'use strict';
  var CV = window.CV;
  var esc = CV.esc;

  var METRICS = [
    ['staleDetectionRate', 'Stale-detection rate', 'Relevant changes that were not accepted as VALID', 'high'],
    ['falseInvalidationRate', 'False-invalidation rate', 'Unchanged context wrongly flagged (lower is better)', 'low'],
    ['falseAcceptanceRate', 'False-acceptance rate', 'Changed context wrongly returned VALID (lower is better)', 'low'],
    ['denyCorrectness', 'DENY correctness', 'Expected DENY that returned DENY', 'high'],
    ['refreshCorrectness', 'REFRESH correctness', 'Expected REFRESH that returned REFRESH', 'high'],
    ['resolveRefusalCorrectness', 'Resolve-refusal correctness', 'Expected refusals that were refused', 'high'],
  ];
  var OUTCOMES = ['VALID', 'REFRESH', 'DENY', 'RESOLVE_DENIED'];
  var OUTCOME_LABEL = { VALID: 'VALID', REFRESH: 'REFRESH', DENY: 'DENY', RESOLVE_DENIED: 'Resolve refused' };

  // One shared, hidden SVG with hatch patterns used as secondary encoding.
  (function defs() {
    var holder = document.createElement('div');
    holder.innerHTML =
      '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false" class="chart"><defs>' +
      '<pattern id="hatch-deny" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="hatch-bg-deny" width="6" height="6"/><line class="hatch-line-deny" x1="0" y1="0" x2="0" y2="6"/></pattern>' +
      '<pattern id="hatch-neutral" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect class="hatch-bg-neutral" width="6" height="6"/><line class="hatch-line-neutral" x1="0" y1="0" x2="0" y2="6"/></pattern>' +
      '</defs></svg>';
    document.body.appendChild(holder.firstChild);
  })();

  function fmtN(n) {
    return n == null ? 'n/a' : String(n);
  }

  function expectText(x) {
    if (!x) return '';
    var out = CV.verdict(x.outcome || 'NONE');
    var codes = (x.codes || []).slice();
    if (x.denialCode) codes.push(x.denialCode);
    if (codes.length) out += '<br><code>' + codes.map(esc).join(', ') + '</code>';
    if (x.informational && x.informational.length)
      out += '<br><span class="muted">informational: <code>' + x.informational.map(esc).join(', ') + '</code></span>';
    return out;
  }

  function notGenerated(file, what) {
    return (
      '<p class="empty"><strong>' + esc(what) + ' not yet generated.</strong> <code>data/' + esc(file) +
      '</code> is not present in this site build. It appears here after the results are regenerated in the ContextVerity repository and synced with <code>node scripts/sync-results.mjs</code>.' +
      CV.fileProtocolNote() + '</p>'
    );
  }

  function legend(items) {
    return (
      '<ul class="legend">' +
      items.map(function (it) {
        return '<li><span class="sw m-' + it[0] + '" aria-hidden="true"></span>' + esc(it[1]) + '</li>';
      }).join('') +
      '</ul>'
    );
  }

  // ---------- charts ----------

  function outcomeChart(s, W) {
    var o = s.observedOutcomes || {};
    var total = OUTCOMES.reduce(function (a, k) {
      return a + (o[k] || 0);
    }, 0);
    var H = 44;
    var x = 0;
    var gap = 2;
    var segs = '';
    var labels = '';
    OUTCOMES.forEach(function (k, i) {
      var n = o[k] || 0;
      if (!n || !total) return;
      var w = (n / total) * W;
      var tip = OUTCOME_LABEL[k] + ': ' + n + ' of ' + total + ' (' + CV.pct(n / total) + ')';
      segs +=
        '<rect class="m-' + k + ' grow" style="--i:' + i + '" x="' + (x + (x ? gap / 2 : 0)).toFixed(1) + '" y="4" width="' +
        Math.max(1, w - (x ? gap : gap / 2)).toFixed(1) + '" height="30" rx="4" tabindex="0" role="img" aria-label="' + esc(tip) + '" data-tip="' + esc(tip) + '"/>';
      if (w > 34) labels += '<text class="v pop" style="--i:' + i + ';fill:#fff" x="' + (x + w / 2).toFixed(1) + '" y="24" text-anchor="middle">' + n + '</text>';
      x += w;
    });
    if (!total) return '<p class="muted">No observed outcomes.</p>';
    return (
      '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="Observed outcome distribution">' + segs + labels + '</svg>' +
      legend(OUTCOMES.map(function (k) {
        return [k, OUTCOME_LABEL[k] + ' ' + (o[k] || 0)];
      }))
    );
  }

  function metricChart(s, W) {
    var m = s.metrics || {};
    var rows = METRICS.filter(function (d) {
      return m[d[0]];
    });
    var RH = 44;
    var LX = 0;
    var BX = Math.min(220, Math.round(W * 0.42));
    var BW = Math.max(60, W - BX - 120);
    var H = rows.length * RH;
    var out = '';
    rows.forEach(function (d, i) {
      var v = m[d[0]];
      var y = i * RH;
      var val = typeof v.value === 'number' ? Math.max(0, Math.min(1, v.value)) : 0;
      var tip = d[1] + ': ' + v.numerator + ' / ' + v.denominator + ' (' + CV.pct(v.value) + '). ' + d[2] + '.';
      out +=
        '<text x="' + LX + '" y="' + (y + 18) + '" class="v">' + esc(d[1]) + '</text>' +
        '<text x="' + LX + '" y="' + (y + 34) + '" style="font-size:11px">' + esc(d[3] === 'low' ? 'lower is better' : 'higher is better') + '</text>' +
        '<rect class="track" x="' + BX + '" y="' + (y + 12) + '" width="' + BW + '" height="12" rx="4"/>' +
        (val > 0
          ? '<rect class="m-metric grow" style="--i:' + i + '" x="' + BX + '" y="' + (y + 12) + '" width="' + (val * BW).toFixed(1) + '" height="12" rx="4" tabindex="0" role="img" aria-label="' + esc(tip) + '" data-tip="' + esc(tip) + '"/>'
          : '<rect x="' + BX + '" y="' + (y + 12) + '" width="' + BW + '" height="12" rx="4" fill="transparent" tabindex="0" role="img" aria-label="' + esc(tip) + '" data-tip="' + esc(tip) + '"/>') +
        '<text class="v pop mono" style="--i:' + i + '" x="' + W + '" y="' + (y + 22) + '" text-anchor="end">' + v.numerator + '/' + v.denominator + '  ' + CV.pct(v.value) + '</text>';
    });
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="Detection metrics">' + out + '</svg>';
  }

  function groupChart(list, W) {
    var groups = [];
    var by = {};
    list.forEach(function (sc) {
      if (!by[sc.group]) {
        by[sc.group] = { PASS: 0, FAIL: 0, UNSUPPORTED: 0, total: 0 };
        groups.push(sc.group);
      }
      var k = sc.status === 'PASS' || sc.status === 'FAIL' ? sc.status : 'UNSUPPORTED';
      by[sc.group][k]++;
      by[sc.group].total++;
    });
    var max = groups.reduce(function (a, g) {
      return Math.max(a, by[g].total);
    }, 0);
    var RH = 26;
    var BX = 140;
    var BW = Math.max(80, W - BX - 40);
    var H = groups.length * RH;
    var out = '';
    groups.forEach(function (g, i) {
      var y = i * RH;
      var x = BX;
      out += '<text x="0" y="' + (y + 17) + '">' + esc(g) + '</text>';
      ['PASS', 'FAIL', 'UNSUPPORTED'].forEach(function (k) {
        var n = by[g][k];
        if (!n) return;
        var w = (n / max) * BW;
        var tip = g + ': ' + n + ' ' + k.toLowerCase();
        out += '<rect class="m-' + k + ' grow" style="--i:' + i + '" x="' + x.toFixed(1) + '" y="' + (y + 5) + '" width="' + Math.max(1, w - 2).toFixed(1) + '" height="15" rx="3" tabindex="0" role="img" aria-label="' + esc(tip) + '" data-tip="' + esc(tip) + '"/>';
        x += w;
      });
      out += '<text class="v pop" style="--i:' + i + '" x="' + (x + 6).toFixed(1) + '" y="' + (y + 17) + '">' + by[g].total + '</text>';
    });
    return (
      '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="Scenarios by group and status">' + out + '</svg>' +
      legend([['PASS', 'Passed'], ['FAIL', 'Failed'], ['UNSUPPORTED', 'Unsupported in this tier']])
    );
  }

  function fmtMs(v) {
    if (v == null) return 'n/a';
    if (typeof v !== 'number') return String(v);
    if (v < 0.1) return v.toFixed(3);
    if (v < 10) return v.toFixed(2);
    if (v < 100) return v.toFixed(1);
    return Math.round(v).toString();
  }

  function rangeChart(rows, labelOf, aria, W) {
    if (!rows.length) return '';
    var lo = Infinity;
    var hi = 0;
    rows.forEach(function (r) {
      if (typeof r.p50 === 'number' && r.p50 > 0) lo = Math.min(lo, r.p50);
      if (typeof r.p95 === 'number') hi = Math.max(hi, r.p95);
    });
    if (!isFinite(lo) || !hi) return '';
    var e0 = Math.floor(Math.log10(lo));
    var e1 = Math.ceil(Math.log10(hi));
    if (e1 === e0) e1++;
    var LX = Math.min(190, Math.round(W * 0.4));
    var PW = W - LX - 22;
    var RH = 24;
    var TOP = 6;
    var H = TOP + rows.length * RH + 26;
    var X = function (v) {
      return LX + ((Math.log10(Math.max(v, Math.pow(10, e0))) - e0) / (e1 - e0)) * PW;
    };
    var out = '<g class="grid">';
    for (var e = e0; e <= e1; e++) {
      var gx = X(Math.pow(10, e)).toFixed(1);
      out += '<line x1="' + gx + '" x2="' + gx + '" y1="' + TOP + '" y2="' + (H - 22) + '"/>';
    }
    out += '</g>';
    for (var e2 = e0; e2 <= e1; e2++) {
      var v = Math.pow(10, e2);
      out += '<text x="' + X(v).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + (v >= 1 ? v.toFixed(0) : v.toFixed(-e2)) + ' ms</text>';
    }
    rows.forEach(function (r, i) {
      var y = TOP + i * RH + RH / 2;
      var a = X(r.p50);
      var b = X(r.p95);
      var tip =
        labelOf(r) + ': p50 ' + fmtMs(r.p50) + ' ms, p95 ' + fmtMs(r.p95) + ' ms' +
        (r.p99 != null ? ', p99 ' + fmtMs(r.p99) + ' ms' : ', p99 n/a (under 1000 samples)') + ', ' + r.samples + ' samples';
      out +=
        '<text x="0" y="' + (y + 4) + '" class="mono">' + esc(labelOf(r)) + '</text>' +
        '<g tabindex="0" role="img" aria-label="' + esc(tip) + '" data-tip="' + esc(tip) + '">' +
        '<rect x="' + LX + '" y="' + (y - RH / 2) + '" width="' + PW + '" height="' + RH + '" fill="transparent"/>' +
        '<line class="range grow" style="--i:' + i + '" x1="' + a.toFixed(1) + '" x2="' + b.toFixed(1) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<circle class="m-p50 pop" style="--i:' + i + '" cx="' + a.toFixed(1) + '" cy="' + y + '" r="5"/>' +
        '<circle class="m-p95 pop" style="--i:' + i + '" cx="' + b.toFixed(1) + '" cy="' + y + '" r="5"/></g>';
    });
    return (
      '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="group" aria-label="' + esc(aria) + '">' + out + '</svg>' +
      legend([['p50', 'p50 (median)'], ['p95', 'p95']])
    );
  }

  function benchTable(rows) {
    return (
      '<div class="table-wrap"><table><thead><tr><th scope="col">Operation</th><th scope="col" class="num">Sources</th><th scope="col" class="num">Concurrency</th><th scope="col" class="num">Samples</th><th scope="col" class="num">p50 ms</th><th scope="col" class="num">p95 ms</th><th scope="col" class="num">p99 ms</th><th scope="col" class="num">Mean ms</th><th scope="col" class="num">Throughput / s</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return (
          '<tr><td><code>' + esc(r.operation) + '</code></td><td class="num">' + esc(r.sources) + '</td><td class="num">' + esc(r.concurrency) +
          '</td><td class="num">' + esc(r.samples) + '</td><td class="num">' + fmtMs(r.p50) + '</td><td class="num">' + fmtMs(r.p95) +
          '</td><td class="num">' + (r.p99 == null ? '<span class="muted" title="Fewer than 1000 samples">n/a</span>' : fmtMs(r.p99)) +
          '</td><td class="num">' + fmtMs(r.mean) + '</td><td class="num">' +
          (typeof r.throughputPerSec === 'number' ? Math.round(r.throughputPerSec).toLocaleString('en') : esc(r.throughputPerSec)) + '</td></tr>'
        );
      }).join('') +
      '</tbody></table></div>'
    );
  }

  // Source-count rows (concurrency 1) and concurrency rows are reported separately.
  // The harness repeats the concurrency-1 baseline at the start of the concurrency sweep.
  function splitBench(rows) {
    var conc = rows.filter(function (r) {
      return r.concurrency > 1;
    });
    var baseIdx = -1;
    if (conc.length) {
      var idxs = [];
      rows.forEach(function (r, i) {
        if (r.concurrency === 1 && r.operation === conc[0].operation && r.sources === conc[0].sources) idxs.push(i);
      });
      if (idxs.length > 1) baseIdx = idxs[idxs.length - 1];
    }
    return {
      sources: rows.filter(function (r, i) {
        return r.concurrency === 1 && i !== baseIdx;
      }),
      concurrency: (baseIdx >= 0 ? [rows[baseIdx]] : []).concat(conc),
    };
  }

  function benchmarks(res, file) {
    if (!res.ok) return '<h3>Benchmarks</h3>' + notGenerated(file, 'Benchmark data');
    var b = res.data;
    var rows = b.results || [];
    var parts = splitBench(rows);
    var html =
      '<h3>Benchmarks</h3><p class="tier-scope">' + (b.scope ? esc(b.scope) + ' ' : '') +
      'Generated ' + esc(b.generatedAt || 'n/a') + '. Horizontal axes are logarithmic.</p><div class="chart-grid">';
    if (parts.sources.length) {
      html += '<div class="chart-card" data-reveal><h3>Latency by number of sources</h3><p class="sub">Concurrency 1. Dot pairs show p50 and p95.</p><div data-chart="bench-sources"></div></div>';
    }
    if (parts.concurrency.length) {
      html +=
        '<div class="chart-card" data-reveal style="--i:1"><h3>Verification latency under concurrency</h3><p class="sub">' +
        esc(parts.concurrency[0].operation) + ' with ' + esc(parts.concurrency[0].sources) + '-source receipts.</p><div data-chart="bench-conc"></div></div>';
    }
    html += '</div><details class="table-view"><summary>Show benchmark tables</summary>';
    if (parts.sources.length) html += '<h4>By number of sources</h4>' + benchTable(parts.sources);
    if (parts.concurrency.length) html += '<h4>By concurrency</h4>' + benchTable(parts.concurrency);
    return html + '</details>';
  }

  function ledger(s) {
    var items = [
      ['Scenarios', s.total],
      ['Executed', s.executed],
      ['Passed', s.passed],
      ['Failed', s.failed],
      ['Unsupported', s.unsupported],
    ];
    return (
      '<dl class="ledger">' +
      items.map(function (it, i) {
        return '<div data-reveal style="--i:' + i + '"><dt>' + esc(it[0]) + '</dt><dd data-n="' + esc(fmtN(it[1])) + '">' + esc(fmtN(it[1])) + '</dd></div>';
      }).join('') +
      '</dl>'
    );
  }

  function metricsTable(s) {
    var m = s.metrics || {};
    return (
      '<details class="table-view"><summary>Show metrics as a table</summary><div class="table-wrap"><table><thead><tr><th scope="col">Metric</th><th scope="col">Meaning</th><th scope="col" class="num">Count</th><th scope="col" class="num">Rate</th></tr></thead><tbody>' +
      METRICS.filter(function (d) {
        return m[d[0]];
      }).map(function (d) {
        var v = m[d[0]];
        return '<tr><th scope="row">' + esc(d[1]) + '</th><td>' + esc(d[2]) + '</td><td class="num">' + esc(v.numerator) + ' / ' + esc(v.denominator) + '</td><td class="num">' + CV.pct(v.value) + '</td></tr>';
      }).join('') +
      '</tbody></table></div></details>'
    );
  }

  function unsupported(list) {
    if (!list.length) return '<p class="muted">Every scenario in this tier was executed.</p>';
    return (
      '<div class="table-wrap"><table><thead><tr><th scope="col">ID</th><th scope="col">Scenario</th><th scope="col">Reason</th></tr></thead><tbody>' +
      list.map(function (sc) {
        return '<tr><td><code>' + esc(sc.id) + '</code></td><td>' + esc(sc.title) + '</td><td>' + esc(sc.unsupportedReason || 'not stated') + '</td></tr>';
      }).join('') +
      '</tbody></table></div>'
    );
  }

  function scenarioTable(tier, list) {
    var groups = [];
    list.forEach(function (sc) {
      if (groups.indexOf(sc.group) < 0) groups.push(sc.group);
    });
    var id = 'scn-' + tier;
    return (
      '<h3 id="' + id + '-h">All scenarios</h3>' +
      '<div class="filters" role="search" aria-labelledby="' + id + '-h">' +
      '<label>Search<input type="search" data-f="q" placeholder="ID, title or code"></label>' +
      '<label>Group<select data-f="group"><option value="">All groups</option>' +
      groups.map(function (g) {
        return '<option>' + esc(g) + '</option>';
      }).join('') +
      '</select></label>' +
      '<label>Status<select data-f="status"><option value="">Any status</option><option>PASS</option><option>FAIL</option><option>UNSUPPORTED</option></select></label>' +
      '<label>Observed<select data-f="outcome"><option value="">Any outcome</option>' +
      OUTCOMES.map(function (k) {
        return '<option>' + k + '</option>';
      }).join('') +
      '</select></label><span class="count" aria-live="polite"></span></div>' +
      '<div class="table-wrap"><table id="' + id + '"><thead><tr><th scope="col">ID</th><th scope="col">Title</th><th scope="col">Group</th><th scope="col">Expected</th><th scope="col">Observed</th><th scope="col">Status</th></tr></thead><tbody>' +
      list.map(function (sc) {
        var obs = sc.observed;
        var codes = obs ? (obs.codes || []).concat(obs.denialCode ? [obs.denialCode] : []) : [];
        var hay = [sc.id, sc.title, sc.group, (sc.expect && sc.expect.outcome) || '', codes.join(' '), sc.status].join(' ').toLowerCase();
        return (
          '<tr data-q="' + esc(hay) + '" data-group="' + esc(sc.group) + '" data-status="' + esc(sc.status) + '" data-outcome="' + esc(obs ? obs.outcome : '') + '">' +
          '<td><code>' + esc(sc.id) + '</code></td><td>' + esc(sc.title) + '</td><td>' + esc(sc.group) + '</td>' +
          '<td>' + expectText(sc.expect) + '</td><td>' + (obs ? expectText(obs) : '<span class="muted">not executed</span>') + '</td>' +
          '<td><span class="status-' + esc(sc.status) + '">' + esc(sc.status) + '</span></td></tr>'
        );
      }).join('') +
      '</tbody></table></div>'
    );
  }

  function wireFilters(container) {
    var inputs = container.querySelectorAll('[data-f]');
    var rows = container.querySelectorAll('tbody tr[data-q]');
    var count = container.querySelector('.filters .count');
    if (!rows.length) return;
    function apply() {
      var f = {};
      Array.prototype.forEach.call(inputs, function (el) {
        f[el.getAttribute('data-f')] = el.value.trim().toLowerCase();
      });
      var shown = 0;
      Array.prototype.forEach.call(rows, function (tr) {
        var ok =
          (!f.q || tr.getAttribute('data-q').indexOf(f.q) >= 0) &&
          (!f.group || tr.getAttribute('data-group').toLowerCase() === f.group) &&
          (!f.status || tr.getAttribute('data-status').toLowerCase() === f.status) &&
          (!f.outcome || tr.getAttribute('data-outcome').toLowerCase() === f.outcome);
        tr.hidden = !ok;
        if (ok) shown++;
      });
      if (count) count.textContent = shown + ' of ' + rows.length + ' shown';
    }
    Array.prototype.forEach.call(inputs, function (el) {
      el.addEventListener('input', apply);
    });
    apply();
  }

  function environment(d) {
    var e = d.environment || {};
    var items = [
      ['Backstage release', esc(e.backstageRelease || 'n/a')],
      ['ContextVerity version', esc(e.contextverityVersion || 'n/a')],
      ['Commit', CV.commitLink(e.commit) + (e.dirtyWorkingTree && e.commit !== 'uncommitted' ? ' <span class="muted">(uncommitted changes present)</span>' : '')],
      ['Node.js', esc(e.node || 'n/a')],
      ['Platform', esc(e.platform || 'n/a')],
      ['CPU', esc((e.cpu || 'n/a') + (e.cpuCount ? ', ' + e.cpuCount + ' cores' : ''))],
      ['Memory', esc(e.memoryGiB ? e.memoryGiB + ' GiB' : 'n/a')],
      ['Generated', esc(d.generatedAt || 'n/a')],
    ];
    return (
      '<h3>Environment</h3><dl class="env">' +
      items.map(function (it) {
        return '<div><dt>' + it[0] + '</dt><dd>' + it[1] + '</dd></div>';
      }).join('') +
      '</dl>'
    );
  }

  function renderTier(section) {
    var tier = section.getAttribute('data-tier');
    var scenFile = section.getAttribute('data-scenarios');
    var benchFile = section.getAttribute('data-benchmarks');
    var body = section.querySelector('.tier-body');
    return Promise.all([CV.load(scenFile), CV.load(benchFile)]).then(function (r) {
      var scen = r[0];
      var html = '';
      if (!scen.ok) {
        html += notGenerated(scenFile, 'Scenario results');
      } else {
        var d = scen.data;
        var s = d.summary || {};
        var list = d.scenarios || [];
        if (d.scope) html += '<p class="tier-scope">' + esc(d.scope) + '</p>';
        html += ledger(s);
        html +=
          '<div class="chart-grid">' +
          '<div class="chart-card" data-reveal><h3>Observed outcomes</h3><p class="sub">Every executed scenario, by the outcome ContextVerity returned.</p><div data-chart="outcomes"></div></div>' +
          '<div class="chart-card" data-reveal style="--i:1"><h3>Detection metrics</h3><p class="sub">Count and rate within this tier.</p><div data-chart="metrics"></div></div>' +
          '<div class="chart-card wide" data-reveal><h3>Scenarios by group</h3><p class="sub">Status of each scenario group in this tier.</p><div data-chart="groups"></div></div>' +
          '</div>';
        html += metricsTable(s);
        var uns = list.filter(function (x) {
          return x.status === 'UNSUPPORTED';
        });
        html += '<h3>Unsupported in this tier</h3>' + unsupported(uns);
        html += scenarioTable(tier, list);
      }
      html += benchmarks(r[1], benchFile);
      if (scen.ok) html += environment(scen.data);
      body.innerHTML = html;
      body.setAttribute('aria-busy', 'false');
      wireFilters(body);
      var parts = r[1].ok ? splitBench(r[1].data.results || []) : null;
      var builders = {
        outcomes: function (W) { return scen.ok ? outcomeChart(scen.data.summary || {}, W) : ''; },
        metrics: function (W) { return scen.ok ? metricChart(scen.data.summary || {}, W) : ''; },
        groups: function (W) { return scen.ok ? groupChart(scen.data.scenarios || [], W) : ''; },
        'bench-sources': function (W) {
          return parts ? rangeChart(parts.sources, function (x) { return x.operation + ', ' + x.sources + ' src'; }, 'Latency by operation and number of sources', W) : '';
        },
        'bench-conc': function (W) {
          return parts ? rangeChart(parts.concurrency, function (x) { return 'concurrency ' + x.concurrency; }, 'Latency by concurrency', W) : '';
        },
      };
      var lastW = {};
      function draw(initial) {
        Array.prototype.forEach.call(body.querySelectorAll('[data-chart]'), function (holder) {
          var W = Math.max(280, Math.round(holder.clientWidth));
          var key = holder.getAttribute('data-chart');
          if (!initial && lastW[key] === W) return;
          lastW[key] = W;
          holder.innerHTML = builders[key](W);
          var svgEl = holder.querySelector('svg.chart');
          if (svgEl) {
            if (initial) CV.reveal(svgEl);
            else svgEl.classList.add('is-in');
          }
        });
      }
      draw(true);
      var t = null;
      window.addEventListener('resize', function () {
        clearTimeout(t);
        t = setTimeout(function () { draw(false); }, 150);
      });
      Array.prototype.forEach.call(body.querySelectorAll('.ledger dd'), function (dd) {
        var n = Number(dd.getAttribute('data-n'));
        if (!isNaN(n)) CV.countUp(dd, n);
      });
      CV.scanReveals(body);
    });
  }

  function renderProvenance() {
    var el = document.getElementById('provenance');
    if (!el) return;
    var files = ['scenarios-backstage.json', 'scenarios-core.json', 'benchmarks-backstage.json', 'benchmarks-core.json', 'summary.json'];
    Promise.all([CV.load('provenance.json')].concat(files.map(CV.load))).then(function (r) {
      var p = r[0].ok ? r[0].data : null;
      var html = '<dl class="env">';
      if (p) {
        var repo = String(p.sourceRepo || '');
        html += '<div><dt>Source repository</dt><dd>' + (/^https:\/\//.test(repo) ? '<a href="' + esc(repo) + '">' + esc(repo.replace('https://', '')) + '</a>' : esc(repo || 'n/a')) + '</dd></div>';
        html += '<div><dt>Results commit</dt><dd>' + CV.commitLink(p.commit) + '</dd></div>';
        html += '<div><dt>Synced into this site</dt><dd>' + esc(p.syncedAt) + '</dd></div>';
      } else {
        html += '<div><dt>Provenance</dt><dd>not yet generated</dd></div>';
      }
      files.forEach(function (f, i) {
        html += '<div><dt><code>data/' + esc(f) + '</code></dt><dd>' + (r[i + 1].ok ? 'present' : 'not yet generated') + '</dd></div>';
      });
      el.innerHTML = html + '</dl>' + (r[0].ok ? '' : '<p class="empty">Provenance file missing.' + CV.fileProtocolNote() + '</p>');
    });
  }

  renderProvenance();
  Array.prototype.forEach.call(document.querySelectorAll('section[data-tier]'), renderTier);
})();
