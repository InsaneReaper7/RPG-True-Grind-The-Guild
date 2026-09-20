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

## 4. Javelin Class (Deferred — Pending Throwing Weapons Milestone)

### Blocking Dependency
- Requires **Spears** + **Throwing Weapons** proficiency.
- While Spears was implemented in Milestone 49, `Throwing Weapons` does not yet exist as an active, crafted, and leveled weapon type (remains on the master backlog).

### Resolution Roadmap
- Following the proven sequencing pattern of Bows → Scout and Longswords → Dark Knight, `Throwing Weapons` must first be built in its own dedicated weapon milestone (recipes, attack logic, accuracy/damage scaling, and basic classes like Skirmisher).
- Once `Throwing Weapons` exists and is verified, **Javelin** will immediately become buildable as a natural follow-up hybrid class without speculative placeholders.

---

## 5. Dragoon Class & Armor Proficiency System (Deferred — Architectural Prerequisite)

### Blocking Dependency
- **Dragoon** (Lancer's Tier 2 evolution) is gated behind a **Heavy Armor** proficiency threshold.
- Currently, no Armor proficiency system (Light/Medium/Heavy, leveled through wear) exists in this project. All armor pieces (Milestones 28 & 33) are static equipment items providing flat Max HP bonuses. Nothing about wearing armor levels up.

### Resolution Roadmap
- Building Dragoon cannot be hastily mocked with a fake stat requirement. It fundamentally requires a dedicated architectural milestone:
  1. Design and build a trainable **Armor Proficiency** system where taking hits or wearing gear earns EXP toward armor weight classes (`light_armor`, `medium_armor`, `heavy_armor`).
  2. Retroactively tag every existing armor piece in `armors.json` (Leather Cap, Leather Armor, Silk Cowl, Silk Robe, Bone Necklace, etc.) with an explicit weight class.
  3. Once the Heavy Armor proficiency leveling loop is verified, Dragoon can be introduced with legitimate requirements (`Lancer` class level + `Heavy Armor` proficiency + `Spears` proficiency).


