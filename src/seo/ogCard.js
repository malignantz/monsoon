// Share-image (Open Graph) cards for Monsoon: pure functions, data in, a
// 1200x630 SVG string out. No I/O, no Vite-only imports. scripts/seo/og.mjs
// turns the SVG into a PNG with @resvg/resvg-js and the bundled TTFs.
//
// Callers pass already-computed public numbers (Scores, costs). Nothing here
// derives a Score; it only draws what it is given.
//
// Text fitting: every function takes an optional second argument
// `{ measure }` where `measure(text, family, weight, size) -> pixel width`.
// scripts/seo/og.mjs exports an accurate one (resvg bbox of the real font),
// and `cards` there is these four functions pre-bound to it. Without it a
// conservative per-character estimate is used, so output is still safe but
// less tightly fitted.

// ---- Palette: mirrors the :root block in src/app.css ----------------------
const PAPER = '#f6f1e6'; // --paper
const INK = '#21241e'; // --ink
const INK_2 = '#5c5f55'; // --ink-2
const INK_3 = '#67695e'; // --ink-3
const LINE = '#d9d1bb'; // --line
const TERRA = '#b84927'; // --terra
const BAND = {
  great: { fill: '#156b4f', ink: '#e8f3ea' }, // --band-great / -ink
  good: { fill: '#9eba63', ink: '#2c3a10' },
  ok: { fill: '#e2a53c', ink: '#46300a' },
  bad: { fill: '#ad4324', ink: '#fff4ee' }
};

// ---- Font family names exactly as the bundled TTFs register them ----------
export const FONT = {
  display: 'Fraunces 144pt', // weight 400: big headlines (high-contrast display cut)
  displayBold: 'Fraunces 36pt', // weight 600: wordmark, badge numbers, row names (sturdier at small sizes)
  body: 'Schibsted Grotesk', // weights 400, 600
  mono: 'Spline Sans Mono' // weights 500, 600
};

export const W = 1200;
export const H = 630;
const MX = 84; // side margin, matches the original card
const CONTENT_W = W - MX * 2; // 1032
const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

