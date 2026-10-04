<script>
  // The Best Value cost-weight dial: a five-stop slider over the exponent on
  // cost (see COST_WEIGHT_STOPS). Native range input, so keyboard, touch and
  // screen-reader behaviour come for free; the stop's word is the readout and
  // its hint says what that setting does to the ranking.
  import { COST_WEIGHT_STOPS as STOPS, DEFAULT_COST_WEIGHT, snapCostWeight } from './data.svelte.js';
  import { track } from './analytics.js';

  // value: the current exponent. onchange(e): live, on every input. context:
  // where the dial sits (for analytics). compact: one-line version (no hint).
  let { value, onchange, context, compact = false } = $props();

  const uid = $props.id();
  const idx = $derived(STOPS.findIndex((s) => s.e === snapCostWeight(value)));
  const stop = $derived(STOPS[idx]);
  const isDefault = $derived(stop.e === DEFAULT_COST_WEIGHT);

  function oninput(ev) {
    onchange?.(STOPS[Number(ev.currentTarget.value)].e);
  }

  function onsettle(ev) {
    track('cost_weight_set', { weight: STOPS[Number(ev.currentTarget.value)].e, from: context });
  }
</script>

<div class="cw" class:compact>
  <div class="head">
    <label for="{uid}-cw">
      <span class="long">How much cost counts</span>
      <span class="short">Cost counts</span>
    </label>
    <span class="read" aria-hidden="true">{stop.word}{isDefault ? ' · default' : ''}</span>
  </div>
  <div class="track">
    <span class="end" aria-hidden="true">Less</span>
    <input
      id="{uid}-cw"
      type="range"
      min="0"
      max={STOPS.length - 1}
      step="1"
      value={idx}
      aria-valuetext="{stop.word}: {stop.hint}"
      {oninput}
      onchange={onsettle}
    />
    <span class="end" aria-hidden="true">More</span>
  </div>
  <p class="hint">{stop.hint}</p>
</div>

<style>
  .cw {
    min-width: 0;
    max-width: 100%;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  label {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
  }

  .short { display: none; }

  .read {
    font-size: 13px;
    font-weight: 600;
    color: var(--terra-deep);
    white-space: nowrap;
  }

  .track {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
  }

  .end {
    font-size: 11.5px;
    color: var(--ink-3);
    flex: none;
  }

  input[type='range'] {
    flex: 1;
    min-width: 0;
    margin: 0;
    height: 44px;
    accent-color: var(--terra);
    cursor: pointer;
  }

  .hint {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 0;
    line-height: 1.45;
  }

  .compact .long { display: none; }
  .compact .short { display: inline; }
  .compact .hint { display: none; }

  @media (max-width: 700px) {
    .long { display: none; }
    .short { display: inline; }
    .hint { display: none; }
  }
</style>
