export { ENDINGS2 } from '../../life/life-data.ts';
export type { EndingDef as EndingCopy } from '../../life/life-data.ts';

export const ENDING_COPY = {
  title: '인생 결산', gallery: '엔딩 모음', restart: '새 인생', home: '타이틀',
  discovered: '발견', locked: '미발견', unknown: '아직 엔딩이 없습니다.',
  score: (score: number) => `최종 점수 ${score}`,
  grade: (grade: string) => `최종 성적 ${grade}`,
  feats: (score: number) => `업적 점수 ${score}`,
  best: (score: number) => `최고 점수 ${score}`,
  count: (count: number, total: number) => `발견한 엔딩 ${count} / ${total}`,
} as const;

export const ENDING_STYLE = `
.life2 .life2-ending-screen { box-sizing:border-box; width:100%; height:100%; max-width:800px; margin:auto;
  display:grid; grid-template-rows:44px minmax(0,1fr) 44px; gap:12px; padding:12px;
  background:#fff6e0; color:#2b2440; font:600 13px/20px system-ui,sans-serif; }
.life2 .life2-ending-screen * { box-sizing:border-box; min-width:0; }
.life2 .life2-ending-screen h1 { font-size:20px; margin:0; }
.life2 .life2-ending-screen h2 { font-size:18px; margin:0; overflow-wrap:anywhere; }
.life2 .life2-ending-screen p { margin:0; overflow-wrap:anywhere; white-space:pre-wrap; }
.life2 .life2-ending-screen button { min-width:44px; min-height:44px; padding:6px;
  font:700 12px/18px system-ui,sans-serif; border:1px solid #80758b; border-radius:8px; color:inherit; background:#fff9eb; }
.life2 .life2-ending-screen button:focus-visible { outline:3px solid #6036b6; outline-offset:-3px; }
.life2 .life2-ending-content { display:grid; align-content:center; gap:12px; }
.life2 .life2-ending-art { display:flex; justify-content:center; }
.life2 .life2-ending-art img,.life2 .life2-ending-art svg { width:96px; height:96px; object-fit:contain; }
.life2 .life2-ending-copy { display:grid; gap:8px; }
.life2 .life2-ending-copy p { min-height:60px; }
.life2 .life2-ending-controls,.life2 .life2-ending-pager { display:flex; align-items:center; gap:8px; }
.life2 .life2-ending-controls button,.life2 .life2-ending-pager button { flex:1; }
.life2 .life2-ending-cards { display:grid; gap:8px; }
.life2 .life2-ending-card { text-align:left; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; }
`;
