<script>
  let { onclose } = $props();

  let cardEl = $state(null);

  const BRAND_BANDS = ['ok', 'ok', 'good', 'good', 'good', 'great', 'great', 'good', 'good', 'good', 'ok', 'ok'];

  const MOMENTS = [
    { label: 'Monthly', text: 'A city can be brilliant in May and miserable in August.' },
    { label: 'Personal', text: 'Rank for Score, daily livability, high season, or Best Value.' },
    { label: 'Practical', text: 'Costs, Schengen math, air quality, hazards, and safety stay in the frame.' }
  ];

  $effect(() => {
    const onkey = (e) => {
      if (e.key === 'Escape') onclose();
    };
    window.addEventListener('keydown', onkey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cardEl?.focus();
    return () => {
      window.removeEventListener('keydown', onkey);
      document.body.style.overflow = prevOverflow;
    };
  });
</script>

<div class="scrim">
  <button type="button" class="scrim-back" aria-label="Close about" onclick={onclose}></button>
  <div class="card" role="dialog" aria-modal="true" aria-label="About Monsoon" tabindex="-1" bind:this={cardEl}>
    <button type="button" class="x" onclick={onclose} aria-label="Close">×</button>

    <header class="head">
      <span class="mark" aria-hidden="true">
        {#each BRAND_BANDS as b}<span class="bcell band-{b}"></span>{/each}
      </span>
      <p class="kicker">About Monsoon<span class="tld">.fyi</span></p>
      <h1>Follow the good months</h1>
      <p class="lede">Monsoon is a seasonal migration planner for people whose best question is open:
        where should I live for a month or two, right now?</p>
    </header>

    <section class="q origin">
      <span class="qlabel">The spark</span>
      <p class="qhint">It started with an itinerary through Southeast Asia that did something quietly
        clever: it moved with the weather, following the kinder months and slipping around the
        seasonal heavy rains. Not long after, Monsoon was born.</p>
    </section>

    <section class="q">
      <span class="qlabel">Why month by month?</span>
      <p class="qhint">Quality of life is seasonal. Seville can be punishingly hot in summer. Chiang Mai
        can lose March and April to burning season and terrible air. A single annual score misses the
        part that decides whether a stay feels easy, workable, and worth extending.</p>
      <div class="moment-grid">
        {#each MOMENTS as m}
          <article>
            <span>{m.label}</span>
            <p>{m.text}</p>
          </article>
        {/each}
      </div>
    </section>

    <section class="q">
      <span class="qlabel">What it helps you find</span>
      <p class="qhint">Monsoon scores cities across weather, air, safety, season, events, and cost, then
        lets your preferences change the answer. The best result might be a famous city in its prime,
        but the fun is often stranger than that: a place you had barely heard of offering an excellent
        month at a fraction of the price.</p>
      <p class="pull">Plovdiv can feel like Barcelona for half off.</p>
    </section>

    <section class="q">
      <span class="qlabel">The point</span>
      <p class="qhint">This is not a bucket-list machine. It is an atlas for living well as you move:
        build a year around mild weather, cleaner air, local energy, visa constraints, and the price of
        actually being there. Sort by Best Value when you want the hidden gems to rise.</p>
    </section>

    <footer class="foot">
      <p class="disclaim">Use it as a planning signal, then re-check visas, advisories, and local
        conditions before you book.</p>
      <button type="button" class="cta" onclick={onclose}>Back to the atlas</button>
    </footer>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(33, 36, 30, 0.45);
    z-index: 60;
    overflow-y: auto;
    padding: 6vh 16px;
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

  .card {
    position: relative;
    z-index: 1;
    max-width: 640px;
    margin: 0 auto;
    background: var(--paper);
    border-radius: 18px;
    border: 1px solid var(--line);
    padding: 28px 34px 22px;
    outline: none;
  }

  .x {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 32px;
    height: 32px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--card);
    color: var(--ink-2);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }

  .x:hover { color: var(--ink); border-color: var(--ink-3); }

  .head { margin-bottom: 6px; }

  .mark {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 2px;
    width: 132px;
    margin-bottom: 12px;
  }

  .bcell { height: 6px; border-radius: 2px; }
  .bcell.band-great { background: var(--band-great); }
  .bcell.band-good { background: var(--band-good); }
  .bcell.band-ok { background: var(--band-ok); }
  .bcell.band-bad { background: var(--band-bad); }

  .kicker {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin: 0;
  }

  .tld {
    color: var(--terra);
    font-family: var(--mono);
    text-transform: none;
    letter-spacing: 0;
  }

  h1 {
    font-size: clamp(28px, 5vw, 38px);
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 4px 0 0;
  }

  .lede {
    font-family: var(--display);
    font-style: italic;
    font-size: 15.5px;
    color: var(--ink-2);
    margin: 10px 0 0;
    line-height: 1.5;
  }

  .q {
    padding: 18px 0;
    border-top: 1px solid var(--line-soft);
  }

  .origin {
    border-top-color: var(--line);
  }

  .qlabel {
    display: block;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
  }

  .qhint {
    font-size: 13px;
    color: var(--ink-2);
    margin: 8px 0 0;
    line-height: 1.6;
  }

  .moment-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 14px;
  }

  .moment-grid article {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px 11px;
  }

  .moment-grid span {
    display: block;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 700;
    color: var(--terra-deep);
  }

  .moment-grid p {
    margin: 5px 0 0;
    font-size: 12px;
    color: var(--ink-2);
    line-height: 1.45;
  }

  .pull {
    margin: 14px 0 0;
    padding-left: 14px;
    border-left: 1px solid var(--terra);
    font-family: var(--display);
    font-style: italic;
    font-size: 18px;
    line-height: 1.35;
    color: var(--ink);
  }

  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    border-top: 1px solid var(--line);
    padding-top: 16px;
  }

  .disclaim {
    margin: 0;
    font-size: 12px;
    color: var(--ink-3);
    line-height: 1.45;
  }

  .cta {
    flex-shrink: 0;
    border: 1px solid var(--ink);
    background: var(--ink);
    color: var(--paper);
    border-radius: 8px;
    padding: 7px 13px;
    font-weight: 700;
  }

  @media (max-width: 620px) {
    .scrim { padding: 0; }
    .card {
      min-height: 100vh;
      border-radius: 0;
      border-left: none;
      border-right: none;
      padding: 24px 20px 20px;
    }

    .moment-grid { grid-template-columns: 1fr; }
    .foot { align-items: stretch; flex-direction: column; }
    .cta { width: 100%; }
  }
</style>
