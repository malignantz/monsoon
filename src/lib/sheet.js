// Shared body-scroll lock for any full-screen overlay (city sheet, settings,
// the My year picker…). Returns an unlock function. Counted, so overlays can
// close in any order: the page scrolls again only when the last one releases.
// (Each lock used to restore the value it saw, which broke when a lower layer
// closed first: rotating a phone with a city sheet open over the My year
// picker left the page locked after both had gone.)
let locks = 0;
let saved = '';

export function lockScroll() {
  if (locks++ === 0) {
    saved = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) document.body.style.overflow = saved;
  };
}
