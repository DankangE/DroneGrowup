import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAP_IDS } from '../src/life/life-data.ts';
import { TIMING_SAMPLE } from './life-time-data.ts';

export type TimingSample = { map: string; measured: number[]; modeled: number[] };
export type TimingMeasurement = { fingerprint: string; measuredAt: string; viewport: string; seed: number;
  samples: TimingSample[] };
const root = new URL('../', import.meta.url);
export const TIMING_REPORT = fileURLToPath(new URL('../docs/life-timing.json', import.meta.url));
// Reject old UI/engine/driver measurements automatically, including changed constants.
function sourceFiles(dir: string): string[] {
  return readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? sourceFiles(`${dir}${entry.name}/`) : /\.(ts|css)$/.test(entry.name) ? [`${dir}${entry.name}`] : []);
}
const sources = [...sourceFiles('src/'), ...['life-time-data.ts', 'life-time-model.ts', 'life-time-calibration.ts',
  'life-check-data.mjs', 'life-ui-driver.mjs', 'board-life-check.mjs', 'layout-check-life.mjs'].map(name => `scripts/${name}`)];
export const TIMING_FINGERPRINT = createHash('sha256').update(sources.sort()
  .map(path => `${path}\n${readFileSync(new URL(path, root), 'utf8')}`).join('\n')).digest('hex');

export function calibration(raw: unknown, fingerprint = TIMING_FINGERPRINT) {
  const missing = { factor: null, secondsPerSeason: null, detail: 'T24 실측 미확인: check:board timed 필요' };
  if (!raw || typeof raw !== 'object') return missing;
  const data = raw as TimingMeasurement;
  const positive = (values: unknown): values is number[] => Array.isArray(values)
    && values.length === TIMING_SAMPLE.seasons && values.every(n => typeof n === 'number' && Number.isFinite(n) && n > 0);
  if (data.fingerprint !== fingerprint || data.viewport !== TIMING_SAMPLE.viewport || data.seed !== TIMING_SAMPLE.seed
    || !Number.isFinite(Date.parse(data.measuredAt)) || !Array.isArray(data.samples) || data.samples.length !== MAP_IDS.length
    || !MAP_IDS.every(map => data.samples.filter(row => row?.map === map && positive(row.measured) && positive(row.modeled)).length === 1)) return missing;
  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const measured = sum(data.samples.flatMap(row => row.measured)), modeled = sum(data.samples.flatMap(row => row.modeled));
  return { factor: measured / modeled, secondsPerSeason: measured / (MAP_IDS.length * TIMING_SAMPLE.seasons),
    detail: `T24 ${data.measuredAt}; ${data.viewport}; 6×12계절; 실측/모형 ${(measured / modeled).toFixed(4)}` };
}
export function readCalibration() {
  try { return calibration(JSON.parse(readFileSync(TIMING_REPORT, 'utf8'))); }
  catch { return calibration(null); }
}
