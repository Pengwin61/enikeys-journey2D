# assets/gen — painted game art

Generated art for Enikey Journey (Monolith Corp).

**Chosen direction: `painted/`.** Ideal references: `concept/340ddb92-778f-40aa-a184-ab4f022c1c50.png` (gameplay) and `concept/f279366c-5330-42c1-8d67-f11a15d6ba3f.png` (office floor). All new art goes to `painted/`. The pixel set was moved to `archive/art/pixel/` and is not loaded by the game.

History — the two directions that were compared:

| Style folder | Look | Style reference |
| --- | --- | --- |
| `painted/` | detailed hi-bit illustration, warm amber light, rich ornament | `painted/props/desk_pc.png`, `concept/f279366c-….png` |
| `pixel/` | chunky clean pixel art, crisp outlines, few details, cool readable office light (cubicles, monitors, coolers) | `concept/style_ref_office.png` |

The engine loads `assets/gen/<style>/<folder>/<name>.png` for every name in `MANIFEST` (`src/assets.js`). Style is picked in the pause menu («Графика») or with `?style=pixel|painted`; missing files fall back to procedural art. The same file names must exist in both styles.

## Folders (inside each style)

| Folder | What goes there | Examples |
| --- | --- | --- |
| `characters/` | hero and NPCs — one pose per file | `enikey_front.png`, `gregor_talk.png` |
| `enemy/` | enemy character assets — one pose per file | `guard_front.png`, `cultist_front.png` |
| `props/` | furniture, devices, decor standing on the floor | `desk_pc.png`, `server_rack.png` |
| `tiles/` | floor tiles and wall pieces | `floor_tile.png` |
| `fx/` | effects: projectiles, explosions, decals | `spark.png` |
| `ui/` | icons for items and abilities | `item_screwdriver.png` |

New file → right style + folder, `snake_case` name, then add the name to `MANIFEST`.

## Format rules (every file, both styles)

- PNG, fully transparent background (fallback: flat #FF00FF).
- Isometric 2:1, camera from the south. One floor tile = 256 × 128 px.
- One object per file, centered, ground contact at the bottom. Margins are trimmed after generation.
- Furniture front faces the lower-left; long objects run upper-left → lower-right.
- Characters: ≈1.4 tiles tall (≈360 px), `_front` faces lower-left, `_back` walks away to the upper-right.
- No text or watermarks unless the brief asks for it.

`concept/` at the repo root holds the art-direction references.

## Guard and corporate cultist

`painted/enemy/` contains `guard_front.png` and `cultist_front.png`, loaded by the enemy renderer. The cultist wears a charcoal blazer, burgundy tie and employee badge, with subtle red eyes and a small cult lapel pin. Its middle-aged face, short hair and grounded painted rendering replace the rejected anime appearance. Current replacement prompt: [cultist_grounded.prompts.md](cultist_grounded.prompts.md). Previous suit prompt: [cultist_suit.prompts.md](cultist_suit.prompts.md). Original concept generation history: [enemy.prompts.md](enemy.prompts.md).

## Bugs from enemy_concept.png

All 12 enemy designs have standalone front/three-quarter PNGs in both `painted/enemy/` and `pixel/enemy/` (24 new files). Small bugs: Logkroh, Pingovik, Fayloed, Processik, Portokrys, Keshling. Medium bugs: Konfigor, Deploit, Dedlok, Utechka, Brandmauzer, Konteynertus. These are single-pose art deliverables; they are not runtime enemy types or animation sheets yet. Compare both styles in [bugs-gallery.html](bugs-gallery.html); names, saved paths and exact built-in image generation prompts are in [bugs.prompts.md](bugs.prompts.md).

## Printer stations

`painted/props/printer_station.png` and `pixel/props/printer_station.png` contain the printer resting directly on a two-drawer cabinet. These are single assembled, floor-anchored sprites: do not draw the original `printer.png` on top as a second object. Original printer images are retained as reference assets.

The `printer` prop keeps its existing footprint, collision and quest-device identity, but now has total height 30 and fades when it occludes the player. Missing art uses a procedural 14-pixel cabinet with a 16-pixel printer seated on top. The loader maps the `printer` prop to `printer_station` in both styles. Generation details: [printer_station.prompts.md](printer_station.prompts.md).

## Day/night pillars

Both styles retain `props/pillar_neon.png` as the red night version and add `props/pillar_neon_blue.png` for daytime. The renderer selects blue during the day, red during overtime (18:00 onward) or scripted night duty, then blue again the next morning. Light pools on the floor and procedural fallback strips use the same state. Pillar lights are never baked into static floor/glow layers, so no old red or blue reflection remains after switching. Generation prompts: [pillar_neon.prompts.md](pillar_neon.prompts.md).

Vertical neon strips embedded in office walls follow the same day/night state. Their light and wet-floor reflections are drawn dynamically; only the unlit mounting channel is baked into the wall.

## Coins and quest markers

Both styles include `ui/coin_token.png` (gold Monolith token) and `ui/quest_marker.png` (industrial exclamation badge). The coin appears in world drops with a spin animation and in the wallet HUD. The neutral grayscale quest marker is tinted cyan for ordinary tasks, purple for elites, red for bosses; the selected task has a larger marker. Its progress bar stays below the badge. Missing art retains procedural fallbacks. Prompts and exact saved paths: [coin_marker.prompts.md](coin_marker.prompts.md).
