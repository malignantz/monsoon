<script>
  // Doubles as first-run onboarding (mode="onboarding") and the re-openable
  // settings panel (mode="settings"). Both write the same shared `prefs` store
  // and persist on close, so nothing here is a one-way door.
  import { prefs, saveSettings } from './data.svelte.js';

  let { mode = 'settings', onclose } = $props();

  let cardEl = $state(null);

  function done() {
    saveSettings();
    onclose();
  }

  $effect(() => {
    const onkey = (e) => {
      // Onboarding has no dismiss-without-choosing; defaults are sensible, so
      // Escape still just saves and closes.
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

  const onboarding = $derived(mode === 'onboarding');
</script>

<div class="scrim">
  <button type="button" class="scrim-back" aria-label="Close settings" onclick={done}></button>
  <div class="card" role="dialog" aria-modal="true" aria-label="Settings" tabindex="-1" bind:this={cardEl}>
    <header class="head">
      <span class="mark">✳</span>
      {#if onboarding}
        <p class="kicker">Slow Travel Atlas</p>
        <h1>Let's tune your atlas</h1>
        <p class="lede">Two quick questions so every screen shows the right prices and the
          safety that matters to you. Change them anytime.</p>
      {:else}
        <p class="kicker">Settings</p>
        <h1>Your atlas</h1>
        <p class="lede">These shape pricing and safety across every view.</p>
      {/if}
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
      <button
        type="button"
        class="switchrow"
        role="switch"
        aria-checked={prefs.womensSafety}
        onclick={() => (prefs.womensSafety = !prefs.womensSafety)}
      >
        <span class="switchtext">
          <span class="qlabel">Weight women's safety</span>
          <span class="qhint">Blends the women's-safety signal 50/50 into every safety score —
            on top of whichever priority you pick.</span>
        </span>
        <span class="switch" class:on={prefs.womensSafety} aria-hidden="true"><span class="knob"></span></span>
      </button>
    </section>

    <footer class="foot">
      <button type="button" class="cta" onclick={done}>
        {onboarding ? 'Start exploring →' : 'Done'}
      </button>
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
    max-width: 460px;
    margin: 0 auto;
    background: var(--paper);
    border-radius: 18px;
    border: 1px solid var(--line);
    padding: 28px 30px 22px;
    outline: none;
  }

  .head { margin-bottom: 22px; }

  .mark {
    font-size: 26px;
    color: var(--terra);
    line-height: 1;
    display: block;
    margin-bottom: 10px;
  }

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
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 8px 0 0;
    line-height: 1.45;
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
    margin-top: 8px;
    padding-top: 18px;
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
</style>
