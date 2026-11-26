// Render one page in headless Chrome and print JSON {status, finalUrl, html, title}
// to stdout. Called by scripts/collect_evidence.py --browser; not part of the build.
// Playwright is not a repo dependency: it is loaded from PLAYWRIGHT_NODE_MODULES
// (default ~/concert_bot/node_modules) and drives the system Chrome
// (CHROME_PATH, default /opt/google/chrome/chrome).
//   node scripts/render_page.mjs <url> [--wait ms] [--scroll n]
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const url = args[0];
if (!url) { console.error('usage: render_page.mjs <url> [--wait ms] [--scroll n]'); process.exit(2); }
const opt = (name, dflt) => { const i = args.indexOf(name); return i > 0 ? Number(args[i + 1]) : dflt; };
const waitMs = opt('--wait', 4000);
const scrolls = opt('--scroll', 2);

const nm = process.env.PLAYWRIGHT_NODE_MODULES || join(homedir(), 'concert_bot', 'node_modules');
const require = createRequire(join(nm, 'noop.js'));
const { chromium } = require('playwright');

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome',
});
try {
  const ctx = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 monsoon.fyi-evidence-collect',
  });
  const page = await ctx.newPage();
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(waitMs);
  for (let i = 0; i < scrolls; i++) {
    await page.mouse.wheel(0, 1600);
    await page.waitForTimeout(1500);
  }
  const html = await page.content();
  process.stdout.write(JSON.stringify({
    status: resp ? resp.status() : null,
    finalUrl: page.url(),
    title: await page.title(),
    html,
  }));
} finally {
  await browser.close();
}
