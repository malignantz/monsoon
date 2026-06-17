<script>
  import MonthStrip from './MonthStrip.svelte';
  import ScoreInfo from './ScoreInfo.svelte';
  import { stripCells, qolFor, fmtMoney, fmtMonthRange, swimNow, MONTHS, PRESETS, detailStatus, cityCost, partyWord, isFavorite, toggleFavorite, shareUrl, shareOrCopy } from './data.svelte.js';

  let { city, month, preset, onclose, onmonth, onstep, onaddtoyear } = $props();

  let sheetEl = $state(null);

  const faved = $derived(isFavorite(city.key));

  // Share a deep link straight to this city's sheet (?city=key). Native share
  // sheet on mobile, clipboard copy elsewhere with a brief "Copied"
  // confirmation, reset on city change so a stepped-to city starts fresh.
  let copied = $state(false);
  let copyTimer;
  async function shareCity() {
    const result = await shareOrCopy({
      url: shareUrl({ city: city.key }),
      title: `${city.name} on Monsoon`,
      text: `${city.name} on Monsoon`
    });
    if (result !== 'copied') return;
    copied = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = false), 1800);
  }
  $effect(() => {
    city.key;
    copied = false;
    return () => clearTimeout(copyTimer);
  });

  $effect(() => {
    const onkey = (e) => {
      if (e.key === 'Escape') onclose();
      else if (e.key === 'ArrowLeft') onstep?.(-1);
      else if (e.key === 'ArrowRight') onstep?.(1);
    };
    window.addEventListener('keydown', onkey);
    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheetEl?.focus();
    return () => {
      window.removeEventListener('keydown', onkey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  });

  const activePreset = $derived(PRESETS[preset] ?? PRESETS.balanced);
  const pw = $derived(activePreset.w);
  const pct = (x) => Math.round(x * 100);
  const monthName = $derived(new Date(2026, month, 1).toLocaleString('en-US', { month: 'long' }));

  const cells = $derived(stripCells(city, preset));
  const m = $derived(city.months[month]);
  const peakPenaltyText = $derived(
    activePreset.peakPenalty && m.season === 'Peak' ? ` This lens subtracts ${activePreset.peakPenalty} points for peak-season crowding.` : ''
  );
  const qol = $derived(qolFor(city, month, preset));
  const saf = $derived(city.safety ?? {});
  const yearEvents = $derived(
    Array.isArray(city.events) ? [...city.events].sort((a, b) => (a.months?.[0] ?? 0) - (b.months?.[0] ?? 0)) : []
  );

  // Cost breakdown for the displayed month + party. Reconstructed from the same
  // core fields the headline uses, so the three lines always sum to cityCost(m):
  // rent carries the month's accommodation seasonality (cost1/cost2 already bake
  // it in), utilities + daily-life are held flat. Couple scales the two shared
  // items by ×1.15 (METHODOLOGY §6b).
  const costBd = $derived.by(() => {
    const total = cityCost(m);
    const isSolo = partyWord() === 'solo';
    const SHARED = 1.15;
    const anchor = isSolo ? city.solo : city.couple;
    const rentBase = (city.rent ?? 0) * (isSolo ? 1 : SHARED);
    const rent = Math.round(total - anchor + rentBase);
    const util = Math.round((city.util ?? 0) * (isSolo ? 1 : SHARED));
    const living = total - rent - util; // exact remainder → three lines sum to total
    return { total, rent, util, living, isSolo };
  });

  const comps = $derived([
    { label: 'Weather', v: m.weather },
    { label: 'Air', v: m.air },
    { label: 'Safety', v: saf.score ?? 0 },
    { label: 'Season', v: m.seasonScore },
    { label: 'Events', v: m.eventScore }
  ]);

  function barColor(v) {
    if (v >= 85) return 'var(--band-great)';
    if (v >= 75) return 'var(--band-good)';
    if (v >= 65) return 'var(--band-ok)';
    return 'var(--band-bad)';
  }
</script>

<div class="scrim">
  <button type="button" class="scrim-back" aria-label="Close city sheet" onclick={onclose}></button>
  <div
    class="sheet"
    role="dialog"
    aria-modal="true"
    aria-label="{city.name} city sheet"
    tabindex="-1"
    bind:this={sheetEl}
  >
    <header class="hero">
      <button type="button" class="back" onclick={onclose}>← Monsoon</button>
      <div class="hero-ctl">
        <button
          type="button"
          class="save"
          class:on={faved}
          aria-pressed={faved}
          onclick={() => toggleFavorite(city.key)}
        >{faved ? '♥ Saved' : '♡ Save'}</button>
        <button
          type="button"
          class="save share"
          class:on={copied}
          onclick={shareCity}
          title="Copy a link to {city.name}"
        >
          {#if copied}
            <svg class="shareicon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
            Copied
          {:else}
            <svg class="shareicon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
            Share
          {/if}
        </button>
        {#if onaddtoyear}
          <button
            type="button"
            class="save addyear"
            onclick={() => onaddtoyear(city.key, month)}
            title="Add {city.name} to your year, starting {MONTHS[month]}"
          >+ Add to year</button>
        {/if}
        {#if onstep}
          <button type="button" class="back step" onclick={() => onstep(-1)} aria-label="Previous city" title="Previous city (←)">‹</button>
          <button type="button" class="back step" onclick={() => onstep(1)} aria-label="Next city" title="Next city (→)">›</button>
        {/if}
        <button type="button" class="back close" onclick={onclose} aria-label="Close">×</button>
      </div>
      <div class="title">
        <p class="kicker">{city.region} · {city.country} · {city.timezone ?? ''}</p>
        <h1 class="hero-title">{city.name}</h1>
        <p class="vibe">{city.vibe}</p>
      </div>
      <div class="snap">
        <div class="snapcell">
          <span class="num v">{Math.round(qol)}</span>
          <span class="k">score · {MONTHS[month]}</span>
        </div>
        <div class="snapcell">
          <span class="num v">{saf.score ?? '—'}</span>
          <span class="k">{saf.label ?? 'safety'}</span>
        </div>
        <div class="snapcell">
          <span class="num v">{fmtMoney(cityCost(m))}</span>
          <span class="k">/mo {partyWord()}
            <ScoreInfo title="Cost estimate" align="right">
              <table class="costbd">
                <tbody>
                  <tr><td>Rent · {MONTHS[month]}</td><td>{fmtMoney(costBd.rent)}</td></tr>
                  <tr><td>Utilities</td><td>{fmtMoney(costBd.util)}</td></tr>
                  <tr><td>Food, transit &amp; daily life</td><td>{fmtMoney(costBd.living)}</td></tr>
                  <tr class="tot"><td>Total</td><td>{fmtMoney(costBd.total)}/mo</td></tr>
                </tbody>
              </table>
              {#if costBd.isSolo}
                <p>Anchored to one solo nomad living mid-range: furnished 1BR in a
                  nomad-popular area, some cooking and eating out, a coworking desk.</p>
              {:else}
                <p>Couple scales from the solo budget — housing shared (×1.15), most
                  daily spending counted per-person.</p>
              {/if}
              <p>Rent reflects {MONTHS[month]} seasonality; other costs are held flat
                across the year.</p>
              <p class="src">Itemized from sourced, dated city cost research.</p>
            </ScoreInfo>
          </span>
        </div>
        {#if city.swim}
          <div
            class="snapcell swim"
            class:off={!swimNow(city, month)}
            title="{city.swim.name}{city.swim.note ? ` — ${city.swim.note}` : ''}"
          >
            <span class="v"><span class="swim-dot">≋</span> {fmtMonthRange(city.swim.months)}</span>
            <span class="k">{swimNow(city, month) ? `${city.swim.body} · swim now` : `${city.swim.body} · too cold now`}</span>
          </div>
        {/if}
      </div>
    </header>

    <section class="block">
      <p class="kicker">The year at a glance — click a month</p>
      <MonthStrip {cells} selected={month} size="lg" labels onselect={onmonth} />
      {#if m.riskNote}
        <p class="risknote">⚠ {MONTHS[month]}: {m.riskNote}</p>
      {/if}
    </section>

    <div class="cols">
      <section class="block">
        <h2>{city.name} in {monthName}
          <ScoreInfo title="Score">
            <p>Five 0–100 sub-scores, weighted by your preset ({activePreset.label}):
              weather {pct(pw.weather)}%, safety {pct(pw.safety)}%, air {pct(pw.air)}%,
              season {pct(pw.season)}%, events {pct(pw.events)}%.{peakPenaltyText}</p>
            <p>When safety falls below 55 it also drags the whole score down — a beautiful
              month in a dangerous place can't ride good weather to the top.</p>
            <p class="src">Built from climate normals, WHO-anchored PM2.5, and the safety index below.</p>
          </ScoreInfo>
        </h2>
        <div class="bars">
          {#each comps as c}
            <div class="bar-row">
              <span class="bar-label">{c.label}</span>
              <div class="bar"><div class="fill" style="width:{c.v}%; background:{barColor(c.v)}"></div></div>
              <span class="num bar-num">{Math.round(c.v)}</span>
            </div>
          {/each}
        </div>
        <table class="climate num">
          <tbody>
            <tr><td>Day / night</td><td>{detailStatus.ready ? `${m.high}° / ${m.low}°F` : '…'}</td></tr>
            <tr><td>Humidity</td><td>{detailStatus.ready ? `${m.hum}%` : '…'}</td></tr>
            <tr><td>Rain days</td><td>{detailStatus.ready ? m.rain : '…'}</td></tr>
            <tr><td>PM2.5</td><td>{detailStatus.ready ? `${m.pm25} µg/m³ · ${m.airCat}` : m.airCat}</td></tr>
            <tr><td>Season</td><td>{m.season}</td></tr>
          </tbody>
        </table>
      </section>

      <section class="block">
        <h2>Safety, two ways
          <ScoreInfo title="Safety score">
            <p>55% violent + 45% property, then a ×0.60–1.40 visitor lens for whether
              travelers are more insulated or more targeted than locals.</p>
            <p>Violent is anchored on the intentional-homicide rate — here
              {saf.violent?.homicideRate ?? '—'}/100k ({saf.violent?.scope ?? 'country'}) — the only
              crime statistic comparable across countries. Property is hand-researched
              petty-theft perception; government advisories are shown as badges, never caps.</p>
            <p class="src">{saf.violent?.source ?? 'World Bank / UNODC'}</p>
          </ScoreInfo>
        </h2>
        {#if !detailStatus.ready}
          <p class="loading">Loading the safety breakdown…</p>
        {:else}
        <div class="bars">
          <div class="bar-row">
            <span class="bar-label">Violent</span>
            <div class="bar"><div class="fill" style="width:{saf.violent?.sub ?? 0}%; background:{barColor(saf.violent?.sub ?? 0)}"></div></div>
            <span class="num bar-num">{Math.round(saf.violent?.sub ?? 0)}</span>
          </div>
          <div class="bar-row">
            <span class="bar-label">Property</span>
            <div class="bar"><div class="fill" style="width:{saf.property?.sub ?? 0}%; background:{barColor(saf.property?.sub ?? 0)}"></div></div>
            <span class="num bar-num">{Math.round(saf.property?.sub ?? 0)}</span>
          </div>
          <div class="bar-row womens">
            <span class="bar-label">Women's street-safety
              <ScoreInfo title="Women's street-safety estimate">
                <p>Our estimate of street safety for women, <strong>{Math.round(saf.womensSafety?.sub ?? 0)}</strong>
                  on a 0–100 scale. It starts from the country baseline and is then adjusted for this city.</p>
                <p>Baseline {Math.round(saf.womensSafety?.baseline ?? 0)}, derived from the
                  {saf.womensSafety?.cs ?? '—'}% of women in {city.country} who tell Gallup they feel safe
                  walking alone at night{#if saf.womensSafety?.adj}, then a
                  {saf.womensSafety.adj > 0 ? '+' : ''}{saf.womensSafety.adj} city adjustment for local
                  conditions (harassment, within-country variation, tourist-vs-local risk){/if}. The estimate
                  can diverge from the raw Gallup figure where local evidence warrants.</p>
                {#if saf.womensSafety?.source}<p>{saf.womensSafety.source}.</p>{/if}
                <p>Displayed alongside, never folded into the headline score — turn on
                  the women's street-safety setting to blend it 50/50 into safety across every view.</p>
                <p class="src"><a href={saf.womensSafety?.url} target="_blank" rel="noopener">
                  Gallup World Poll, via the Georgetown WPS Index</a></p>
              </ScoreInfo>
            </span>
            <div class="bar"><div class="fill" style="width:{saf.womensSafety?.sub ?? 0}%; background:{barColor(saf.womensSafety?.sub ?? 0)}"></div></div>
            <span class="num bar-num">{Math.round(saf.womensSafety?.sub ?? 0)}</span>
          </div>
        </div>
        <p class="lens">
          Local baseline <strong class="num">{Math.round(saf.base ?? 0)}</strong>
          <span class="arrow" class:up={(saf.tourist?.modifier ?? 1) > 1} class:down={(saf.tourist?.modifier ?? 1) < 1}>
            → ×{saf.tourist?.modifier ?? 1} visitor lens →
          </span>
          visitor score <strong class="num">{saf.score ?? '—'}</strong>
        </p>
        {#if saf.tourist?.tags?.length}
          <p class="tags">{#each saf.tourist.tags as t}<span class="tag">{t}</span>{/each}</p>
        {/if}
        {/if}
        {#if city.drawDetail?.narrative}
          <h2 class="mt">The draw</h2>
          <p class="narrative">{city.drawDetail.narrative}</p>
        {:else}
          <h2 class="mt">The draw</h2>
          <p class="narrative">{city.draw}</p>
        {/if}
      </section>
    </div>

    {#if yearEvents.length}
      <section class="block">
        <h2>The calendar worth planning around</h2>
        <ul class="events">
          {#each yearEvents as e}
            <li class:major={e.tier >= 3}>
              <span class="emo num">{e.months.map((x) => MONTHS[x - 1]).join('/')}</span>
              <span class="ename">{e.name}</span>
              <span class="eblurb">{e.blurb}</span>
              {#if e.tier >= 3}<span class="etier">major</span>{/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <footer class="foot">
      <span>Scores per the Monsoon methodology — re-verify visa rules &amp; advisories before travel.</span>
    </footer>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(33, 36, 30, 0.45);
    /* Above the My year picker sheet (z 60) so a city opened from a picker row
       sits on top, and closing it returns to the still-open picker. */
    z-index: 70;
    overflow-y: auto;
    padding: 4vh 16px;
  }

  .scrim-back {
    position: fixed;
    inset: 0;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    cursor: default;
  }

  .sheet {
    position: relative;
    z-index: 1;
    max-width: 880px;
    margin: 0 auto;
    background: var(--paper);
    border-radius: 18px;
    border: 1px solid var(--line);
    padding: 26px 30px 18px;
    outline: none;
  }

  .hero-ctl {
    position: absolute;
    top: 18px;
    right: 20px;
    display: flex;
    gap: 6px;
  }

  .hero-ctl .back { margin-bottom: 0; }

  .step {
    padding: 3px 12px;
    font-size: 16px;
    line-height: 1.3;
  }

  .close {
    padding: 3px 11px;
    font-size: 17px;
    line-height: 1.3;
  }

  .back {
    background: none;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 5px 14px;
    font-size: 13px;
    color: var(--ink-2);
    margin-bottom: 18px;
  }

  .back:hover { border-color: var(--ink-2); color: var(--ink); }

  .save {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 5px 15px;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-2);
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }

  .save:hover { border-color: var(--terra); color: var(--terra-deep); }

  /* Icon + label sit on one baseline; the icon is the standard share glyph
     (tray + up arrow), swapping to a check on copy. */
  .save.share {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .shareicon { flex: none; }

  .save.on {
    color: var(--terra-deep);
    border-color: var(--terra);
    background: var(--terra-soft, #f6e3d8);
  }

  /* The new browse→plan action leads the cluster: filled ink so it reads as the
     primary thing to do with a city you like. */
  .save.addyear {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }

  .save.addyear:hover {
    background: var(--terra);
    border-color: var(--terra);
    color: var(--paper);
  }

  h1 { font-size: clamp(30px, 6vw, 44px); font-weight: 600; }

  /* Shared element for the card → sheet view transition. The matching card
     title carries the same name only during the morph (see CityCard). */
  .hero-title { view-transition-name: city-hero; }

  .vibe {
    font-family: var(--display);
    font-style: italic;
    color: var(--ink-2);
    margin: 6px 0 0;
    font-size: 16px;
  }

  .snap {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 18px;
  }

  .snapcell {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 14px;
    display: flex;
    flex-direction: column;
    min-width: 90px;
  }

  .snapcell.swim { border-color: var(--teal); color: var(--teal); }
  .snapcell.swim .k { color: var(--teal); }

  .snapcell.swim.off { border-color: var(--line); color: var(--ink-3); }
  .snapcell.swim.off .k { color: var(--ink-3); }
  .swim-dot { font-weight: 700; }
  .snapcell.swim .swim-dot { color: var(--teal); }
  .snapcell.swim.off .swim-dot { color: var(--ink-3); }
  .v { font-size: 19px; font-weight: 600; }
  .k { font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3); }

  .block { margin-top: 26px; }

  h2 {
    font-size: 21px;
    font-weight: 580;
    margin-bottom: 12px;
  }

  .mt { margin-top: 24px; }

  .risknote { color: var(--terra-deep); font-size: 13.5px; margin: 10px 0 0; }

  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 34px;
  }

  @media (max-width: 720px) {
    .cols { grid-template-columns: 1fr; }
  }

  .bars { display: flex; flex-direction: column; gap: 7px; }

  .bar-row {
    display: grid;
    grid-template-columns: 104px 1fr 34px;
    align-items: center;
    gap: 10px;
  }

  .bar-label { font-size: 12.5px; color: var(--ink-2); }
  .womens .bar-label { font-style: italic; }

  .bar {
    height: 9px;
    background: var(--paper-2);
    border-radius: 5px;
    overflow: hidden;
  }

  .fill { height: 100%; border-radius: 5px; }
  .bar-num { font-size: 12px; text-align: right; }

  .lens { font-size: 13.5px; color: var(--ink-2); margin: 14px 0 0; }
  .arrow { color: var(--ink-3); }
  .arrow.up { color: var(--teal); }
  .arrow.down { color: var(--terra-deep); }

  .tags { display: flex; flex-wrap: wrap; gap: 5px; margin: 10px 0 0; }

  .tag {
    font-size: 11px;
    background: var(--paper-2);
    border-radius: 999px;
    padding: 2px 9px;
    color: var(--ink-2);
  }

  .narrative { font-size: 14.5px; color: var(--ink-2); margin: 0; }

  .loading {
    font-size: 13px;
    font-style: italic;
    color: var(--ink-3);
    margin: 0;
  }

  .climate {
    margin-top: 16px;
    width: 100%;
    border-collapse: collapse;
    font-size: 13.5px;
  }

  .climate td {
    padding: 6px 0;
    border-top: 1px solid var(--line-soft);
  }

  .climate td:first-child { color: var(--ink-3); font-family: var(--sans); }
  .climate td:last-child { text-align: right; }

  /* Cost-breakdown table inside the cost-estimate popover */
  .costbd { width: 100%; border-collapse: collapse; margin: 1px 0 9px; }
  .costbd td { padding: 4px 0; border-top: 1px solid var(--line-soft); }
  .costbd tr:first-child td { border-top: none; }
  .costbd td:first-child { color: var(--ink-2); }
  .costbd td:last-child { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; padding-left: 14px; }
  .costbd .tot td { border-top: 1px solid var(--line); font-weight: 600; color: var(--ink); padding-top: 5px; }

  .events { list-style: none; margin: 0; padding: 0; }

  .events li {
    display: grid;
    grid-template-columns: 70px 200px 1fr auto;
    gap: 12px;
    align-items: baseline;
    padding: 8px 0;
    border-top: 1px solid var(--line-soft);
    font-size: 13.5px;
  }

  .emo { color: var(--ink-3); font-size: 12px; }
  .ename { font-weight: 600; }
  .eblurb { color: var(--ink-2); }

  .etier {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--terra);
    border: 1px solid var(--terra);
    border-radius: 999px;
    padding: 1px 8px;
  }

  li.major .ename { color: var(--terra-deep); }

  .foot {
    margin-top: 30px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
    display: flex;
    justify-content: space-between;
    gap: 20px;
    font-size: 11.5px;
    color: var(--ink-3);
  }

  /* ───────── Mobile: the sheet becomes a true bottom sheet ─────────
     Anchored to the bottom edge, full width, scrolling internally and clearing
     the home indicator. The header action cluster un-anchors into a wrapping
     row with comfortable targets, and the dense event grid stacks to two lines
     so blurbs and the "major" badge stop spilling past the right edge. */
  @media (max-width: 600px) {
    .scrim {
      padding: 0;
      display: flex;
      align-items: flex-end;
      overflow: hidden;
    }

    .sheet {
      width: 100%;
      max-width: 100%;
      margin: 0;
      border-radius: 18px 18px 0 0;
      max-height: var(--sheet-max-h);
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 16px var(--pad-x) calc(20px + var(--safe-b));
    }

    /* A grab handle so the bottom-sheet affordance reads at a glance. */
    .sheet::before {
      content: '';
      position: sticky;
      top: 0;
      display: block;
      width: 40px;
      height: 4px;
      margin: -4px auto 10px;
      border-radius: 999px;
      background: var(--line);
    }

    .hero-ctl {
      position: static;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 6px 0 4px;
    }

    .hero-ctl .save {
      min-height: var(--tap);
      display: inline-flex;
      align-items: center;
    }

    .step,
    .close {
      min-width: var(--tap);
      min-height: var(--tap);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }

    /* Push prev/next/close to the right so save/share lead the row. */
    .step:first-of-type { margin-left: auto; }
  }

  @media (max-width: 720px) {
    .events li {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 8px;
    }

    .emo { order: 0; }
    .ename { order: 1; }
    .etier { order: 2; margin-left: auto; }
    .eblurb { order: 3; flex-basis: 100%; }
  }
</style>
