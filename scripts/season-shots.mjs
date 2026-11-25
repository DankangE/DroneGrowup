// npm run build && node scripts/season-shots.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { preview } from 'vite';
import { revealOption } from './ui-driver.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'docs/screenshots/seasons');
const server = await preview({ root, preview: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, channel: process.env.CHROME_PATH ? undefined : 'chrome' });
  await mkdir(out, { recursive: true });
  for (const [width, height] of [[390, 844], [1280, 800]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', deviceScaleFactor: 1, locale: 'ko-KR' });
    const page = await context.newPage();
    const shot = async name => {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(img => img.decode()));
      });
      await page.screenshot({ path: join(out, `${name}-${width}x${height}.png`) });
    };
    const act = async id => {
      await (await revealOption(page, { id })).click();
      await page.locator('[data-action="continue"]').click();
    };
    await page.goto(server.resolvedUrls.local[0] + '?debug=1&seed=7');
    await page.locator('[data-action="new"]').click();
    await page.locator('[data-acts="0"]').waitFor();
    // Capture the comparison grid, then highlight the separate season-end action.
    await revealOption(page, { id: 'st_theory' });
    await shot('home');
    await (await revealOption(page, { id: 'rest' })).focus();
    await page.locator('[data-option="rest"][data-rest="full"]').waitFor();
    await shot('rest-full');

    await act('st_theory');
    await act('st_sim');
    assert.equal(await page.evaluate(() => window.__game.state().turn), 0);
    await page.locator('[data-acts="2"]').waitFor();
    await revealOption(page, { id: 'st_sim' });
    await shot('mid-season');
    await (await revealOption(page, { id: 'rest' })).focus();
    await page.locator('[data-option="rest"][data-rest="light"]').waitFor();
    await shot('rest-light');

    await act('st_parttime');
    await page.locator('[data-stamina="tired"]').waitFor();
    await shot('low-stamina');
    await (await revealOption(page, { id: 'rest' })).click();
    await page.locator('[data-season-change]').waitFor();
    await shot('season-change');
    await context.close();
  }
  console.log(`12 screenshots in ${out}`);
} finally {
  await browser?.close();
  await new Promise(done => server.httpServer.close(done));
}
