<script>
  // A read-only companion to Settings/Methodology — same scrim/card shell and
  // visual language, but a short, value-led guide. Opened from the header "?"
  // button (a secondary utility beside the settings gear), so "how to use it"
  // lives near the top where people look for help — distinct from About (what
  // Monsoon is) and Methodology (how the scores are built).
  //
  // Structure follows JTBD: the idea (mental model) → the two jobs (browse a
  // month / build a year) → the payoff worth knowing. Lead with value, name a
  // payoff for each item, and surface the discovery-arbitrage "aha" up front
  // rather than burying it in a flat step list. See [[explainer-ia-direction]].
  let { onclose } = $props();

  let cardEl = $state(null);

  const BRAND_BANDS = ['ok', 'ok', 'good', 'good', 'good', 'great', 'great', 'good', 'good', 'good', 'ok', 'ok'];

  const USES = [
    {
      label: 'Browse a month',
      text: 'Pick a month and see every city ranked for it — “where should I be in June?” Open any card for the full year: safety, monthly cost, swimmable months, and the festivals worth planning around.'
    },
    {
      label: 'Build a year',
      text: 'In <strong>My year</strong>, chain stays into a route. Monsoon tallies your average score, monthly cost, festivals and Schengen days as you go — then save or share the itinerary.'
    }
  ];

  const TRICKS = [
    {
      label: 'Sort by Best Value',
      text: 'The payoff the app is built for: an unfamiliar city at the right time often beats the famous one for a fraction of the price. <em>Plovdiv can feel like Barcelona for half off.</em>'
    },
    {
      label: 'Let the month lead',
      text: 'Each city’s colored strip is its whole year — green months line up, red ones don’t. <em>When</em> you go matters as much as <em>where</em>.'
    },
    {
      label: 'Tune the lens',
      text: 'The ⚙ reweights what “best” means (livability, high season, who’s traveling); ♡ saves cities; filters narrow by region, safety, air, cost and Schengen.'
    }
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
  <button type="button" class="scrim-back" aria-label="Close guide" onclick={onclose}></button>
  <div class="card" role="dialog" aria-modal="true" aria-label="How to use Monsoon" tabindex="-1" bind:this={cardEl}>
    <button type="button" class="x" onclick={onclose} aria-label="Close">×</button>

    <header class="head">
      <span class="mark" aria-hidden="true">
        {#each BRAND_BANDS as b}<span class="bcell band-{b}"></span>{/each}
      </span>
      <p class="kicker">Guide</p>
      <h1>How to use Monsoon</h1>
      <p class="lede">Quality of life is seasonal. Here’s the idea, the two ways people use it,
        and the trick worth knowing.</p>
    </header>

    <section class="q">
      <span class="qlabel">The idea</span>
      <p class="qhint">A city that’s glorious in May can be brutal in August. Monsoon scores all 111
        cities for <em>every</em> month on one shared yardstick — weather, air, safety, cost, season
        and events — so the numbers are a way to <strong>compare cities honestly</strong>, not grades
        to obsess over. The whole job: find where you’d actually want to be, and when.</p>
    </section>

    <section class="q">
      <span class="qlabel">Two ways to use it</span>
      <div class="uses">
        {#each USES as u}
          <article>
            <span class="usetitle">{u.label}</span>
            <p>{@html u.text}</p>
          </article>
        {/each}
      </div>
    </section>

    <section class="q">
      <span class="qlabel">The trick worth knowing</span>
      <ul class="tips">
        {#each TRICKS as t}
          <li>
            <span class="tiplead">{t.label}</span>
            <span class="tiptext">{@html t.text}</span>
          </li>
        {/each}
      </ul>
    </section>

    <footer class="foot">
      <p class="disclaim">A planning signal, not a booking engine — re-check visas, advisories and
        local conditions before you travel.</p>
      <button type="button" class="cta" onclick={onclose}>Start exploring</button>
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
    max-width: 620px;
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

  h1 {
    font-size: clamp(26px, 5vw, 34px);
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 4px 0 0;
  }

  .lede {
    font-family: var(--display);
    font-style: italic;
    font-size: 15px;
    color: var(--ink-2);
    margin: 10px 0 0;
    line-height: 1.5;
  }

  .q {
    padding: 18px 0;
    border-top: 1px solid var(--line-soft);
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
    line-height: 1.55;
  }

  .uses {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
    margin-top: 12px;
  }

  .uses article {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 13px 14px;
  }

  .usetitle {
    display: block;
    font-size: 13.5px;
    font-weight: 700;
    color: var(--terra-deep);
  }

  .uses p {
    margin: 6px 0 0;
    font-size: 12.5px;
    color: var(--ink-2);
    line-height: 1.5;
  }

  .tips {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
  }

  .tips li {
    padding: 9px 0;
    font-size: 13px;
    line-height: 1.55;
    color: var(--ink-2);
  }

  .tips li + li {
    border-top: 1px solid var(--line-soft);
  }

  .tiplead {
    font-weight: 700;
    color: var(--ink);
  }

  .tiplead::after {
    content: ' — ';
    color: var(--ink-3);
    font-weight: 400;
  }

  .foot {
    margin-top: 8px;
    padding-top: 18px;
    border-top: 1px solid var(--line-soft);
  }

  .disclaim {
    font-size: 12px;
    color: var(--ink-3);
    line-height: 1.5;
    margin: 0 0 16px;
  }

  .cta {
    width: 100%;
    height: 44px;
    border: none;
    border-radius: 999px;
    background: var(--ink);
    color: var(--paper);
    font-family: var(--sans);
    font-size: 14.5px;
    font-weight: 600;
    transition: background 0.15s ease;
    cursor: pointer;
  }

  .cta:hover { background: var(--terra-deep); }

  @media (max-width: 620px) {
    .scrim { padding: 0; }
    .card {
      min-height: 100vh;
      border-radius: 0;
      border-left: none;
      border-right: none;
      padding: 24px 20px 20px;
    }

    .uses { grid-template-columns: 1fr; }
  }
</style>
