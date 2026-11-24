# 파일럿 키우기 — art pipeline

How the raster art is made, what was tried, and the exact prompts, so any image can be regenerated or extended
in the same style. Status: **full set shipped** (2026-11-24): 1 cover, 18 scenes, 14 speaker portraits,
11 ending portraits. 26 generations in all (3 in the sample pass, 23 for the full set), no retries needed,
the subscription's image limit was not reached.

## Pipeline in use

| | |
| --- | --- |
| Generator | The Codex CLI's built-in `image_gen` tool (`codex features list` shows `image_generation stable true`), image model `gpt-image-2` per the tool's own notes. Runs inside the existing ChatGPT/Codex subscription: no API key, no new paid service. |
| Command | `codex exec -m gpt-6.2-astra -c model_reasoning_effort=low --sandbox workspace-write --skip-git-repo-check -C <empty dir> "<prefix> File name: ./<name>.png. Image: <prompt>"` |
| Prefix | `Use your built-in image generation tool (not code, not SVG, not Python drawing) to generate one image, then copy it to the given file name in the current directory. Do not post-process it. Reply with the file name only.` |
| Output | PNG, 1536x1024 for 3:2 prompts, 1254x1254 for 1:1. Codex first writes to `~/.codex/generated_images/<session>/` and then copies. |
| Time | About 1 to 2 minutes per image; three ran in parallel in under 2 minutes. |
| Seeds | The built-in tool exposes no seed and no sampler settings. Reproduction is by prompt only; expect a different image of the same kind. Keep the raw PNG of every image that ships. |
| Licence | OpenAI's terms of use assign the output to the user, commercial use included. The prompts name no artist, game or brand, and the images copy no character, composition, logo or UI from the reference screenshots. |
| Data sent out | Only the art prompts below (generic descriptions). No project, user or repo details. |
| Batch | `node scripts/art-generate.mjs docs/art-prompts.json <out dir> <name> ...` runs the command above for each named prompt, four at a time, each bounded by `timeout 420`. `FORCE=1` regenerates a name that already has a PNG. |
| Portrait sheets | To spend a quarter of the generations and keep one drawing hand, portraits are generated four at a time: one 1:1 image that is a strict 2x2 grid of busts. `scripts/art-export.mjs` cuts each sheet into four 384x384 portraits (its `SHEETS` table says which cell is who). |
| Web export | `node scripts/art-export.mjs <dir with raw PNGs> [name ...]`: `cwebp` at 1344x896 (scenes) or 384x384 (portraits), quality stepped down from 80 until the file fits its budget (scene 300 KB, portrait 60 KB; cover 400 KB). It also writes a q95 WebP of every raw generation to `docs/art-raw/` (the 3 to 4 MB PNGs are not kept in git). |
| Wiring | `src/ui/art.ts` maps place and career stage to a scene, event to a speaker, ending to a portrait. An `<img>` is created only when its view is shown, so a run downloads just the scenes it visits; an image that fails to load removes itself and the drawn SVG fallback shows. `tests/art.test.ts` checks every named file exists and fits its budget. |
| In-game check | `npm run build && node scripts/art-shots.mjs docs/screenshots/art-final` opens every scene in the real play screen at 390x844 and 1280x800. |
| Lettering | Never generated. The title is real text in Bagel Fat One (SIL OFL 1.1, `public/fonts/OFL-BagelFatOne.txt`), subset to the glyphs of "파일럿 키우기" with `pyftsubset --text="파일럿 키우기" --flavor=woff2` (3.6 KB). Every prompt ends with a "no text, letters, logos" clause. |

## Files

| Shipped file | Size | Raw generation | Used for |
| --- | --- | --- | --- |
| `public/art/cover.webp` | 261 KB | `docs/art-raw/cover-v2.png` | Title screen key visual |
| `public/art/scene-office.webp` | 271 KB | `docs/art-raw/scene-office-v1.png` | Small company office |
| `public/art/scene-<id>.webp` x 17 | 214 to 293 KB each | `docs/art-raw/scene-<id>.webp` | Play stage "현장" view, see the scene table below |
| `public/art/portrait-senior.webp` | 19 KB | `docs/art-raw/portrait-senior-v1.png` | Event popup portrait: senior |
| `public/art/portrait-<id>.webp` x 13 | under 60 KB each | `docs/art-raw/sheet-speakers1..3.webp`, `sheet-endings3.webp` (examiner) | Event popup portraits |
| `public/art/ending-<id>.webp` x 11 | under 60 KB each | `docs/art-raw/sheet-endings1..3.webp` | Ending screen and ending gallery |
| `public/fonts/bagel-fat-one-title.woff2` | 3.6 KB | Google Fonts repo, `ofl/bagelfatone` | Title lettering |

