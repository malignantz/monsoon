<script>
  let { title, align = 'left', children } = $props();
  let open = $state(false);
  let root = $state(null);

  $effect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (root && !root.contains(e.target)) open = false; };
    const onKey = (e) => { if (e.key === 'Escape') open = false; };
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDocClick, true);
      document.removeEventListener('keydown', onKey);
    };
  });
</script>

<span class="wrap" bind:this={root}>
  <button
    type="button"
    class="dot"
    class:active={open}
    aria-expanded={open}
    aria-label="How {title} is calculated"
    onclick={(e) => { e.stopPropagation(); open = !open; }}>i</button>
  {#if open}
    <span class="pop" class:right={align === 'right'} role="note">
      <span class="pop-title">{title}</span>
      {@render children?.()}
    </span>
  {/if}
</span>

<style>
  .wrap { position: relative; display: inline-block; vertical-align: 1px; }

  .dot {
    width: 15px;
    height: 15px;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: none;
    color: var(--ink-3);
    font-family: var(--display);
    font-style: italic;
    font-size: 10px;
    line-height: 1;
    padding: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .dot:hover,
  .dot.active { border-color: var(--ink-2); color: var(--ink); }

  .pop {
    position: absolute;
    left: -8px;
    top: calc(100% + 9px);
    width: min(300px, 76vw);
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px 15px 13px;
    z-index: 30;
    display: block;
    box-shadow: 0 10px 28px rgba(33, 36, 30, 0.12);
    font-size: 12.5px;
    font-style: normal;
    font-weight: 400;
    font-family: var(--sans);
    line-height: 1.55;
    color: var(--ink-2);
    text-transform: none;
    letter-spacing: normal;
    text-align: left;
    white-space: normal;
    cursor: auto;
  }

  .pop.right { left: auto; right: -8px; }

  .pop-title {
    display: block;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-bottom: 6px;
  }

  .pop :global(p) { margin: 0 0 7px; }
  .pop :global(p:last-child) { margin-bottom: 0; }
  .pop :global(a) { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  .pop :global(a:hover) { color: var(--ink); }
  .pop :global(.src) { color: var(--ink-3); font-size: 11.5px; }
</style>
