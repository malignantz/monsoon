<script>
  // Icon key, optionally led by the month-strip band key. The band swatches are
  // tiny strip cells drawn at the same relative heights the small strip uses
  // (great/good full, ok a step down, avoid two), so the non-colour cue is
  // taught in the same breath as the colours.
  let { bands = false } = $props();

  const BANDS = [
    { k: 'great', label: 'great', range: '85+' },
    { k: 'good', label: 'good', range: '75+' },
    { k: 'ok', label: 'ok', range: '65+' },
    { k: 'bad', label: 'avoid', range: '' }
  ];
</script>

<p class="legend">
  {#if bands}
    <span class="bandkey">
      {#each BANDS as b}
        <span class="bk"><span class="sw sw-{b.k}" aria-hidden="true"></span>{b.label}{#if b.range}<span class="num rng">&nbsp;{b.range}</span>{/if}</span>
      {/each}
    </span>
  {/if}
  <span class="it">◆ Schengen</span>
  <span class="it">≋ swimmable</span>
  <!-- The compact (bands) key trims these two so it fits two lines on a phone. -->
  <span class="it">★ {bands ? 'festival' : 'major festival'}</span>
  <span class="it">⚠ {bands ? 'hazard' : 'seasonal hazard'}</span>
</p>

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px 6px;
    margin: 0;
    font-size: 11px;
    color: var(--ink-3);
  }

  .legend span { white-space: nowrap; }

  .it + .it::before,
  .bandkey + .it::before {
    content: '· ';
    margin-right: 6px;
  }

  .bandkey {
    display: inline-flex;
    align-items: baseline;
    gap: 9px;
  }

  .bk {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
    color: var(--ink-2);
  }

  .rng {
    font-size: 11px;
    color: var(--ink-3);
  }

  /* Mini strip cells, bottom-aligned on the text baseline. */
  .sw {
    display: inline-block;
    width: 8px;
    border-radius: 2px;
    align-self: baseline;
  }

  .sw-great { height: 11px; background: var(--band-great); }
  .sw-good  { height: 11px; background: var(--band-good); }
  .sw-ok    { height: 8.5px; background: var(--band-ok); }
  .sw-bad   { height: 6px; background: var(--band-bad); }
</style>
