// T21: eleven original busts. Clothing, silhouettes and tools distinguish jobs without lettering.
import type { TrackId } from '../life/types.ts';
import { path as p } from './art-svg.ts';
import type { ArtPath, VectorArt } from './art-svg.ts';

export const JOB_NAMES: Record<TrackId, string> = {
  service: '가게 직원', delivery: '배송 기사', mechanic: '드론 정비사', clerk: '사무직',
  pilot: '프리랜서 파일럿', employee: '드론 회사 직원', instructor: '드론 교관', public: '항공안전 공무원',
  rescue: '소방 드론 대원', creator: '드론 크리에이터', engineer: '드론 개발 엔지니어',
  inspector: '산업 점검 전문가', film: '항공 촬영 감독', atc: '드론 관제사', racer: '프로 드론 레이서',
  solo: '1인 사업자', company: '법인 대표', academy: '교육원 원장', director: '협회 임원',
};

const HAIR = {
  crop: 'M37 49q-7-29 14-32 14-13 33 3 14 7 7 34l-9-17-15-7-19 10-6 16Z',
  wave: 'M35 58q-17-14 1-27-2-20 20-16 19-16 32 5 17-1 12 19l-10 22-8-27q-22 13-38 2l-3 26Z',
  bob: 'M29 83 32 36Q34 11 62 12q29-4 34 26l5 45-20 8-4-46-34-2-2 48Z',
  tied: 'M88 32q27-14 18 20l-6 36-16-21 7-22ZM34 53q-9-32 17-38 34-13 42 20v23l-12-23-36 5-7 18Z',
  curls: 'M31 53q-14-6-4-19-8-15 9-17 2-15 18-9 14-14 25 0 19-4 20 14 18 9 4 23l-11 21-12-29-33 5-8 20Z',
  side: 'M33 55Q23 19 54 14q34-12 41 21l-7 26-8-29-33 12-9 18Z',
} as const;
type Portrait = { background: string; skin: string; hair: string; cut: keyof typeof HAIR;
  coat: string; shirt: string; details: readonly ArtPath[] };

function portrait(row: Portrait): VectorArt {
  return { viewBox: '0 0 128 128', paths: [
    p('M4 4h120v120H4Z', row.background, 'none'),
    p('M64 13a48 48 0 1 0 0 96 48 48 0 0 0 0-96Z', '#fff5e6', 'none'),
    p(HAIR[row.cut], row.hair),
    p('M16 124q0-35 36-38h24q36 3 36 38Z', row.coat),
    p('M53 72h22v16l-11 13-11-13Z', row.skin),
    p('M38 48q-8-5-7 7t9 8m48-15q8-5 7 7t-9 8', row.skin),
    p('M40 40q6-14 19-12 18-4 29 12l-2 22Q83 81 64 84 44 80 41 62Z', row.skin),
    // Hairline, brows, eyes and smile stay legible at 64px; no text or tiny hand details.
    p('M38 43 41 30l22-10 23 10 5 13-14-11q-14 15-27 8l-11 8Z', row.hair),
    p('M46 50q5-3 10 0m16 0q5-3 10 0', 'none', row.hair),
    p('M51 55v3m26-3v3', 'none', '#3b444b', 3),
    p('m64 57-2 8 4 1m-11 6q9 7 18-1', 'none', '#925e54', 2),
    p('M49 88 64 101 79 88l-6 36H55Z', row.shirt),
    p('M49 87 39 96l13 10-8 8 7 10m28-37 10 9-13 10 8 8-7 10'),
    ...row.details,
  ] };
}

const glasses = p('M44 53h15v10H44zM69 53h15v10H69zM59 57h10', 'none', '#536880');
const badge = p('M91 94h12v17H91zM94 98h6m-6 5h6', '#fff5df');
const clipboard = p('M82 85h27v35H82zM89 82h13v7H89zM88 98h15m-15 7h15m-15 7h10', '#efbd68');
const headset = [p('M34 55V40q1-29 30-29 30 0 30 29v24', 'none', '#536880', 4),
  p('M29 48h10v19H29zM89 48h10v19H89zM94 67q0 10-20 10', '#8099a7')];

