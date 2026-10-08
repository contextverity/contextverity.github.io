#!/usr/bin/env node
// Copies machine-readable results from a ContextVerity checkout into /data/.
//
//   node scripts/sync-results.mjs [path-to-contextverity/test-results]
//
// Default source: ../contextverity/test-results (a sibling checkout).
// Writes data/provenance.json with the source repository, the commit recorded
// by the test harness and the sync time. Local paths are never written.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_REPO = 'https://github.com/contextverity/contextverity';
const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(here, '..');
const dataDir = join(siteRoot, 'data');
const src = resolve(process.argv[2] || join(siteRoot, '..', 'contextverity', 'test-results'));

if (!existsSync(src) || !statSync(src).isDirectory()) {
  console.error(`sync-results: source directory not found: ${src}`);
  console.error('Pass the test-results directory of a ContextVerity checkout as the first argument.');
  process.exit(1);
}

const files = readdirSync(src).filter((f) => f.endsWith('.json')).sort();
if (!files.length) {
  console.error(`sync-results: no JSON files in ${src}`);
  process.exit(1);
}

mkdirSync(dataDir, { recursive: true });
const commits = new Set();
for (const f of files) {
  const raw = readFileSync(join(src, f), 'utf8');
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    console.error(`sync-results: ${f} is not valid JSON: ${err.message}`);
    process.exit(1);
  }
  if (/^scenarios-/.test(f) && doc?.environment?.commit) commits.add(doc.environment.commit);
  // Re-serialize so the published file is normalized and contains only parsed JSON.
  writeFileSync(join(dataDir, f), JSON.stringify(doc, null, 2) + '\n');
  console.log(`copied ${f}`);
}

let commit = 'unknown';
if (commits.size === 1) commit = [...commits][0];
else if (commits.size > 1) {
  commit = [...commits].join(',');
  console.warn(`sync-results: scenario files disagree on commit: ${commit}`);
}

const provenance = {
  sourceRepo: SOURCE_REPO,
  commit,
  syncedAt: new Date().toISOString(),
  files,
};
writeFileSync(join(dataDir, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
console.log(`wrote provenance.json (commit ${commit})`);
