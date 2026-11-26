// Prints scores and key metrics (FCP, LCP, TBT, CLS, transfer size, JS requests) per Lighthouse report.
// Usage: node scripts/lh-metrics.cjs docs/lighthouse/*.report.json
const fs = require('fs');
const path = require('path');
for (const f of process.argv.slice(2)) {
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  const a = r.audits;
  const s = (k) => Math.round(r.categories[k].score * 100);
  const ms = (k) => Math.round(a[k].numericValue);
  const reqs = a['network-requests'].details.items;
  const js = reqs.filter((i) => i.resourceType === 'Script');
  const kb = (n) => (n / 1024).toFixed(0);
  console.log(
    [path.basename(f).replace('.report.json', ''), s('performance'), s('accessibility'), s('best-practices'), s('seo'),
      ms('first-contentful-paint'), ms('largest-contentful-paint'), ms('total-blocking-time'), a['cumulative-layout-shift'].numericValue.toFixed(3),
      kb(a['total-byte-weight'].numericValue), js.length, kb(js.reduce((t, i) => t + i.transferSize, 0))].join('\t')
  );
}
