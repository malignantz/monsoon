<script>
  // One registry filter (filters.svelte.js) rendered as real form controls:
  // a checkbox for a toggle, a radio group (with "Any") for a select, checkboxes
  // for a multi. Two looks: 'list' (a vertical menu, inside a desktop dropdown)
  // and 'pills' (wrapping pills, in "More filters" and the phone sheet).
  import { filterState, setFilter } from './filters.svelte.js';

  let { filter: f, ctx, variant = 'pills', showLegend = true, legendId = null } = $props();

  const uid = $props.id(); // radio-group name, unique per rendered control
  const value = $derived(filterState[f.id]);
  const options = $derived(f.options ? f.options(ctx) : []);
  const isOn = (o) => (f.same ? value != null && f.same(value, o.v) : value === o.v);

  function toggleMulti(v) {
    const cur = filterState[f.id];
    setFilter(f.id, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  }
</script>

{#if f.kind === 'toggle'}
  <label class="refine-toggle" class:list={variant === 'list'}>
    <input type="checkbox" checked={value} onchange={(e) => setFilter(f.id, e.currentTarget.checked)} />
    <span>{#if f.glyph}<span class="glyph" aria-hidden="true">{f.glyph}</span>{/if}{f.chipLabel(true, ctx)}</span>
  </label>
{:else}
  <fieldset class="fc {variant}">
    {#if showLegend}
      <legend class="fc-legend" id={legendId}>{f.legend ? f.legend(ctx) : f.label}</legend>
    {:else}
      <legend class="sr-only">{f.legend ? f.legend(ctx) : f.label}</legend>
    {/if}
    <div class="fc-opts" class:grid={f.kind === 'multi' && variant === 'list'}>
      {#if f.kind === 'select'}
        <label class="opt any">
          <input type="radio" name={uid} checked={value == null} onchange={() => setFilter(f.id, null)} />
          <span>Any</span>
        </label>
        {#each options as o (o.v)}
          <label class="opt">
            <input type="radio" name={uid} checked={isOn(o)} onchange={() => setFilter(f.id, o.v)} />
            <span>{o.label}</span>
          </label>
        {/each}
      {:else}
        {#each options as o (o.v)}
          <label class="opt">
            <input type="checkbox" checked={value.includes(o.v)} onchange={() => toggleMulti(o.v)} />
            <span>{o.label}</span>
          </label>
        {/each}
      {/if}
    </div>
  </fieldset>
{/if}

<style>
  .fc {
    margin: 0;
    padding: 0;
    border: none;
    min-width: 0;
  }

  .fc-legend {
    padding: 0;
    margin: 0 0 7px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-2);
  }

  /* ── list: a quiet vertical menu ── */
  .list .fc-opts {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .list .fc-opts.grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .list .opt {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 7px;
    font-size: 12.5px;
    color: var(--ink-2);
    cursor: pointer;
    transition: background 0.12s ease, color 0.12s ease;
  }

  .list .opt:hover {
    background: var(--paper-2);
    color: var(--ink);
  }

  .list .opt:has(input:checked) {
    color: var(--ink);
    font-weight: 600;
  }

  .list .opt input {
    width: 14px;
    height: 14px;
    margin: 0;
    accent-color: var(--terra);
    flex-shrink: 0;
  }

  /* ── pills: the refine-toggle vocabulary from app.css ── */
  .pills .fc-opts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .pills .opt {
    position: relative;
    display: inline-flex;
    align-items: center;
    padding: 5px 12px;
    border: 1px solid var(--line);
    border-radius: 999px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--ink-2);
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .pills .opt:hover {
    border-color: var(--ink-2);
    color: var(--ink);
  }

  .pills .opt input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .pills .opt:has(input:checked) {
    background: var(--terra-soft);
    border-color: var(--terra);
    color: var(--terra-deep);
    font-weight: 600;
  }

  /* "Any" is the resting state, not an applied filter: no terracotta. */
  .pills .opt.any:has(input:checked) {
    background: transparent;
    border-color: var(--ink-3);
    color: var(--ink);
  }

  .pills .opt:has(input:focus-visible) {
    outline: 2px solid var(--terra);
    outline-offset: 2px;
  }

  .glyph { opacity: 0.8; margin-right: 5px; }

  .refine-toggle.list {
    border: none;
    padding: 6px 8px;
  }

  @media (max-width: 700px) {
    .pills .opt {
      min-height: var(--tap);
      padding: 0 14px;
      font-size: 13.5px;
    }
    .pills .fc-opts { gap: 8px; }
    .list .opt { min-height: var(--tap); }
  }
</style>
