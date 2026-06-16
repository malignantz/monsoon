// Lightweight, provider-agnostic analytics wrapper ("wired but dark").
//
// Layer 1 (audience: geo / UA / referrers / Web Vitals) is handled outside the
// bundle by the Cloudflare Web Analytics beacon in index.html — nothing to do
// here for that.
//
// Layer 2 (behaviour: the custom events below) is OFF until a provider script
// is present on the page. Every track() call is a safe no-op until then, so the
// instrumentation can live in the components now and cost nothing. Turning it on
// later is a config flip, not a refactor:
//   • Plausible — add their <script>, exposes window.plausible(event, {props})
//   • PostHog   — add their snippet, exposes window.posthog.capture(event, props)
// Whichever is loaded gets the events; if neither is, calls just no-op.

const DEV = import.meta.env?.DEV;

export function track(event, props) {
  try {
    if (typeof window === 'undefined') return;

    // Plausible: plausible(eventName, { props: {...} })
    if (typeof window.plausible === 'function') {
      window.plausible(event, props ? { props } : undefined);
    }

    // PostHog: posthog.capture(eventName, { ...props })
    if (window.posthog && typeof window.posthog.capture === 'function') {
      window.posthog.capture(event, props);
    }

    // In dev there's no provider loaded, so echo to the console to confirm the
    // events fire (and with what props) while building out instrumentation.
    if (DEV) console.debug('[analytics]', event, props ?? '');
  } catch {
    // Analytics must never break the app — swallow everything.
  }
}
