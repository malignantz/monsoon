// One shared behaviour for every dialog, sheet and bottom sheet:
//
//   <div role="dialog" aria-modal="true" tabindex="-1" use:focusTrap={{ onescape: close }}>
//
// • Focus moves into the layer on open (the layer itself, which carries the
//   dialog's label) and goes back to whatever had it before on close.
// • Tab and Shift+Tab cycle inside the topmost layer only. A live toast
//   (anything marked data-trap-include) joins the cycle, so its Undo stays
//   reachable from inside a sheet.
// • Escape closes the topmost layer only. Layers stack in mount order, which
//   matches what is visually on top here: the My year picker (z 60) under a
//   city sheet (z 70) opened from one of its rows; a comparison under a sheet
//   opened from it; methodology (z 80) over the sheet whose footer opened it.
//   An open info popover (ScoreInfo) swallows its own Escape at the document,
//   before this window listener, and methodology handles its own in the
//   capture phase — so Escape peels exactly one layer at a time.
// • The page behind is scroll-locked while any layer is open.
//
// Options: onescape (omit for layers that handle Escape themselves),
// autofocus/restore/lock (default true; false for a host wrapping a component
// that already manages its own focus and scroll lock).
import { lockScroll } from './sheet.js';

const stack = [];

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(',');

function tabbables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.tabIndex >= 0 && !el.closest('[hidden], [inert]') && el.getClientRects().length > 0
  );
}

export const isTopLayer = (node) => !!node && stack.at(-1)?.node === node;

// Put focus back on the open layer (e.g. after a toast inside its Tab cycle
// closes); a no-op when nothing is open.
export function focusTopLayer() {
  stack.at(-1)?.node.focus?.({ preventScroll: true });
}

function onKeydown(e) {
  const top = stack.at(-1);
  if (!top) return;
  if (e.key === 'Escape') {
    if (e.defaultPrevented || !top.opts.onescape) return;
    e.preventDefault();
    top.opts.onescape();
    return;
  }
  if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return;
  const extra = [...document.querySelectorAll('[data-trap-include]')].filter((el) => !top.node.contains(el));
  const items = [...tabbables(top.node), ...extra.flatMap(tabbables)];
  e.preventDefault();
  if (!items.length) {
    top.node.focus?.({ preventScroll: true });
    return;
  }
  const i = items.indexOf(document.activeElement);
  const next = i < 0 ? (e.shiftKey ? items.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + items.length) % items.length;
  items[next].focus();
}

export function focusTrap(node, options = {}) {
  const opts = { autofocus: true, restore: true, lock: true, ...options };
  const layer = { node, opts, prev: document.activeElement };
  if (!stack.length) window.addEventListener('keydown', onKeydown);
  stack.push(layer);
  const unlock = opts.lock ? lockScroll() : null;
  if (opts.autofocus) node.focus({ preventScroll: true });

  return {
    update(next = {}) {
      Object.assign(layer.opts, next);
    },
    destroy() {
      const i = stack.indexOf(layer);
      const wasTop = i === stack.length - 1;
      if (i >= 0) stack.splice(i, 1);
      if (!stack.length) window.removeEventListener('keydown', onKeydown);
      unlock?.();
      if (!opts.restore || !wasTop) return;
      // Back to the control that opened this layer; if it has gone (the view
      // changed underneath), to the layer that is now on top.
      const target = layer.prev?.isConnected ? layer.prev : stack.at(-1)?.node;
      target?.focus?.({ preventScroll: true });
    }
  };
}
