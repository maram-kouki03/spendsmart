#!/usr/bin/env bash
# Runs Lighthouse (headless Chrome) on the production build: / and /login, desktop and mobile.
# Usage: start the app first (npm run build && npm start), then  bash scripts/lighthouse.sh <label>
# Writes docs/lighthouse/<label>-<page>-<preset>.report.html (+ .json) and prints the four scores.
set -euo pipefail
LABEL="${1:-run}"
BASE="${BASE:-http://localhost:4000}"
OUT="docs/lighthouse"
mkdir -p "$OUT"
for page in home login; do
  url="$BASE/"; [ "$page" = login ] && url="$BASE/login"
  for preset in desktop mobile; do
    flags=(--quiet --chrome-flags="--headless=new --no-sandbox" --output=html --output=json
           --only-categories=performance,accessibility,best-practices,seo
           --output-path="$OUT/$LABEL-$page-$preset")
    # Lighthouse's default form factor is mobile; --preset=desktop switches to the desktop config.
    [ "$preset" = desktop ] && flags+=(--preset=desktop)
    npx --yes lighthouse "$url" "${flags[@]}" >/dev/null 2>&1 || true
    node -e '
      const r = require(process.argv[1]);
      const s = (k) => Math.round(r.categories[k].score * 100);
      console.log(`${process.argv[2]}\t${process.argv[3]}\tperf ${s("performance")}\ta11y ${s("accessibility")}\tbp ${s("best-practices")}\tseo ${s("seo")}`);
    ' "$PWD/$OUT/$LABEL-$page-$preset.report.json" "$page" "$preset"
  done
done
