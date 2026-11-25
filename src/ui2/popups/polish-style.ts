import { POLISH as P } from './polish-data.ts';
export const POLISH_STYLE = `
.life2 .life2-popup { height:min(407px,55dvh); background:#fff6e0; opacity:1; font-size:14px; line-height:20px; }
.life2 .life2-popup[data-compact]:not([data-reading]):not([data-details]):not([data-stage]) { grid-template-rows:44px 60px minmax(50px,1fr) 44px; }
.life2 .life2-popup h2 { font-size:18px; line-height:22px; }
.life2 .life2-popup-copy p { font-size:14px; line-height:20px; }
.life2 .life2-popup-choice strong { font-size:14px; line-height:18px; }
.life2 .life2-popup-choice small { font-size:12px; line-height:16px; }
.life2 .life2-popup-row { min-height:50px; }
.life2 .life2-popup[data-notification] { height:280px; }
.life2 .life2-popup[data-stage] { height:min(407px,55dvh); grid-template-rows:44px auto minmax(0,1fr); }
.life2 .life2-popup[data-popup=my-life] { background:#fff6e0; backdrop-filter:none; }
.life2 .life2-labelled-rows { margin:0; display:grid; gap:6px; width:100%; }
.life2 .life2-labelled-row { padding:7px 9px; border:1px solid #d8cebb; border-radius:8px; background:#fffdf5; }
.life2 .life2-labelled-row dt { color:#5b536b; font-size:11px; line-height:15px; }
.life2 .life2-labelled-row dd { margin:0; font-size:14px; line-height:20px; overflow-wrap:anywhere; }
.life2 .life2-popup-copy:has(.life2-labelled-rows) { align-items:center; }
.life2 .life2-popup[data-card] { height:auto; max-height:none; grid-template-rows:44px auto minmax(0,1fr) auto 44px;
  align-content:stretch; gap:10px; padding:16px max(16px,calc((100vw - 650px)/2)); background:#fff6e0; }
.life2 .life2-popup[data-card][data-reading] { grid-template-rows:44px auto minmax(0,1fr) 44px; }
.life2 .life2-popup[data-card][data-popup=rankup] { background:#f1f5de; border-color:#4d7163; }
.life2 .life2-popup[data-card][data-popup=demotion] { background:#f2e6e5; border-color:#955b60; }
.life2 .life2-popup[data-card][data-popup=demotion] .life2-card-heading strong { color:#84464d; }
.life2 .life2-card-hero { display:grid; gap:12px; }
.life2 .life2-card-heading { display:flex; gap:18px; align-items:center; position:relative; }
.life2 .life2-card-heading > img,.life2 .life2-card-heading > svg { width:112px; height:112px; object-fit:contain; flex:none; }
.life2 .life2-card-heading strong { font-size:30px; line-height:36px; }
.life2 .life2-card-heading .life2-rank-rays { position:absolute; right:0; width:90px; height:90px; opacity:.35; pointer-events:none; }
.life2 .life2-stage-banner { padding:10px 14px; border-radius:12px; background:#d9eeeb; }
.life2 .life2-stage-banner > div:first-child { display:flex; justify-content:space-between; gap:8px; }
.life2 .life2-stage-banner strong { font-size:18px; }
.life2 .life2-stage-banner span { font-size:12px; }
.life2 .life2-stage-track { margin:8px 0 0; height:32px; border-radius:10px; background:transparent; }
.life2 .life2-stage-progress { position:relative; width:100%; height:32px; background:linear-gradient(to right,#377b76 var(--progress),#b6cdc9 var(--progress)) center/100% 6px no-repeat; border-radius:10px; }
.life2 .life2-stage-drone { position:absolute; left:clamp(0px,var(--progress),calc(100% - 32px)); top:0; width:32px; height:32px; }
.life2 [data-motion=rankup][data-animating] .life2-card-heading { animation:life2-rank-burst ${P.rankMs}ms ease-out; }
.life2 [data-motion=demotion][data-animating] .life2-card-heading { animation:life2-rank-drop ${P.rankMs}ms ease-out; }
.life2 [data-animating] .life2-stage-drone { animation:life2-drone-arrival ${P.rankMs}ms ease-out; }
.life2 [data-changed-stat] { animation:life2-stat-glow ${P.glowMs}ms ease-out; border-radius:6px; }
.life2 .life2-hud [data-changed-stat] { position:relative; }
.life2 .life2-stat-tick { position:absolute; top:100%; left:0; z-index:12; white-space:nowrap; font-size:11px;
  padding:2px; background:#fff3c7; animation:life2-number-tick ${P.glowMs}ms ease-out both; pointer-events:none; }
.life2 [data-changed-stat] dd { animation:life2-stat-tick ${P.glowMs}ms ease-out; }
.life2 [data-changed-stat][data-direction=down] { color:#88464b; }
.life2 .life2-tile-callout { position:absolute; z-index:12; inset:35% 18% auto; padding:16px; border:2px solid #508079;
  border-radius:18px; background:#fff8e6; text-align:center; pointer-events:none; animation:life2-callout ${P.calloutMs}ms ease-out both; }
.life2 .life2-tile-callout svg { display:block; margin:0 auto 8px; width:42px!important; height:42px!important; }
.life2 .life2-tile-callout strong { font-size:20px; line-height:26px; }
@media(orientation:landscape) and (min-width:900px) { .life2 .life2-popup:not([data-fullscreen]):not([data-notification]) { height:100%; } }
@media(max-width:899px) {
  .life2 .life2-shell:has(.life2-popup-host) { grid-template-rows:110px minmax(412px,1fr) 0 44px; }
  .life2 .life2-options.life2-popup-host { border:0; padding:0; background:transparent; box-shadow:none; }
}
@keyframes life2-rank-burst { from { transform:scale(.9); opacity:.2; } 45% { transform:scale(1.03); } to { transform:scale(1); opacity:1; } }
@keyframes life2-rank-drop { from { transform:translateY(-14px); opacity:.3; } to { transform:translateY(0); opacity:1; } }
@keyframes life2-drone-arrival { from { transform:translateX(-20px); } to { transform:translateX(0); } }
@keyframes life2-number-tick { from { opacity:1; transform:translateY(4px); } to { opacity:0; transform:translateY(-4px); visibility:hidden; } }
@keyframes life2-stat-glow { from { background:#f8d97b; box-shadow:0 0 12px #e7c361; } to { background:transparent; box-shadow:none; } }
@keyframes life2-stat-tick { from { transform:translateY(6px); } to { transform:translateY(0); } }
@keyframes life2-callout { 0% { opacity:0; transform:scale(.85); } 30%,75% { opacity:1; transform:scale(1); } 100% { opacity:0; } }
@media(prefers-reduced-motion:reduce) {
  .life2 .life2-stat-tick { display:none; animation:none!important; }
  .life2 [data-changed-stat],.life2 [data-changed-stat] dd,.life2 [data-animating] .life2-card-heading,
  .life2 [data-animating] .life2-stage-drone,.life2 .life2-tile-callout { animation:none!important; }
}
`;
