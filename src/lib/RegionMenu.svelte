<script>
  let { regions, active, ontoggle, onclear } = $props();

  let btn = $state();
  let panel = $state();
  let open = $state(false);

  // The filter row scrolls horizontally on mobile (overflow:auto), which would
  // clip an absolutely-positioned menu — so the panel is a top-layer [popover]
  // positioned manually under the trigger.
  function position() {
    if (!btn || !panel) return;
    const r = btn.getBoundingClientRect();
    const w = panel.offsetWidth;
    const left = Math.min(r.left, window.innerWidth - w - 12);
    panel.style.left = `${Math.max(12, left)}px`;
    panel.style.top = `${r.bottom + 6}px`;
  }

  function onToggle(e) {
    open = e.newState === 'open';
    if (open) position();
  }

  $effect(() => {
    if (!open) return;
    const reflow = () => position();
    window.addEventListener('scroll', reflow, true);
    window.addEventListener('resize', reflow);
    return () => {
      window.removeEventListener('scroll', reflow, true);
      window.removeEventListener('resize', reflow);
    };
  });
</script>

<button
  bind:this={btn}
  type="button"
  class="chip region"
  class:on={active.size > 0}
  popovertarget="region-pop"
  aria-haspopup="true"
  aria-expanded={open}
>
  Regions{active.size ? ` · ${active.size}` : ''}{open ? ' ▴' : ' ▾'}
</button>

<div bind:this={panel} id="region-pop" class="pop" popover="auto" ontoggle={onToggle}>
  <div class="pop-head">
    <span class="pop-title">Filter by region</span>
    {#if active.size}
      <button type="button" class="pop-clear" onclick={onclear}>Clear</button>
    {/if}
  </div>
  <div class="pop-list">
    {#each regions as r}
      <label class="opt" class:sel={active.has(r)}>
        <input type="checkbox" checked={active.has(r)} onchange={() => ontoggle(r)} />
        <span>{r}</span>
      </label>
    {/each}
  </div>
</div>

<style>
  .chip.region {
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 0;
  }

  .chip.region.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }

  .pop {
    position: fixed;
    margin: 0;
    inset: auto;
    width: 248px;
    max-width: calc(100vw - 24px);
    padding: 6px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: 0 14px 32px -14px rgba(33, 36, 30, 0.4);
    opacity: 0;
    transform: translateY(-4px);
    transition: opacity 0.14s ease, transform 0.14s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .pop:popover-open {
    opacity: 1;
    transform: translateY(0);
  }

  .pop-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 8px 8px;
    border-bottom: 1px solid var(--line-soft);
    margin-bottom: 4px;
  }

  .pop-title {
    font-size: 9.5px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .pop-clear {
    border: none;
    background: none;
    padding: 0;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--terra-deep);
  }

  .pop-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    max-height: 320px;
    overflow-y: auto;
  }

  .opt {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 8px;
    border-radius: 7px;
    font-size: 12.5px;
    color: var(--ink-2);
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
  }

  .opt:hover {
    background: var(--paper-2);
    color: var(--ink);
  }

  .opt.sel {
    color: var(--ink);
    font-weight: 600;
  }

  .opt input {
    width: 14px;
    height: 14px;
    accent-color: var(--terra);
    flex-shrink: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .pop {
      transition: none;
      transform: none;
    }
  }
</style>