export const NEW_JOB_PORTRAITS = {
  service: portrait({ background: '#eadbc4', skin: '#efc09a', hair: '#4e3f39', cut: 'tied',
    coat: '#e5b36c', shirt: '#fff5df', details: [
      p('M43 94h40v30H43zM46 93l-5-10m39 10 6-10', '#6e9f8e'),
      p('M51 105h24v13H51Z', '#cfe3d0'), badge,
    ] }),
  delivery: portrait({ background: '#d4e9e2', skin: '#cc966f', hair: '#393b42', cut: 'crop',
    coat: '#7095aa', shirt: '#fff5df', details: [
      p('M35 33q4-25 29-23 27-1 29 23ZM28 33h69v7H28Z', '#7095aa'),
      p('M76 91h38v29H76zM76 91l19 9 19-9m-19 9v20', '#e3b978'),
      p('M54 89v35', 'none', '#fff5df', 4),
    ] }),
  clerk: portrait({ background: '#e4ddf1', skin: '#f2cab2', hair: '#51464b', cut: 'bob',
    coat: '#7f829e', shirt: '#fff5df', details: [glasses,
      p('M84 94h30v28H84zM89 99h20m-20 6h20m-20 6h14', '#d8e8e6'),
      p('m59 99 5 6 5-6-5 21Z', '#c890aa'),
    ] }),
  public: portrait({ background: '#d6e3ef', skin: '#ddb08c', hair: '#45464d', cut: 'side',
    coat: '#68819a', shirt: '#fff5df', details: [
      p('m59 99 5 6 5-6-5 21Z', '#dbb66c'), badge,
      p('M23 98h21v24H23zM28 104h11m-11 6h11', '#b6cfd0'),
    ] }),
  rescue: portrait({ background: '#f0ded0', skin: '#bd8868', hair: '#373e3e', cut: 'crop',
    coat: '#d88664', shirt: '#5e777c', details: [
      p('M32 36q0-26 32-26t32 26ZM26 36h76v7H26Z', '#efbd68'),
      p('M60 13h8v22h-8Z', '#fff5df'),
      p('M30 99h17v25H30zM81 99h17v25H81Z', '#efda90'),
      p('M88 93h17v24H88zM94 93V79m0 20h5m-5 5h5', '#536880'),
    ] }),
  creator: portrait({ background: '#f0dbea', skin: '#edbc9a', hair: '#735361', cut: 'curls',
    coat: '#b793bf', shirt: '#fff5df', details: [
      p('M38 87q2 23 26 26 24-3 26-26l-10 4q-2 16-16 15-14 1-16-15Z', '#dfc5dd'),
      p('M88 84h20v32H88zM93 89h10v19H93zM98 116v8', '#8099a7'),
      p('m59 118 5-6 5 6', 'none', '#fff5df'),
    ] }),
  engineer: portrait({ background: '#d3e8e5', skin: '#deb395', hair: '#41494b', cut: 'wave',
    coat: '#eef0df', shirt: '#71a397', details: [glasses,
      p('M81 91h32v29H81zM89 99h16v13H89zM85 95h4m16 0h4m-24 21h4m16 0h4', '#71a397'),
      p('M29 99h14v19H29zM33 99V90m6 9V87', '#c6dddf'),
    ] }),
  inspector: portrait({ background: '#dce5ce', skin: '#c69779', hair: '#575557', cut: 'tied',
    coat: '#8d9e80', shirt: '#fff5df', details: [
      p('M32 35q0-26 32-26t32 26ZM27 35h74v7H27Z', '#fff5df'),
      p('M60 11h8v23h-8Z', '#efbd68'),
      p('M30 94h12v30H30zM86 94h12v30H86Z', '#efda90'), clipboard,
    ] }),
  film: portrait({ background: '#e3dde9', skin: '#edbfa5', hair: '#4c4245', cut: 'side',
    coat: '#6d8290', shirt: '#e2bd89', details: [
      p('M32 25q19-21 54-9l5 15-53 5ZM27 34l68-8 5 8-71 7Z', '#586775'),
      p('M21 87 78 124', 'none', '#d6b58d', 8),
      p('M77 90h26v28H77zM103 98l12-5v23l-12-5', '#536880'),
      p('M88 96a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z', '#b5dfeb'),
    ] }),
  atc: portrait({ background: '#d6e6ee', skin: '#efcbb4', hair: '#4a434b', cut: 'bob',
    coat: '#93b6c6', shirt: '#fff5df', details: [...headset,
      p('M28 91h17v5H28zM83 91h17v5H83Z', '#536880'), badge,
      p('m59 99 5 6 5-6-5 21Z', '#536880'),
    ] }),
  racer: portrait({ background: '#f0e1bd', skin: '#d5a07c', hair: '#594944', cut: 'wave',
    coat: '#cc846e', shirt: '#536880', details: [
      p('M31 28h66v17H31zM37 31h23v10H37zM68 31h23v10H68z', '#536880'),
      p('M39 33h18v6H39zM71 33h17v6H71Z', '#b5dfeb'),
      p('M28 98h18v8H28zM28 114h18v8H28zM46 106h12v8H46Z', '#fff5df'),
      p('M84 94h25l6 15-10 13H87l-9-13Zm1 9h23v7H85Z', '#efbd68'),
    ] }),
} satisfies Partial<Record<TrackId, VectorArt>>;
