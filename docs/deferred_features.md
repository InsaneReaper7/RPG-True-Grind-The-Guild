# Deferred Features Specification

This document captures features and design decisions intentionally deferred from current implementation rounds to ensure they are preserved and prioritized for future milestones.

---

## 1. Full-Group Retaliation When Attacked

### Background & Current Behavior
Currently, when an enemy initiates an attack on (or retargets to) a party member who is not actively targeting that enemy, that individual passively absorbs hits until downed. Other party members do not react unless commanded.

### Corrected Wanted Behavior (Target: Future Milestone)
- **Entire Active Group Retaliation**: When **any** party member takes damage, the **entire active party** must automatically engage that attacker — not just the individual member that was struck fighting back alone.
- **Trigger Semantics**: One party member taking a hit functions as a full party engage command against that enemy.
- **Engagement Logic**: Retaliation must use the exact same engage-and-position logic as a player-issued attack click (`engageEnemy`):
  - **Pass 1**: Members that can already attack from their exact current tile (`distance <= attackRangeTiles`) hold their positions and begin attacking immediately.
  - **Pass 2**: Members outside their attack range find distinct, reachable tiles strictly within their own `attackRangeTiles` around the attacker.
  - **Pass 3**: Movement paths are computed and executed without stacking.
- **Strict No-Stacking Invariant**: Retaliating members must always find their own free, unshared attackable tile. Tile occupancy rules apply strictly with zero exceptions (never overlapping another unit).

---

## 2. Forward-Looking Design Analysis: Swarm Encounters & Unit Trapping (Milestone 9)

