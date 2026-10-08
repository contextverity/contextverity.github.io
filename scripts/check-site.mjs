#!/usr/bin/env node
// Static sanity check for the ContextVerity website. Run: node scripts/check-site.mjs
//
// - required permanent pages and files exist
// - every internal href/src (HTML) and url() (CSS) resolves to a tracked file,
//   and same-site #fragments point at an existing id
// - every JSON file in /data parses
// - no http:// URLs, and no third-party script, stylesheet or font URLs
// - no local filesystem paths leak into published files
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const err = (file, msg) => errors.push(`${file ? relative(root, file) + ': ' : ''}${msg}`);

const REQUIRED = [
  'index.html',
  'architecture/index.html',
  'results/index.html',
  'demo/index.html',
  'docs/index.html',
  'security/index.html',
  'roadmap/index.html',
  'contributing/index.html',
  '404.html',
  'robots.txt',
  '.nojekyll',
  'favicon.svg',
  'scripts/sync-results.mjs',
  'scripts/check-site.mjs',
];
for (const f of REQUIRED) if (!existsSync(join(root, f))) err(null, `missing required file ${f}`);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const all = walk(root);
const published = all.filter((p) => !relative(root, p).startsWith('.github' + sep));
const html = published.filter((p) => extname(p) === '.html');
const css = published.filter((p) => extname(p) === '.css');
const js = published.filter((p) => extname(p) === '.js' || extname(p) === '.mjs');
const svg = published.filter((p) => extname(p) === '.svg');

const idCache = new Map();
function idsOf(file) {
  if (!idCache.has(file)) {
    const s = readFileSync(file, 'utf8');
    idCache.set(file, new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return idCache.get(file);
}

function resolveTarget(fromFile, url) {
  const clean = url.split('#')[0].split('?')[0];
  let p = clean.startsWith('/') ? join(root, decodeURI(clean)) : resolve(dirname(fromFile), decodeURI(clean));
  if (clean === '' ) p = fromFile;
  else if (clean.endsWith('/')) p = join(p, 'index.html');
  else if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  return p;
}

function checkRef(file, url, kind) {
  if (/^(mailto:|tel:|data:|javascript:)/i.test(url)) {
    if (/^javascript:/i.test(url)) err(file, `javascript: URL in ${kind}`);
    return;
  }
  if (/^http:\/\//i.test(url)) return err(file, `insecure http:// URL in ${kind}: ${url}`);
  if (/^(https:)?\/\//i.test(url)) return; // external, checked separately for resources
  const target = resolveTarget(file, url);
  if (!target.startsWith(root)) return err(file, `${kind} escapes the site root: ${url}`);
  if (!existsSync(target)) return err(file, `broken ${kind}: ${url}`);
  const frag = url.includes('#') ? url.split('#')[1] : '';
  if (frag && extname(target) === '.html' && !idsOf(target).has(decodeURIComponent(frag))) {
    err(file, `missing anchor #${frag} in ${relative(root, target)} (from ${kind} ${url})`);
  }
}

for (const file of html) {
  const s = readFileSync(file, 'utf8');
  for (const m of s.matchAll(/\s(href|src|srcset|poster|action)="([^"]*)"/g)) {
    const [, attr, value] = m;
    const urls = attr === 'srcset' ? value.split(',').map((x) => x.trim().split(/\s+/)[0]) : [value];
    for (const u of urls) if (u) checkRef(file, u, attr);
  }
  // Third-party executable or styling resources are not allowed.
  for (const m of s.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g))
    if (/^(https?:)?\/\//i.test(m[1])) err(file, `third-party script: ${m[1]}`);
  for (const m of s.matchAll(/<link\b[^>]*>/g)) {
    const tag = m[0];
    const href = (tag.match(/\shref="([^"]+)"/) || [])[1] || '';
    if (/rel="(stylesheet|preload|modulepreload|icon|manifest)"/.test(tag) && /^(https?:)?\/\//i.test(href))
      err(file, `third-party resource in <link>: ${href}`);
  }
  if (!/<html[^>]*\slang="/.test(s)) err(file, 'missing <html lang>');
  if (!/<title>[^<]+<\/title>/.test(s)) err(file, 'missing <title>');
  if (!/<main\b/.test(s)) err(file, 'missing <main> landmark');
  for (const m of s.matchAll(/<img\b[^>]*>/g)) if (!/\salt="/.test(m[0])) err(file, `img without alt: ${m[0].slice(0, 80)}`);
}

for (const file of css) {
  const s = readFileSync(file, 'utf8');
  for (const m of s.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    const u = m[1];
    if (/^data:/.test(u) || u.startsWith('#')) continue;
    if (/^(https?:)?\/\//i.test(u)) err(file, `external url() in CSS: ${u}`);
    else checkRef(file, u, 'url()');
  }
  if (/@import\s/.test(s)) err(file, '@import is not allowed');
  if (/@font-face/.test(s)) err(file, '@font-face is not allowed (system fonts only)');
}

for (const file of js) {
  const s = readFileSync(file, 'utf8');
  if (/\bimport\s*\(\s*['"]https?:/.test(s) || /from\s+['"]https?:/.test(s)) err(file, 'remote module import');
}

// http:// anywhere in published text, except XML namespace identifiers and
// loopback addresses shown as text (checked as link targets above).
const NS_OK = /^http:\/\/(www\.w3\.org\/|127\.0\.0\.1|localhost)/;
for (const file of [...html, ...css, ...js, ...svg]) {
  const s = readFileSync(file, 'utf8');
  for (const m of s.matchAll(/http:\/\/[^\s"'<>)]+/g)) if (!NS_OK.test(m[0])) err(file, `http:// URL: ${m[0]}`);
  if (/\/Users\/|\/home\/[a-z]|[A-Z]:\\\\Users/.test(s)) err(file, 'contains a local filesystem path');
}

for (const file of svg) {
  const s = readFileSync(file, 'utf8');
  if (/<script\b/i.test(s)) err(file, 'SVG contains <script>');
  if (/(?:href|xlink:href)="(https?:)?\/\//.test(s)) err(file, 'SVG references an external resource');
}

const dataDir = join(root, 'data');
if (existsSync(dataDir)) {
  for (const f of readdirSync(dataDir).filter((n) => n.endsWith('.json'))) {
    const p = join(dataDir, f);
    try {
      JSON.parse(readFileSync(p, 'utf8'));
    } catch (e) {
      err(p, `invalid JSON: ${e.message}`);
    }
    if (/\/Users\/|\/home\/[a-z]/.test(readFileSync(p, 'utf8'))) err(p, 'contains a local filesystem path');
  }
} else {
  err(null, 'missing data/ directory');
}

if (errors.length) {
  console.error(`check-site: ${errors.length} problem(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`check-site: OK (${html.length} pages, ${css.length} stylesheets, ${js.length} scripts, ${svg.length} SVGs)`);
