// Prints the failing Lighthouse audits (score < 0.9) and key metrics of the given report JSON files.
// Usage: node scripts/lh-failures.cjs docs/lighthouse/*.report.json
const fs = require('fs');
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  const a = r.audits;
  const m = (k) => a[k]?.displayValue || '-';
  console.log(`\n== ${f}\n   FCP ${m('first-contentful-paint')} · LCP ${m('largest-contentful-paint')} · TBT ${m('total-blocking-time')} · CLS ${m('cumulative-layout-shift')} · SI ${m('speed-index')}`);
  for (const cat of Object.values(r.categories)) {
    for (const ref of cat.auditRefs) {
      const x = a[ref.id];
      if (!x || x.score === null || x.score >= 0.9 || x.scoreDisplayMode === 'informative' || x.scoreDisplayMode === 'notApplicable') continue;
      const items = (x.details?.items || []).slice(0, 4).map((i) => i.node?.snippet || i.url || i.source?.url || i.label || '').filter(Boolean);
      console.log(`   [${cat.id}] ${x.id} (${x.score}) ${x.displayValue || ''}${items.length ? `\n      ${items.join('\n      ')}` : ''}`);
    }
  }
}
