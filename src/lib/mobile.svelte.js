// One source of truth for "are we on a phone-sized screen?" so layout decisions
// (the My year board vs. the vertical month list, sheet vs. inline panel) can
// branch on real state instead of CSS-only media queries. 700px matches the
// breakpoint the components already use for their stacked layouts.
const MOBILE_Q = '(max-width: 700px)';

export const screen = $state({ mobile: false });

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mq = window.matchMedia(MOBILE_Q);
  screen.mobile = mq.matches;
  // addEventListener('change') is the modern API; guard for very old Safari.
  const onChange = (e) => (screen.mobile = e.matches);
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
}
