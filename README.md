# contextverity.github.io

ContextVerity project website. Apache-2.0.

Plain HTML, CSS, vanilla JavaScript and SVG. No framework, no build step, no
external scripts, styles, fonts, analytics or cookies. GitHub Pages serves the
repository root as-is (see `.github/workflows/pages.yml`).

## Preview locally

```sh
python3 -m http.server 8765
# open http://127.0.0.1:8765/
```

Pages read result data from `/data/` with `fetch`, so open them over HTTP rather
than from the file system.

## Sync result data

Result pages never hard-code numbers. They render the JSON files that the
ContextVerity test harness writes to `test-results/`. To refresh them from a
checkout of [contextverity/contextverity](https://github.com/contextverity/contextverity):

```sh
node scripts/sync-results.mjs ../contextverity/test-results
```

This copies every JSON file into `data/` and writes `data/provenance.json`
(source repository, the commit recorded by the harness, and the sync time).
Files that have not been generated yet (for example benchmarks) are shown on
the site as "not yet generated".

## Check before pushing

```sh
node scripts/check-site.mjs
```

Validates required pages, internal links, anchors and assets, parses every JSON
file in `data/`, and rejects `http://` URLs and third-party scripts, styles or
fonts. CI runs the same check before deploying.

## Permanent URLs

`/`, `/architecture/`, `/results/` and `/demo/` are linked publicly and must keep
working.
