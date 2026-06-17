// Shared body-scroll lock for any full-screen overlay (city sheet, settings, the
// My year city picker). Returns an unlock function so callers can run it inside
// an $effect cleanup. Stacks safely: nested locks restore the right prior value
// because each call captures the value it saw.
export function lockScroll() {
  const prev = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return () => {
    document.body.style.overflow = prev;
  };
}
