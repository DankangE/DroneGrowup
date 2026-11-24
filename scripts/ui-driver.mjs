// Shared helpers for the headless scripts that drive the real UI (playtest.mjs, layout-check.mjs).
// They rely only on the hooks in docs/ui-spec.md: data-option, data-action, data-tab, data-screen.

const visible = (locator) => locator.filter({ visible: true });

/** Clicks through every page of the pager that is on screen now, calling `each` on every page (first included). */
export async function eachPage(page, each) {
  await page.locator('[data-action="page-first"]:visible').first().click({ timeout: 1000 }).catch(() => {});
  for (let i = 0; i < 30; i++) {
    if ((await each(i)) === true) return true;
    const next = visible(page.locator('[data-action="page-next"]:not([disabled])')).first();
    if (!(await next.count())) return false;
    await next.click();
  }
  throw new Error('pager did not end after 30 pages');
}

/** Visits every tab (and every page inside it) of the view on screen. `each(tabName, pageIndex)` may return true to stop. */
export async function eachTabAndPage(page, each) {
  const names = await page.evaluate(() => [...document.querySelectorAll('[data-tab]')]
    .filter((t) => t.getClientRects().length && !t.disabled)
    .map((t) => t.getAttribute('data-tab')));
  if (!names.length) return eachPage(page, (i) => each('', i));
  for (const name of names) {
    await visible(page.locator(`[data-tab="${name}"]`)).first().click();
    if (await eachPage(page, (i) => each(name, i))) return true;
  }
  return false;
}

/**
 * Brings the button of one option on screen the way a player would: looks in the current view, then opens the
 * services sheet (free options) or the full list, and walks the tabs and pages until the button shows.
 */
export async function revealOption(page, option) {
  const target = page.locator(`[data-option="${option.id}"]:visible`).first();
  const found = async () => (await target.count()) > 0;
  if (await found()) return target;
  if (await eachTabAndPage(page, found)) return target;
  for (const opener of option.free ? ['services', 'all'] : ['all', 'services']) {
    const button = visible(page.locator(`[data-action="${opener}"]`)).first();
    if (!(await button.count())) continue;
    await button.click();
    if ((await found()) || (await eachTabAndPage(page, found))) return target;
    await visible(page.locator('[data-action="close"]')).first().click({ timeout: 1000 }).catch(() => {});
  }
  throw new Error(`option ${option.id} is offered by the engine but no button for it can be reached in the UI`);
}
