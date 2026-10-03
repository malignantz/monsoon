<script>
  import MonthStrip from './MonthStrip.svelte';
  import { stripCells, qolFor, valueFor, whyNow, fmtMoney, cityCost, partyWord, isFavorite, toggleFavorite } from './data.svelte.js';
  import { stripSummary } from './stripSummary.js';

  // compare: null outside compare mode; { on, full } while picking. The
  // control lives *outside* the card's button (no nested interactive) as a
  // labelled strip attached under it, so it only exists while the user has
  // asked to compare — browse stays exactly as calm as before.
  let { city, month, preset, mode, valueModel, heroKey = null, openKey = null, onopen, compare = null, oncompare } = $props();

  const faved = $derived(isFavorite(city.key));

  // Wear the shared `city-hero` name only while this card is the one morphing to
  // or from the sheet, and only in the snapshot where the sheet isn't its match
  // — so the card title and the sheet title are never both tagged at once.
  const hero = $derived(heroKey === city.key && openKey !== city.key);

  const cells = $derived(stripCells(city, preset));
  const score = $derived(
    mode === 'value' ? valueFor(city, month, preset, valueModel) : qolFor(city, month, preset)
  );
  // The strip is colour-only, so the card's accessible name carries its year.
  const yearSummary = $derived(stripSummary(cells));
  const why = $derived(whyNow(city, month));
  const m = $derived(city.months[month]);
</script>

