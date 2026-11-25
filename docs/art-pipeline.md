# 파일럿 키우기 — art pipeline

The life board uses repository-owned inline SVG and the retained raster assets. Historical generation prompts are preserved below.
V1 status: **full set shipped** (2026-11-24): 1 cover, 18 scenes, 14 speaker portraits,
11 ending portraits. 26 generations in all (3 in the sample pass, 23 for the full set), no retries needed,
the subscription's image limit was not reached.

## V2 / T21: inline art (2026-11-25)

T21 follows life-board §11.1: keep the 2D board, existing scenes and pawn, and add small original drawings.
For this ticket, the explicit implementation constraint is inline SVG/data, with no external image generation,
network service, downloaded pack or new dependency. The historical raster prompts below do not apply to v2 additions.

### Inventory and naming

| Source | Contents | Use |
| --- | --- | --- |
| `src/ui2/icons.ts` | 8 paths in `NEW_TILE_PATHS`: `jobfair`, `shop`, `estate`, `life`, `biz`, `luck`, `station`, `invest` | `tileIcon(kind)`; eight older kinds reuse `src/ui/icons.ts` unchanged |
| `src/ui2/place-tiles.ts` | 71 `NEW_PLACE_TILES`, keyed by the new `PlaceId`s | One tile per new location in `src/life/world.ts`; shared building parts, distinct compositions |
| `src/ui2/job-portraits.ts` | 11 `NEW_JOB_PORTRAITS`, keyed by `TrackId`, and Korean `JOB_NAMES` | Original head-and-shoulder drawings with recognizable work clothing and props |
| `src/ui2/art-svg.ts` | Path data types and `vectorArt` renderer | Creates SVG/path elements with `createElementNS`; no markup parsing or resource ids |
| `src/ui2/art.ts` | `placeAsset`, `jobAsset`, `placeArt`, `jobPortrait` | Total place/job lookup and ready-to-use SVG or local image elements |

The ticket does not enumerate the new places or the eleven jobs. Interpretation: cover every added place,
reuse portraits for the seven v1 careers and the existing mechanic, and draw the remaining eleven jobs.
This covers all 89 places and all 19 careers alongside the career catalog in `src/life/tracks.ts`.

| New portrait id | Visible cue |
| --- | --- |
| `service` | Green apron and name badge |
| `delivery` | Blue cap and parcel |
| `clerk` | Glasses, blazer and document folder |
| `public` | Blue uniform, tie and document booklet |
| `rescue` | Gold helmet, reflective jacket and radio |
| `creator` | Curly hair, hoodie and phone camera |
| `engineer` | Lab coat, glasses and circuit board |
| `inspector` | White hard hat, work vest and clipboard |
| `film` | Brimmed hat, shoulder strap and camera |
| `atc` | Headset and uniform shoulder tabs |
| `racer` | FPV goggles, racing jacket and controller |

`LEGACY_JOB_PORTRAITS` reuses `portrait-mechanic` and the shipped `ending-pilot`, `ending-employee`,
`ending-instructor`, `ending-solo`, `ending-ceo`, `ending-academy`, `ending-director` busts.
`LEGACY_PLACE_SCENES` keeps the existing places on local `scene-*.webp` files (exam → airfield,
office → solo). These are art mappings, not career eligibility or game-state calculations.

### Drawing and extension procedure

1. Use the exact `SpaceKind`, `PlaceId` or `TrackId` from `src/life/types.ts` as the table key.
   Update the matching exhaustive mapping and coverage assertions when adding an id.
2. Draw icon paths on `0 0 24 24`, with round joins and strokes in `currentColor`. The board renders them
   at 22×22, with its visible Korean label and accessible tile name retained. Distinguish shopping bags
   from an owned storefront, a house/key from living/heart, and job-change arrows from station arrows.
3. Draw places on `0 0 128 128`: a shallow raised tile, warm cream buildings, dark green outlines and
   flat shaded props. District grounds are mint (A), lilac (B), sand (C), blue (D), teal (E), warm sand (F).
   Reuse the small hall/store/home/station components; add a place-specific prop or silhouette.
4. Draw job busts on `0 0 128 128`, with flat pastel backgrounds, a light circle, clear faces and clothing.
   Vary hair, complexion and outfit; use job tools rather than lettering or copied logos. These compact
   vector portraits complement the retained webtoon raster busts; they do not replace the v1 artwork.
5. Keep editable paths and colors in the tables. Importing the tables deterministically constructs the
   exact same drawings; there is no generation prompt, random seed, export step or raster asset to fetch.
   Each icon path is ≤1 KB, each expanded place drawing ≤6 KB, each portrait ≤8 KB (JSON UTF-8 bytes).
6. Call `placeArt(place)` or `jobPortrait(track)` when the relevant popup needs art. They return an SVG for
   new art or an image using the build's `BASE_URL` and the existing `public/art` file. Set display size in
   the consuming view. SVG labels use attributes; no storage/server text is interpolated into markup.
   `data-place-art`, `data-job-portrait` and `data-tile-icon` identify the rendered artwork.
7. Run `node --test tests/art.test.ts`, `npm test` and `npm run typecheck`. The art suite preserves every shipped raster
   file/budget check and checks all new ids, distinct drawings, data budgets, rendering, accessible names,
   local raster paths and all 212 board tiles. It uses a small DOM double, not a browser dependency.
8. For visual review, run `npm run dev` and open `?debug=1`: check the icons at 390×844, 360×740,
   1280×800 and 1366×768. In a separate development preview, import `NEW_PLACE_TILES`, `NEW_JOB_PORTRAITS`
   and the renderers to make a contact sheet; inspect at 128px and 64px for clipped outlines, faces and
   recognizable props. Preview code and screenshots are review artifacts, not production game UI.

T21 changes only the icon selection hook in `board.ts`; popup placement of the prepared place/job artwork
belongs to the popup tickets. It leaves the T17 animation/app files and shared styles untouched.
Validation: 10 art tests passed. Browser contact-sheet review was attempted, but Chrome exited with
`SIGABRT` and cleanup reported `kill EPERM` in this sandbox; visual/layout review remains unverified.

## V1 raster pipeline (historical)

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
| Wiring | `src/ui2/art.ts` maps places/jobs to rasters or inline SVG. Ending art is selected in `src/ui2/popups/ending.ts`. `tests/art.test.ts` checks every retained raster and all new drawings against their original budgets. |
| In-game check | `npm run layout:life` checks the current board, popup and ending views at all four supported sizes. |
| Lettering | Text is rendered by the UI. The local Bagel Fat One font is distributed with its SIL OFL licence in `public/fonts/`. |

## Retained source assets

`public/art/` and `docs/art-raw/` retain the original cover, scenes, portraits and chibis.
Active raster mappings are `LEGACY_PLACE_SCENES` and `LEGACY_JOB_PORTRAITS` in `src/ui2/art.ts`;
the 11 original ending portraits are also used by the ending/gallery renderer. All shipped raster
file-existence and size checks remain in `tests/art.test.ts`, including art kept for future reuse.
The old client screenshots and its capture script were removed in T23.

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
