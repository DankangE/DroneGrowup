// T21: original small dioramas. Shared parts keep the new districts in one drawing style.
import type { PlaceId as V1PlaceId } from '../game/types.ts';
import type { PlaceId } from '../life/types.ts';
import { path as p } from './art-svg.ts';
import type { ArtPath, VectorArt } from './art-svg.ts';

type Parts = readonly ArtPath[];
const C = { cream: '#fff5df', gold: '#efbd68', glass: '#b5dfeb', leaf: '#6a9a79',
  mint: '#dce9c9', city: '#dedbf0', field: '#e6d4b5', lab: '#cce6ee', port: '#c8e4df', beach: '#f4e1b5' };
const windows = p('M34 47h12v13H34zM57 47h12v13H57zM80 47h12v13H80z', C.glass);
const tree: Parts = [p('M103 74v24'), p('M103 50c-19 0-19 28 0 28s19-28 0-28Z', C.leaf)];
const bench: Parts = [p('M20 87h28v7H20zM24 94v7m20-7v7', C.gold)];
const water = p('M9 88q14-10 28 0t28 0 28 0 26 0v17H9Z', C.glass);
const book = p('M47 62q9-5 17 0 8-5 17 0v18q-9-5-17 0-8-5-17 0Zm17 0v18', C.cream);
const key = p('M63 60a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm7 7h18m-5 0v6m-7-6v4', C.gold);
const heart = p('M64 78 51 65c-9-12 8-20 13-9 5-11 22-3 13 9Z', '#ecaaab');
const bag = p('M52 59h24l3 24H49Zm6 0v-5a6 6 0 0 1 12 0v5', C.gold);
const crate = p('M75 77h23v22H75zM75 77l23 22m0-22L75 99', C.gold);
const screen = p('M47 55h35v24H47zM64 79v6m-10 0h20', C.glass);
const chart = p('M47 79V56m0 23h36M53 72l9-7 8 3 12-13m-8 0h8v8');
const shield = p('M64 53 80 59v13q-3 12-16 18-13-6-16-18V59Zm-8 16 6 6 11-13', C.gold);
const cross = p('M59 52h10v11h11v10H69v11H59V73H48V63h11Z', '#ecaaab');
const drone: Parts = [p('M48 60 78 82m0-22L48 82M55 65h16v13H55z', C.cream),
  p('M46 53a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM80 53a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM46 75a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM80 75a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z', C.gold)];
const camera: Parts = [p('M46 60h28v21H46zM74 65l13-7v26l-13-7M53 60v-6h14v6', '#8099a7'),
  p('M59 65a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z', C.glass)];
const antenna: Parts = [p('M94 24v25m-7 0h14M85 19q-7 9 0 18m18-18q7 9 0 18'),
  p('M94 23a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', C.gold)];
const fountain: Parts = [p('M36 81q28-14 56 0v8q-28 17-56 0Z', C.glass),
  p('M64 80V49m-18 7q18-24 36 0M64 65q-13-18-22-5m22 5q13-18 22-5')];

function tile(ground: string, parts: Parts): VectorArt {
  return { viewBox: '0 0 128 128', paths: [
    p('M8 22Q8 16 14 16h100q6 0 6 6v84q0 6-6 6H14q-6 0-6-6Z', '#b9b5a3'),
    p('M8 18q0-6 6-6h100q6 0 6 6v82q0 6-6 6H14q-6 0-6-6Z', ground),
    p('M12 97h104', 'none', '#fff5df', 4), ...parts,
  ] };
}
function hall(ground: string, roof: string, details: Parts = []): VectorArt {
  return tile(ground, [p('M25 40h78v52H25Z', C.cream), p('M20 40 33 24h62l14 16Z', roof),
    windows, p('M54 73h20v19H54Z', C.glass), ...details]);
}
function store(ground: string, roof: string, details: Parts): VectorArt {
  return tile(ground, [p('M24 43h80v50H24Z', C.cream),
    p('M21 43 28 28h72l7 15v7q-8 10-17 0-9 10-18 0-8 10-17 0-9 10-17 0-9 10-17 0Z', roof),
    p('M38 29v15m17-15v15m17-15v15m18-15v15'), ...details]);
}
function homes(ground: string, roof: string, details: Parts = []): VectorArt {
  return tile(ground, [p('M20 49h50v43H20zM74 37h33v55H74Z', C.cream),
    p('M16 49 45 28l29 21ZM70 37l21-17 20 17Z', roof),
    p('M27 59h13v13H27zM51 59h12v13H51zM82 47h15v12H82zM82 67h15v12H82Z', C.glass),
    p('M43 77h12v15H43Z', C.gold), ...details]);
}
function terminal(ground: string, roof: string, details: Parts = []): VectorArt {
  return tile(ground, [p('M25 37h78v39H25Z', C.cream), p('M20 37 30 23h68l10 14Z', roof),
    p('M34 44h60v20H34Z', C.glass), p('M23 85h83m-83 8h83M34 81v16m18-16v16m18-16v16m18-16v16'),
    ...details]);
}
function tower(ground: string, roof: string, details: Parts = []): VectorArt {
  return tile(ground, [p('M29 29h45v65H29zM74 48h29v46H74Z', C.cream),
    p('M25 29 33 19h37l8 10Zm49 19 7-10h19l7 10Z', roof),
    p('M38 38h10v13H38zM57 38h10v13H57zM38 61h10v13H38zM57 61h10v13H57zM82 58h13v15H82Z', C.glass),
    ...details]);
}

