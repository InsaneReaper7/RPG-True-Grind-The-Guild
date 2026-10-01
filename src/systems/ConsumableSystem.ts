import { DataLoader } from '../utils/DataLoader.ts';
import { GameState } from './GameState.ts';
import type { Player } from '../entities/Player.ts';

export interface UseConsumableOptions {
  party?: Player[];
  preferredTarget?: Player;
  fromMember?: Player;
  fromStockpile?: boolean;
  scene?: any;
}

export interface CanUseResult {
  canUse: boolean;
  reason?: string;
  target?: Player;
}

export interface UseResult {
  success: boolean;
  message: string;
}

export class ConsumableSystem {
  private static instance: ConsumableSystem;
  private cooldowns: Map<string, number> = new Map(); // itemId -> remainingMs

  private constructor() {}

  public static getInstance(): ConsumableSystem {
    if (!ConsumableSystem.instance) {
      ConsumableSystem.instance = new ConsumableSystem();
    }
    return ConsumableSystem.instance;
  }

  public getQuickSlots(): (string | null)[] {
    return GameState.getInstance().getQuickSlots();
  }

  public setQuickSlot(index: number, itemId: string | null): void {
    GameState.getInstance().setQuickSlot(index, itemId);
  }

  public clearQuickSlot(index: number): void {
    GameState.getInstance().setQuickSlot(index, null);
  }

  public getCooldownRemainingMs(itemId: string): number {
    return Math.max(0, this.cooldowns.get(itemId) || 0);
  }

  public setCooldown(itemId: string, durationMs: number): void {
    this.cooldowns.set(itemId, durationMs);
  }

  public update(deltaMs: number): void {
    for (const [id, remaining] of this.cooldowns.entries()) {
      const next = remaining - deltaMs;
      if (next <= 0) {
        this.cooldowns.delete(id);
      } else {
        this.cooldowns.set(id, next);
      }
    }
  }

  public isFoodItem(itemId: string): boolean {
    const dataLoader = DataLoader.getInstance();
    return !!dataLoader.getFood(itemId);
  }

  public isConsumable(itemId: string): boolean {
    if (this.isFoodItem(itemId)) return true;
    const knownConsumables = new Set([
      'bandage',
      'antidote',
      'energy_potion',
      'mana_potion',
      'revive_potion',
      'escape_stone',
      'health_potion',
      'potion_mana'
    ]);
    if (knownConsumables.has(itemId)) return true;
    const itemDef = DataLoader.getInstance().getItem(itemId);
    return itemDef?.category === 'consumables';
  }

  public getPartyCarriedCount(itemId: string, options?: UseConsumableOptions): number {
    const party = this.resolveParty(options);
    const normalizedId = itemId === 'potion_mana' ? 'mana_potion' : itemId;
    let total = 0;
    for (const m of party) {
      if (typeof m.getItemCount === 'function') {
        total += m.getItemCount(normalizedId);
      }
    }
    return total;
  }

  private resolveParty(options?: UseConsumableOptions): Player[] {
    if (options?.party && options.party.length > 0) {
      return options.party;
    }
    if (options?.preferredTarget) {
      if (typeof options.preferredTarget.getPartyMembers === 'function') {
        const party = options.preferredTarget.getPartyMembers();
        if (party && party.length > 0) return party;
      }
      return [options.preferredTarget];
    }
    if (options?.fromMember) {
      if (typeof options.fromMember.getPartyMembers === 'function') {
        const party = options.fromMember.getPartyMembers();
        if (party && party.length > 0) return party;
      }
      return [options.fromMember];
    }
    const hud = (globalThis as any).window?.activeHUD || (options?.scene as any)?.hud || (globalThis as any).activeHUD;
    if (hud?.currentParty && hud.currentParty.length > 0) {
      return hud.currentParty;
    }
    if (hud?.getCurrentParty && hud.getCurrentParty().length > 0) {
      return hud.getCurrentParty();
    }
    if (options?.scene?.party && options.scene.party.length > 0) {
      return options.scene.party;
    }
    if (options?.scene?.player) {
      if (typeof options.scene.player.getPartyMembers === 'function') {
        return options.scene.player.getPartyMembers();
      }
      return [options.scene.player];
    }
    return [];
  }

