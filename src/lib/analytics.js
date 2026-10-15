// First-party analytics wrapper.
//
// Layer 1 (audience: geo / UA / referrers / Web Vitals) is handled outside the
// bundle by the Cloudflare Web Analytics beacon in index.html — nothing to do
// here for that.
//
// Layer 2 (behaviour: the custom events below) is sent to our own Pages Function,
// POST /api/e (functions/api/e.js), which writes one Analytics Engine data point
// per event. No third-party script, no cookie, no identifier: the body is just
// {e, p, path}. Nothing is sent in dev, on localhost, or when the browser says
// Global Privacy Control is on. `npm run report:events` reads the data back.
//
// track() never throws: analytics must never break the app.

const DEV = import.meta.env?.DEV;

// Static page types that may send a visitor into the app, as `?from=<page-type>`.
// App.svelte reads it once, fires `entry`, and strips it from the address bar.
// derive.js writes these values and check-seo.mjs validates them.
export const ENTRY_FROM = ['best-month', 'best-region', 'city', 'compare', 'cities'];

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|.*\.localhost)$/;

function sink(event, props) {
  if (typeof location === 'undefined' || LOCAL.test(location.hostname)) return;
  if (typeof navigator !== 'undefined' && navigator.globalPrivacyControl === true) return;
  const body = JSON.stringify({ e: event, p: props ?? {}, path: location.pathname });
  if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/e', body)) return;
  fetch('/api/e', { method: 'POST', body, keepalive: true }).catch(() => {});
}

export function track(event, props) {
  try {
    if (typeof window === 'undefined') return;

    // In dev, echo to the console to confirm the events fire (and with what
    // props) while building out instrumentation. Nothing is sent.
    if (DEV) {
      console.debug('[analytics]', event, props ?? '');
      return;
    }

    sink(event, props);
  } catch {
    // Analytics must never break the app — swallow everything.
  }
}
