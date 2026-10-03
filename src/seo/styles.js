// Critical CSS inlined into every static page. Brand tokens are lifted from the
// app's own src/app.css :root block at build time, so a palette change there
// flows here without a second copy to keep in sync.
import appCss from '../app.css?raw';

const rootBlock = /:root\s*\{[\s\S]*?\n\}/.exec(appCss)?.[0];
if (!rootBlock) throw new Error('[seo] could not find the :root token block in src/app.css');

const PAGE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--paper);background-image:radial-gradient(rgba(33,36,30,.035) .5px,transparent .5px);background-size:14px 14px;color:var(--ink);font-family:var(--sans);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased;overflow-x:hidden}
h1,h2,h3{font-family:var(--display);font-weight:550;line-height:1.15;margin:0}
a{color:var(--ink);text-decoration-color:var(--line);text-underline-offset:3px}
a:hover{color:var(--terra-deep);text-decoration-color:currentColor}
:focus-visible{outline:2px solid var(--terra);outline-offset:2px;border-radius:4px}
.num{font-family:var(--mono);font-variant-numeric:tabular-nums}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.wrap{max-width:940px;margin:0 auto;padding:0 var(--pad-x)}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 0 10px;flex-wrap:wrap}
.brand{display:inline-flex;align-items:center;gap:9px;text-decoration:none;font-family:var(--display);font-size:21px;font-weight:600;letter-spacing:-.01em}
.mark{display:inline-grid;grid-template-columns:repeat(4,5px);gap:2px;height:20px}
.mark i{display:block;border-radius:1.5px}
.mark i:nth-child(1){background:var(--band-bad)}.mark i:nth-child(2){background:var(--band-ok)}.mark i:nth-child(3){background:var(--band-good)}.mark i:nth-child(4){background:var(--band-great)}
.nav{display:flex;gap:4px;flex-wrap:wrap}
.nav a{font-size:14px;font-weight:500;text-decoration:none;padding:8px 10px;border-radius:999px;color:var(--ink-2)}
.nav a:hover{background:var(--paper-2);color:var(--ink)}
.crumbs{font-size:13px;color:var(--ink-3);margin:6px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px}
.crumbs li+li::before{content:"›";margin-right:6px;color:var(--line)}
.crumbs a{color:var(--ink-3)}
.kicker{font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:600;color:var(--ink-3);margin:26px 0 8px}
h1{font-size:var(--h1);font-weight:600;letter-spacing:-.015em}
h1 .dot{color:var(--terra)}
.dek{font-family:var(--display);font-size:clamp(18px,2.6vw,21px);color:var(--ink-2);margin:12px 0 0;max-width:46em}
.lede{font-size:17px;margin:18px 0 0;max-width:44em}
.lede strong{font-weight:650}
.strip-wrap{margin:22px 0 6px}
.strip-months{display:grid;grid-template-columns:repeat(12,1fr);gap:2px;margin-top:6px}
.strip-months a{font-size:11px;text-align:center;color:var(--ink-3);text-decoration:none;padding:4px 0}
.strip-months a:hover{color:var(--terra-deep)}
.ctas{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0 4px}
.btn{display:inline-flex;align-items:center;min-height:var(--tap);padding:0 18px;border-radius:999px;font-weight:600;font-size:15px;text-decoration:none;border:1px solid var(--ink);transition:background .15s ease}
.btn.primary{background:var(--ink);color:var(--paper)}
.btn.primary:hover{background:var(--terra-deep);border-color:var(--terra-deep);color:#fff}
.btn.ghost{color:var(--ink);background:transparent}
.btn.ghost:hover{background:var(--paper-2);color:var(--ink)}
section{margin-top:40px;padding-top:22px;border-top:1px solid var(--line)}
section>h2{font-size:var(--h2);margin-bottom:12px}
section>p{max-width:44em;margin:10px 0}
.glance{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:0;padding:0}
.glance>div{background:var(--card);border:1px solid var(--line-soft);border-radius:12px;padding:12px 14px}
.glance dt{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);font-weight:600}
.glance dd{margin:4px 0 0;font-size:15px}
.glance dd .big{font-size:22px;font-weight:600;margin-right:6px}
.schengen{color:var(--schengen);font-weight:600}
.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line-soft);border-radius:12px;background:var(--card)}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{padding:9px 10px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--line-soft)}
th{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);font-weight:600;background:var(--paper-2)}
th:first-child,td:first-child{text-align:left;position:sticky;left:0;background:inherit}
thead th:first-child{background:var(--paper-2)}
tbody tr{background:var(--card)}
tbody tr:last-child td{border-bottom:none}
td.note{white-space:normal;text-align:left;color:var(--ink-2);font-size:13px;min-width:12em}
.pill{display:inline-block;min-width:2.4em;text-align:center;border-radius:6px;padding:1px 6px;font-family:var(--mono);font-weight:600;font-size:14px}
.pill.lg{font-size:20px;padding:3px 9px;border-radius:8px}
.band-great{background:var(--band-great);color:var(--band-great-ink)}
.band-good{background:var(--band-good);color:var(--band-good-ink)}
.band-ok{background:var(--band-ok);color:var(--band-ok-ink)}
.band-bad{background:var(--band-bad);color:var(--band-bad-ink)}
.flag{color:var(--terra-deep);font-size:12.5px}
.muted{color:var(--ink-3)}
.small{font-size:13.5px}
ul.plain,ol.plain{list-style:none;margin:0;padding:0}
.events li{padding:10px 0;border-bottom:1px solid var(--line-soft);display:grid;grid-template-columns:5.5em 1fr;gap:10px}
.events li:last-child{border-bottom:none}
.events .when{font-family:var(--mono);font-size:13px;color:var(--ink-3);padding-top:2px}
.tier{font-size:11px;letter-spacing:.06em;text-transform:uppercase;font-weight:600;color:var(--terra-deep);margin-left:6px}
.sources li{padding:9px 0;border-bottom:1px solid var(--line-soft);font-size:14.5px}
.sources li:last-child{border-bottom:none}
.sources b{font-weight:650}
.chip{display:inline-block;font-size:11px;letter-spacing:.04em;text-transform:uppercase;font-weight:600;border:1px solid var(--line);border-radius:999px;padding:0 7px;margin-left:6px;color:var(--ink-2);vertical-align:1px}
.chip.editorial{border-color:var(--terra-soft);background:var(--terra-soft);color:var(--terra-deep)}
.chip.low{border-color:var(--band-ok);color:var(--band-ok-ink)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
.card{display:block;background:var(--card);border:1px solid var(--line-soft);border-radius:12px;padding:12px 14px;text-decoration:none}
.card:hover{border-color:var(--ink-3);color:var(--ink)}
.card .row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px}
.card .name{font-family:var(--display);font-size:18px;font-weight:600}
.card .sub{font-size:13px;color:var(--ink-3);margin-top:8px}
.rank>li{display:grid;grid-template-columns:2.2em 1fr auto;gap:4px 12px;align-items:start;padding:14px 0;border-bottom:1px solid var(--line-soft)}
.rank>li:last-child{border-bottom:none}
.rank .pos{font-family:var(--mono);color:var(--ink-3);font-size:14px;padding-top:4px}
.rank .name{font-family:var(--display);font-size:19px;font-weight:600}
.rank .where{font-size:13px;color:var(--ink-3)}
.rank .why{font-size:14.5px;color:var(--ink-2);margin:8px 0 0}
.rank .right{text-align:right}
.rank .val{display:block;font-family:var(--mono);font-size:21px;font-weight:600;line-height:1.2}
.rank .unit{display:block;font-size:12px;color:var(--ink-3);max-width:12em;margin-left:auto}
.rank .cost{display:block;font-family:var(--mono);font-size:13px;color:var(--ink-2);margin-top:6px}
.rank .strip-cell{margin-top:9px;max-width:300px}
.rest{columns:2 220px;column-gap:28px;font-size:14.5px;margin:0;padding-left:2.4em}
.rest li{break-inside:avoid;padding:3px 0}
.rest .num{color:var(--ink-3);font-size:13px;margin-left:6px}
.region{margin-top:28px}
.region h2{font-size:var(--h2);margin-bottom:10px}
.cmp{margin:22px 0 6px}
.cmp-row+.cmp-row{margin-top:16px}
.cmp-head{display:flex;justify-content:space-between;align-items:baseline;gap:4px 12px;flex-wrap:wrap;margin-bottom:6px}
.cmp-head .name{font-family:var(--display);font-size:19px;font-weight:600}
.cmp-head .cost{font-size:13px;color:var(--ink-2)}
.winrow{display:grid;grid-template-columns:repeat(12,1fr);gap:2px;margin-top:5px}
.winrow span{display:block;height:5px;border-radius:2px}
.winrow span.on{background:var(--terra)}
.cmp-note{font-size:13.5px;color:var(--ink-3);margin:10px 0 0;max-width:46em}
.cmp-note .key{display:inline-block;width:18px;height:5px;border-radius:2px;background:var(--terra);vertical-align:2px;margin-right:6px}
td.verdict,th.verdict{text-align:left}
td.verdict.win{color:var(--terra-deep);font-weight:650}
td.diff{color:var(--ink-2)}
.bullets{margin:10px 0;padding-left:1.2em;max-width:44em}
.bullets li{padding:2px 0}
.xlinks p{margin:8px 0;max-width:46em}
.xlinks{margin-top:14px}
.monthnav{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:0;padding:0;list-style:none}
.monthnav a{display:block;text-align:center;padding:8px 0;border:1px solid var(--line);border-radius:8px;text-decoration:none;font-size:14px;font-weight:500}
.monthnav a[aria-current]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.monthnav a:hover{border-color:var(--ink)}
.prevnext{display:flex;justify-content:space-between;gap:12px;margin:18px 0 0;font-weight:500}
.foot{margin:56px 0 0;padding:22px 0 40px;border-top:1px solid var(--line);font-size:13.5px;color:var(--ink-3)}
.foot p{margin:8px 0}
.foot a{color:var(--ink-2)}
@media (min-width:720px){.monthnav{grid-template-columns:repeat(12,1fr)}}
@media (max-width:560px){.rank>li{grid-template-columns:1.8em 1fr auto}.rank .strip-cell{max-width:none}}
`;

const minify = (css) =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};:,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();

export const BASE_CSS = minify(rootBlock) + minify(PAGE_CSS);
export { minify };