  private getSelectedMembers(party: Player[], options?: UseConsumableOptions): Player[] {
    const hud = (globalThis as any).window?.activeHUD || (options?.scene as any)?.hud;
    if (hud?.getSelectedMemberIndices) {
      const indices: number[] = Array.from(hud.getSelectedMemberIndices());
      const selected = indices.map((idx: number) => party[idx]).filter(Boolean);
      if (selected.length > 0) return selected;
    }
    if (options?.scene?.getSelectedMembers) {
      const selected = options.scene.getSelectedMembers();
      if (selected && selected.length > 0) return selected;
    }
    return [];
  }

  private showToast(message: string, type: 'info' | 'warn' | 'error' | 'success' = 'warn', duration: number = 2500): void {
    const hud = (globalThis as any).window?.activeHUD;
    if (hud && typeof hud.showToast === 'function') {
      hud.showToast(message, type, duration);
    } else {
      console.log(`[ConsumableSystem] [Toast ${type}] ${message}`);
    }
  }

  public getTargetForConsumable(itemId: string, options?: UseConsumableOptions): Player | null {
    const check = this.canUseConsumable(itemId, options);
    return check.target || null;
  }

  public canUseConsumable(itemId: string, options?: UseConsumableOptions): CanUseResult {
    const party = this.resolveParty(options);
    const leader = party[0];
    const selectedMembers = this.getSelectedMembers(party, options);

    // Normalize mana_potion alias
    const normalizedId = itemId === 'potion_mana' ? 'mana_potion' : itemId;

    // Check item cooldown
    const cd = this.getCooldownRemainingMs(normalizedId);
    if (cd > 0) {
      return { canUse: false, reason: `On cooldown (${(cd / 1000).toFixed(1)}s)` };
    }

    // Availability check: is it carried, or food at Outpost?
    const gameState = GameState.getInstance();
    const isFood = this.isFoodItem(normalizedId);
    const isAtOutpost = leader && typeof leader.isAtOutpost === 'function' ? leader.isAtOutpost() : false;

    let totalCarried = 0;
    if (options?.fromMember && typeof options.fromMember.getItemCount === 'function') {
      totalCarried = options.fromMember.getItemCount(normalizedId);
    } else {
      for (const m of party) {
        if (typeof m.getItemCount === 'function') {
          totalCarried += m.getItemCount(normalizedId);
        }
      }
    }

    const stockpileCount = gameState.getItemCount(normalizedId);

    if (options?.fromStockpile) {
      if (!isFood) {
        return { canUse: false, reason: 'Stockpile items cannot be used (carried-only)' };
      }
      if (!isAtOutpost) {
        return { canUse: false, reason: 'Stockpile food can only be eaten at the Outpost' };
      }
      if (stockpileCount <= 0) {
        return { canUse: false, reason: 'No food in stockpile' };
      }
    } else if (totalCarried <= 0) {
      if (isFood && isAtOutpost && stockpileCount > 0) {
        // Can draw from stockpile at Outpost
      } else {
        return { canUse: false, reason: 'None carried' };
      }
    }

    switch (normalizedId) {
      case 'revive_potion': {
        // The selected member, if downed. Otherwise the downed member closest to the leader.
        if (options?.preferredTarget && options.preferredTarget.state === 'downed') {
          return { canUse: true, target: options.preferredTarget };
        }
        const selectedDowned = selectedMembers.find((m) => m.state === 'downed');
        if (selectedDowned) {
          return { canUse: true, target: selectedDowned };
        }
        const allDowned = party.filter((m) => m.state === 'downed');
        if (allDowned.length === 0) {
          return { canUse: false, reason: 'No one is downed' };
        }
        if (leader) {
          allDowned.sort((a, b) => {
            const distA = Math.hypot((a.gridPos?.x ?? a.x) - (leader.gridPos?.x ?? leader.x), (a.gridPos?.y ?? a.y) - (leader.gridPos?.y ?? leader.y));
            const distB = Math.hypot((b.gridPos?.x ?? b.x) - (leader.gridPos?.x ?? leader.x), (b.gridPos?.y ?? b.y) - (leader.gridPos?.y ?? leader.y));
            return distA - distB;
          });
        }
        return { canUse: true, target: allDowned[0] };
      }

      case 'bandage': {
        // The selected member, if bleeding. Otherwise any bleeding member.
        if (options?.preferredTarget && options.preferredTarget.activeStatusEffects.has('bleed')) {
          return { canUse: true, target: options.preferredTarget };
        }
        const selectedBleeding = selectedMembers.find((m) => m.activeStatusEffects.has('bleed'));
        if (selectedBleeding) {
          return { canUse: true, target: selectedBleeding };
        }
        const anyBleeding = party.find((m) => m.activeStatusEffects.has('bleed'));
        if (anyBleeding) {
          return { canUse: true, target: anyBleeding };
        }
        return { canUse: false, reason: 'Not bleeding' };
      }

      case 'antidote': {
        // The selected member, if poisoned. Otherwise any poisoned member.
        if (options?.preferredTarget && options.preferredTarget.activeStatusEffects.has('poison')) {
          return { canUse: true, target: options.preferredTarget };
        }
        const selectedPoisoned = selectedMembers.find((m) => m.activeStatusEffects.has('poison'));
        if (selectedPoisoned) {
          return { canUse: true, target: selectedPoisoned };
        }
        const anyPoisoned = party.find((m) => m.activeStatusEffects.has('poison'));
        if (anyPoisoned) {
          return { canUse: true, target: anyPoisoned };
        }
        return { canUse: false, reason: 'Not poisoned' };
      }

      case 'energy_potion':
      case 'mana_potion': {
        // The selected member. If nobody is selected, or several are, use the leader.
        let target: Player | undefined;
        if (options?.preferredTarget) {
          target = options.preferredTarget;
        } else if (selectedMembers.length === 1) {
          target = selectedMembers[0];
        } else {
          target = leader;
        }

        if (!target) {
          return { canUse: false, reason: 'No valid target' };
        }

        if (target.energy >= target.maxEnergy) {
          return { canUse: false, reason: 'Energy full', target };
        }

        return { canUse: true, target };
      }

      case 'health_potion': {
        // The selected member, if injured. Otherwise the injured member with the lowest HP%.
        if (options?.preferredTarget && options.preferredTarget.hp < options.preferredTarget.maxHp && options.preferredTarget.state !== 'dead') {
          return { canUse: true, target: options.preferredTarget };
        }
        const selectedInjured = selectedMembers.find((m) => m.hp < m.maxHp && m.state !== 'dead');
        if (selectedInjured) {
          return { canUse: true, target: selectedInjured };
        }
        const injuredList = party.filter((m) => m.hp < m.maxHp && m.state !== 'dead');
        if (injuredList.length === 0) {
          return { canUse: false, reason: 'No one is injured' };
        }
        injuredList.sort((a, b) => a.hp / Math.max(1, a.maxHp) - b.hp / Math.max(1, b.maxHp));
        return { canUse: true, target: injuredList[0] };
      }

      case 'escape_stone': {
        // Party-wide, as today.
        if (isAtOutpost) {
          return { canUse: false, reason: 'Already at Outpost' };
        }
        const partyInCombat = party.some((m) => m.inCombat);
        const combatActive = partyInCombat || (options?.scene?.combatSystem ? options.scene.combatSystem.isInCombat(options.scene.time?.now || Date.now()) : false);
        if (combatActive) {
          return { canUse: false, reason: 'Cannot escape in combat' };
        }
        if (options?.scene?.isTransitioning) {
          return { canUse: false, reason: 'Already escaping' };
        }
        return { canUse: true, target: leader };
      }

      default: {
        if (isFood) {
          // Food: The selected member, or the leader.
          let target: Player | undefined;
          if (options?.preferredTarget) {
            target = options.preferredTarget;
          } else if (selectedMembers.length === 1) {
            target = selectedMembers[0];
          } else {
            target = leader;
          }

          if (!target) {
            return { canUse: false, reason: 'No valid target' };
          }

          if (target.hunger >= target.maxHunger) {
            return { canUse: false, reason: 'Hunger full', target };
          }

          return { canUse: true, target };
        }
        return { canUse: false, reason: 'Unknown consumable' };
      }
    }
  }

