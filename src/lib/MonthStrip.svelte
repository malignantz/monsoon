<script>
  import { MONTH_LETTERS } from './data.svelte.js';

  let { cells, selected = -1, size = 'sm', onselect = null, labels = false } = $props();
</script>

<div class="strip {size}" class:clickable={!!onselect}>
  {#each cells as c, i}
    <button
      type="button"
      class="cell band-{c.band}"
      class:risk1={c.risk === 1}
      class:risk2={c.risk === 2}
      class:sel={i === selected}
      disabled={!onselect}
      onclick={() => onselect?.(i)}
      title="{MONTH_LETTERS[i]}: {Math.round(c.q)}"
    >
      {#if labels}<span class="ml">{MONTH_LETTERS[i]}</span>{/if}
      {#if size === 'lg'}<span class="q num">{Math.round(c.q)}</span>{/if}
      {#if c.fest}<span class="fest" aria-label="major festival" title="Major festival">★</span>{/if}
    </button>
  {/each}
</div>

<style>
  .strip {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 2px;
    width: 100%;
  }

  .cell {
    position: relative;
    border: none;
    border-radius: 3px;
    padding: 0;
    height: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    font: inherit;
  }

  .cell:disabled {
    cursor: default;
  }

  .lg .cell {
    height: 52px;
    border-radius: 6px;
  }

  .clickable .cell:hover {
    transform: translateY(-2px);
    transition: transform 0.12s ease;
  }

  .band-great { background: var(--band-great); color: var(--band-great-ink); }
  .band-good { background: var(--band-good); color: var(--band-good-ink); }
  .band-ok { background: var(--band-ok); color: var(--band-ok-ink); }
  .band-bad { background: var(--band-bad); color: var(--band-bad-ink); }

  .risk1 { box-shadow: inset 0 0 0 1.5px rgba(33, 36, 30, 0.35); }
  .risk2 {
    box-shadow: inset 0 0 0 2px rgba(33, 36, 30, 0.55);
    background-image: repeating-linear-gradient(
      -45deg,
      transparent 0 3px,
      rgba(33, 36, 30, 0.18) 3px 5px
    );
  }

  .sel {
    outline: 2px solid var(--ink);
    outline-offset: 1.5px;
  }

  .ml {
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    opacity: 0.85;
    line-height: 1;
  }

  .q {
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
  }

  .fest {
    position: absolute;
    bottom: 1px;
    font-size: 6px;
    line-height: 1;
    color: currentColor;
    opacity: 0.9;
  }

  .lg .fest {
    bottom: 3px;
    font-size: 9px;
  }
</style>
