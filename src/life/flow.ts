/** Interactive flow closes empty bonus menus in the same engine transaction.
 * engine.choose remains the single-step API for bots, simulations and rule tests.
 * Both modes share play(), so costs, hooks, RNG and previews have one implementation.
 */
import { choose as step, forecast as preview, options as choices } from './engine.ts';
import type { GameState } from './types.ts';
export * from './engine.ts';
export const choose = (state: GameState, id: string, menu: 'board' | 'phone' = 'board', singleDie = false) =>
  step(state, id, menu, singleDie, menu === 'board');
export const forecast = (state: GameState, id: string, menu: 'board' | 'phone' = 'board') =>
  preview(state, id, menu, menu === 'board');
export const options = (state: GameState, menu: 'board' | 'phone' = 'board') => choices(state, menu, true);
