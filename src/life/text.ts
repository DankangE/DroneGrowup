/** Korean name inflection shared by data copy and the UI; no game rules live here. */
export type Particle = '을/를' | '으로/로' | '은/는' | '이/가' | '과/와';
export function josa(name: string, pair: Particle): string {
  const last = name.trimEnd().at(-1) ?? '';
  const code = last.charCodeAt(0) - 0xac00;
  const batchim = code >= 0 && code < 11172 ? code % 28 : 0;
  const [closed, open] = pair.split('/');
  return name + (batchim && !(pair === '으로/로' && batchim === 8) ? closed : open);
}
