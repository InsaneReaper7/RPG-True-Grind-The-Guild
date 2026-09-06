# Milestone 1 — Vertical Slice

**Goal:** prove out click-to-move, the tile grid, weapon proficiency leveling, and basic auto-combat in a real running build — nothing else. This is the *only* thing to build in this task.

## Tech

- TypeScript + Phaser 3, scaffolded via Vite.
- Single Phaser Scene, top-down 2D pixel art placeholder assets (simple colored squares/circles are fine — no real art yet).

## In Scope

1. **Tile grid:** a small fixed-size top-down tilemap (e.g. 20x20 tiles), rendered with Phaser's Tilemap API.
2. **Click-to-move:** clicking a tile moves the player character there via pathfinding across walkable tiles (a lightweight grid pathfinder like `easystar.js` is fine).
3. **Camera:** locked on to the player by default, follows their movement. WASD pans the camera off lock-on; scroll wheel zooms.
4. **Weapon equip + proficiency exp:** player starts with **Short Swords** equipped (read from `data/weapons.json`). Attacking anything grants proficiency exp toward Short Swords, using the tier scale from `data/classes.json` (10/30/60/90).
5. **Class unlock (display only):** when Short Swords proficiency hits 10, unlock and display "Fencer" (the Short Swords Novice class from `data/classes.json`) — a console log and a simple on-screen text popup is enough. No skills or stat bonuses need to function yet.
6. **One enemy:** a Wolf (`data/enemies.json`), idle until the player enters an aggro radius, then paths to melee range and attacks. Basic contact damage is fine — no skills yet.
7. **Click-to-engage:** clicking the Wolf moves the player to melee range and initiates a basic auto-attack loop against it (attack, short cooldown, repeat) until it dies or the player moves away.
8. **HP:** a single health bar for both player and Wolf (no Critical bar yet — that's Milestone 2). Wolf death removes it from the scene and logs a proficiency exp gain.

## Explicitly Out of Scope (do not build these yet)

Building/tile-placement mode, crafting stations, food/hunger/mood, dungeon randomization, multiple party members, status effects, active skills/cooldowns/energy bar, the Critical health bar, dual-wielding, the research tree, Skill Books. All of these are later milestones — if you find yourself about to implement any of them, stop and flag it instead.

## Success Criteria

- Clicking an empty tile walks the player there.
- Clicking the Wolf walks the player to melee range and starts auto-attacking.
- The Wolf's HP bar depletes and it disappears on death.
- The player's Short Swords proficiency value increases from combat and visibly reaches 10.
- At proficiency 10, "Fencer" is displayed as unlocked.

## Data Files to Use

- `data/weapons.json` — weapon type definitions (id, category, two-handed flag).
- `data/classes.json` — proficiency tier thresholds and the Fencer unlock requirement.
- `data/enemies.json` — Wolf stats and harvest-item tags (harvest items themselves are not implemented in M1 — just stub the data so it's ready for a later milestone).
