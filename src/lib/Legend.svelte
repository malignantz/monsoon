<p class="legend">
  <span>◆ Schengen</span>
  <span>≋ swimmable</span>
  <span>★ major festival</span>
  <span>⚠ seasonal hazard</span>
</p>

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px 6px;
    margin: 0;
    font-size: 11px;
    color: var(--ink-3);
  }

  .legend span { white-space: nowrap; }

  .legend span + span::before {
    content: '· ';
    margin-right: 6px;
  }
</style>