### The Trapping Concern
With a strict no-stacking rule where units cannot path through or share tiles with other units:
- If enough enemies surround a single party member (or any unit) such that all 8 adjacent tiles are occupied, that unit becomes **fully trapped**.
- The unit has no reachable tile to path to, preventing retreat, tactical repositioning, or disengagement.
- While manageable with 1 or 2 enemies in Milestone 8, this becomes a critical gameplay failure mode in "swarm" style encounters (Milestone 9's bestiary expansion).

### Prospective Design Solutions (To be decided before Milestone 9 swarm content ships):
1. **Enemy Surround / Attack Concurrency Cap**:
   - Cap the number of simultaneous melee attackers that can target/surround a single unit (e.g., maximum 4 or 5 around an individual unit).
   - This guarantees at least one or more adjacent tiles always remain open for retreat or tactical maneuvering.
2. **"Shove Through" / Emergency Escape Valve**:
   - Introduce an explicit movement exception allowing a unit to path through an occupied enemy tile strictly when no alternative open route exists (possibly incurring a movement slow or stamina/energy cost).
3. **Flocking / Repulsion Separation**:
   - Swarm enemies maintain separation behaviors that avoid forming an impenetrable 8-tile barrier around isolated targets.

---

## 3. Advanced Armor Stats & Full Equipment Paperdoll (Future Milestones)

### Background & Milestone 28 Scope
In Milestone 28, Helmet and Body Armor slots were introduced with flat Max HP bonuses to establish the two-slot foundation and resolve dangling crafting resources (Wolf Pelt and Spider Silk) without complicating damage formulas. Equipping is handled cleanly via dropdown selectors in the Party Overview modal.

### Roadmap for Future Milestones
- **Specialized Defensive Stats**:
  - **Physical Damage Reduction**: Armor ratings mitigating flat or percentage physical damage from melee/ranged hits.
  - **Magic Resistance / Warding**: Mitigating elemental school damage (Fire, Ice, Lightning) or granting status effect resistance (reducing burn/chill/shock chances).
  - **Defensive Hidden Skill Synergy**: Bonuses to Block chance/mitigation %, Parry trigger rate, Counterattack damage, and Evasion rating.
- **Weight & Encumbrance System**:
  - Each armor piece and weapon having weight values (light hide, medium mail, heavy plate).
  - High total encumbrance imposing movement speed penalties or higher energy costs for sprinting/skills.
- **Full Drag-and-Drop Paperdoll Equipment Screen**:
  - Visual paperdoll character equipment screen deferred until jewelry and accessory slots (Necklace, Ring, Accessory) are introduced.
  - Interactive drag-and-drop paperdoll layout covering all slots simultaneously (Helmet, Body Armor, Weapons, Offhand, Necklace, Ring, Accessory) once the item catalogue spans all categories.

---

## 4. Javelin Class (Deferred to Milestone 54 — Prerequisite Resolved)

### Status Update (Milestone 54 — Implemented & Complete)
- **Resolved and Shipped**: `Javelin` class implemented in `data/classes.json` with Tier 1 Adept requirements (`spears: 30` + `throwing_weapons: 10`) and dual hidden skill bonuses (`counterattack: 0.05`, `evasion: 0.05`).
- **Full 5-Skill Kit**: Implemented in `data/skills.json` and `src/systems/CombatSystem.ts`:
  1. `piercing_throw` (Class Lv 1): 4-tile piercing projectile attack.
  2. `impaling_thrust` (Class Lv 10): 2-tile reach thrust applying `bleed`.
  3. `vaulting_leap` (Class Lv 20): Self reposition maneuver using spear leverage with +40% Evasion window.
  4. `pinning_spear` (Class Lv 30): 4-tile barbed throw applying `slow` (50%).
  5. `heartseeker_hurl` (Class Lv 40): 5-tile capstone with distance-scaled projectile damage (+10%/tile).
- **Genuine Hybrid Mechanics**:
  - Full cross-proficiency scaling on all offensive skills (`+0.15 * partnerLevel`).
  - Sidearm Pairing in `Player.ts`: Spears (1H/2H) with Throwing Weapons offhand, or Throwing Weapons with 1H Spear offhand without requiring Dual Wielding.
  - Skills usable with either weapon family.
- **Design Origin & Audit**: Direct audit of `class_system (1).md` confirmed Javelin was not in original tables; requirements and kit are newly designed following Tier 1 Adept precedents (matching Scout and Dark Knight).

---

## 5. Dragoon Class & Armor Proficiency System (Resolved & Shipped)

### Status Update (Implemented & Complete)
- **Resolved and Shipped**: With heavy armor equipment (`iron_greathelm`, `iron_plate_armor`) introduced in the armor expansion (798910f / dc29eed), `heavy_armor` became trainable through real armor wear in combat.
- **Dragoon Class Implemented**: `dragoon` added to `data/classes.json` with Tier 2 Expert requirements (`spears: 60`, `heavy_armor: 30`, `hoplite: 15`), hidden skill bonus `{ "resilience": 0.05 }`, and primary attribute `str`.
- **Full 5-Skill Kit**: Implemented in `data/skills.json`:
  1. `drake_thrust` (Class Lv 1): 1.5× weapon damage + PB heavy (+0.15 per Heavy Armor level), 16 EN, 3 s CD, Range 1.
  2. `iron_scales` (Class Lv 10): DT 0.7 for 6 s self-buff, 22 EN, 15 s CD.
  3. `dragon_dive` (Class Lv 20): move `leap` + 2.2× weapon damage + PB heavy, radius 1.5 around target, 30% stun, 28 EN, 10 s CD, Range 4.
  4. `wyrmpiercer` (Class Lv 30): 2.6× weapon damage, line AoE (`maxTargets: 3`), 100% expose, 30 EN, 9 s CD, Range 1, AI rotation 60 (≥2).
  5. `highwind` (Class Lv 40): move `leap` + 3.6× weapon damage + PB heavy, radius 2 around target, ×1.3 vs exposed targets, 44 EN, 18 s CD, Range 5.
- **Roster Count**: Combat classes increased from 85 → **86** (STR 39, DEX 13, INT 34), total classes from 94 → **95**, total skill IDs from 425 → **430**.

---

## 6. Spear Class Lineage: Naming Mismatch & Evolution Path Divergence (Design Flag)

### Audit Discovery (Surfaced via M54 Citation Audit)
1. **Naming Inversion in `class_system (1).md` vs Shipped M49**:
   - **Documented in `class_system (1).md`**:
     - *Tier 0 (Novice)*: **Spearman** (`Spears 10`) — "Basic reach fighter"
     - *Tier 1 (Apprentice)*: **Lancer** (`Spears 30 + Shields 10`) — "Defensive spear fighter"
     - *Tier 2 (Expert)*: **Storm Lancer** (`Spears 30 + Lightning Magic 30 + Lancer Lv 15`) — "Lightning-infused spear warrior"
   - **Shipped in M49**:
     - *Tier 0 (Novice)*: **Lancer** (`id: "lancer"`, `Spears 10`)
     - *Tier 1 (Adept)*: **Hoplite** (`id: "hoplite"`, `Spears 30 + Shields 10`)
   - What is live as `"lancer"` corresponds mechanically to documented `Spearman`, and `"hoplite"` corresponds mechanically to documented `Lancer`.

2. **Evolution Path Divergence (Dragoon vs. Storm Lancer) — Resolved as Dual Branches**:
   - The decision from 2026-09-26 confirmed **Direction 1 (Dual Branches)**:
     - **Storm Lancer** (Magical / Lightning hybrid: `Spears 30 + Lightning Magic 30 + Hoplite Lv 15`).
     - **Dragoon** (Martial / Heavy armor juggernaut: `Spears 60 + Heavy Armor 30 + Hoplite Lv 15`).
   - Both evolutions are now live in `classes.json`.

### Eventual Decision Points (Deferred — Non-blocking)
- **Class Naming / IDs**:
  - *Option A (Deliberate Divergence)*: Keep current shipped IDs and names (`lancer` at Spears 10, `hoplite` at Spears 30 + Shields 10) as an accepted divergence (preserves save compatibility and existing tests/references; "Hoplite" is an evocative and accurate name for Spear + Shield).
  - *Option B (Canonical Alignment)*: Perform a formal migration renaming `lancer` -> `spearman` and `hoplite` -> `lancer` across `classes.json`, tests, and save deserializers.

---

## 7. Crossbow Class Lineage: Loader Implemented, Deeper Tiers Deferred (Milestone 55)

### Status Summary
- **Shipped in Milestone 55**:
  - **Crossbows**: Implemented as a genuine two-handed ranged weapon (`twoHanded: true`, `attackRangeTiles: 4`, `baseAccuracy: 0.60`, `weight: 5.0`, `attackIntervalMs: 1500`, `baseDamage: 9`) with full additive accuracy scaling (`accuracyPerLevel: 0.004`), attack speed bonus (`attackSpeedPerLevel: 0.005`), and crafting recipe in `data/blacksmithRecipes.json`.
  - **Loader (Tier 0 Novice)**: Implemented and shipped alongside Crossbows at `Crossbows 10` with a full 5-skill kit (`primed_shot` Lv 1, `rapid_crank` Lv 10, `arbalest_brace` Lv 20, `pinning_bolt` Lv 30, `kinetic_overdraw` Lv 40). This prevents Crossbows from suffering the "reachable but hollow" progression gap, matching the pattern set by Fist→Brawler, Katana→Swordsman, Longswords→Squire, and Throwing Weapons→Skirmisher.

### Deeper Tiers Deferred (Documented Lineage in `class_system (1).md`)
The deeper tiers and hybrid branch are explicitly cited and preserved, but deferred to future dedicated milestones due to genuine cross-system prerequisites:

1. **Sharpshooter (Tier 1 Adept)**:
   - *Requirement*: `Crossbows 30 + Bows 10` (Line 125).
   - *Fantasy*: "Precision trainee".
   - *Deferral Reason*: Hybrid dual-ranged progression requiring Bows cross-proficiency synergy and hybrid skill design.
2. **Witch Hunter (Tier 2 Expert)**:
   - *Requirement*: `Crossbows 30 + Holy Magic 30 + Sharpshooter Lv 15` (Line 152).
   - *Fantasy*: "Monster and magic hunter".
   - *Deferral Reason*: Multi-tier dependency requiring Holy Magic integration and Sharpshooter class leveling.
3. **Demon Hunter (Tier 3 Master / Exotic)**:
   - *Requirement*: `Short Swords 60 + Crossbows 60 + Holy Magic 30 + Witch Hunter Lv 20` (Line 180).
   - *Fantasy*: "Specialist in hunting supernatural creatures".
   - *Deferral Reason*: Master-tier hybrid requiring Short Swords + Crossbows + Holy Magic + Witch Hunter progression.
4. **Bounty Hunter (Hybrid / Utility)**:
   - *Requirement*: `Crossbows 30 + Perception 30` (Line 328).
   - *Fantasy*: "Tracks marks others can't find".
   - *Deferral Reason*: Gated behind `Perception`, an entirely new character stat system not yet built in the project.

---

## 8. Thrower Class (Tier 1 Adept — Shipped & Reachable)

### Status Summary
- **Citation & Line References**:
  - Exact citation in `docs/class_system (1).md` line 136: `| Thrower | Throwing Weapons 30 + Daggers 10 | Quick-handed skirmisher |`.
  - Also cited at line 500: `Throwing Weapons is now covered (Skirmisher -> Thrower), but it doesn't yet have an Expert/Master-tier class of its own`.
  - GDD Section 12.2 audit confirmed Thrower is not among original starter templates; the 5-skill kit is transparently framed as an original, authentic hybrid design following Section 12.2 structure.
- **Genuine Hybrid Identity**:
  - Implemented in `data/classes.json` with Tier 1 Adept requirements (`throwing_weapons: 30` + `daggers: 10`) and dual hidden skill bonuses (`evasion: 0.05`, `counterattack: 0.05`).
  - Sidearm Pairing: Thrower can equip Throwing Weapons in main hand and Daggers in offhand (or Daggers in main hand and Throwing Weapons in offhand) as an allowed sidearm exception in `src/entities/Player.ts`, matching Scout and Javelin precedent without requiring universal Dual Wielding.
  - Cross-Proficiency Scaling: All offensive Thrower skills dynamically scale damage with the partner proficiency (+0.15 to +0.25 scaling per partner level).
  - Cross-Proficiency EXP Training: Attacks award EXP to both proficiencies (+2 wielded, +1/+2 partner).
- **Full 5-Skill Kit (1, 10, 20, 30, 40 Unlock Cadence)**:
  - `quick_toss` (Lv 1, 12 EN, 3.0s CD, 3 tiles): 140% weapon damage + partner scaling + Bleed check.
  - `skirmish_step` (Lv 10, 18 EN, 7.0s CD, 4s duration): tactical self-buff granting +35% Evasion.
  - `fan_of_knives` (Lv 20, 22 EN, 6.0s CD, 3 tiles): 160% weapon damage + 50% splash cleave to adjacent enemies within 1 tile.
  - `crippling_volley` (Lv 30, 26 EN, 9.0s CD, 4 tiles): 185% weapon damage + 50% Slow and Bleed for 4s.
  - `blade_barrage` (Lv 40 capstone, 35 EN, 12.0s CD, 4 tiles): 260% weapon damage + elevated hybrid scaling (+0.25/level); synergizes with `skirmish_step` to deal +25% bonus damage and refund 10 energy.

---

## 9. Alchemical Bomber Class & Crafting Mastery Progression (Explicitly Deferred — Missing Prerequisite Chain)

### Audit Discovery & Prerequisite Analysis
- **Documented Requirement in `docs/class_system (1).md`**:
  - Line 269: `| Alchemical Bomber | Alchemy 30 + Throwing Weapons 60 + Journeyman Alchemist Lv 15 | Turns volatile potions into weapons |`
  - Located under `## Crafting × Combat Hybrids`.
- **The Prerequisite Chain**:
  - Gated behind `Journeyman Alchemist Lv 15`.
  - In `docs/class_system (1).md` lines 244-250 (`## Crafting Mastery Classes`):
    - `Apprentice Alchemist` (`Alchemy 10`)
    - `Journeyman Alchemist` (`Alchemy 30, req. Apprentice Alchemist Lv 10`)
    - `Master Alchemist` (`Alchemy 60, req. Journeyman Lv 15`)
    - `Archalchemist` (`Alchemy 90, req. Master Lv 25`)
- **Codebase Audit Result**:
  - Neither `Journeyman Alchemist` nor `Apprentice Alchemist` exists in `data/classes.json` or anywhere in the codebase.
  - In fact, the entire **Crafting Mastery Class** system (Apprentice/Journeyman/Master ranks for crafting professions) has not yet been implemented.
  - Because `Journeyman Alchemist` does not exist as an actual class, a character cannot level it to Lv 15.
- **Explicit Deferral Decision**:
  - Following the established discipline of the project (matching how `Dragoon` was deferred due to missing Heavy Armor equipment, and how `Javelin` was deferred until Throwing Weapons existed):
  - `Apprentice Alchemist` is now implemented in the *Crafting Mastery, Apprentice Rank* milestone (unlocked at Alchemy 10).
  - `Journeyman Alchemist` (required at Alchemy 30 + Apprentice Alchemist Lv 10) is slated for the upcoming *Crafting Mastery, Journeyman Rank* milestone.
  - **Alchemical Bomber remains explicitly deferred**, now awaiting the arrival of the **Journeyman** rank milestone and its associated Alchemy 30 recipes. It will not be built around an invented shortcut or fake stand-in requirement.

---

## 10. Infernal Caldera Dedicated Boss (Third Boss Enemy — Future Milestone)

### Current Architecture & Deliberate Resolution
- The procedural dungeon generator enforces a milestone boss chamber every 5th floor (Floor 5, 10, 15, 20...).
- Floor 5 (Abyssal Depths) maps to `abyssal_colossus`.
- Floor 15+ (Glacial Caverns) maps to `glacial_sovereign`.
- Prior to this resolution, Floor 10 (Infernal Caldera, Floors 6–10) lacked an explicit `bossEnemyId` mapping, causing it to draw randomly from `bossPool`, which created an accidental thematic mismatch where the ice boss (`glacial_sovereign`) could spawn inside the volcanic core.
- **Current Deliberate Resolution**: `infernal_caldera.bossEnemyId` is explicitly mapped to `abyssal_colossus`. As a subterranean earth titan of stone with tectonic Earthshaker Tremors, `abyssal_colossus` serves as the intentional, documented placeholder boss for Floor 10 pending a dedicated volcanic boss. Multi-seed unit tests verify 100% `abyssal_colossus` spawns and 0% `glacial_sovereign` bleed.
- **Future Milestone Scope**: Introduce a dedicated Fire/Magma Boss-tier enemy (e.g., Magma Golem, Pyre Wyrm, or Infernal Juggernaut) with its own visual texture, fire/magma signature mechanics (e.g. lava pools, burn stacks), 4-item harvest drop table, and remap `infernal_caldera.bossEnemyId` to this new boss.
