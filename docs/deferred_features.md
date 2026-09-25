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

## 5. Dragoon Class & Armor Proficiency System (Prerequisite Resolved — Dragoon Ready for Dedicated Scoping)

### Status Update (Armor Proficiency System Shipped)
- **Resolved and Shipped**: Trainable **Armor Proficiency** system implemented across `light_armor`, `medium_armor`, and `heavy_armor`.
- **True Armor Tagging vs. Pure Stat Jewelry**:
  - The 4 true armor pieces in `armors.json` (Leather Cap, Leather Armor, Silk Cowl, Silk Robe) occupying the Helmet and Body slots are explicitly tagged with their weight class (`light` or `medium`).
  - The 3 jewelry/accessory pieces (Bone Necklace, Wolf Claw Ring, Venom Charm) occupying Necklace, Ring, and Accessory slots have **no `weightClass` tag** — they are pure stat items with zero involvement in armor proficiency.
- **Explicit Slot Exclusion & EXP Invariants**:
  - Combat hooks (`hit`, `attack`, `kill`) and active weight class introspection (`getEquippedArmorWeightClasses()`) **explicitly evaluate only true armor slots (`helmet` and `body`)**.
  - Necklace, Ring, and Accessory slots are explicitly excluded and contribute zero armor proficiency EXP under any condition.
- **EXP Awarding Mechanics (Intentional Design Distinction)**:
  - **Hit (`hit`) — Per-Piece Award**: When a character absorbs a hit in combat, every equipped true armor piece (Helmet/Body) absorbs impact and awards +1 EXP to its corresponding weight class. Wearing 2 light pieces (cowl + robe) awards +2 `light_armor` EXP per hit; wearing 1 light helmet and 1 medium body awards +1 `light_armor` EXP and +1 `medium_armor` EXP per hit. This models physical coverage: more surface area/pieces enduring damage yields more defensive conditioning.
  - **Attack (`attack`) & Kill (`kill`) — Per-Unique-Class Award**: Offensive actions award +1 EXP (`attack`) and +2 EXP (`kill`) per *unique weight class worn on true armor slots* rather than per piece. A character in full light armor moves and maneuvers within the light encumbrance class as a whole; deduplication prevents offensive action spam from multiplying EXP per piece equipped while still rewarding mixed-weight builds equally (+1/+2 to each worn class).
- **Known Deliberate Gap — `heavy_armor` Currently Untrainable**:
  - Zero existing true armor pieces in `armors.json` or recipes in `armorsmithRecipes.json` are tagged `heavy` (all existing true armor pieces are `light` or `medium`).
  - While the `heavy_armor` proficiency is architecturally complete, tested, and ready in engine logic (trainable stat definition, leveling curves, discovery, and serialization), there is currently no equipment in the game that allows a player to earn EXP in it.
  - **Prerequisite Tracking (Matching Throwing Weapons → Javelin)**: Exactly matching how Throwing Weapons was tracked as Javelin's missing prerequisite piece (Milestone 49 → Milestone 54), Heavy Armor equipment (e.g., Iron Plate, Forged Heavy Mail) is a known, deliberate prerequisite that must be introduced in a future blacksmithing/armor milestone before players can earn `heavy_armor` levels to satisfy Dragoon's requirement (`Spears 60 + Heavy Armor 30 + Lancer/Hoplite Lv 15`).
- **Next Step for Dragoon**: Introduce heavy armor craftables/equipment in an armor expansion milestone to enable `heavy_armor` training, and resolve the Lancer/Hoplite naming and evolutionary branch decisions.

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

2. **Evolution Path Divergence (Dragoon vs. Storm Lancer)**:
   - Early project concept and Section 5 above define Lancer's Tier 2 evolution as **Dragoon**, gated behind a new Heavy Armor proficiency system.
   - The canonical `class_system (1).md` documents Lancer's Tier 2 evolution as **Storm Lancer**, gated behind `Spears 30 + Lightning Magic 30 + Lancer Lv 15` (elemental magic synergy rather than armor proficiency).

### Eventual Decision Points (Deferred — Non-blocking)
- **Class Naming / IDs**:
  - *Option A (Deliberate Divergence)*: Keep current shipped IDs and names (`lancer` at Spears 10, `hoplite` at Spears 30 + Shields 10) as an accepted divergence (preserves save compatibility and existing tests/references; "Hoplite" is an evocative and accurate name for Spear + Shield).
  - *Option B (Canonical Alignment)*: Perform a formal migration renaming `lancer` -> `spearman` and `hoplite` -> `lancer` across `classes.json`, tests, and save deserializers.
- **Tier 2 Progression Architecture**:
  - *Direction 1 (Dual Branches)*: Support both evolutions branching from the spear tree:
    - **Storm Lancer** (Magical / Lightning hybrid: `Spears 30 + Lightning Magic 30 + Lancer Lv 15`).
    - **Dragoon** (Martial / Heavy armor juggernaut: `Spears 60 + Heavy Armor 30 + Lancer/Hoplite Lv 15`).
  - *Direction 2 (Single Intended Direction)*: Select either Storm Lancer or Dragoon as the canonical evolution.

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
