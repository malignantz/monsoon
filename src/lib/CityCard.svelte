<script>
  import MonthStrip from './MonthStrip.svelte';
  import { stripCells, qolFor, valueFor, whyNow, fmtMoney, cityCost, partyWord, isFavorite, toggleFavorite } from './data.svelte.js';

  let { city, month, preset, mode, valueModel, heroKey = null, openKey = null, onopen } = $props();

  const faved = $derived(isFavorite(city.key));

  // Wear the shared `city-hero` name only while this card is the one morphing to
  // or from the sheet, and only in the snapshot where the sheet isn't its match
  // — so the card title and the sheet title are never both tagged at once.
  const hero = $derived(heroKey === city.key && openKey !== city.key);

  const cells = $derived(stripCells(city, preset));
  const score = $derived(
    mode === 'value' ? valueFor(city, month, preset, valueModel) : qolFor(city, month, preset)
  );
  const why = $derived(whyNow(city, month));
  const m = $derived(city.months[month]);
</script>

<div class="cardwrap">
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
        <h3 style:view-transition-name={hero ? 'city-hero' : undefined}>{city.name}</h3>
        <span class="country">{city.country}</span>
      </div>
      <div class="score {mode === 'value' ? 'neutral' : `band-${cells[month].band}`}">
        <span class="num big">{Math.round(score)}</span>
        <span class="lbl">{mode === 'value' ? 'best value' : 'top pick'}</span>
      </div>
    </div>

    <MonthStrip {cells} selected={month} />

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
</div>

<style>
  .cardwrap {
    position: relative;
  }

  .fav {
    position: absolute;
    top: 11px;
    right: 11px;
    z-index: 2;
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

  .top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
    /* Clear the top-right corner for the favorite heart. */
    padding-right: 30px;
  }

  h3 {
    font-size: 21px;
    font-weight: 580;
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
    font-size: 9px;
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
    font-size: 10.5px;
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
