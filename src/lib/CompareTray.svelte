<script>
  import { cityByKey } from './data.svelte.js';
  import { MAX_COMPARE } from './compare.js';

  // The slim bar that holds the in-progress comparison while you browse. It is
  // the compare mode's visible home: it appears with the first pick (or when
  // the "Compare" toggle is switched on), lists the picks with one-tap removal,
  // and opens the comparison once there are two.
  let { keys = [], onremove, onclear, onopen } = $props();

  const picks = $derived(keys.map((k) => cityByKey.get(k)).filter(Boolean));
  const ready = $derived(picks.length >= 2);
  const hint = $derived(
    picks.length === 0
      ? `Tick up to ${MAX_COMPARE} cities`
      : picks.length === 1
        ? 'add one more'
        : picks.length < MAX_COMPARE
          ? 'add one more, or'
          : ''
  );

  // Selection changes are announced politely; the bar itself is not a live
  // region (re-reading every chip on each change would be noise).
  let said = $state('');
  let prev = null;
  $effect(() => {
    const now = keys.slice();
    // First run: the bar just appeared, so the pick that summoned it is
    // announced like any other.
    if (prev === null) prev = [];
    const added = now.find((k) => !prev.includes(k));
    const removed = prev.find((k) => !now.includes(k));
    const name = (k) => cityByKey.get(k)?.name ?? 'City';
    if (added) said = `${name(added)} added to comparison, ${now.length} of ${MAX_COMPARE}.`;
    else if (removed) said = now.length ? `${name(removed)} removed, ${now.length} left.` : 'Comparison cleared.';
    prev = now;
  });
</script>

<div class="tray" role="region" aria-label="Comparison picks">
  <span class="lead">Compare<span class="colon">:</span></span>
  <ul class="picks">
    {#each picks as c (c.key)}
      <li>
        <button type="button" class="pick" onclick={() => onremove(c.key)} aria-label="Remove {c.name} from comparison" title="Remove {c.name}">
          <span class="pname">{c.name}</span><span class="px" aria-hidden="true">×</span>
        </button>
      </li>
    {/each}
    {#if hint}
      <li class="hint" aria-hidden={picks.length > 0 ? 'true' : undefined}>
        {#if picks.length > 0 && picks.length < MAX_COMPARE}<span class="slot" aria-hidden="true"></span>{/if}{hint}
      </li>
    {/if}
  </ul>
  <button
    type="button"
    class="go"
    aria-disabled={!ready}
    aria-label={ready ? `Open the comparison of ${picks.length} cities` : 'Compare — pick at least two cities first'}
    title={ready ? 'Open the comparison' : 'Pick at least two cities'}
    onclick={() => ready && onopen()}
  >Compare<span class="go-n num"> {picks.length || ''}</span> <span aria-hidden="true">→</span></button>
  <button type="button" class="clear" onclick={onclear} aria-label="Clear comparison and stop picking" title="Clear">×</button>
  <span class="sr-only" aria-live="polite">{said}</span>
</div>

<style>
  /* A light slab, deliberately not the ink pill the toast uses, so the two never
     read as the same object when both are up (the toast lifts above this). */
  .tray {
    position: fixed;
    left: 50%;
    bottom: calc(14px + var(--safe-b));
    transform: translateX(-50%);
    z-index: calc(var(--z-sticky) + 5);
    display: flex;
    align-items: center;
    gap: 10px;
    width: max-content;
    max-width: min(720px, calc(100vw - 24px));
    padding: 7px 7px 7px 16px;
    background: var(--card);
    border: 1px solid var(--ink-3);
    border-radius: 14px;
    box-shadow: 0 16px 34px -18px rgba(33, 36, 30, 0.55);
    animation: tray-in 0.22s cubic-bezier(0.22, 1, 0.36, 1);
  }

  /* Opacity-only so it never fights the centring transform. */
  @keyframes tray-in {
    from { opacity: 0; }
  }

  .lead {
    flex: none;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink);
  }

  .picks {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .picks::-webkit-scrollbar { display: none; }

  .picks li { flex: none; }

  .pick {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 8px 0 11px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--paper);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink);
    white-space: nowrap;
    transition: border-color 0.15s ease, color 0.15s ease;
  }

  .px {
    font-size: 15px;
    line-height: 1;
    color: var(--ink-3);
    transition: color 0.15s ease;
  }

  .pick:hover { border-color: var(--terra); }
  .pick:hover .px { color: var(--terra-deep); }

  .hint {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
    color: var(--ink-2);
    white-space: nowrap;
  }

  /* An empty dashed slot: the room left for one more city. */
  .slot {
    width: 30px;
    height: 22px;
    border: 1px dashed var(--line);
    border-radius: 999px;
  }

  .go {
    flex: none;
    height: 34px;
    padding: 0 15px;
    border: 1px solid var(--ink);
    border-radius: 10px;
    background: var(--ink);
    color: var(--paper);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .go:hover { background: var(--terra); border-color: var(--terra); }

  .go[aria-disabled='true'] {
    background: transparent;
    border-color: var(--line);
    color: var(--ink-3);
    cursor: default;
  }

  .go-n { font-size: 11.5px; opacity: 0.8; }

  .clear {
    flex: none;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 999px;
    background: none;
    color: var(--ink-3);
    font-size: 18px;
    line-height: 1;
  }

  .clear:hover { color: var(--ink); background: var(--paper-2); }

  @media (max-width: 700px) {
    .tray {
      left: 12px;
      right: 12px;
      transform: none;
      width: auto;
      max-width: none;
      gap: 8px;
      padding: 6px 4px 6px 12px;
    }

    /* The word "Compare" already labels the primary button; on phones the
       lead-in drops so the picks get the room. */
    .lead { display: none; }

    .picks {
      flex: 1;
      -webkit-mask-image: linear-gradient(90deg, #000 88%, transparent);
      mask-image: linear-gradient(90deg, #000 88%, transparent);
      padding-right: 14px;
    }

    .pick { height: 36px; }

    .go {
      height: var(--tap);
      padding: 0 13px;
    }

    .go-n { display: none; }

    .clear {
      width: var(--tap);
      height: var(--tap);
    }

    .hint .slot { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .tray { animation: none; }
  }
</style>