  private consumeItemFromParty(itemId: string, target: Player, party: Player[], fromMember?: Player): boolean {
    const normalizedId = itemId === 'potion_mana' ? 'mana_potion' : itemId;
    // 1. If explicit fromMember requested, use it first
    if (fromMember && typeof fromMember.getItemCount === 'function' && fromMember.getItemCount(normalizedId) > 0) {
      if (typeof fromMember.removeItem === 'function') {
        return fromMember.removeItem(normalizedId, 1);
      }
    }
    // 2. Target's own bag first
    if (target && typeof target.getItemCount === 'function' && target.getItemCount(normalizedId) > 0) {
      if (typeof target.removeItem === 'function') {
        return target.removeItem(normalizedId, 1);
      }
    }
    // 3. Other party bags in order
    for (const m of party) {
      if (m !== target && typeof m.getItemCount === 'function' && m.getItemCount(normalizedId) > 0) {
        if (typeof m.removeItem === 'function') {
          return m.removeItem(normalizedId, 1);
        }
      }
    }
    // 4. Try target's consumeCarriedConsumable if implemented
    if (target && typeof target.consumeCarriedConsumable === 'function') {
      return target.consumeCarriedConsumable(normalizedId, 1);
    }
    return false;
  }

  public static useConsumable(itemId: string, options?: UseConsumableOptions): UseResult {
    return ConsumableSystem.getInstance().useConsumable(itemId, options);
  }