// Same thresholds as band() in src/lib/data.svelte.js.
export function bandOf(q) {
  if (q >= 85) return 'great';
  if (q >= 75) return 'good';
  if (q >= 65) return 'ok';
  return 'bad';
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- Measuring and fitting -------------------------------------------------
const EST = { [FONT.display]: 0.5, [FONT.displayBold]: 0.52, [FONT.body]: 0.53, [FONT.mono]: 0.62 };
function estimate(text, family, weight, size) {
  return [...String(text)].length * size * (EST[family] ?? 0.55) * (weight >= 600 ? 1.05 : 1);
}

function pickMeasure(opts) {
  return typeof opts?.measure === 'function' ? opts.measure : estimate;
}

const SLACK = 0.98; // fit into 98% of the box; the ink bbox ignores side bearings

// Largest font size <= maxSize (and >= minSize) at which `text` fits maxW.
// Text that still overflows at minSize is truncated with an ellipsis.
function fit(measure, text, family, weight, maxW, maxSize, minSize) {
  text = String(text ?? '');
  const avail = maxW * SLACK;
  const w0 = measure(text, family, weight, maxSize);
  if (w0 <= avail) return { text, size: maxSize };
  let size = Math.max(minSize, Math.floor((maxSize * avail) / w0));
  while (size > minSize && measure(text, family, weight, size) > avail) size -= 1;
  if (measure(text, family, weight, size) <= avail) return { text, size };
  let t = text;
  while (t.length > 1 && measure(t + '…', family, weight, size) > avail) t = t.slice(0, -1);
  return { text: t.trimEnd() + '…', size };
}

const money = (v) => (typeof v === 'number' ? `$${Math.round(v).toLocaleString('en-US')}` : String(v ?? ''));
const roundQ = (q) => Math.round(Number(q) || 0);

// ---- Drawing helpers -------------------------------------------------------
function txt(x, y, s, { family, weight = 400, size, fill = INK, anchor, ls } = {}) {
  return (
    `<text x="${x}" y="${y}" font-family="${esc(family)}" font-weight="${weight}" font-size="${size}" fill="${fill}"` +
    (anchor ? ` text-anchor="${anchor}"` : '') +
    (ls ? ` letter-spacing="${ls}"` : '') +
    `>${esc(s)}</text>`
  );
}

function open(title, desc) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<title>${esc(title)}</title><desc>${esc(desc)}</desc>` +
    `<rect width="${W}" height="${H}" fill="${PAPER}"/>`
  );
}

// Four band-coloured bars + "Monsoon" + ".fyi" in terracotta mono.
function brand(measure, y = 80) {
  const bars = [BAND.bad, BAND.ok, BAND.good, BAND.great]
    .map((b, i) => `<rect x="${MX + i * 27}" y="${y}" width="17" height="48" rx="5" fill="${b.fill}"/>`)
    .join('');
  const nameSize = 38;
  const nameW = measure('Monsoon', FONT.displayBold, 600, nameSize);
  const x = MX + 4 * 27 + 24;
  return (
    bars +
    txt(x, y + 36, 'Monsoon', { family: FONT.displayBold, weight: 600, size: nameSize }) +
    txt(x + nameW + 8, y + 36, '.fyi', { family: FONT.mono, weight: 600, size: 26, fill: TERRA })
  );
}

// The signature 12-cell month strip. `cells` is [{q, band?}]; missing cells draw
// as empty outlines so a short array never throws.
function strip(
  cells,
  { x = MX, y, w = CONTENT_W, h, gap = 10, r = 12, numSize = 0, outline = [], letterY, letterSize = 22, boldLetters = [] }
) {
  const cw = (w - gap * 11) / 12;
  let out = '';
  for (let i = 0; i < 12; i++) {
    const c = cells?.[i];
    const cx = +(x + i * (cw + gap)).toFixed(2);
    if (c && Number.isFinite(Number(c.q))) {
      const b = BAND[c.band && BAND[c.band] ? c.band : bandOf(c.q)];
      out += `<rect x="${cx}" y="${y}" width="${+cw.toFixed(2)}" height="${h}" rx="${r}" fill="${b.fill}"/>`;
      if (numSize) {
        out += txt(+(cx + cw / 2).toFixed(2), y + h / 2 + numSize * 0.35, roundQ(c.q), {
          family: FONT.mono,
          weight: 600,
          size: numSize,
          fill: b.ink,
          anchor: 'middle'
        });
      }
    } else {
      out += `<rect x="${cx}" y="${y}" width="${+cw.toFixed(2)}" height="${h}" rx="${r}" fill="none" stroke="${LINE}" stroke-width="2"/>`;
    }
    if (outline.includes(i)) {
      out += `<rect x="${+(cx - 5).toFixed(2)}" y="${y - 5}" width="${+(cw + 10).toFixed(2)}" height="${h + 10}" rx="${r + 4}" fill="none" stroke="${INK}" stroke-width="3"/>`;
    }
    if (letterY) {
      const bold = boldLetters.includes(i);
      out += txt(+(cx + cw / 2).toFixed(2), letterY, MONTH_LETTERS[i], {
        family: FONT.mono,
        weight: bold ? 600 : 500,
        size: letterSize,
        fill: bold ? INK : INK_3,
        anchor: 'middle'
      });
    }
  }
  return out;
}

// ---- Default site card -----------------------------------------------------
// data: { cityCount, regionCount, cells: [{q, band?} x12] } - cells are purely
// decorative here; the badge shows the highest Score among them.
export function defaultCard({ cityCount, regionCount, cells = [] } = {}, opts) {
  const measure = pickMeasure(opts);
  const qs = cells.map((c) => Number(c?.q)).filter(Number.isFinite);
  const top = qs.length ? roundQ(Math.max(...qs)) : null;
  let s = open('Monsoon — follow the good months', `${cityCount} cities scored month by month.`);
  s += brand(measure);
  if (top != null) {
    const b = BAND[bandOf(top)];
    s += `<rect x="${W - MX - 150}" y="76" width="150" height="92" rx="16" fill="${b.fill}"/>`;
    s += txt(W - MX - 75, 128, top, { family: FONT.displayBold, weight: 600, size: 52, fill: b.ink, anchor: 'middle' });
    s += txt(W - MX - 75, 154, 'SCORE', { family: FONT.body, weight: 600, size: 17, fill: b.ink, anchor: 'middle', ls: 1.5 });
  }
  if (regionCount) {
    s += txt(MX, 222, `${regionCount} regions · 12 months`, { family: FONT.mono, weight: 500, size: 22, fill: TERRA, ls: 1 });
  }
  const head = fit(measure, 'Follow the good months', FONT.display, 400, CONTENT_W, 124, 70);
  s += txt(MX - 4, 338, head.text, { family: FONT.display, weight: 400, size: head.size });
  const sub = fit(
    measure,
    `${cityCount} cities scored month by month — weather, air, safety, cost.`,
    FONT.body,
    400,
    CONTENT_W,
    33,
    22
  );
  s += txt(MX, 394, sub.text, { family: FONT.body, weight: 400, size: sub.size, fill: INK_2 });
  s += strip(cells, { y: 468, h: 78, letterY: 592, letterSize: 22 });
  return s + '</svg>';
}

// ---- City card -------------------------------------------------------------
// data: { name, country, region, cells, best: {month:'May', q:92}, fromSolo:'$1,420', safety?: {score,label} }
export function cityCard({ name, country, region, cells = [], best, fromSolo, safety } = {}, opts) {
  const measure = pickMeasure(opts);
  let s = open(`${name} — Monsoon`, `${name}: Score by month.`);
  s += brand(measure);

  if (safety && Number.isFinite(Number(safety.score))) {
    const label = safety.label ? ` · ${safety.label}` : '';
    const size = 24;
    s +=
      `<text x="${W - MX}" y="116" text-anchor="end" font-family="${FONT.body}" font-size="${size}" fill="${INK_2}">Safety ` +
      `<tspan font-family="${FONT.mono}" font-weight="600" fill="${INK}">${esc(roundQ(safety.score))}</tspan>${esc(label)}</text>`;
  }

  // Name baseline is fixed; the kicker rides just above the cap height so a
  // shrunken long name keeps the same rhythm as a short one.
  const nm = fit(measure, name, FONT.display, 400, CONTENT_W, 112, 52);
  const nameY = 328;
  s += txt(MX - 3, nameY, nm.text, { family: FONT.display, weight: 400, size: nm.size });
  const kicker = [country, region].filter(Boolean).join(' · ');
  const k = fit(measure, kicker.toUpperCase(), FONT.mono, 500, CONTENT_W, 22, 15);
  s += txt(MX, Math.round(nameY - nm.size * 0.74 - 26), k.text, { family: FONT.mono, weight: 500, size: k.size, fill: TERRA, ls: 1 });

  // Outlined month: best.month (name, or 0-11 index), else the highest cell.
  let bi = best ? monthIndex(best.month) : -1;
  if (bi < 0 && cells.length) bi = cells.reduce((m, c, i) => (Number(c?.q) > Number(cells[m]?.q) ? i : m), 0);
  if (best) {
    const parts = [
      { t: `Best in ${best.month}`, w: 600, fill: INK },
      { t: ' · ', w: 400, fill: INK_3 },
      { t: `Score ${roundQ(best.q)}`, w: 600, fill: INK }
    ];
    if (fromSolo) {
      parts.push({ t: ' · ', w: 400, fill: INK_3 }, { t: `from ${money(fromSolo)}/mo solo`, w: 400, fill: INK_2 });
    }
    const plain = parts.map((p) => p.t).join('');
    const f = fit(measure, plain, FONT.body, 600, CONTENT_W, 32, 20);
    const spans = parts
      .map((p) => `<tspan font-weight="${p.w}" fill="${p.fill}">${esc(p.t)}</tspan>`)
      .join('');
    s += `<text x="${MX}" y="400" font-family="${FONT.body}" font-size="${f.size}">${spans}</text>`;
  }

  s += strip(cells, {
    y: 440,
    h: 96,
    numSize: 28,
    outline: bi >= 0 ? [bi] : [],
    boldLetters: bi >= 0 ? [bi] : [],
    letterY: 586,
    letterSize: 22
  });
  return s + '</svg>';
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
function monthIndex(m) {
  if (typeof m === 'number') return m;
  const i = MONTH_NAMES.findIndex((n) => n.startsWith(String(m ?? '').toLowerCase().slice(0, 3)) && String(m).length >= 3);
  return i;
}

// ---- Month card ------------------------------------------------------------
// data: { month:'June', leaders:[{name,country,q,cost}] (3-5), great:31, total:120 }
export function monthCard({ month, leaders = [], great, total } = {}, opts) {
  const measure = pickMeasure(opts);
  let s = open(`Where to be in ${month} — Monsoon`, `Top-scoring cities in ${month}.`);
  s += brand(measure);
  const title = fit(measure, `Where to be in ${month}`, FONT.display, 400, CONTENT_W, 88, 52);
  s += txt(MX - 3, 232, title.text, { family: FONT.display, weight: 400, size: title.size });
  if (great != null && total != null) {
    s += txt(MX, 280, `${great} of ${total} cities score 85+ in ${month}`, { family: FONT.body, weight: 400, size: 30, fill: INK_2 });
  }

  const rows = leaders.slice(0, 5);
  const top = 312;
  const avail = 590 - top;
  const rh = Math.min(66, Math.floor(avail / Math.max(rows.length, 1)));
  const pillW = 92;
  const pillH = Math.min(44, rh - 10);
  const costRight = W - MX - pillW - 28;
  rows.forEach((l, i) => {
    const y = top + i * rh;
    const mid = y + rh / 2;
    if (i > 0) s += `<line x1="${MX}" y1="${y}" x2="${W - MX}" y2="${y}" stroke="${LINE}" stroke-width="1.5"/>`;
    s += txt(MX, mid + 10, i + 1, { family: FONT.mono, weight: 600, size: 26, fill: TERRA });
    const nx = MX + 52;
    const cost = l.cost != null && l.cost !== '' ? (typeof l.cost === 'number' ? `${money(l.cost)}/mo` : String(l.cost)) : '';
    const costW = cost ? measure(cost, FONT.mono, 500, 24) : 0;
    const maxText = costRight - costW - 28 - nx;
    const nm = fit(measure, l.name, FONT.displayBold, 600, maxText * 0.68, 32, 20);
    const nmW = measure(nm.text, FONT.displayBold, 600, nm.size);
    s += txt(nx, mid + 11, nm.text, { family: FONT.displayBold, weight: 600, size: nm.size });
    const cx = nx + nmW + 14;
    const co = fit(measure, l.country ?? '', FONT.body, 400, Math.max(40, costRight - costW - 28 - cx), 22, 16);
    if (l.country) s += txt(cx, mid + 8, co.text, { family: FONT.body, weight: 400, size: co.size, fill: INK_3 });
    if (cost) s += txt(costRight, mid + 8, cost, { family: FONT.mono, weight: 500, size: 24, fill: INK_2, anchor: 'end' });
    const b = BAND[bandOf(l.q)];
    s += `<rect x="${W - MX - pillW}" y="${mid - pillH / 2}" width="${pillW}" height="${pillH}" rx="${pillH / 2}" fill="${b.fill}"/>`;
    s += txt(W - MX - pillW / 2, mid + 9, roundQ(l.q), { family: FONT.mono, weight: 600, size: 26, fill: b.ink, anchor: 'middle' });
  });
  return s + '</svg>';
}

// ---- Compare card ----------------------------------------------------------
// data: { a:{name,cells,cost}, b:{name,cells,cost}, claim, winMonths:[0-11 indexes where A wins] }
export function compareCard({ a, b, claim, winMonths = [] } = {}, opts) {
  const measure = pickMeasure(opts);
  let s = open(`${a?.name} vs ${b?.name} — Monsoon`, claim || `${a?.name} vs ${b?.name}`);
  s += brand(measure);

  // Headline "A vs B": names in Fraunces, "vs" small in the body face. Measure at
  // a reference size and scale (widths are linear in font size).
  const REF = 100;
  const wa = measure(a?.name ?? '', FONT.display, 400, REF);
  const wb = measure(b?.name ?? '', FONT.display, 400, REF);
  const vsRatio = 0.36;
  const wv = measure('vs', FONT.body, 600, REF * vsRatio);
  const gapRatio = 0.34;
  const total = wa + wb + wv + 2 * gapRatio * REF; // at size REF
  let size = Math.min(86, Math.floor((REF * CONTENT_W * SLACK) / total));
  size = Math.max(size, 40);
  const k = size / REF;
  let nameA = a?.name ?? '', nameB = b?.name ?? '';
  if (total * k > CONTENT_W * SLACK) {
    // Extreme case: truncate any name too wide for half the room at the 40px floor.
    const each = (CONTENT_W * SLACK - (wv + 2 * gapRatio * REF) * k) / 2;
    if (wa * k > each) nameA = fit(measure, nameA, FONT.display, 400, each, size, size).text;
    if (wb * k > each) nameB = fit(measure, nameB, FONT.display, 400, each, size, size).text;
  }
  const wA = measure(nameA, FONT.display, 400, size);
  const gap = gapRatio * size;
  const vsSize = Math.round(size * vsRatio);
  const wV = measure('vs', FONT.body, 600, vsSize);
  const hy = 232;
  s += txt(MX - 3, hy, nameA, { family: FONT.display, weight: 400, size });
  s += txt(MX - 3 + wA + gap, hy, 'vs', { family: FONT.body, weight: 600, size: vsSize, fill: TERRA });
  s += txt(MX - 3 + wA + gap + wV + gap, hy, nameB, { family: FONT.display, weight: 400, size });

  if (claim) {
    const c = fit(measure, claim, FONT.body, 400, CONTENT_W, 30, 20);
    s += txt(MX, 282, c.text, { family: FONT.body, weight: 400, size: c.size, fill: INK_2 });
  }

  const rowsDef = [
    { side: a, y: 336, win: winMonths },
    { side: b, y: 456, win: [] }
  ];
  for (const { side, y, win } of rowsDef) {
    const cost = side?.cost != null && side.cost !== '' ? (typeof side.cost === 'number' ? `${money(side.cost)}/mo` : String(side.cost)) : '';
    const costW = cost ? measure(cost, FONT.mono, 500, 22) : 0;
    const nm = fit(measure, side?.name ?? '', FONT.body, 600, CONTENT_W - costW - 30, 26, 18);
    s += txt(MX, y + 4, nm.text, { family: FONT.body, weight: 600, size: nm.size });
    if (cost) s += txt(W - MX, y + 4, cost, { family: FONT.mono, weight: 500, size: 22, fill: INK_2, anchor: 'end' });
    s += strip(side?.cells ?? [], { y: y + 18, h: 62, r: 11, numSize: 22, outline: win });
  }
  // Month letters once, under the lower strip.
  const cw = (CONTENT_W - 110) / 12;
  for (let i = 0; i < 12; i++) {
    s += txt(+(MX + i * (cw + 10) + cw / 2).toFixed(2), 568, MONTH_LETTERS[i], {
      family: FONT.mono,
      weight: 500,
      size: 20,
      fill: INK_3,
      anchor: 'middle'
    });
  }
  if (winMonths.length) {
    const lg = fit(measure, `Outlined: months ${a?.name} scores higher`, FONT.body, 400, CONTENT_W, 20, 15);
    s += txt(MX, 604, lg.text, { family: FONT.body, weight: 400, size: lg.size, fill: INK_3 });
  }
  return s + '</svg>';
}
