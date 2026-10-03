// Light / dark theme: the preference ('system' | 'light' | 'dark', saved with
// the other settings) and its application to the page. Plain JS, safe to import
// where window or document don't exist (static page generation, tests).
//
// index.html runs an inline script that resolves and sets data-theme before
// first paint so there's no flash. resolveTheme() below mirrors that logic
// exactly; the two must stay in step.

export const THEMES = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' }
];

export const isTheme = (k) => THEMES.some((t) => t.key === k);

// Browser chrome colours, matching --paper in each theme (app.css, index.html).
const THEME_COLOR = { light: '#f6f1e6', dark: '#191b16' };

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemQuery() {
  return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(DARK_QUERY) : null;
}

// An explicit 'light' or 'dark' wins; anything else follows the device.
export function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return systemQuery()?.matches ? 'dark' : 'light';
}

export function applyTheme(pref) {
  if (typeof document === 'undefined') return;
  const theme = resolveTheme(pref);
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
}

// Keep a 'system' preference live when the device flips (sunset, OS toggle).
// Call once; getPref is read on every change so it always sees the current choice.
export function watchSystemTheme(getPref) {
  const mq = systemQuery();
  if (!mq) return;
  const onChange = () => {
    if (getPref() === 'system') applyTheme('system');
  };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
}
