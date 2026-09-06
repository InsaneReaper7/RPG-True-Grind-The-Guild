import Phaser from 'phaser';
import { Entity } from './Entity';
import { PlayerData, WeaponDef } from '../types/game';
import { GameState } from '../systems/GameState';
import { DataLoader } from '../utils/DataLoader';

export class Player extends Entity {
  public equippedWeapon: WeaponDef;
  public targetEntity: Entity | null = null;
  public lastAttackTime: number = 0;
  public attackRangeTiles: number = 1;

  public energy: number;
  public maxEnergy: number;
  public energyRegenPerSecond: number;
  public lastSkillUseTimes: Map<string, number> = new Map();

  public knownSkillIds: string[] = [];
  public equippedSkillIds: string[] = [];
  public autocastMap: Map<string, boolean> = new Map();
  public bookLearnedSkills: Set<string> = new Set();

  // Milestone 7: Hunger, Mood & Food Buff
  public hunger: number = 100;
  public maxHunger: number = 100;
  public hungerDrainPerSecond: number = 0.5; // ~30 hunger per minute
  public autoEatThreshold: number = 25;

  public mood: number = 80;
  public maxMood: number = 100;

  public wellFedRemainingMs: number = 0;
  public wellFedNextTickMs: number = 0;
  public wellFedHpPerSec: number = 2;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    playerData: PlayerData,
    startingWeapon: WeaponDef,
    tileSize: number = 32
  ) {
    super(
      scene,
      x,
      y,
      'player-avatar',
      playerData.name,
      playerData.maxHp,
      playerData.criticalHpMax,
      tileSize
    );

    this.moveSpeed = playerData.moveSpeed;
    this.attackRangeTiles = playerData.attackRangeTiles;
    this.equippedWeapon = startingWeapon;

    this.energy = playerData.maxEnergy;
    this.maxEnergy = playerData.maxEnergy;
    this.energyRegenPerSecond = playerData.energyRegenPerSecond;

    this.knownSkillIds = playerData.knownSkillIds ? [...playerData.knownSkillIds] : ['power_strike'];
    this.equippedSkillIds = playerData.equippedSkillIds ? [...playerData.equippedSkillIds] : ['power_strike'];
    for (const skillId of this.equippedSkillIds) {
      this.autocastMap.set(skillId, true);
    }
  }

  public isAutocastEnabled(skillId: string): boolean {
    if (!this.autocastMap.has(skillId)) {
      return true; // default ON
    }
    return this.autocastMap.get(skillId) === true;
  }

  public setAutocast(skillId: string, enabled: boolean): void {
    this.autocastMap.set(skillId, enabled);
    console.log(`[Player] Autocast for skill '${skillId}' set to ${enabled ? 'ON' : 'OFF'}`);
  }

  public equipSkill(skillId: string, slotIndex?: number): boolean {
    if (!this.knownSkillIds.includes(skillId)) {
      console.warn(`[Player] Cannot equip unknown skill: ${skillId}`);
      return false;
    }
    // If already equipped, return false or no-op
    const existingIndex = this.equippedSkillIds.indexOf(skillId);
    if (existingIndex !== -1) {
      if (slotIndex !== undefined && slotIndex !== existingIndex && slotIndex < 5) {
        // Swap or move within slots
        this.equippedSkillIds.splice(existingIndex, 1);
        this.equippedSkillIds.splice(slotIndex, 0, skillId);
        return true;
      }
      return false;
    }

    if (this.equippedSkillIds.length >= 5 && slotIndex === undefined) {
      console.warn(`[Player] Cannot equip more than 5 skills`);
      return false;
    }

    if (slotIndex !== undefined && slotIndex >= 0 && slotIndex < 5) {
      if (slotIndex < this.equippedSkillIds.length) {
        this.equippedSkillIds[slotIndex] = skillId;
      } else {
        this.equippedSkillIds.push(skillId);
      }
    } else {
      if (this.equippedSkillIds.length < 5) {
        this.equippedSkillIds.push(skillId);
      }
    }

    if (!this.autocastMap.has(skillId)) {
      this.autocastMap.set(skillId, true);
    }
    console.log(`[Player] Equipped skill: ${skillId}. Current loadout: [${this.equippedSkillIds.join(', ')}]`);
    return true;
  }

  public unequipSkill(skillId: string): boolean {
    const idx = this.equippedSkillIds.indexOf(skillId);
    if (idx === -1) return false;
    this.equippedSkillIds.splice(idx, 1);
    console.log(`[Player] Unequipped skill: ${skillId}. Current loadout: [${this.equippedSkillIds.join(', ')}]`);
    return true;
  }

  public learnSkill(skillId: string, fromBook: boolean = false): boolean {
    let newlyLearned = false;
    if (!this.knownSkillIds.includes(skillId)) {
      this.knownSkillIds.push(skillId);
      newlyLearned = true;
    }
    if (fromBook) {
      this.bookLearnedSkills.add(skillId);
    }
    return newlyLearned;
  }

  public isSkillLearnedFromBook(skillId: string): boolean {
    return this.bookLearnedSkills.has(skillId);
  }

  public applyBandage(): boolean {
    if (!this.activeStatusEffects.has('bleed')) {
      return false;
    }
    const gameState = GameState.getInstance();
    if (gameState.getItemCount('bandage') <= 0) {
      return false;
    }
    const consumed = gameState.consumeItem('bandage', 1);
    if (!consumed) {
      return false;
    }
    this.removeStatusEffect('bleed');
    return true;
  }

  public setTarget(target: Entity | null): void {
    this.targetEntity = target;
  }

  public clearTarget(): void {
    this.targetEntity = null;
  }

  public revive(): void {
    if (this.state !== 'downed') return;

    this.hp = Math.floor(this.maxHp * 0.5);
    this.criticalHp = this.maxCriticalHp;
    this.state = 'idle';

    this.avatarSprite.setAngle(0);
    this.avatarSprite.setAlpha(1);
    this.drawHpBar();
    console.log(`[Player] Revived with ${this.hp} Main HP and ${this.criticalHp} Critical HP!`);
  }

  public heal(amount: number): number {
    if (this.state === 'dead' || this.state === 'downed') return 0;
    const oldHp = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    const restored = this.hp - oldHp;
    if (restored > 0) {
      this.drawHpBar();
    }
    return restored;
  }

  /**
   * Fully restores Main HP, Critical HP, and Energy to their maximums instantly.
   * Recovers downed state if downed, clears active status effects, and redraws HP bar.
   * Returns true if any stat was actually restored, or false if already at 100% capacity.
   */
  public rest(): boolean {
    const wasFull =
      this.hp >= this.maxHp &&
      this.criticalHp >= this.maxCriticalHp &&
      this.energy >= this.maxEnergy;

    this.hp = this.maxHp;
    this.criticalHp = this.maxCriticalHp;
    this.energy = this.maxEnergy;

    if (this.state === 'downed') {
      this.state = 'idle';
      this.avatarSprite.setAngle(0);
      this.avatarSprite.setAlpha(1);
    }

    if (this.activeStatusEffects.size > 0) {
      this.activeStatusEffects.clear();
      if (this.statusIconSprite) this.statusIconSprite.setVisible(false);
      this.avatarSprite.clearTint();
    }

    this.drawHpBar();
    return !wasFull;
  }

  public eatFood(foodId: string = 'ration'): boolean {
    const dataLoader = DataLoader.getInstance();
    const foodDef = dataLoader.getFood(foodId);
    if (!foodDef) {
      console.warn(`[Player] Unknown food item: ${foodId}`);
      return false;
    }

    const gameState = GameState.getInstance();
    const consumed = gameState.consumeOldestFood(foodId);
    if (!consumed) {
      return false;
    }

    const oldHunger = this.hunger;
    this.hunger = Math.min(this.maxHunger, this.hunger + foodDef.hungerRestored);
    const restored = this.hunger - oldHunger;

    // Refresh Well Fed buff (resets duration to 15s, does not stack +2 HP/sec rate)
    this.wellFedHpPerSec = foodDef.buff.hpRegenPerSec;
    this.wellFedRemainingMs = foodDef.buff.durationMs;
    this.wellFedNextTickMs = 1000;

    console.log(
      `%c[Player] 🍖 Ate ${foodDef.name}! Restored +${restored.toFixed(1)} Hunger (Now: ${this.hunger.toFixed(1)}/100). Well Fed buff refreshed (15s @ +${this.wellFedHpPerSec} HP/s).`,
      'color: #10b981; font-weight: bold;'
    );
    this.createFloatingText(`+${restored.toFixed(0)} Hunger (Well Fed)`, '#10b981');
    return true;
  }

  public setHunger(amount: number): void {
    this.hunger = Math.max(0, Math.min(this.maxHunger, amount));
    console.log(`[Player] Hunger set to: ${this.hunger.toFixed(1)} / ${this.maxHunger}`);
  }

  public setMood(amount: number): void {
    this.mood = Math.max(0, Math.min(this.maxMood, amount));
    console.log(`[Player] Mood set to: ${this.mood.toFixed(1)} / ${this.maxMood}`);
  }

  public createFloatingText(textString: string, colorHex: string): void {
    const text = this.scene.add.text(this.x, this.y - 20, textString, {
      fontSize: '11px',
      color: colorHex,
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: { x: 4, y: 2 }
    });
    text.setOrigin(0.5);
    text.setDepth(this.y + 1000);

    this.scene.tweens.add({
      targets: text,
      y: text.y - 20,
      alpha: 0,
      duration: 1000,
      onComplete: () => text.destroy()
    });
  }

  public override update(time: number, delta: number): void {
    super.update(time, delta);

    if (this.state !== 'downed' && this.state !== 'dead') {
      // 1. Passive Energy regeneration over time
      if (this.energy < this.maxEnergy) {
        this.energy = Math.min(this.maxEnergy, this.energy + (this.energyRegenPerSecond * delta) / 1000);
      }

      // 2. Hunger Drain over time
      if (this.hunger > 0) {
        this.hunger = Math.max(0, this.hunger - (this.hungerDrainPerSecond * delta) / 1000);
      }

      // 3. Auto-Eat when crossing low threshold
      if (this.hunger <= this.autoEatThreshold) {
        const gameState = GameState.getInstance();
        if (gameState.getFoodItemCount('ration') > 0) {
          console.log(
            `%c[Auto-Eat] 🥣 Hunger dropped to ${this.hunger.toFixed(1)} <= ${this.autoEatThreshold}. Auto-eating Ration from inventory...`,
            'color: #34d399; font-weight: bold;'
          );
          this.eatFood('ration');
        }
      }

      // 4. Well Fed HP Regen Buff Ticking
      if (this.wellFedRemainingMs > 0) {
        this.wellFedRemainingMs -= delta;
        this.wellFedNextTickMs -= delta;
        if (this.wellFedNextTickMs <= 0) {
          this.wellFedNextTickMs += 1000;
          if (this.hp < this.maxHp) {
            const healed = this.heal(this.wellFedHpPerSec);
            if (healed > 0) {
              console.log(`[Well Fed] Regenerated +${healed} HP from food buff!`);
              this.createFloatingText(`+${healed} HP`, '#22c55e');
            }
          }
        }
      }

      // 5. Dynamic Mood System (Asymmetric Rest vs Dungeon Crawl & Hunger Inputs)
      const isSafeZone = GameState.getInstance().getIsSafeZone();
      let moodDeltaPerSec = 0;

      // Rest Input: Safe Outpost vs Dungeon Crawl Fatigue
      if (isSafeZone) {
        moodDeltaPerSec += 0.35; // Outpost recovery (+21/min)
      } else {
        moodDeltaPerSec -= 0.50; // Dungeon crawling stress (-30/min)
      }

      // Hunger Input: Pure Mood drain when hungry
      if (this.hunger < 20) {
        moodDeltaPerSec -= 0.80; // Starvation severe drain
      } else if (this.hunger < 50) {
        moodDeltaPerSec -= 0.30; // Mild hunger drain
      }

      this.mood = Math.max(0, Math.min(this.maxMood, this.mood + (moodDeltaPerSec * delta) / 1000));
    }
  }
}
