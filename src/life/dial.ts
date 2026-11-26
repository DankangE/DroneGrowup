import { DIAL_SETTINGS, LIFE_RULES } from './life-data.ts';
import type { DialNotch } from './life-data.ts';
export type DialTicks = { success: number; fail: number; crash: number };
export const baseOptionId = (id: string): string => id.split('@')[0];
export function dialNotch(id: string): DialNotch | undefined {
  const parts = id.split('@');
  return parts.length === 1 ? 'mid' : parts.length === 2 ? DIAL_SETTINGS.find(row => row.id === parts[1])?.id : undefined;
}
export function dialTicks(chance: number, crashPct: number): DialTicks {
  const crash = Math.floor(((LIFE_RULES.percent - chance) * crashPct + LIFE_RULES.percent / 2) / LIFE_RULES.percent);
  return { success: chance, fail: LIFE_RULES.percent - chance - crash, crash };
}