// All 71 places added by v2, with explicit art choices; no runtime fallback to a generic location.
export const NEW_PLACE_TILES = {
  village_hall: hall(C.mint, C.leaf, [p('M59 28h10v9H59Z', C.gold), ...bench]),
  library: hall(C.mint, '#9d8abc', [book]),
  park: tile(C.mint, [water, ...tree, ...bench]),
  bus_terminal: terminal(C.mint, C.leaf, [p('M40 50h45v24H40zM46 55h33v9H46z', C.gold)]),
  job_center: hall(C.mint, C.gold, [p('M49 62h30v18H49zM57 62v-7h14v7', '#91bbaa')]),
  estate: store(C.mint, C.leaf, [key]),
  city_hall: hall(C.city, '#9d8abc', [p('M34 46v41m14-41v41m32-41v41m14-41v41'), ...bench]),
  estate_street: homes(C.city, '#9d8abc', [key]),
  downtown: tower(C.city, '#b595c0', [bag]),
  wedding: hall(C.city, '#e5a9b0', [heart, ...tree]),
  station: terminal(C.city, '#8099b2', [p('M59 23a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 3v4l4 2', C.cream)]),
  broadcast_station: tower(C.city, '#8fa2c5', [...antenna, ...camera]),
  department_store: tower(C.city, '#c890aa', [bag, ...bench]),
  jobfair: hall(C.city, '#c695b6', [p('M44 59h17v23H44zM70 59h17v23H70z', C.gold)]),
  mall: store(C.city, '#9d8abc', [bag, ...bench]),
  apartment: homes(C.city, '#8fa2c5', [...tree]),
  lottery: store(C.city, C.gold, [p('m64 55 5 9 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2Z', '#e5a9b0')]),
  airport: terminal(C.city, '#8fa2c5', [p('m64 42 5 16 20 9v5l-20-5v9l5 5H54l5-5v-9l-20 5v-5l20-9Z', C.cream)]),
  hospital: hall(C.city, '#83b8ac', [cross]),
  convention: hall(C.city, '#b595c0', [p('M44 56h40v26H44Z', C.glass), ...bench]),
  city_park: tile(C.city, [...fountain, ...tree, ...bench]),
  culture: store(C.city, '#e5a9b0', [p('M65 52v24m0-24 16-4v22M65 73q-15-5-15 4t15-1m16-9q-15-5-15 4t15-1', C.gold)]),
  field_office: hall(C.field, '#b68b66', [screen, crate]),
  maintenance_base: hall(C.field, '#88a297', [...drone, crate]),
  dorm: homes(C.field, '#b68b66', [...bench]),
  safety_center: hall(C.field, C.gold, [shield]),
  freight_station: terminal(C.field, '#b68b66', [crate]),
  warehouse: hall(C.field, '#88a297', [p('M42 56h43v36H42zM42 66h43M42 77h43', '#b5c5bd'), crate]),
  test_shuttle: terminal(C.field, '#83b8ac', [...drone]),
  fire_base: hall(C.field, '#dc927f', [p('M64 53q-6 15-14 22c-10 17 34 21 30-1-6 8-8-9-16-21Z', C.gold)]),
  logistics: hall(C.field, '#7d9ba6', [p('M35 66h29v21H35zM64 72h17l8 10v5H64Z', C.gold), crate]),
  company_housing: homes(C.field, '#88a297', [...tree]),
  gate: tile(C.lab, [p('M22 35h19v60H22zM87 35h19v60H87zM19 35V22h90v13Z', C.cream),
    p('M41 43h46v9H41Z', C.glass), ...drone]),
  lab: hall(C.lab, '#7d9ba6', [p('M58 54h12m-9 0v14L49 85h30L67 68V54M55 77h18', C.glass)]),
  cert_center: hall(C.lab, '#8fa2c5', [shield, ...bench]),
  grad_school: tower(C.lab, '#7d9ba6', [book]),
  test_airfield: tile(C.lab, [p('M33 22h62v74H33Z', '#91a3ab'),
    p('M64 27v10m0 12v10m0 12v10m0 8v6', 'none', C.cream, 3), ...drone]),
  raceway: tile(C.lab, [p('M35 28h58q15 0 15 16v33q0 16-15 16H35q-15 0-15-16V44q0-16 15-16Z', '#91a3ab'),
    p('M39 41h50q6 0 6 6v27q0 6-6 6H39q-6 0-6-6V47q0-6 6-6Z', C.mint),
    p('M21 55h12v11H21zM21 77h12v11H21Z', C.cream), ...drone]),
  zone_shuttle: terminal(C.lab, '#8fa2c5', [shield]),
  startup_hub: hall(C.lab, '#83b8ac', [screen, ...antenna]),
  pro_shop: store(C.lab, '#7d9ba6', [...drone]),
  research_housing: homes(C.lab, '#8fa2c5', [...tree]),
  newtown_square: tile(C.port, [...fountain, ...bench]),
  waterfront_mall: store(C.port, '#83b8ac', [bag, water]),
  startup_tower: tower(C.port, '#83b8ac', [screen]),
  securities: tower(C.port, '#7d9ba6', [chart]),
  sales_office: hall(C.port, '#83b8ac', [key]),
  port: tile(C.port, [water, p('M25 86V24h62v8H33m49 0v24m-4 0h8v8h-8', C.gold), crate]),
  business_school: hall(C.port, '#7d9ba6', [book, chart]),
  observatory: tile(C.port, [p('M44 91 51 58h26l7 33Zm-9-49q29-32 58 0v16H35Z', C.cream),
    p('M64 25v33M35 43h58', 'none', '#7d9ba6', 3), ...tree]),
  newtown_station: terminal(C.port, '#83b8ac', [...tree]),
  residence: tower(C.port, C.gold, [...tree]),
  ferry: tile(C.port, [water, p('M24 70h81L92 89H38ZM42 49h45v21H42Z', C.cream),
    p('M49 54h30v9H49zM54 49V38h16v11', C.glass)]),
  invest_hall: hall(C.port, C.gold, [chart, ...bench]),
  waterfront_park: tile(C.port, [...tree, ...bench, water]),
  duty_free: store(C.port, C.gold, [bag, crate]),
  beach_square: tile(C.beach, [...fountain, water]),
  promenade: tile(C.beach, [water, ...bench, p('M86 89V35m0 0q-18-22-28-4m28 4q20-22 27-4m-27 4q-20-1-24 15m24-15q22 0 26 14', 'none', C.leaf, 4)]),
  resort: homes(C.beach, '#df9d7a', [water, ...tree]),
  beach_studio: tile(C.beach, [water, ...camera, p('M57 82 46 98m17-16 11 16M26 30v38m0-33 15 7-15 8', C.gold)]),
  country_homes: homes(C.beach, C.leaf, [...bench]),
  care_hospital: hall(C.beach, '#83b8ac', [cross, ...tree]),
  culture_center: hall(C.beach, '#df9d7a', [book, ...bench]),
  marina: tile(C.beach, [water, p('M29 81h68L85 94H42ZM62 25v56M58 32 35 73h23Zm9 10v31h22Z', C.cream)]),
  lighthouse: tile(C.beach, [water, p('M47 88 53 38h22l6 50ZM48 38V25h32v13ZM46 25l18-12 18 12Z', C.cream),
    p('M51 53h26v13H51Z', '#dc927f'), p('M56 29h16v6H56Z', C.gold)]),
  spa: tile(C.beach, [p('M26 73q38-30 76 0v14q-38 24-76 0Z', '#b5c5bd'),
    p('M34 73q30-20 60 0-30 20-60 0Z', C.glass), p('M45 57q-8-8 0-16t0-16m19 28q-8-8 0-16t0-16m19 36q-8-8 0-16t0-16')]),
  pension: homes(C.beach, '#df9d7a', [bag]),
  resort_station: terminal(C.beach, '#df9d7a', [...bench]),
  credit_union: hall(C.beach, C.leaf, [p('M64 55a15 15 0 1 0 0 30 15 15 0 0 0 0-30Zm-9 11 4 10 5-8 5 8 4-10', C.gold)]),
  golf: tile(C.beach, [p('M34 31q47-26 62 8 18 31-21 52-60 8-53-22Z', '#a9c98a'),
    p('M65 81V28l21 11-21 11', '#dc927f'), p('M40 81a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z', C.cream)]),
  festival: tile(C.beach, [p('M25 92V58h78v34ZM19 58l45-36 45 36Z', '#e5a9b0'),
    p('M53 70h22v22H53Z', C.gold), p('M17 19q47 20 94 0m-80 5 7 13 7-10m12 2 7 13 7-13m12-2 7 10 7-13')]),
} satisfies Record<Exclude<PlaceId, V1PlaceId>, VectorArt>;
