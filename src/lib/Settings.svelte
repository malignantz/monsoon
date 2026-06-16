<script>
  // The re-openable settings panel. Writes the shared `prefs` store and persists
  // on close, so nothing here is a one-way door.
  import { PRESETS, prefs, saveSettings } from './data.svelte.js';

  let { preset = $bindable('balanced'), onclose } = $props();

  let cardEl = $state(null);

  // The signature month strip, reused as the brand mark (Bali's twelve months).
  const BRAND_BANDS = ['ok', 'ok', 'good', 'good', 'good', 'great', 'great', 'good', 'good', 'good', 'ok', 'ok'];

  function done() {
    saveSettings();
    onclose();
  }

  $effect(() => {
    const onkey = (e) => {
      // Defaults are sensible, so Escape just saves and closes.
      if (e.key === 'Escape') done();
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
  <button type="button" class="scrim-back" aria-label="Close settings" onclick={done}></button>
  <div class="card" role="dialog" aria-modal="true" aria-label="Settings" tabindex="-1" bind:this={cardEl}>
    <header class="head">
      <span class="mark" aria-hidden="true">
        {#each BRAND_BANDS as b}<span class="bcell band-{b}"></span>{/each}
      </span>
      <p class="kicker">Settings</p>
      <h1>Your atlas</h1>
      <p class="lede">These shape ranking, pricing, and safety across every view.</p>
    </header>

    <section class="q">
      <span class="qlabel">Who's traveling?</span>
      <div class="seg" role="group" aria-label="Party size">
        <button type="button" class:on={prefs.party === 'solo'} onclick={() => (prefs.party = 'solo')}>Solo</button>
        <button type="button" class:on={prefs.party === 'couple'} onclick={() => (prefs.party = 'couple')}>Couple</button>
      </div>
      <p class="qhint">We'll show a single {prefs.party} cost-of-living figure everywhere instead of two.</p>
    </section>

    <section class="q">
      <span class="qlabel">Optimize for</span>
      <div class="preset-grid" role="radiogroup" aria-label="Optimize for">
        {#each Object.entries(PRESETS) as [k, v]}
          <button
            type="button"
            class:on={preset === k}
            role="radio"
            aria-checked={preset === k}
            title={v.blurb}
            onclick={() => (preset = k)}
          >
            <span>{v.label}</span>
            <em>{v.blurb}</em>
          </button>
        {/each}
      </div>
    </section>

    <section class="q">
      <button
        type="button"
        class="switchrow"
        role="switch"
        aria-checked={prefs.womensSafety}
        onclick={() => (prefs.womensSafety = !prefs.womensSafety)}
      >
        <span class="switchtext">
          <span class="qlabel">Weight women's street-safety</span>
          <span class="qhint">Blends the women's street-safety estimate 50/50 into every safety score —
            on top of whichever priority you pick.</span>
        </span>
        <span class="switch" class:on={prefs.womensSafety} aria-hidden="true"><span class="knob"></span></span>
      </button>
    </section>

    <footer class="foot">
      <button type="button" class="cta" onclick={done}>Done</button>
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

  .card {
    position: relative;
    z-index: 1;
    max-width: 540px;
    margin: 0 auto;
    background: var(--paper);
    border-radius: 18px;
    border: 1px solid var(--line);
    padding: 26px 28px 20px;
    outline: none;
  }

  .head { margin-bottom: 18px; }

  .mark {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 2px;
    width: 132px;
    margin-bottom: 12px;
  }

  .bcell {
    height: 6px;
    border-radius: 2px;
  }

  .bcell.band-great { background: var(--band-great); }
  .bcell.band-good { background: var(--band-good); }
  .bcell.band-ok { background: var(--band-ok); }
  .bcell.band-bad { background: var(--band-bad); }

  h1 {
    font-size: clamp(26px, 5vw, 34px);
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 2px 0 0;
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
    padding: 15px 0;
    border-top: 1px solid var(--line-soft);
  }

  .qlabel {
    display: block;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
  }

  .qhint {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 8px 0 0;
    line-height: 1.45;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 10px;
  }

  .preset-grid button {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-height: 96px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--card);
    color: var(--ink-2);
    padding: 10px;
    text-align: left;
    font: inherit;
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }

  .preset-grid button:hover {
    border-color: var(--ink-3);
    color: var(--ink);
  }

  .preset-grid button.on {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }

  .preset-grid span {
    font-size: 13.5px;
    font-weight: 700;
    line-height: 1.15;
  }

  .preset-grid em {
    font-style: normal;
    font-size: 11.5px;
    line-height: 1.35;
    color: currentColor;
    opacity: 0.72;
  }

  .seg {
    display: inline-flex;
    align-items: center;
    height: 38px;
    margin-top: 10px;
    border: 1px solid var(--line);
    border-radius: 999px;
    overflow: hidden;
    background: var(--card);
  }

  .seg button {
    border: none;
    background: none;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink-3);
    padding: 0 24px;
    height: 100%;
  }

  .seg button:hover { color: var(--ink); }

  .seg button.on {
    background: var(--ink);
    color: var(--paper);
  }

  .switchrow {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    text-align: left;
  }

  .switchtext { flex: 1; }
  .switchrow .qhint { margin-top: 6px; }

  .switch {
    flex: none;
    position: relative;
    width: 46px;
    height: 26px;
    border-radius: 999px;
    background: var(--paper-3);
    border: 1px solid var(--line);
    transition: background 0.18s ease, border-color 0.18s ease;
    margin-top: 2px;
  }

  .switch.on {
    background: var(--terra);
    border-color: var(--terra);
  }

  .knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--card);
    box-shadow: 0 1px 2px rgba(33, 36, 30, 0.3);
    transition: transform 0.18s ease;
  }

  .switch.on .knob { transform: translateX(20px); }

  .foot {
    margin-top: 6px;
    padding-top: 15px;
    border-top: 1px solid var(--line-soft);
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
  }

  .cta:hover { background: var(--terra-deep); }

  @media (max-width: 560px) {
    .preset-grid { grid-template-columns: 1fr; }
    .preset-grid button { min-height: 0; }
  }
</style>
