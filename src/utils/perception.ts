import { CraftingSystem } from '../systems/CraftingSystem.ts';
import type { GatheringNodeDef } from '../types/game.ts';

/**
 * Computes the perception detection chance clamped to [0.05, 0.90].
 * chance = min(0.90, 0.05 + 0.01 * perceptionLevel + explorerBonus)
 */
export function computeDetectionChance(
  perceptionLevel: number,
  perks?: { detectionBonusChance?: number }
): number {
  const explorerBonus = perks?.detectionBonusChance ?? 0;
  const raw = 0.05 + 0.01 * perceptionLevel + explorerBonus;
  return Math.min(0.90, Math.round(raw * 10000) / 10000);
}

/**
 * Executes a detection tick over undiscovered caches and party members.
 * Returns the list of discovered caches and their revealer.
 */
export function runDetectionTick<
  C extends { x: number; y: number; roomIndex?: number },
  P extends { gridPos: { x: number; y: number }; state?: string; progression: { getProficiencyLevel(skillId: string): number } }
>(
  caches: C[],
  party: P[],
  rng: () => number = Math.random,
  getPerks: (member: P) => { detectionBonusChance?: number; detectionRadius?: number } = (m) =>
    CraftingSystem.getCrafterPerks(m as any, 'perception')
): { cache: C; revealer: P }[] {
  if (caches.length === 0 || party.length === 0) return [];
  const reveals: { cache: C; revealer: P }[] = [];

  for (let cIdx = caches.length - 1; cIdx >= 0; cIdx--) {
    const cache = caches[cIdx];
    for (const member of party) {
      if (member.state === 'dead' || member.state === 'downed') continue;
      const perks = getPerks(member);
      const radius = perks.detectionRadius ?? 3;
      const dist = Math.max(Math.abs(member.gridPos.x - cache.x), Math.abs(member.gridPos.y - cache.y));
      if (dist <= radius) {
        const percLevel = member.progression.getProficiencyLevel('perception');
        const chance = computeDetectionChance(percLevel, perks);
        const roll = rng();
        if (roll < chance) {
          reveals.push({ cache, revealer: member });
          break; // This cache is revealed, move to next cache
        }
      }
    }
  }

  return reveals;
}

/**
 * Checks if any living party member stepped directly onto an undiscovered cache tile.
 */
export function findStepReveals<
  C extends { x: number; y: number; roomIndex?: number },
  P extends { gridPos: { x: number; y: number }; state?: string }
>(
  caches: C[],
  party: P[]
): { cache: C; revealer: P }[] {
  if (caches.length === 0 || party.length === 0) return [];
  const reveals: { cache: C; revealer: P }[] = [];
  const revealedSet = new Set<C>();

  for (const member of party) {
    if (member.state === 'dead' || member.state === 'downed') continue;
    for (let i = caches.length - 1; i >= 0; i--) {
      const cache = caches[i];
      if (!revealedSet.has(cache) && member.gridPos.x === cache.x && member.gridPos.y === cache.y) {
        revealedSet.add(cache);
        reveals.push({ cache, revealer: member });
      }
    }
  }

  return reveals;
}

/**
 * Finds unvisited rooms that living party members have entered.
 */
export function findNewlyEnteredRooms<
  R extends { x: number; y: number; width: number; height: number },
  P extends { gridPos: { x: number; y: number }; state?: string }
>(
  rooms: R[],
  visited: Set<number>,
  party: P[]
): { roomIndex: number; room: R; members: P[] }[] {
  if (!rooms || rooms.length === 0 || party.length === 0) return [];
  const newlyEntered: { roomIndex: number; room: R; members: P[] }[] = [];

  for (let rIdx = 0; rIdx < rooms.length; rIdx++) {
    if (visited.has(rIdx)) continue;
    const room = rooms[rIdx];
    const livingInRoom = party.filter((m) => {
      if (m.state === 'dead' || m.state === 'downed') return false;
      return (
        m.gridPos.x >= room.x &&
        m.gridPos.x < room.x + room.width &&
        m.gridPos.y >= room.y &&
        m.gridPos.y < room.y + room.height
      );
    });

    if (livingInRoom.length > 0) {
      newlyEntered.push({ roomIndex: rIdx, room, members: livingInRoom });
    }
  }

  return newlyEntered;
}

/**
 * Evaluates gathering node bonuses from bonusLootPerk and bonusClassExp.
 */
export function rollNodeBonuses(
  nodeDef: GatheringNodeDef,
  character: any,
  rollFn: () => number = Math.random
): {
  bonusDrop: { resourceId: string; itemName: string; count: number } | null;
  classExpGrants: { classId: string; amount: number }[];
} {
  let bonusDrop: { resourceId: string; itemName: string; count: number } | null = null;
  const classExpGrants: { classId: string; amount: number }[] = [];

  // bonusLootPerk extra draw
  if (nodeDef.bonusLootPerk) {
    const perks = CraftingSystem.getCrafterPerks(character, nodeDef.bonusLootPerk);
    const bonusChance = (perks as any).cacheBonusRollChance ?? perks.bonusYieldChance ?? 0;
    if (bonusChance > 0) {
      const perkRoll = rollFn();
      if (perkRoll < bonusChance / 100) {
        if (nodeDef.lootTable && nodeDef.lootTable.length > 0) {
          const totalWeight = nodeDef.lootTable.reduce((sum, e) => sum + (e.weight ?? 1), 0);
          const rollVal = rollFn() * totalWeight;
          let acc = 0;
          let selected = nodeDef.lootTable[0];
          for (const entry of nodeDef.lootTable) {
            acc += (entry.weight ?? 1);
            if (rollVal <= acc) {
              selected = entry;
              break;
            }
          }
          const pId = selected.itemId || selected.resourceId || nodeDef.resourceId;
          const pName = selected.name || pId.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
          const pCount = selected.count ?? (selected.yieldCount ?? (nodeDef.yieldCount || 1));
          bonusDrop = { resourceId: pId, itemName: pName, count: pCount };
        }
      }
    }
  }

  // bonusClassExp
  if (nodeDef.bonusClassExp && Array.isArray(nodeDef.bonusClassExp)) {
    for (const entry of nodeDef.bonusClassExp) {
      if (character.progression.isClassUnlocked(entry.classId)) {
        classExpGrants.push({ classId: entry.classId, amount: entry.amount });
      }
    }
  }

  return { bonusDrop, classExpGrants };
}
