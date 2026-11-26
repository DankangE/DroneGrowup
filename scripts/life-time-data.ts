// Human reading/deliberation pauses, shared by the timed UI driver and simulation.
// Presentation durations are imported from the UI; these are not balance knobs.
export const THINK_MS = { spin: 800, pick: 3000, space: 4000, bonus: 3500,
  event: 6000, result: 2400, large: 8000 } as const;
export const LARGE_POPUPS: readonly string[] = ['job', 'estate', 'wedding', 'education', 'biz', 'fund',
  'transfer', 'review', 'year-end', 'chapter', 'retirement'];
export const TIMING_SAMPLE = { seasons: 12, seed: 11, viewport: '1366x768' } as const;
