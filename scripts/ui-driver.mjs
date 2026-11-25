// Shared helpers for the headless scripts that drive the real UI (playtest.mjs, layout-check.mjs).
// They rely only on the hooks in docs/ui-spec.md: data-option, data-pick, data-nav, data-tab, data-action.

const shown = (page, selector) => page.locator(`${selector}:visible`).first();
const has = async (locator) => (await locator.count()) > 0;

/** The names of the visible, enabled buttons carrying `attribute` (data-nav or data-tab), in DOM order. */
export const names = (page, attribute) => page.evaluate((attr) => [...document.querySelectorAll(`[${attr}]`)]
  .filter((b) => b.getClientRects().length && !b.disabled)
  .map((b) => b.getAttribute(attr)), attribute);

/** Walks the pager on screen from its first page. `each(pageIndex)` may return true to stop. */
export async function eachPage(page, each) {
  const prev = shown(page, '[data-action="page-prev"]:not([disabled])');
  for (let i = 0; i < 30 && (await has(prev)); i++) await prev.click();
  const next = shown(page, '[data-action="page-next"]:not([disabled])');
  for (let i = 0; i < 30; i++) {
    if ((await each(i)) === true) return true;
    if (!(await has(next))) return false;
    await next.click();
  }
  throw new Error('pager did not end after 30 pages');
}

/** Visits every tab, and every page inside it, of the view on screen. `each(tabName, pageIndex)` may return true to stop. */
export async function eachTabAndPage(page, each) {
  const tabs = await names(page, 'data-tab');
  if (!tabs.length) return eachPage(page, (i) => each('', i));
  for (const tab of tabs) {
    await shown(page, `[data-tab="${tab}"]`).click();
    if (await eachPage(page, (i) => each(tab, i))) return true;
  }
  return false;
}

/**
 * Brings the button that commits one option on screen the way a player would and returns it: looks at the
 * current view, then through its tabs and pages, then through the bottom navigation. A regular card commits directly. A
 * confirmation card opens its inline commit button first.
 */
export async function revealOption(page, option) {
  const target = shown(page, `[data-option="${option.id}"]`);
  const here = async () => {
    if (await has(target)) return true;
    const pick = shown(page, `[data-pick="${option.id}"]`);
    if (!(await has(pick))) return false;
    await pick.click();
    await target.waitFor({ state: 'visible', timeout: 3000 });
    return true;
  };
  if (await here()) return target;
  const back = shown(page, '[data-action="back-to-options"]:enabled');
  if (await has(back)) {
    await back.click();
    if (await here()) return target;
  }
  const nav = ['shop', 'repair'].includes(option.kind) ? 'shop' : option.kind === 'bank' ? 'bank' : 'home';
  const tab = page.locator(`[data-nav="${nav}"]:enabled`);
  if (await tab.count() && await tab.getAttribute('aria-pressed') !== 'true') await tab.click();
  const search = async () => (await here()) || (await eachTabAndPage(page, here));
  if (await search()) return target;
  for (const nav of await names(page, 'data-nav')) {
    await shown(page, `[data-nav="${nav}"]`).click();
    if (await search()) return target;
  }
  throw new Error(`option ${option.id} is offered by the engine but no button for it can be reached in the UI`);
}


/** The result owns the first continue. A career change can insert a second card before play resumes. */
export const stoppedResult = page => page.locator('[data-phase="result"] [data-spin="done"]');
export async function finishChoice(page, onRank) {
  await stoppedResult(page).locator('[data-action="continue"]:enabled').click();
  const rank = page.locator('[data-phase="rankup"] [data-rank-card]');
  const appeared = await rank.count() === 1;
  if (appeared) {
    if (onRank) await onRank(rank);
    await rank.locator('[data-action="continue"]').click();
  }
  return appeared;
}