`public/art` is 5.5 MB in 44 files; the whole build (`dist/`) is 6.3 MB. A first visit loads the cover and
one scene (about 0.6 MB of art); the rest arrives as places, events and endings come up.

### Scenes

| Scene | Shown for |
| --- | --- |
| `home`, `school`, `airfield`, `town`, `shop`, `garage`, `bank`, `farm`, `site`, `bridge`, `windfarm`, `studio`, `coast`, `academy`, `assoc` | The place of the same name (`airfield` also stands for the exam ground) |
| `solo` | "내 사무실" while the player works alone: a one-desk studio room with a van outside |
| `office` | The company office once a company exists (fewer than 6 staff, before the second funding round); also the "본사" place while the player still works alone |
| `hq` | The company at 6 or more staff or from the second round, and the employer's office during the employee career |

The play screen opens on the home place of the career stage (student: school, pilot: airfield, employee: hq,
instructor: academy, solo: office, company: hq, director: association hall) and follows the place of the
current event and of the last action taken.

### Portraits

Speakers (one per recurring kind of person; `EVENT_SPEAKER` in `src/ui/art.ts` assigns every event to one):
senior, mechanic, professor, broker, client, banker, manager, engineer, trainee, inspector, anchor, friend,
investor, examiner. Endings: ceo, chairman, academy, solo, debtor, smallbiz, director, instructor, employee,
pilot, student. An ending not yet reached shows an empty frame in the gallery and its image is not requested.

## Screenshots

`docs/screenshots/art-final/` (WebP, 390x844 and 1280x800): `title`, `play-start`, `play-event` (window popup
with portrait and stat chart), `play-busy-shop`, `play-result`, `ending`, `gallery-full`, and `scene-<id>` for
all 18 scenes. The first group comes from `LAYOUT_SHOTS=<dir> npm run layout`, the scenes from
`scripts/art-shots.mjs`. `docs/screenshots/art-samples/` holds the earlier sample pass.

Notes from the visual check of the full set: no stray glyphs, no broken hands or faces, no style drift between
sheets. The `home`, `solo` and `bank` scenes are dioramas with dark corners rather than edge-to-edge floors;
they were kept because they read well in the frame.

## What was checked and rejected (2026-11-24)

- **Local Stable Diffusion / ComfyUI / Flux**: none installed. No `~/ComfyUI`, nothing listening on :8188, the
  Hugging Face cache is empty, no SD / SDXL / Flux checkpoints on disk. The Film project's only local model is
  LTX-2.5 (video, MLX) under `~/orca/LTX_Local_Studio`; it was not touched. A local route would be FLUX.1-schnell
  (Apache-2.0) through `mflux` on this M5 / 24 GB machine: about a 12 GB download and a new install, and schnell
  is weaker than the result below at hands, props and a consistent cast. Not installed, not tried.
- **Ollama**: only a text model (`qwen3:14b`). No image model.
- **Apple Image Playground**: installed, but it is a GUI app with no command-line or scriptable path, and its
  fixed styles (animation / illustration / sketch) do not cover a webtoon key visual or an isometric tycoon scene.
  Not tried.