<div class="cardwrap" class:comparing={!!compare} class:picked={compare?.on}>
  <button
    type="button"
    class="fav"
    class:on={faved}
    aria-pressed={faved}
    aria-label={faved ? `Remove ${city.name} from favorites` : `Save ${city.name} to favorites`}
    title={faved ? 'Saved' : 'Save'}
    onclick={() => toggleFavorite(city.key)}
  >{faved ? '♥' : '♡'}</button>

  <button type="button" class="card" onclick={() => onopen(city.key)}>
    <div class="top">
      <div class="names">
        <span class="city-name" style:view-transition-name={hero ? 'city-hero' : undefined}>{city.name}</span>
        <span class="country">{city.country}</span>
      </div>
      <div class="score {mode === 'value' ? 'neutral' : `band-${cells[month].band}`}">
        <span class="num big">{Math.round(score)}</span>
        <span class="lbl">{mode === 'value' ? 'Best Value' : 'Score'}</span>
      </div>
    </div>

    <MonthStrip {cells} selected={month} />
    <span class="sr-only">{yearSummary}</span>

    <p class="why">{why || city.draw}</p>

    <div class="meta">
      <span class="num cost">{fmtMoney(cityCost(m))}<em>/mo {partyWord()}</em></span>
      <span class="tags">
        <span class="tag">{city.region}</span>
        {#if city.schengen}<span class="tag schengen">◆ Schengen</span>{/if}
        {#if m.risk >= 1}<span class="tag hazard" title={m.riskNote}>hazard</span>{/if}
      </span>
    </div>
  </button>

  {#if compare}
    <label class="cmp" class:on={compare.on} class:off={compare.full && !compare.on} title={compare.full && !compare.on ? 'Three cities picked — remove one to add another' : undefined}>
      <input
        type="checkbox"
        checked={compare.on}
        disabled={compare.full && !compare.on}
        aria-label="Compare {city.name}"
        onchange={() => oncompare(city.key)}
      />
      <span class="box" aria-hidden="true"></span>
      <span class="cmp-l" aria-hidden="true">{compare.on ? 'Comparing' : compare.full ? 'Compare · 3 picked' : 'Compare'}</span>
    </label>
  {/if}
</div>

<style>
  .cardwrap {
    position: relative;
  }

  .fav {
    position: absolute;
    top: 11px;
    right: 11px;
    z-index: var(--z-raised);
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    border-radius: 999px;
    font-size: 17px;
    line-height: 1;
    color: var(--ink-3);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s ease, color 0.15s ease, transform 0.12s ease;
  }

  /* Heart is discoverable on hover/focus, but always visible once saved. */
  .cardwrap:hover .fav,
  .fav:focus-visible,
  .fav.on {
    opacity: 1;
  }

  .fav:hover { color: var(--terra); transform: scale(1.12); }

  .fav.on { color: var(--terra); }

  /* Touch has no hover, so the discover-on-hover heart would be invisible and
     unreachable. On coarse pointers it's always shown and given a roomier hit
     area (saving is also available full-size in the city sheet, so this stays a
     secondary target). */
  @media (hover: none) and (pointer: coarse) {
    .fav {
      opacity: 1;
      width: var(--tap);
      height: var(--tap);
      top: 6px;
      right: 6px;
    }
  }

  .card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    text-align: left;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 16px 16px 14px;
    font: inherit;
    color: inherit;
    width: 100%;
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  }

  .card:hover {
    transform: translateY(-3px);
    border-color: var(--ink-3);
    box-shadow: 0 10px 24px -14px rgba(33, 36, 30, 0.35);
  }

  /* ── Compare mode ──
     The card and its compare strip read as one object: the card gives up its
     bottom radius and its hover lift (which would tear it off the strip). */
  .comparing .card {
    border-radius: 14px 14px 0 0;
  }

  .comparing .card:hover {
    transform: none;
    box-shadow: none;
  }

  .picked .card,
  .picked .card:hover { border-color: var(--terra); }

  .cmp {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 38px;
    margin-top: -1px;
    padding: 0 16px;
    border: 1px solid var(--line);
    border-radius: 0 0 14px 14px;
    background: var(--paper-2);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink-2);
    cursor: pointer;
    user-select: none;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .cmp:hover { color: var(--ink); border-color: var(--ink-3); }

  .cmp.on {
    background: var(--terra-soft);
    border-color: var(--terra);
    color: var(--terra-deep);
  }

  .cmp.off {
    cursor: default;
    color: var(--ink-3);
  }

  .cmp.off:hover { border-color: var(--line); color: var(--ink-3); }

  /* Native checkbox for semantics and keyboard (Space); the drawn box is the
     visual, with a tick when picked — state never rides on colour alone. */
  .cmp input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .box {
    position: relative;
    flex: none;
    width: 15px;
    height: 15px;
    border: 1.5px solid var(--ink-3);
    border-radius: 4px;
    background: var(--card);
  }

  .cmp.on .box {
    background: var(--terra);
    border-color: var(--terra);
  }

  .cmp.on .box::after {
    content: '';
    position: absolute;
    left: 4px;
    top: 1px;
    width: 4px;
    height: 8px;
    border: solid #fdf3ec;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  .cmp.off .box { opacity: 0.5; }

  .cmp:has(input:focus-visible) {
    outline: 2px solid var(--terra);
    outline-offset: 2px;
  }

  @media (max-width: 700px) {
    .cmp { height: var(--tap); }
  }

  .top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    /* Clear the top-right corner for the favorite heart. */
    padding-right: 30px;
  }

  .city-name {
    display: block;
    font-family: var(--display);
    font-size: 21px;
    font-weight: 580;
    line-height: 1.15;
  }

  .country {
    font-size: 12.5px;
    color: var(--ink-2);
  }

  .score {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 64px;
    border-radius: 10px;
    padding: 6px 8px 4px;
  }

  .neutral {
    background: var(--card);
    color: var(--ink);
    border: 1px solid var(--line);
  }

  .band-great { background: var(--band-great); color: var(--band-great-ink); }
  .band-good { background: var(--band-good); color: var(--band-good-ink); }
  .band-ok { background: var(--band-ok); color: var(--band-ok-ink); }
  .band-bad { background: var(--band-bad); color: var(--band-bad-ink); }

  .big {
    font-size: 22px;
    font-weight: 600;
    line-height: 1;
  }

  .lbl {
    font-size: 11px;
    letter-spacing: 0;
    text-transform: uppercase;
    opacity: 0.85;
  }

  .why {
    margin: 0;
    font-family: var(--display);
    font-style: italic;
    font-size: 14px;
    color: var(--ink-2);
    min-height: 1.4em;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
  }

  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    border-top: 1px solid var(--line-soft);
    padding-top: 10px;
  }

  .cost {
    font-size: 14px;
    font-weight: 500;
  }

  .cost em {
    font-style: normal;
    font-size: 11px;
    color: var(--ink-3);
    font-family: var(--sans);
  }

  .tags {
    display: flex;
    gap: 5px;
  }

  .tag {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: var(--ink-2);
    background: var(--paper-2);
    border-radius: 999px;
    padding: 2.5px 9px;
  }

  .tag.schengen {
    color: var(--schengen);
    background: var(--schengen-soft);
  }

  .tag.hazard {
    color: #7d2c12;
    background: #f3ddd2;
  }
</style>
