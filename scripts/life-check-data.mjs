// T20 harness settings; these are reading pauses/policy preferences, never game balance.
export const SIZES = [[390, 844], [360, 740], [1280, 800], [1366, 768]];
import { TIMING_SAMPLE } from './life-time-data.ts';
import { readCalibration } from './life-time-calibration.ts';
export { THINK_MS, LARGE_POPUPS } from './life-time-data.ts';
export const SEASONS = TIMING_SAMPLE.seasons;
export const MODEL_SECONDS = readCalibration().secondsPerSeason;
export const MAX_CHOICES_PER_SEASON = 64;
export const DESTINATION_PRIORITY = { rankup: 8, job: 7, train: 6, rest: 5, jobfair: 4,
  contest: 3, event: 2, pay: 1, start: 1 };
