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
