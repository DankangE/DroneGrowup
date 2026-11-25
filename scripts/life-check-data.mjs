// T20 harness settings; these are reading pauses/policy preferences, never game balance.
export const SIZES = [[390, 844], [360, 740], [1280, 800], [1366, 768]];
export const SEASONS = 12;
export const MODEL_SECONDS = 14.9;
export const MAX_CHOICES_PER_SEASON = 64;
// §2: 0.8s deliberation + the real 0.7s wheel = 1.5s. Movement is awaited separately.
export const THINK_MS = { spin: 800, pick: 3000, space: 4000, bonus: 3500,
  event: 6000, result: 2400, large: 8000 };
export const LARGE_POPUPS = ['job', 'estate', 'wedding', 'education', 'biz', 'fund',
  'transfer', 'review', 'year-end', 'chapter', 'retirement'];
export const DESTINATION_PRIORITY = { rankup: 8, job: 7, train: 6, rest: 5, jobfair: 4,
  contest: 3, event: 2, pay: 1, start: 1 };
