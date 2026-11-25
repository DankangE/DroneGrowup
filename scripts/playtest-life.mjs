// npm run playtest:life — real v2 clicks to the first promotion or three complete years.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserDriver, playSeasons, withLifeBrowser } from './life-ui-driver.mjs';

export async function main() {
  await withLifeBrowser(async open => {
    // Fresh runs: the debug hook is read-only here; fixtures are only for map timing/layout.
    for (const seed of [1, 11]) {
      const page = await open([390, 844], seed);
      try {
        const run = await playSeasons(browserDriver(page), { stopAtRankup: true });
        assert.ok(run.promotions || run.seasonTimes.length === 12);
        assert.equal(await page.locator('.life2-debt').count(), 1, 'debt remains visible beside cash');
        console.log(`playtest:life seed ${seed}: ${run.choices} real choices, ${run.seasonTimes.length} seasons, ${run.promotions} promotions`);
      } finally { await page.context().close(); }
    }
  });
  console.log('playtest:life OK: real default-URL clicks, paged options/results, automatic empty-bonus close, debt HUD and interactive engine parity; no browser errors');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
