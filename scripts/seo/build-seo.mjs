// Build the static SEO surface into dist/ (GROWTH_ENGINE_PLAN §3 Option B).
//
// Run after `vite build` (scripts/build.sh does this). The SPA is untouched;
// this only adds standalone HTML pages plus sitemap.xml and llms.txt.
//
// Why Vite's SSR loader: the scoring helpers live in src/lib/data.svelte.js,
// which uses Svelte runes ($state) and Vite-only imports (`import core from
// '…json'`, `…json?url`, `app.css?raw`). Plain Node can't import that. A
// middleware-mode Vite server (no port, no HMR socket, no file watcher) with
// the Svelte plugin compiles those modules for SSR on demand, so the pages
// call the very same qolFor / stripCells / whyNow / MonthStrip.svelte the app
// ships — no second copy of the scoring. Svelte's server renderer then turns
// the src/seo/*.svelte templates into static HTML (no hydration, no JS).
//
// Usage: node scripts/seo/build-seo.mjs [--out dist]
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GENERATED_TREES, countsLine } from './trees.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const outArg = process.argv.indexOf('--out');
const outDir = join(root, outArg > 0 ? process.argv[outArg + 1] : 'dist');

const t0 = performance.now();

if (!existsSync(join(outDir, 'index.html'))) {
  console.error(`[seo] ${outDir}/index.html not found — run \`vite build\` first.`);
  process.exit(1);
}

const vite = await createServer({
  root,
  configFile: false, // skip the app config's split-data hook: vite build already ran it
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  // css: 'injected' makes render() return MonthStrip's scoped <style>, which
  // the generator inlines into each page.
  plugins: [svelte({ compilerOptions: { css: 'injected' } })]
});

let result;
try {
  const { buildSite } = await vite.ssrLoadModule('/src/seo/entry.js');
  const detail = JSON.parse(readFileSync(join(root, 'src/generated/travel-detail.json'), 'utf8'));
  result = buildSite({ detail });
} finally {
  await vite.close();
}

// Generated trees are owned by this script: clear them so a renamed or removed
// city never leaves a stale page behind (compare/ and og/ are owned too, so a
// removed comparison or share image goes with it).
for (const dir of GENERATED_TREES) rmSync(join(outDir, dir), { recursive: true, force: true });

let bytes = 0;
for (const f of result.files) {
  const dest = join(outDir, f.path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, f.content);
  bytes += Buffer.byteLength(f.content);
}

// Pages that failed their substance gate are not emitted; say which and why.
for (const s of result.skipped ?? []) console.log(`[seo] skip ${s.path} — ${s.reason}`);

const ms = Math.round(performance.now() - t0);
const pagePaths = result.files.filter((f) => f.path.endsWith('/index.html')).map((f) => ('/' + f.path).replace(/^\/+/, '/').replace(/index\.html$/, ''));
const sitemaps = result.files.filter((f) => /^sitemap.*\.xml$/.test(f.path)).length;
console.log(
  `[seo] ${result.pages} pages (${countsLine(pagePaths)}) + ${sitemaps} sitemap files, llms.txt → ${outDir.replace(root + '/', '')}/ · ${(bytes / 1024).toFixed(0)} KB · ${ms} ms`
);
