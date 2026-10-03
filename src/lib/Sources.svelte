<script>
  // Inline "where this comes from" disclosure for a group of numbers on the
  // city sheet. Opens in the flow under the numbers it explains (no floating
  // panel to clip on a bottom sheet); each row names the raw input, its source,
  // the data window / as-of date, a confidence chip and a one-line method.
  import { CHIP_LABEL } from './provenance.js';

  let {
    label = 'Where these numbers come from',
    rows = [],
    reportHref = '',
    open = $bindable(false),
    toggle = true,
    id,
    children
  } = $props();
</script>

{#if toggle}
  <button
    type="button"
    class="srctoggle"
    aria-expanded={open}
    aria-controls={id}
    onclick={() => (open = !open)}
  >{label}<span class="chev" class:up={open} aria-hidden="true">›</span></button>
{/if}

{#if open}
  <div class="srcpanel" {id}>
    {@render children?.()}
    {#if rows.length}
      <ul class="srcrows">
        {#each rows as r}
          <li>
            <div class="rhead">
              <span class="rlabel">{r.label}{#if r.value != null && r.value !== ''}<span class="rval num">{r.value}</span>{/if}</span>
              {#if r.chip}
                <span class="chip chip-{r.chip}">{CHIP_LABEL[r.chip]}</span>
              {:else if r.type}
                <span class="chip chip-type">{r.type}</span>
              {/if}
            </div>
            {#if r.input}<p class="rinput">{r.input}</p>{/if}
            {#if r.rationale}<p class="rnote"><span class="rnlabel">Note:</span> {r.rationale}</p>{/if}
            {#if r.sources?.length || r.sourceText || r.when}
              <p class="rmeta">
                {#if r.sources?.length}
                  {#each r.sources as s, i}{#if i}; {/if}{#if s.url}<a href={s.url} target="_blank" rel="noopener">{s.name}</a>{:else}{s.name}{/if}{/each}
                {:else if r.sourceText}
                  {r.sourceText}
                {/if}
                {#if r.when}<span class="rwhen">{(r.sources?.length || r.sourceText) ? ' · ' : ''}{r.when}</span>{/if}
                {#if r.chip && r.type}<span class="rwhen"> · {r.type}</span>{/if}
              </p>
            {/if}
            {#if r.method}<p class="rmethod">{r.method}</p>{/if}
            {#if r.licence}<p class="rmethod">Licence: {r.licence}</p>{/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if reportHref}
      <p class="report"><a href={reportHref} target="_blank" rel="noopener">Report this number</a></p>
    {/if}
  </div>
{/if}

<style>
  .srctoggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 12px;
    padding: 0;
    border: none;
    background: none;
    font-family: var(--sans);
    font-size: 12px;
    color: var(--ink-3);
    text-decoration: underline dotted;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .srctoggle:hover { color: var(--ink); text-decoration-style: solid; }

  .chev {
    display: inline-block;
    transform: rotate(90deg);
    transition: transform 0.15s ease;
    text-decoration: none;
  }

  .chev.up { transform: rotate(-90deg); }

  /* On touch, an invisible overlay brings the 12px link up to a comfortable
     target without growing the line it sits on. */
  @media (max-width: 700px) {
    .srctoggle { position: relative; min-height: 32px; }
  }

  .srcpanel {
    margin-top: 8px;
    padding: 4px 14px 10px;
    border: 1px solid var(--line-soft);
    border-radius: 10px;
    background: var(--card);
    font-size: 12.5px;
    line-height: 1.5;
    color: var(--ink-2);
  }

  .srcrows { list-style: none; margin: 0; padding: 0; }

  .srcrows li {
    padding: 9px 0;
    border-top: 1px solid var(--line-soft);
  }

  .srcrows li:first-child { border-top: none; }

  .rhead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .rlabel { font-weight: 600; color: var(--ink); }
  .rval { margin-left: 7px; font-weight: 500; color: var(--ink-2); }

  .chip {
    flex: none;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0 7px;
    color: var(--ink-3);
    white-space: nowrap;
  }

  .chip-high { border-color: var(--teal); color: var(--teal); }
  .chip-medium { border-color: var(--ink-3); color: var(--ink-2); }
  .chip-low { border-color: var(--terra); color: var(--terra-deep); }
  .chip-editorial { border-style: dashed; color: var(--ink-2); }
  .chip-type { text-transform: none; letter-spacing: 0; }

  .rinput, .rnote, .rmeta, .rmethod { margin: 2px 0 0; }
  .rnote { font-style: italic; }
  .rnlabel { font-style: normal; color: var(--ink-3); }
  .rmeta { font-size: 11.5px; color: var(--ink-3); overflow-wrap: anywhere; }
  .rmeta a { color: var(--ink-2); text-decoration: underline; text-underline-offset: 2px; }
  .rmeta a:hover { color: var(--ink); }
  .rmethod { font-size: 11.5px; color: var(--ink-3); }

  .report {
    margin: 6px 0 0;
    padding-top: 8px;
    border-top: 1px solid var(--line-soft);
    font-size: 11.5px;
    text-align: right;
  }

  .report a { color: var(--ink-3); text-decoration: underline dotted; text-underline-offset: 2px; }
  .report a:hover { color: var(--ink); text-decoration-style: solid; }
</style>
