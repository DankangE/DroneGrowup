// Original cover illustration. All geometry and colours below are local artwork.
import { svg } from './dom.ts';

export function coverArt(): SVGSVGElement {
  const art = svg('svg', { viewBox: '0 0 660 370', class: 'cover-art', 'aria-hidden': 'true' });
  art.innerHTML = `
    <defs>
      <pattern id="field" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(16)"><rect width="12" height="12" fill="#afc879"/><path d="M1 0v12" stroke="#87ac67" stroke-width="5"/></pattern>
      <g id="pine"><ellipse cx="4" cy="1" rx="9" ry="4" fill="#699477"/><path d="M0 2v-11" stroke="#585a40" stroke-width="3"/><path d="m0-28-8 15h4l-7 10q9 5 21 0l-7-10h4Z" fill="#669677" stroke="#48755d" stroke-width="1.5"/></g>
      <g id="hangar" stroke="#446756" stroke-width="1.8" stroke-linejoin="round"><path d="m0 0 24-12 32 9-22 13Z" fill="#a0b69a" transform="translate(3 9)"/><path d="m0-11 24-11 30 9v15L30 14 0 5Z" fill="#fff0ca"/><path d="m30-2 24-11v15L30 14Z" fill="#c6d2ac"/><path d="m-3-11 14-13 15-6 31 14-26 13Z" fill="#cf7956"/><path d="m-3-11 14-13 31 10-11 11Z" fill="#ee9b68"/><path d="m5-4 9 3v6L5 2Zm14 4 6 2v6l-6-2Z" fill="#79a8a0"/></g>
      <g id="rotor"><ellipse cy="5" rx="32" ry="13" fill="#6c9e98" opacity=".3"/><ellipse rx="30" ry="12" fill="#cdf3e8" fill-opacity=".65" stroke="#3b685e" stroke-width="2.6"/><path d="M-29-2q3-5 27 0 18-10 29-6 2 4-24 9-20 6-32 1Z" fill="#456b63"/><ellipse rx="5" ry="3.5" fill="#ffda81" stroke="#365d54" stroke-width="2"/></g>
      <g id="cloud" fill="#fffceb"><path d="M0 20q2-11 15-10 5-16 21-11 10 2 12 10 15-4 20 11Z"/><path d="M8 25h35m4 0h8" stroke="#e3f2da" stroke-width="3" stroke-linecap="round"/></g>
    </defs>
    <g opacity=".86"><use href="#cloud" transform="translate(38 31) scale(.72)"/><use href="#cloud" transform="translate(506 30) scale(1.1)"/><use href="#cloud" transform="translate(40 140) scale(1.4)"/></g>
    <g fill="none" stroke="#fffae3" stroke-width="3" stroke-linecap="round" stroke-dasharray="5 9"><path d="M10 224q71 5 100-47t70-44q31 4 24 23-7 16-30 10-26-9 3-34t81-35"/></g>
    <g stroke-linejoin="round" stroke="#5f866b" stroke-width="2">
      <path d="m65 242 264-115q19-8 44 0l240 83q19 6 15 18l-5 18-224 109q-29 13-52 4L78 274q-15-5-13-32Z" fill="#87a277"/>
      <path d="m68 236 258-114q20-8 42-1l252 86q20 8 2 19L392 338q-17 8-38 1L74 253q-21-7-6-17Z" fill="#c9d99d"/>
      <path d="m89 235 100-44 73 22-99 46Z" fill="url(#field)"/><path d="m472 202 55-23 79 28-54 25Z" fill="url(#field)"/>
    </g>
    <path d="M247 159q-3 22 35 28t29 28q-7 18 47 22t60 35q1 15 36 30l-27 13q-42-14-39-37 1-19-43-23-76-6-61-41 5-11-19-15-38-8-46-28Z" fill="#8ec6b8"/>
    <path d="M78 246 220 185 569 238M192 287l100-47 222-75" fill="none" stroke="#b0b68b" stroke-width="12"/><path d="M78 246 220 185 569 238M192 287l100-47 222-75" fill="none" stroke="#fff0c9" stroke-width="8"/>
    <g transform="translate(219 185)"><path d="m0 0 79-35 42 14-81 36Z" fill="#719489" stroke="#517568" stroke-width="2"/><path d="m18 1 77-34" transform="translate(1 4)" stroke="#f6edcc" stroke-width="2.5" stroke-dasharray="9 6"/></g>
    <use href="#hangar" transform="translate(172 220) scale(.78)"/><use href="#hangar" transform="translate(129 237) scale(.6)"/><use href="#hangar" transform="translate(440 235) scale(.95)"/><use href="#hangar" transform="translate(380 254) scale(.68)"/>
    <path d="m285 282 67-31 47 15-66 33Z" fill="#9ab488" stroke="#7f9e72" stroke-width="2"/><ellipse cx="341" cy="275" rx="21" ry="9" fill="none" stroke="#fff5d1" stroke-width="2.5"/><path d="m333 272 8 6m0-10 8 6m-12 1 8-4" fill="none" stroke="#fff5d1" stroke-width="2"/>
    ${[[232,167],[245,163],[258,161],[384,155],[402,164],[421,163],[526,213],[547,219],[492,251],[477,259],[271,269],[254,275],[242,265],[348,309],[369,315],[394,305],[202,246]].map(([x,y],i)=>`<use href="#pine" transform="translate(${x} ${y}) scale(${.52+(i%3)*.13})"/>`).join('')}
    <g class="cover-drone"><g transform="translate(346 102) rotate(-8)">
      <ellipse cx="5" cy="57" rx="46" ry="10" fill="#4a7665" opacity=".17"/>
      <g fill="none" stroke="#31564e" stroke-linecap="round" stroke-linejoin="round">
        <path d="m-30 9-8 29 19 6m49-31 2 24-17 6" stroke-width="7"/>
        <path d="m-14-5-40-22m69 17 48-18m-77 27-54 21m83-20 52 23" stroke-width="14"/>
        <path d="m-14-7-40-22m69 17 48-18m-77 27-54 21m83-20 52 23" stroke="#ffdf9c" stroke-width="8"/>
      </g>
      <g fill="#e89c49" stroke="#365d54" stroke-width="3"><rect x="-64" y="-33" width="15" height="12" rx="5"/><rect x="55" y="-33" width="15" height="12" rx="5"/><rect x="-73" y="11" width="15" height="13" rx="5"/><rect x="61" y="12" width="15" height="13" rx="5"/></g>
      <use href="#rotor" x="-57" y="-34"/><use href="#rotor" x="63" y="-34"/>
      <path d="M-32-12q-6-7 0-14l21-9q8-3 16 1l27 13q9 4 6 14l-4 15q-2 9-16 13-12 3-19-1l-24-13q-8-4-7-12Z" fill="#d7cdb0" stroke="#31564e" stroke-width="3.6"/>
      <path d="M-33-23q-1-5 9-8l15-6q7-2 15 1l27 14q10 5 1 11L12 1Q6 4-2 0l-27-14q-7-4-4-9Z" fill="#fff7d9" stroke="#31564e" stroke-width="3"/>
      <path d="m-22-30 12-5 37 18-13 7Z" fill="#f5a14f"/><path d="m-23-15 19 10m17-8 9-4" stroke="#83a097" stroke-width="3" stroke-linecap="round"/>
      <path d="m3 6 26-12-1 11L6 16Z" fill="#43675e"/><path d="m15 3 8-4" stroke="#95ded1" stroke-width="3"/>
      <rect x="-17" y="11" width="27" height="21" rx="6" fill="#536e65" stroke="#31564e" stroke-width="3"/><circle cx="1" cy="21" r="7" fill="#77c9c1" stroke="#243f3b" stroke-width="3"/><circle cx="3" cy="19" r="2" fill="#e9ffea"/>
      <use href="#rotor" x="-65" y="12"/><use href="#rotor" x="69" y="13"/>
    </g></g>
    <g fill="#fff1b6" stroke="#819773" stroke-width="1.5"><path d="m485 92 4 10 9 4-9 4-4 10-4-10-9-4 9-4Z"/><path d="m224 44 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/></g>`;
  return art;
}
