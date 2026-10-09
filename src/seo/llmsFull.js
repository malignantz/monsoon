// llms-full.txt: the plain text of every indexable static page in one file,
// for agents that would rather read the whole corpus than crawl it. Each page's
// rendered <main> is turned into light Markdown (headings, lists, tables,
// internal links); decorative strips (aria-hidden) and SVG are dropped.
import { SITE } from './derive.js';

const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'wbr', 'source']);
const BLOCK = new Set(['p', 'div', 'li', 'dt', 'dd', 'tr', 'blockquote', 'figcaption', 'section', 'article', 'ul', 'ol', 'dl', 'table', 'thead', 'tbody', 'figure', 'aside', 'nav', 'header', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const HEAD = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };

const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const attr = (attrs, name) => {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4]) : null;
};

// html: a fragment (the page's <main>); shift: how many levels to demote
// headings (h2 → h3 when shift=1); dropH1: omit the page's own h1 (the
// surrounding section heading already carries it).
export function htmlToText(html, { shift = 0, dropH1 = true } = {}) {
  const src = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|svg)\b[\s\S]*?<\/\1>/gi, '');
  const re = /<\/?([a-zA-Z][\w-]*)([^>]*)>|[^<]+/g;
  let out = '';
  let skip = null; // { name, depth } while inside an aria-hidden subtree
  let depth = 0; // nesting of skip.name since the skipped element opened
  let link = null; // { href, start } while inside an internal <a>
  let row = null; // current table row cells
  let table = null; // { rows: 0 } while inside a table
  let inDt = false;
  let liDepth = 0; // inside <li>, nested blocks become spaces so an item stays on one line
  let afterLink = false; // insert a space when text runs straight on from a link
  const ensureBreak = (n = 1) => {
    out = out.replace(/[ \t]+$/, '');
    const trailing = out.match(/\n*$/)[0].length;
    if (out.length && trailing < n) out += '\n'.repeat(n - trailing);
  };
  for (const m of src.matchAll(re)) {
    const [tok, rawName, attrs = ''] = m;
    if (!rawName) {
      if (skip) continue;
      let text = decode(tok).replace(/\s+/g, ' ');
      if (afterLink && /^[\w$(]/.test(text) && !row) text = ' ' + text;
      afterLink = false;
      if (!text.trim()) {
        if (out && !/\s$/.test(out) && !row) out += ' ';
        else if (row && row.length && !/\s$/.test(row[row.length - 1])) row[row.length - 1] += ' ';
        continue;
      }
      if (row) {
        if (!row.length) row.push('');
        row[row.length - 1] += text;
      } else out += text;
      continue;
    }
    const name = rawName.toLowerCase();
    const closing = tok.startsWith('</');
    if (skip) {
      if (name === skip.name) depth += closing ? -1 : 1;
      if (depth === 0) skip = null;
      continue;
    }
    if (!closing && !VOID.has(name) && /aria-hidden\s*=\s*["']?true/i.test(attrs)) {
      skip = { name };
      depth = 1;
      continue;
    }
    if (name === 'br') {
      if (row) row[row.length - 1] += ' ';
      else out += '\n';
      continue;
    }
    if (name === 'table') {
      if (!closing) table = { rows: 0 };
      else table = null;
      ensureBreak(2);
      continue;
    }
    if (name === 'tr') {
      if (!closing) row = [];
      else if (row) {
        const cells = row.map((c) => c.replace(/\s+/g, ' ').trim().replace(/\|/g, '/'));
        ensureBreak(1);
        out += `| ${cells.join(' | ')} |\n`;
        if (table && table.rows === 0) out += `| ${cells.map(() => '---').join(' | ')} |\n`;
        if (table) table.rows++;
        row = null;
      }
      continue;
    }
    if (name === 'th' || name === 'td') {
      if (row && !closing) row.push('');
      continue;
    }
    if (row) continue; // other tags inside a row are inline
    if (HEAD[name]) {
      const level = HEAD[name];
      if (!closing) {
        ensureBreak(2);
        if (!(dropH1 && level === 1)) out += '#'.repeat(Math.min(6, level + shift)) + ' ';
        else skip = { name }, (depth = 1);
      } else ensureBreak(2);
      continue;
    }
    if (name === 'li') {
      if (!closing) {
        ensureBreak(1);
        out += '- ';
        liDepth++;
      } else {
        liDepth = Math.max(0, liDepth - 1);
        ensureBreak(1);
      }
      continue;
    }
    if (name === 'dt') {
      if (!closing) {
        ensureBreak(1);
        inDt = true;
      } else inDt = false;
      continue;
    }
    if (name === 'dd') {
      if (!closing) out = out.replace(/\s+$/, '') + ': ';
      else ensureBreak(1);
      continue;
    }
    if (name === 'a') {
      if (!closing) {
        const href = attr(attrs, 'href');
        if (href && href.startsWith('/') && !href.startsWith('//')) link = { href: decode(href), start: out.length };
      } else if (link) {
        const text = out.slice(link.start).trim();
        out = out.slice(0, link.start) + (text ? `[${text}](${SITE}${link.href})` : '');
        link = null;
        afterLink = true;
      }
      continue;
    }
    if (BLOCK.has(name)) {
      if (liDepth > 0 && name !== 'ul' && name !== 'ol') {
        if (out && !/\s$/.test(out)) out += ' ';
      } else ensureBreak(name === 'p' || name === 'blockquote' || name === 'figure' ? 2 : 1);
      continue;
    }
  }
  return out
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const mainOf = (body) => {
  const m = body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  return m ? m[1] : body;
};

// Reading order for the corpus: hubs before leaves.
export const pageRank = (path) => {
  if (path === '/best/') return 0;
  if (path.startsWith('/best/where-to-be-in-')) return 1;
  if (path.startsWith('/best/')) return 2;
  if (path === '/cities/') return 3;
  if (path === '/compare/') return 4;
  if (path.startsWith('/compare/')) return 5;
  return 6;
};