  public static canUseConsumable(itemId: string, options?: UseConsumableOptions): CanUseResult {
    return ConsumableSystem.getInstance().canUseConsumable(itemId, options);
  }

  public useConsumable(itemId: string, options?: UseConsumableOptions): UseResult {
    const normalizedId = itemId === 'potion_mana' ? 'mana_potion' : itemId;
    const check = this.canUseConsumable(normalizedId, options);

    if (!check.canUse) {
      const toastMsg =
        check.reason === 'No one is downed'
          ? 'No one needs reviving'
          : check.reason === 'Not bleeding'
          ? 'No one is bleeding'
          : check.reason === 'Not poisoned'
          ? 'No one is poisoned'
          : check.reason === 'Energy full'
          ? 'Energy full'
          : check.reason === 'Hunger full'
          ? 'Hunger full'
          : check.reason === 'Health full'
          ? 'No one is injured'
          : check.reason === 'Cannot escape in combat'
          ? '⚠️ Cannot use Escape Stone while any party member is in combat!'
          : check.reason === 'Already at Outpost'
          ? 'Already at Outpost!'
          : check.reason === 'None carried'
          ? `No ${normalizedId.replace(/_/g, ' ')} carried by party!`
          : `Cannot use: ${check.reason}`;

      this.showToast(toastMsg, 'warn');
      return { success: false, message: toastMsg };
    }

    const party = this.resolveParty(options);
    const leader = party[0];
    const target = check.target || leader;

    switch (normalizedId) {
      case 'revive_potion': {
        const downedAlly = target;
        if (!downedAlly || downedAlly.state !== 'downed') {
          const msg = 'No one needs reviving';
          this.showToast(msg, 'warn');
          return { success: false, message: msg };
        }

        // Scene revive flow
        const scene = options?.scene || downedAlly.scene || (globalThis as any).window?.game?.scene?.getScene('MainScene') || (globalThis as any).window?.game?.scene?.getScene('OutpostScene');
        if (scene && typeof scene.interactReviveAlly === 'function') {
          const ok = scene.interactReviveAlly(downedAlly);
          if (ok !== false) {
            return { success: true, message: `Starting revive on ${downedAlly.entityName}...` };
          }
          return { success: false, message: 'Revive could not be started' };
        }

        // Fallback / headless flow: carried item from target first then others
        const consumed = this.consumeItemFromParty('revive_potion', downedAlly, party, options?.fromMember);
        if (!consumed) {
          const msg = '⚠️ No Revive Potion carried!';
          this.showToast(msg, 'warn');
          return { success: false, message: msg };
        }

        const livingReviver = party.find((m) => m.state !== 'downed' && m.state !== 'dead') || leader;
        if (typeof downedAlly.revive === 'function') {
          downedAlly.revive(livingReviver);
        } else {
          downedAlly.state = 'idle';
          downedAlly.hp = Math.ceil(downedAlly.maxHp * 0.2);
        }
        const msg = `✨ Revived ${downedAlly.entityName}!`;
        this.showToast(msg, 'success');
        return { success: true, message: msg };
      }

      case 'bandage': {
        if (!target.activeStatusEffects.has('bleed')) {
          const msg = 'Not bleeding';
          this.showToast(msg, 'warn');
          return { success: false, message: msg };
        }
        const consumed = this.consumeItemFromParty('bandage', target, party, options?.fromMember);
        if (!consumed) {
          const msg = 'No Bandages carried by party!';
          this.showToast(msg, 'warn');
          return { success: false, message: msg };
        }
        if (typeof target.removeStatusEffect === 'function') {
          target.removeStatusEffect('bleed');
        } else if (target.activeStatusEffects?.delete) {
          target.activeStatusEffects.delete('bleed');
        }
        target.createFloatingText?.('Cured Bleed!', '#22c55e');
        const msg = `🩹 Applied Bandage to ${target.entityName}! Cured Bleed.`;
        this.showToast(msg, 'success');
        return { success: true, message: msg };
      }

      case 'antidote': {
        if (!target.activeStatusEffects.has('poison')) {
          const msg = 'Not poisoned';
          this.showToast(msg, 'warn');
          return { success: false, message: msg };
        }
        const consumed = this.consumeItemFromParty('antidote', target, party, options?.fromMember);
        if (!consumed) {
          const msg = 'No Antidotes carried by party!';
          this.showToast(msg, 'warn');
          return { success: false, message: msg };
        }
        if (typeof target.removeStatusEffect === 'function') {
          target.removeStatusEffect('poison');
        } else if (target.activeStatusEffects?.delete) {
          target.activeStatusEffects.delete('poison');
        }
        target.createFloatingText?.('Cured Poison!', '#22c55e');
        const msg = `🧪 Applied Antidote to ${target.entityName}! Cured Poison.`;
        this.showToast(msg, 'success');
        return { success: true, message: msg };
      }

      case 'energy_potion':
      case 'mana_potion': {
        if (target.energy >= target.maxEnergy) {
          const msg = 'Energy full';
          this.showToast(msg, 'warn');
          return { success: false, message: msg };
        }
        const consumed = this.consumeItemFromParty(normalizedId, target, party, options?.fromMember);
        if (!consumed) {
          const msg = `No ${normalizedId === 'energy_potion' ? 'Energy' : 'Mana'} Potions carried!`;
          this.showToast(msg, 'warn');
          return { success: false, message: msg };
        }

        const recipe = DataLoader.getInstance().getAlchemyRecipe(normalizedId);
        const energyRestored = recipe?.energyRestored ?? 35;
        target.energy = Math.min(target.maxEnergy, target.energy + energyRestored);
        const buffDuration = recipe?.buffDurationMs ?? 15000;
        const buffRegen = recipe?.buffRegenPerSec ?? 2;
        if (normalizedId === 'energy_potion') {
          target.energyPotionRemainingMs = buffDuration;
          target.energyPotionRegenPerSec = buffRegen;
        } else {
          target.manaPotionRemainingMs = buffDuration;
          target.manaPotionRegenPerSec = buffRegen;
        }

        const potLabel = normalizedId === 'energy_potion' ? 'Energy Potion' : 'Mana Potion';
        const msg = `⚡ ${target.entityName} drank ${potLabel}!`;
        this.showToast(msg, 'success');
        return { success: true, message: msg };
      }

      case 'health_potion': {
        if (target.hp >= target.maxHp) {
          const msg = 'No one is injured';
          this.showToast(msg, 'warn');
          return { success: false, message: msg };
        }
        const consumed = this.consumeItemFromParty('health_potion', target, party, options?.fromMember);
        if (!consumed) {
          const msg = 'No Health Potions carried by party!';
          this.showToast(msg, 'warn');
          return { success: false, message: msg };
        }
        const healAmt = 50;
        const oldHp = target.hp;
        target.hp = Math.min(target.maxHp, target.hp + healAmt);
        const healed = Math.round(target.hp - oldHp);
        target.createFloatingText?.(`+${healed} HP`, '#4ade80');
        this.setCooldown('health_potion', 10000);
        const msg = `💖 ${target.entityName} restored +${healed} HP!`;
        this.showToast(msg, 'success');
        return { success: true, message: msg };
      }

      case 'escape_stone': {
        const scene = options?.scene || leader?.scene || (globalThis as any).window?.game?.scene?.getScene('MainScene');
        if (scene && typeof scene.useEscapeStone === 'function') {
          const ok = scene.useEscapeStone();
          if (ok !== false) {
            return { success: true, message: '🌀 Using Escape Stone! Teleporting party to Outpost...' };
          }
          return { success: false, message: 'Could not use Escape Stone' };
        }
        // Fallback
        const consumed = this.consumeItemFromParty('escape_stone', leader, party, options?.fromMember);
        if (!consumed) {
          const msg = 'No Escape Stone carried by party!';
          this.showToast(msg, 'warn');
          return { success: false, message: msg };
        }
        const msg = '🌀 Using Escape Stone! Teleporting party to Outpost...';
        this.showToast(msg, 'success');
        return { success: true, message: msg };
      }

      default: {
        if (this.isFoodItem(normalizedId)) {
          if (target.hunger >= target.maxHunger) {
            const msg = 'Hunger full';
            this.showToast(msg, 'warn');
            return { success: false, message: msg };
          }
          if (options?.fromStockpile) {
            if (!target.isAtOutpost()) {
              const msg = 'Stockpile food can only be eaten at the Outpost';
              this.showToast(msg, 'warn');
              return { success: false, message: msg };
            }
            if (GameState.getInstance().getItemCount(normalizedId) <= 0) {
              const msg = 'No food in stockpile!';
              this.showToast(msg, 'warn');
              return { success: false, message: msg };
            }
            GameState.getInstance().consumeItem(normalizedId, 1);
            if (typeof target.eatFood === 'function') {
              target.eatFood(normalizedId);
            } else {
              target.hunger = Math.min(target.maxHunger, target.hunger + 30);
            }
          } else {
            const consumed = this.consumeItemFromParty(normalizedId, target, party, options?.fromMember);
            if (!consumed) {
              const msg = 'No food available to eat!';
              this.showToast(msg, 'warn');
              return { success: false, message: msg };
            }
            if (typeof target.eatFood === 'function') {
              target.eatFood(normalizedId);
            } else {
              target.hunger = Math.min(target.maxHunger, target.hunger + 30);
            }
          }
          const msg = `🍖 ${target.entityName} ate ${normalizedId.replace(/_/g, ' ')}!`;
          this.showToast(msg, 'success');
          return { success: true, message: msg };
        }
        const msg = 'Unknown consumable';
        return { success: false, message: msg };
      }
    }
  }
}
