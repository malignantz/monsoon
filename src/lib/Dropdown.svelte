<script module>
  // Only one dropdown is open at a time across the page.
  const ui = $state({ open: null });
</script>

<script>
  // A button that opens a small panel beneath it (desktop filter row, lens).
  // Escape closes it and returns focus to the button; a click outside or Tab
  // out of it closes it; opening another closes this one.
  import { tick } from 'svelte';

  // onclear + clearLabel: an active dropdown gets a separate "×" button beside
  // its main part, so the set value clears without opening the panel.
  // fitHeight: cap the panel to the space below the button (it scrolls inside).
  let { id, active = false, label, badge = 0, panelLabel, width = 260, onclear = null, clearLabel = '', fitHeight = false, button, children } = $props();
  let maxH = $state(null);

  let wrap = $state();
  let btn = $state();
  let panel = $state();
  let alignRight = $state(false);
  const open = $derived(ui.open === id);

  export function close(refocus = false) {
    if (ui.open === id) ui.open = null;
    if (refocus) btn?.focus();
  }

  async function toggle() {
    if (open) return close();
    ui.open = id;
    await tick();
    if (!panel || !btn) return;
    const r = btn.getBoundingClientRect();
    alignRight = r.left + panel.offsetWidth > document.documentElement.clientWidth - 12;
    if (fitHeight) maxH = Math.max(220, Math.min(window.innerHeight - r.bottom - 18, window.innerHeight * 0.7));
    (panel.querySelector('input:checked') ?? panel.querySelector('input, button, select'))?.focus();
  }

  $effect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!wrap?.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close(true);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  });

  function onFocusOut(e) {
    if (e.relatedTarget && !wrap?.contains(e.relatedTarget)) close();
  }
</script>

<div class="dd" bind:this={wrap} onfocusout={onFocusOut}>
  <button
    bind:this={btn}
    type="button"
    class="dd-btn"
    class:on={active}
    class:has-x={active && onclear}
    class:open
    aria-expanded={open}
    aria-controls="{id}-panel"
    onclick={toggle}
  >
    {#if button}{@render button()}{:else}{label}{/if}
    {#if badge}<span class="dd-badge num">{badge}<span class="sr-only"> active</span></span>{/if}
    <svg class="dd-chev" viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
      <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
  {#if active && onclear}
    <button type="button" class="dd-x" aria-label={clearLabel} title={clearLabel} onclick={() => { onclear(); close(); btn?.focus(); }}>
      <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
        <path d="M2 2 8 8M8 2 2 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
    </button>
  {/if}
  {#if open}
    <div
      bind:this={panel}
      id="{id}-panel"
      class="dd-panel"
      class:right={alignRight}
      role="group"
      aria-label={panelLabel ?? label}
      class:fit={maxH != null}
      style:width="{width}px"
      style:max-height={maxH != null ? `${maxH}px` : null}
    >
      {@render children?.()}
    </div>
  {/if}
</div>

<style>
  .dd {
    position: relative;
    flex: none;
    display: flex;
  }

  /* Main part + "×" read as one pill split by a hairline. */
  .dd-btn.has-x {
    padding-right: 9px;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
    border-right-width: 0;
  }

  .dd-x {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 30px;
    padding: 0 2px 0 0;
    border: 1px solid var(--terra);
    border-left: 1px solid rgb(var(--terra-rgb) / 0.35);
    border-radius: 0 999px 999px 0;
    background: var(--terra-soft);
    color: var(--terra-deep);
    transition: background 0.15s ease;
  }

  .dd-x:hover { background: rgb(var(--terra-rgb) / 0.22); }

  .dd-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 11px 0 13px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--card);
    font-size: 12.5px;
    font-weight: 500;
    color: var(--ink-2);
    white-space: nowrap;
    transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
  }

  .dd-btn:hover,
  .dd-btn.open {
    border-color: var(--ink-3);
    color: var(--ink);
  }

  /* Set filters wear the terracotta "filter applied" accent. */
  .dd-btn.on {
    background: var(--terra-soft);
    border-color: var(--terra);
    color: var(--terra-deep);
    font-weight: 600;
  }

  .dd-chev {
    flex: none;
    opacity: 0.75;
    transition: transform 0.15s ease;
  }

  .dd-btn.open .dd-chev { transform: rotate(180deg); }

  .dd-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 17px;
    height: 17px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--terra);
    color: var(--on-terra);
    font-size: 10.5px;
    font-weight: 600;
    line-height: 1;
  }

  .dd-panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: calc(var(--z-sticky) - 1);
    max-width: calc(100vw - 24px);
    padding: 10px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 14px 32px -14px rgb(var(--shade-rgb) / 0.4);
    animation: dd-in 0.14s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .dd-panel.fit {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-top: 0;
  }

  .dd-panel.right {
    left: auto;
    right: 0;
  }

  @keyframes dd-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
</style>
