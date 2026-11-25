// Capture the five balance views from the current dist/ build.
// npm run build && node scripts/balance-shots.mjs
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright-core';
import { newGame } from '../src/game/engine.ts';
import { revealOption } from './ui-driver.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = join(root, 'docs/screenshots/balance');
const student = newGame(7);
student.s.money = 160;
student.phase = 'event';
student.eventId = 'scholarship';

const pilot = newGame(7);
pilot.stage = 'pilot';
pilot.turn = 24;
pilot.flags.push('licensed');
Object.assign(pilot.s, { money: 650, debt: 200, stamina: 65, theory: 54, skill: 68, xp: 145, rep: 22,
  drone: 2, gear: 1, car: 1, cond: 77, flights: 12 });
const tiredPilot = stamina => ({ ...pilot, s: { ...pilot.s, stamina } });

const server = await preview({ root, configFile: join(root, 'vite.config.ts'), preview: { port: 5297, strictPort: false } });
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, channel: process.env.CHROME_PATH ? undefined : 'chrome' });
  await mkdir(out, { recursive: true });
  for (const [width, height] of [[390, 844], [1280, 800]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', deviceScaleFactor: 1, hasTouch: width < 600, locale: 'ko-KR' });
    const page = await context.newPage();
    await page.goto(server.resolvedUrls.local[0]);
    async function resume(state) {
      await page.evaluate(run => localStorage.setItem('pilot-growup:run:v1', JSON.stringify(run)), state);
      await page.reload();
      await page.locator('[data-action="continue-run"]').click();
      await page.locator('[data-screen="play"]').waitFor();
    }
    async function shot(view) {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(img => img.decode()));
      });
      await page.screenshot({ path: join(out, `${view}-${width}.png`) });
    }
    await resume(student);
    await page.locator('dialog[open] .answer').first().waitFor();
    await shot('contest-after');
    await resume(pilot);
    await shot('home');
    await page.locator('[data-nav="info"]').click();
    await shot('info');
    await resume(tiredPilot(30));
    await revealOption(page, { id: 'rest' });
    await page.locator('[data-option="rest"][data-rest="full"]').click();
    await page.locator('[data-season-change]').waitFor();
    await page.locator('.delta-chip', { hasText: '체력 +60' }).waitFor();
    await shot('rest-result');
    await resume(tiredPilot(8));
    await page.locator('[data-stamina="exhausted"]').waitFor();
    await page.locator('[data-tab="job"]').click();
    await revealOption(page, { id: 'job_spray' });
    await page.locator('.detail:has([data-option="job_spray"]) .lock-reasons, [data-option="job_spray"] .lock-reasons')
      .filter({ hasText: '체력 부족' }).waitFor();
    await shot('low-stamina');
    await context.close();
  }
  console.log(`10 screenshots in ${out}`);
} finally {
  await browser?.close();
  await new Promise(done => server.httpServer.close(done));
}
