import { POPUP_RULES } from './data.ts';

export const POPUP_STYLE = `
.life2 .life2-popup-host { isolation:isolate; z-index:10; }
.life2 .life2-popup {
  position:fixed; z-index:10; inset:auto 6px 60px; box-sizing:border-box;
  height:min(360px,${POPUP_RULES.sheetPercent}dvh); max-height:${POPUP_RULES.sheetPercent}vh;
  padding:8px; border:2px solid #3a2861; border-radius:16px 16px 8px 8px;
  background:#fff6e0; color:#2b2440; display:grid; gap:6px;
  grid-template-rows:44px 80px minmax(0,1fr) 44px; min-width:0;
  font:600 12px/16px system-ui,sans-serif; animation:life2-sheet-in ${POPUP_RULES.enterMs}ms ease-out;
}
.life2 .life2-popup * { box-sizing:border-box; min-width:0; }
.life2 .life2-popup button { min-width:44px; min-height:44px; font:700 12px/16px system-ui,sans-serif;
  padding:4px 6px; border:1px solid #80758b; border-radius:7px; color:inherit; background:#fff9eb; }
.life2 .life2-popup button:disabled { color:#736a76; background:#eee7dc; }
.life2 .life2-popup button:focus-visible { outline:3px solid #6036b6; outline-offset:-3px; }
.life2 .life2-popup-header > button,.life2 .life2-popup-copy > button { flex:none; }
.life2 .life2-popup-header,.life2 .life2-popup-copy,.life2 .life2-popup-footer {
  display:flex; align-items:center; justify-content:space-between; gap:6px; }
.life2 .life2-popup h2 { font:800 14px/18px system-ui,sans-serif; margin:0; overflow-wrap:anywhere; }
.life2 .life2-popup-copy p { flex:1; margin:0; white-space:pre-wrap; overflow-wrap:anywhere; font-size:12px; line-height:16px; }
.life2 .life2-popup-copy svg,.life2 .life2-popup-copy img { width:48px; height:48px; object-fit:contain; flex:none; }
.life2 .life2-popup-list { display:grid; align-content:center; gap:4px; min-height:0; }
.life2 .life2-popup-row { display:grid; grid-template-columns:minmax(0,1fr) 44px; gap:4px; }
.life2 .life2-popup-choice { text-align:left; display:grid; align-content:center; gap:1px; }
.life2 .life2-popup-choice strong { font-size:12px; line-height:16px; overflow-wrap:anywhere; }
.life2 .life2-popup-choice small { font-size:11px; line-height:14px; overflow-wrap:anywhere; }
.life2 .life2-popup-footer button { flex:1; }
.life2 .life2-popup [data-result-wheel] { border:3px solid #6c3ec4; border-radius:50%; width:48px; height:48px;
  display:grid; place-content:center; flex:none; font-weight:800; }
.life2 .life2-popup[data-popup=demotion] { background:#f7dedb; border-color:#963d3d; }
.life2 .life2-popup[data-popup=rankup] { background:#e8dcff; }
.life2 .life2-popup[data-fullscreen] { inset:0 0 60px; height:auto; max-height:none; border-radius:0;
  align-content:center; grid-template-rows:44px 100px minmax(170px,240px) 44px; padding:max(8px,env(safe-area-inset-top)) 16px; }
.life2 .life2-popup[data-reading] { grid-template-rows:44px minmax(0,1fr) 44px; }
.life2 .life2-popup[data-notification] { height:${POPUP_RULES.notificationHeight}px; grid-template-rows:44px minmax(0,1fr); }
.life2 .life2-popup[data-details] { grid-template-rows:44px minmax(0,1fr) 44px; }
/* A measured dock can have only 6px of clearance: translating 12px on entry would hide the pawn. */
.life2 .life2-popup[data-dock] { animation-name:life2-sheet-dock-in; }
.life2 .life2-popup-tabs { display:flex; gap:4px; }
.life2 .life2-popup-tabs button { flex:1; padding:2px; font-size:11px; }
.life2 .life2-popup-tabs [aria-selected=true] { background:#e8dcff; }
@media (orientation:landscape) and (min-width:900px) {
  .life2 .life2-popup { position:absolute; inset:0; height:100%; max-height:none; border-radius:10px; }
  .life2 .life2-popup-host { position:relative; grid-area:options; min-height:0; min-width:0; }
  .life2 .life2-popup[data-fullscreen] { position:fixed; inset:0 0 68px; height:auto; padding:12vh 25vw; }
  .life2 .life2-popup[data-notification] { inset:0 0 auto; height:${POPUP_RULES.notificationHeight}px; }
}
@keyframes life2-sheet-in { from { transform:translateY(12px); } }
@keyframes life2-sheet-dock-in { from { border-color:#ad761b; } }
@media(prefers-reduced-motion:reduce) { .life2 .life2-popup { animation:none; } }
`;
