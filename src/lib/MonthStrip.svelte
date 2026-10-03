<script>
  import { MONTH_LETTERS, MONTHS } from './data.svelte.js';

  // muted: every month at the out-of-window weight — for lists with no booking
  // window to frame (My year picker once the year is full).
  let { cells, selected = -1, size = 'sm', onselect = null, labels = false, frameFrom = -1, frameLen = 0, muted = false } = $props();

  // The stay-length window as underline segments (split so it wraps Dec→Jan).
  const frame = $derived.by(() => {
    if (frameFrom < 0 || frameLen <= 0) return [];
    const head = Math.min(frameLen, 12 - frameFrom);
    const segs = [{ from: frameFrom, len: head }];
    if (frameLen > head) segs.push({ from: 0, len: frameLen - head });
    return segs;
  });
</script>

<!-- Interactive (onselect) strips render real buttons; display-only strips (cards,
     My year rows) render plain spans so they never nest a control inside the
     card's own button. Display-only strips are aria-hidden — the host supplies a
     text summary of the year instead (see stripSummary.js). -->
<div class="strip {size}" class:clickable={!!onselect} aria-hidden={onselect ? undefined : 'true'}>
  {#each cells as c, i}
    {@const tip = `${MONTHS[i]}: ${Math.round(c.q)} Score\nWeather: ${Math.round(c.weather)}${c.airCat ? ` · Air: ${c.airCat}` : ''}${c.seasonPhase ? ` · Season: ${c.seasonPhase}` : ''} · Events: ${Math.round(c.events)}${c.fest ? ' ★' : ''}`}
    {#if onselect}
      <button
        type="button"
        class="cell band-{c.band}"
        class:risk1={c.risk === 1}
        class:risk2={c.risk === 2}
        class:sel={i === selected}
        class:dim={muted || (frameFrom >= 0 && (i - frameFrom + 12) % 12 >= frameLen)}
        aria-pressed={i === selected}
        aria-label="{MONTHS[i]}: score {Math.round(c.q)}{c.fest ? ', major festival' : ''}{c.risk >= 1 ? ', seasonal hazard' : ''}"
        onclick={() => onselect(i)}
        title={tip}
      >
        {#if labels}<span class="ml" aria-hidden="true">{MONTH_LETTERS[i]}</span>{/if}
        {#if size === 'lg'}<span class="q num" aria-hidden="true">{Math.round(c.q)}</span>{/if}
        {#if c.fest}<span class="fest" aria-hidden="true" title="Major festival">★</span>{/if}
      </button>
    {:else}
      <span
        class="cell band-{c.band}"
        class:risk1={c.risk === 1}
        class:risk2={c.risk === 2}
        class:sel={i === selected}
        class:dim={muted || (frameFrom >= 0 && (i - frameFrom + 12) % 12 >= frameLen)}
        title={tip}
      >
        {#if labels}<span class="ml">{MONTH_LETTERS[i]}</span>{/if}
        {#if size === 'lg'}<span class="q num">{Math.round(c.q)}</span>{/if}
        {#if c.fest}<span class="fest">★</span>{/if}
      </span>
    {/if}
  {/each}
  {#if frame.length}
    <div class="winmark" aria-hidden="true">
      {#each frame as seg}
        <span class="winbar" style="grid-column: {seg.from + 1} / span {seg.len}"></span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .strip {
    position: relative;
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 2px;
    width: 100%;
  }

  /* Months outside the stay-length window recede so the booked block reads
     first, but stay legible enough to compare their color and score. */
  .cell.dim { opacity: 0.62; }

  /* A whisper-thin accent underline ties the in-window months to the score —
     gentler than a full bracket, and it follows the Dec→Jan wrap. */
  .winmark {
    position: absolute;
    left: 0;
    right: 0;
    bottom: -4px;
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 2px;
    pointer-events: none;
  }

  .winbar {
    height: 2px;
    border-radius: 2px;
    background: var(--terra);
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

  /* Non-colour cue for the score band (the green "good" and amber "ok" — and
     the dark "great" and "avoid" — read alike without colour vision). On the
     small strip, warm-band cells sit a little lower, bottom-aligned, so the year
     reads as a quiet skyline: great/good full height, ok a step down, avoid two
     steps down. The large sheet strip prints each month's score, so it stays
     flat. The legend swatches mirror these heights. */
  .sm {
    align-items: end;
  }

  .sm .cell.band-ok { height: 11px; }
  .sm .cell.band-bad { height: 8px; }

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
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0;
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
