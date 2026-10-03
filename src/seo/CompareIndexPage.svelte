<script>
  // /compare/ — every published comparison, grouped by the lower-cost city's
  // region, with the gate numbers that decide which pairs exist (pairing.js GATE).
  import Shell from './Shell.svelte';
  import { GATE } from './pairing.js';
  import { regionSlug, BEST_INDEX } from './derive.js';

  let { groups, count, considered, site, crumbs } = $props();

  const pct = (x) => Math.round(x * 100);
  const cheaper = pct(GATE.minSavings);
  const monthCheaper = pct(1 - GATE.winCostRatio);
</script>

<Shell {crumbs} {site}>
  <p class="kicker">{count} comparisons · {groups.length} regions</p>
  <h1>Lower-cost cities beside better-known ones, month by month</h1>
  <p class="lede">
    Each page sets one city against a better-known city nearby and shows, for every month, which one scores higher on the Balanced Score and what a month costs in each.
    A comparison is published only when the lower-cost city wins enough months, by enough, for the claim to hold.
  </p>

  <section aria-labelledby="how">
    <h2 id="how">How pairs are chosen</h2>
    <p>
      We looked at {considered} pairings of a city with a better-known one in the same region or within {GATE.nearbyLatDeg} degrees of latitude on the same continent (same-region pairs are also kept within {GATE.sameRegionMaxLatDeg} degrees).
      A pair is published when all of this holds:
    </p>
    <ul class="bullets">
      <li>The lower-cost city is at least {cheaper}% cheaper, solo, on both its base month and its twelve-month average.</li>
      <li>It scores at least {GATE.winMargin} points higher in at least {GATE.minWinMonths} months while costing at least {monthCheaper}% less in that month.</li>
      <li>It wins more months than the better-known city wins outright (a month where the other city is at least {GATE.evenMargin} points ahead).</li>
      <li>Its best month leads by at least {GATE.minBestMargin} points, with at least one reason beyond cost and the Score itself: cleaner air, milder heat, fewer rain days or a higher safety score.</li>
      <li>No city appears as the lower-cost side in more than {GATE.maxAnchorsPerSubject} comparisons, and none as the better-known side in more than {GATE.maxSubjectsPerAnchor}.</li>
    </ul>
    <p>
      Pairs that do not clear the bar are not published. Every page also says when the better-known city is the better pick.
      Scores and costs are the ones on each <a href="/cities/">city page</a>; <a href={BEST_INDEX}>Where to be</a> ranks every city by month.
    </p>
  </section>

  <nav aria-label="Regions">
    <p class="small">
      {#each groups as g, i}<a href="#{regionSlug(g.region)}">{g.regionName}</a> <span class="muted">({g.items.length})</span>{i < groups.length - 1 ? ' · ' : ''}{/each}
    </p>
  </nav>

  {#each groups as g}
    <div class="region" id={regionSlug(g.region)}>
      <h2>{g.regionName}</h2>
      <ul class="plain sources">
        {#each g.items as o}
          <li><a href={o.path}><b>{o.label}</b></a>: {o.claim}</li>
        {/each}
      </ul>
    </div>
  {/each}
</Shell>
