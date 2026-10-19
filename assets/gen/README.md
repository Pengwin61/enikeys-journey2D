# assets/gen — painted game art

Generated art for Enikey Journey (Monolith Corp). The engine loads files listed in `src/assets.js` (`MANIFEST`); anything missing falls back to procedural art.

## Folders

| Folder | What goes there | Examples |
| --- | --- | --- |
| `characters/` | hero, NPCs, enemies, bosses — one pose per file | `enikey_front.png`, `gregor_front.png`, `guard_front.png` |
| `props/` | furniture, devices, decor standing on the floor | `desk_pc.png`, `server_rack.png` |
| `tiles/` | floor tiles and wall pieces | `floor_tile.png` |
| `fx/` | effects: projectiles, explosions, decals | `spark.png` |
| `ui/` | icons for items and abilities | `item_screwdriver.png` |

New file → put it in the right folder, `snake_case` name, then add the name to `MANIFEST` in `src/assets.js`.

## Format rules (every file)

- PNG, fully transparent background (fallback: flat #FF00FF, the loader keys it out when served over http).
- Isometric 2:1, camera from the south. One floor tile = 256 × 128 px.
- One object per file, centered, ground contact at the bottom. Margins are trimmed after generation.
- Furniture front faces the lower-left; long objects run upper-left → lower-right.
- Style: match `props/desk_pc.png` — detailed hi-bit pixel art, dark outlines, warm top light, red/cyan neon accents. No text or watermarks.
- Characters: ≈1.4 tiles tall (≈360 px), `_front` faces lower-left, `_back` walks away to the upper-right.

`concept/` at the repo root holds the art-direction references.
