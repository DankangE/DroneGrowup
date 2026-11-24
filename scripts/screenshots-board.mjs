// Capture the real board and its cards. Play to the first promotion in Chrome,
// then replay the remaining choices in the engine to resume the final decision.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { POLICIES, botRandom, pick } from '../src/game/bots.ts';
import { choose, options } from '../src/game/engine.ts';
import { finishChoice, revealOption, stoppedResult } from './ui-driver.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'docs/screenshots/board');
const seed = 3;
await build({ root, logLevel: 'warn' });
const server = await preview({ root, preview: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, channel: process.env.CHROME_PATH ? undefined : 'chrome' });
  await mkdir(output, { recursive: true });
  for (const [width, height, suffix] of [[390, 844, 'mobile'], [1280, 800, 'desktop']]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'ko-KR', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const readState = () => page.evaluate(() => window.__game.state());
    const shot = async name => {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, image => image.decode()));
      });
      await page.screenshot({ path: join(output, `${name}-${suffix}.png`) });
    };
    const act = async id => {
      await (await revealOption(page, { id })).click();
      await finishChoice(page);
    };
    await page.goto(server.resolvedUrls.local[0] + '?debug=1&seed=' + seed);
    await page.locator('[data-action="new"]').click();
    await revealOption(page, { id: 'st_theory' });
    await shot('board-home');
    await act('st_theory');
    await act('st_sim');
    await page.locator('[data-token][data-season="0"][data-step="2"]').waitFor();
    await shot('mid-season');
    const roll = await revealOption(page, { id: 'st_flight' });
    await page.locator('.detail [data-wheel-preview]').waitFor();
    await shot('spinner-before');
    await roll.click();
    await stoppedResult(page).locator('[data-wheel][data-outcome]').waitFor();
    await shot('spinner-result');
    await finishChoice(page);

    const random = botRandom(seed);
    let state = await readState();
    let sawRank = false;
    let sawEvent = false;
    while (!sawRank || !sawEvent) {
      assert.notEqual(state.phase, 'ended', 'seed must encounter a rank-up and an event');
      if (!sawEvent && state.phase === 'event') {
        await page.locator('[data-phase="event"] dialog').waitFor();
        await shot('event');
        sawEvent = true;
      }
      const id = pick(POLICIES.pilot, state, random);
      await (await revealOption(page, options(state).find(o => o.id === id))).click();
      await finishChoice(page, async rank => {
        if (!sawRank && await rank.getAttribute('data-kind') === 'up') {
          await shot('rank-card');
          sawRank = true;
        }
      });
      state = await readState();
    }
    if (state.phase === 'event') {
      await act(pick(POLICIES.pilot, state, random));
      state = await readState();
    }
    await page.locator('[data-action="grades"]').click();
    await page.locator('[data-grades="numbers"]').waitFor();
    await shot('grades-numbers');

    let finalChoice;
    while (state.phase !== 'ended') {
      const id = pick(POLICIES.pilot, state, random);
      const next = choose(state, id).state;
      if (next.phase === 'ended') {
        finalChoice = options(state).find(o => o.id === id);
        break;
      }
      state = next;
    }
    assert.ok(finalChoice);
    // This is exactly the JSON saveRun writes after the preceding choice.
    await page.evaluate(saved => localStorage.setItem('pilot-growup:run:v1', JSON.stringify(saved)), state);
    await page.reload();
    await page.locator('[data-action="continue-run"]').click();
    assert.deepEqual(await readState(), state);
    await (await revealOption(page, finalChoice)).click();
    await finishChoice(page);
    await page.locator('[data-screen="ending"]').waitFor();
    await shot('ending');
    await context.close();
  }
  console.log(`16 board screenshots in ${output}`);
} finally {
  await browser?.close();
  await new Promise(done => server.httpServer.close(done));
}