- **Free asset packs** (for isometric furniture and tiles, e.g. Kenney's CC0 packs): not needed, since the
  generated scene is closer to the 2000s tycoon look than assembled generic tiles would be. Still the fallback
  if scenes ever need to be edited piece by piece.
- **LLM hand-drawn SVG**: this is what the old cover and map were, and what the user called generic. Not used for art.
- **Cover v1** (`docs/art-raw/cover-v1-rejected.webp`): same pipeline, first prompt. Clean drawing, but five
  full-body figures standing apart on a plain sky-and-hill background read as a stiff line-up. Replaced by v2
  (knees-up, overlapping group, sticker background).

## Prompts

The prompts of the full set (17 scenes, 6 portrait sheets) are in `docs/art-prompts.json`: `_style.scene` and
`_style.sheet` are the shared first sentences, `_tail` the shared closing clause, and each other key is one
image. The three sample-pass prompts follow here in full.

### Cover v2 (shipped)

> wide 3:2 landscape key visual for a Korean mobile career-raising game about drone pilots, in the polished style
> of Korean romance-webtoon promotional art: delicate clean line art, soft painterly cel shading, attractive
> stylish adult characters, white sticker outline around the character group. Five original characters shown from
> the knees up, large in frame, standing close together and overlapping like a group poster, each with a different
> confident pose. Center and slightly in front: a young drone-company CEO in a navy three-piece suit, a small white
> quadcopter drone resting on one raised palm and a fan of banknotes in the other hand, a confident smile. Left of
> center: a professional drone pilot in an olive flight jacket, FPV goggles pushed up on the forehead, a radio
> controller on a neck strap, giving a thumbs up with a big grin. Right of center: a woman who is a drone academy
> director in a beige blazer, holding a clipboard against her chest and a rolled diploma with a red ribbon,
> cheerful. Far left, partly behind: a solo freelancer with a backpack carrying a hard drone case over the
> shoulder. Far right, partly behind: a silver-haired association chairman in a pinstripe suit with a medal,
> holding up a gold trophy. Background: bright pastel gradient of pink, lavender, cream and mint with a faint grid,
> layered with cute flat sticker graphics: small drones, gold coins, banknotes, stars, sparkles, propellers, dotted
> patterns, striped circles, a rainbow, pixel hearts. Keep the lowest fifth of the image simple (clothing and
> background only) so a title can be overlaid there. Absolutely no text, letters, numbers, logos, signatures or
> watermarks anywhere. Clean anatomically correct hands with five fingers, clean faces.

### Cover v1 (rejected)

> wide 3:2 landscape key visual for a Korean mobile career-raising game, polished Korean webtoon / anime
> illustration style with clean line art and soft cel shading. Five original adult characters standing full-body
> side by side as successful people, composed so the three in the middle are the stars: center, a confident young
> drone-company CEO in a navy suit holding a sleek white quadcopter drone on one palm and a fan of banknotes in the
> other hand; left of center, a professional drone pilot in a flight jacket with a radio controller hanging from a
> neck strap and FPV goggles pushed up on the forehead, giving a thumbs up; right of center, a friendly drone
> academy director woman in a blazer holding a clipboard and a graduation certificate tube; far left, a solo
> freelancer with a backpack and a camera drone case; far right, an older association chairman in a formal suit
> with a medal and a trophy. Bright pastel sky-blue and mint background with a subtle grid, sticker-like doodles:
> small drones, coins, stars, propellers, clouds, white sticker outlines around the characters. Leave the
> lower-middle area calm enough for a title to be overlaid later. Absolutely no text, letters, logos, or watermarks
> anywhere in the image. Clean, anatomically correct hands and faces.

### Scene: company office v1 (shipped)

> wide 3:2 landscape, a detailed isometric 2D game background in the style of an early-2000s Korean PC business
> tycoon game: crisp pre-rendered pixel-art look, strict 2:1 isometric projection, saturated warm colours, small
> dark outlines, many tiny props. The image is filled edge to edge by the cutaway interior of a small drone startup
> office seen from above with the front walls removed and low glass partition walls between rooms. Rooms: an open
> work area with wooden floor, desks with computers and office chairs; a drone workshop corner with a workbench,
> quadcopter drones under repair, tool racks and shelves of drone boxes and batteries; a meeting room with a long
> glass table and blue chairs; a lounge with cream sofas, a coffee table, a water cooler and potted plants on
> black-and-white checkered tiles; a small charging station wall with rows of drone batteries; wooden doors, filing
> cabinets, a printer, a whiteboard with simple diagrams (no letters). Six or seven tiny chibi-proportioned
> employees in the same pixel style: two working at desks, one repairing a drone at the workbench, one carrying a
> box, one resting on the sofa, one walking with a controller. No user interface, no windows or popups, no text, no
> letters, no numbers, no logos, no watermark.

### Portrait: senior v1 (shipped)

> square 1:1 character portrait for a game dialog window, bust shot (head and shoulders), same polished Korean
> webtoon / anime illustration style with clean line art and soft cel shading. An original friendly young man in
> his mid twenties, a university senior who works as a drone camera operator: short tousled dark brown hair, warm
> smile, wearing a grey hoodie under a black windbreaker, a camera strap over one shoulder, a small drone
> controller lanyard. Facing slightly to the side, looking at the viewer. Flat soft mint-green background with a
> subtle lighter circle behind the head. No text, no letters, no logos, no watermark, no frame.

## Style rules for the full set

- Two styles on purpose, as the user asked: **webtoon illustration** for the cover and every portrait,
  **2000s isometric tycoon pixel look** for every scene. Reuse the first sentence of the matching prompt above
  word for word so the set stays consistent.
- Scenes: 3:2, strict 2:1 isometric, cutaway interior or yard filling the frame, six or so tiny people, no UI,
  no letters. Growth variants (for example the office at three company sizes) are separate prompts that change
  only the room list and head count.
- Portraits: 1:1 bust, flat pastel background with a lighter circle, one per recurring character.
- Check each image for hands, faces, stray glyphs and anything that resembles the reference screenshots before
  it ships; regenerate rather than retouch.

## Cost of the full set

Estimated before the run: about 25 images and 60 to 75 generations with retries. Actual: 43 shipped images
from 26 generations (portrait sheets, and every generation was usable first time), no extra cost, no image
limit reached.
