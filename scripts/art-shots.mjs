// Screenshots of every scene in the running game, for looking at the art in place.
// Bots play runs in Node until each scene has a state that can show it; the page then opens that run,
// picks the place on the map and switches back to the field view.
//
//   node scripts/art-shots.mjs docs/screenshots/art-final      (uses the build in dist/, run `npm run build` first)
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright-core';
import { POLICIES, botRandom, pick } from '../src/game/bots.ts';
import { PLACES } from '../src/game/data.ts';
import { choose, newGame, options } from '../src/game/engine.ts';
import { SCENE_IDS, STAGE_PLACE, sceneId } from '../src/ui/art.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.argv[2] ?? 'docs/screenshots/art-final');
const RUN_KEY = 'pilot-growup:run:v1';
mkdirSync(out, { recursive: true });

// scene -> { state, place }; a state whose home place already shows the scene is preferred (no map trip)
const found = new Map();
for (const policy of Object.keys(POLICIES)) {
  for (let seed = 1; seed <= 12 && found.size < SCENE_IDS.length; seed++) {
    let state = newGame(seed);
    const rand = botRandom(seed);
    while (state.phase !== 'ended') {
      const offered = options(state);
      if (state.phase === 'action') {
        const home = STAGE_PLACE[state.stage];
        for (const place of [home, ...offered.map((o) => o.place)]) {
          const scene = sceneId(place, state);
          if (!found.has(scene)) found.set(scene, { state, place, home: place === home });
        }
      }
      state = choose(state, pick(POLICIES[policy], state, rand)).state;
    }
  }
}

const server = await preview({ root, configFile: join(root, 'vite.config.ts'), preview: { port: 5297, strictPort: false } });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, channel: process.env.CHROME_PATH ? undefined : 'chrome' });
const missing = SCENE_IDS.filter((id) => !found.has(id));
try {
  for (const [width, height] of [[390, 844], [1280, 800]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', deviceScaleFactor: 1, hasTouch: width < 600, locale: 'ko-KR' });
    const page = await context.newPage();
    for (const [scene, { state, place, home }] of found) {
      await page.goto(`${base}?debug=1`);
      await page.evaluate(([key, run]) => { localStorage.clear(); localStorage.setItem(key, JSON.stringify(run)); }, [RUN_KEY, state]);
      await page.reload();
      await page.locator('[data-action="continue-run"]').click();
      await page.locator('[data-screen="play"]').waitFor();
      if (!home) {
        await page.locator('.stage-toggle button', { hasText: '지도' }).click();
        await page.locator(`.map-place.available[aria-label="${PLACES[place].name} 선택지 보기"]`).click();
        await page.locator('.stage-toggle button', { hasText: '현장' }).click();
      }
      const shown = await page.locator('.scene img').evaluate((img) => img.decode().then(() => img.currentSrc));
      if (!shown.endsWith(`scene-${scene}.webp`)) throw new Error(`${scene}: the stage shows ${shown}`);
      await page.screenshot({ path: join(out, `${width}x${height}-scene-${scene}.png`) });
    }
    await context.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`scene screenshots: ${found.size} scenes at 2 sizes in ${out}`);
if (missing.length) {
  console.error(`no bot run reaches: ${missing.join(', ')}`);
  process.exit(1);
}
