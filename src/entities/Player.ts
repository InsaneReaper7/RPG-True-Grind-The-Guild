import Phaser from 'phaser';
import { Entity } from './Entity.ts';
import type { PlayerData, WeaponDef, CharacterSnapshot } from '../types/game.ts';
import { GameState } from '../systems/GameState.ts';
import { DataLoader } from '../utils/DataLoader.ts';
import { ProgressionSystem } from '../systems/ProgressionSystem.ts';
import type { ClassifiedRoom } from '../systems/RoomClassifier.ts';

export class Player extends Entity {
  public id: string;
  public progression: ProgressionSystem;
  public currentRoom: ClassifiedRoom | null = null;
  public currentRoomName: string | null = null;
  public equippedWeapon: WeaponDef;
  public offhandWeapon: WeaponDef | null = null;
  public targetEntity: Entity | null = null;
  public lastAttackTime: number = 0;
  public attackRangeTiles: number = 1;
  public avatarTextureKey: string;

  public energy: number;
  public maxEnergy: number;
  public energyRegenPerSecond: number;
  public lastSkillUseTimes: Map<string, number> = new Map();

  public activeClass: string | null = null;
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

  // Milestone 19: Energy Scarcity & Potions
  public inCombat: boolean = false;
  public energyPotionRemainingMs: number = 0;
  public energyPotionRegenPerSec: number = 0;
  public manaPotionRemainingMs: number = 0;
  public manaPotionRegenPerSec: number = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    playerData: PlayerData,
    startingWeapon: WeaponDef,
    tileSize: number = 32,
    avatarKey: string = 'player-avatar',
    progression?: ProgressionSystem
  ) {
    super(
      scene,
      x,
      y,
      avatarKey,
      playerData.name,
      playerData.maxHp,
      playerData.criticalHpMax,
      tileSize
    );

    this.id = playerData.id || 'hero';
    this.avatarTextureKey = avatarKey;
    this.moveSpeed = playerData.moveSpeed;
    this.equippedWeapon = startingWeapon;
    this.attackRangeTiles = startingWeapon?.attackRangeTiles ?? playerData.attackRangeTiles ?? 1;

    this.energy = playerData.maxEnergy;
    this.maxEnergy = playerData.maxEnergy;
    this.energyRegenPerSecond = playerData.energyRegenPerSecond;

    this.progression = progression || new ProgressionSystem(DataLoader.getInstance().getClassesData(), this.entityName);
    if (this.progression) {
      this.progression.ownerName = this.entityName;
    }

    this.knownSkillIds = playerData.knownSkillIds ? [...playerData.knownSkillIds] : [];
    this.equippedSkillIds = playerData.equippedSkillIds ? [...playerData.equippedSkillIds] : [];
    for (const skillId of this.equippedSkillIds) {
      this.autocastMap.set(skillId, true);
    }

    this.progression.onClassUnlocked((event) => {
      // First-unlock auto-equip: if currently unranked/null, equip first unlocked class
      if (!this.activeClass) {
        this.setActiveClass(event.classDef.id);
      }
      this.checkSkillUnlocks();
    });

    this.checkSkillUnlocks();
  }

  public setActiveClass(classId: string | null): boolean {
    if (classId === null) {
      this.activeClass = null;
      console.log(`[Player:${this.entityName}] Cleared active class (Unranked).`);
      return true;
    }
    if (this.progression.isClassUnlocked(classId)) {
      this.activeClass = classId;
      console.log(`[Player:${this.entityName}] Active class set to: ${classId}`);
      this.checkSkillUnlocks();
      return true;
    }
    console.warn(`[Player:${this.entityName}] Cannot set active class to '${classId}': not unlocked.`);
    return false;
  }

  public checkSkillUnlocks(): string[] {
    const dataLoader = DataLoader.getInstance();
    let allSkills: any[] = [];
    try {
      allSkills = dataLoader.getSkills();
    } catch {
      allSkills = [];
    }
    const newlyLearned: string[] = [];
    for (const skill of allSkills) {
      if (this.progression.isSkillUnlocked(skill, this)) {
        if (!this.knownSkillIds.includes(skill.id)) {
          this.learnSkill(skill.id);
          newlyLearned.push(skill.id);
          if (this.equippedSkillIds.length < 5 && !this.equippedSkillIds.includes(skill.id)) {
            this.equipSkill(skill.id);
          }
        }
      }
    }
    return newlyLearned;
  }

  public equipWeapon(weapon: WeaponDef): void {
    this.equippedWeapon = weapon;
    this.attackRangeTiles = weapon.attackRangeTiles ?? (weapon.category === 'magic' || weapon.category === 'ranged' ? 4 : 1);
    if (weapon.twoHanded && this.offhandWeapon) {
      console.log(`[Player:${this.entityName}] Unequipped offhand because ${weapon.name} is two-handed`);
      this.offhandWeapon = null;
    }
    console.log(`[Player:${this.entityName}] Equipped main weapon: ${weapon.name} (Range: ${this.attackRangeTiles} tiles)`);
  }

  public equipOffhandWeapon(weapon: WeaponDef | null): boolean {
    if (weapon === null) {
      this.offhandWeapon = null;
      console.log(`[Player:${this.entityName}] Unequipped offhand weapon`);
      return true;
    }
    if (this.equippedWeapon?.twoHanded) {
      console.warn(`[Player:${this.entityName}] Cannot equip offhand while wielding a two-handed weapon!`);
      return false;
    }
    // Shield can be equipped directly in offhand without requiring Dual Wielding
    if (weapon.category === 'offhand' || weapon.id === 'shields') {
      this.offhandWeapon = weapon;
      console.log(`[Player:${this.entityName}] Equipped shield in offhand: ${weapon.name}`);
      return true;
    }
    // Second one-handed weapon requires Dual Wielding unlocked
    if (!this.progression.isDualWieldUnlocked()) {
      console.warn(`[Player:${this.entityName}] Cannot equip offhand weapon: Dual Wielding is locked!`);
      return false;
    }
    if (weapon.category !== 'melee_1h' || weapon.twoHanded) {
      console.warn(`[Player:${this.entityName}] Cannot equip ${weapon.name} in offhand: must be a one-handed melee weapon or shield`);
      return false;
    }
    this.offhandWeapon = weapon;
    console.log(`[Player:${this.entityName}] Equipped offhand weapon: ${weapon.name}`);
    return true;
  }

  public isDualWielding(): boolean {
    return this.offhandWeapon !== null && this.offhandWeapon.category !== 'offhand';
  }

  public hasShield(): boolean {
    return this.offhandWeapon !== null && (this.offhandWeapon.category === 'offhand' || this.offhandWeapon.id === 'shields');
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

  public drinkPotion(potionId: string): boolean {
    if (potionId !== 'energy_potion' && potionId !== 'mana_potion') {
      return false;
    }
    const gameState = GameState.getInstance();
    if (gameState.getItemCount(potionId) <= 0) {
      return false;
    }
    const dataLoader = DataLoader.getInstance();
    const recipe = dataLoader.getAlchemyRecipe(potionId);
    if (!recipe) return false;

    const consumed = gameState.consumeItem(potionId, 1);
    if (!consumed) return false;

    const energyRestored = recipe.energyRestored ?? 35;
    const oldEnergy = this.energy;
    this.energy = Math.min(this.maxEnergy, this.energy + energyRestored);
    const restored = Math.floor(this.energy - oldEnergy);

    const buffDuration = recipe.buffDurationMs ?? 15000;
    const buffRegen = recipe.buffRegenPerSec ?? 2;

    if (potionId === 'energy_potion') {
      this.energyPotionRemainingMs = buffDuration;
      this.energyPotionRegenPerSec = buffRegen;
      console.log(`[Potion] ⚡ ${this.entityName} drank Energy Potion! +${restored} EN restored, +${buffRegen} EN/s for ${(buffDuration / 1000).toFixed(0)}s`);
      this.createFloatingText(`+${restored} EN (Energy Potion)`, '#38bdf8');
    } else {
      this.manaPotionRemainingMs = buffDuration;
      this.manaPotionRegenPerSec = buffRegen;
      console.log(`[Potion] 🔷 ${this.entityName} drank Mana Potion! +${restored} EN restored, +${buffRegen} EN/s for ${(buffDuration / 1000).toFixed(0)}s`);
      this.createFloatingText(`+${restored} EN (Mana Potion)`, '#a855f7');
    }
    return true;
  }

  public lastCombatRepathTimeMs: number = 0;
  public combatRepathIntervalMs: number = 400;

  public setTarget(target: Entity | null): void {
    this.targetEntity = target;
  }

  public clearTarget(): void {
    const hadTarget = this.targetEntity !== null;
    this.targetEntity = null;
    if (hadTarget) {
      this.stopMovement();
      if (this.state === 'attacking') {
        this.state = 'idle';
      }
    }
  }

  public revive(reviver?: Player): void {
    if (this.state !== 'downed') return;

    this.hp = Math.floor(this.maxHp * 0.5);
    this.criticalHp = this.maxCriticalHp;
    this.state = 'idle';
    this.claimedDestination = null;
    this.clearTarget();

    this.avatarSprite.setAngle(0);
    this.avatarSprite.setAlpha(1);
    this.drawHpBar();
    console.log(`[Player] Revived with ${this.hp} Main HP and ${this.criticalHp} Critical HP!`);

    // Track Ally Revived activity on the reviver (or leader/first non-downed living ally)
    const actor = reviver || (this.scene as any)?.party?.find((m: Player) => m !== this && m.state !== 'downed' && m.state !== 'dead') || (this.scene as any)?.player;
    if (actor && actor !== this && actor.progression) {
      actor.progression.recordActivity('Ally Revived', 1);
    }
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

  public useSkill(skillId: string, target?: Entity | Player, time?: number): boolean {
    const scene = this.scene as any;
    if (scene?.combatSystem && typeof scene.combatSystem.castSkill === 'function') {
      return scene.combatSystem.castSkill(this, skillId, target, time);
    }
    const dataLoader = DataLoader.getInstance();
    const skillDef = dataLoader.getSkill(skillId);
    if (!skillDef || !this.progression.isSkillUnlocked(skillDef, this)) return false;
    const now = time ?? Date.now();
    const lastUsed = this.lastSkillUseTimes.get(skillId) || 0;
    if (now - lastUsed < skillDef.cooldownMs) return false;
    if (this.energy < skillDef.energyCost) return false;

    if (skillDef.targetType === 'ally' || (skillDef.healAmount && skillDef.healAmount > 0)) {
      const targetAlly = (target as Player) || this;
      this.energy -= skillDef.energyCost;
      this.lastSkillUseTimes.set(skillId, now);
      targetAlly.heal(skillDef.healAmount || 20);
      return true;
    }
    return false;
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

  public getSnapshot(sceneTime: number): CharacterSnapshot {
    const dataLoader = DataLoader.getInstance();
    const autocastObj: Record<string, boolean> = {};
    for (const [k, v] of this.autocastMap.entries()) {
      autocastObj[k] = v;
    }

    const remainingCooldowns: Record<string, number> = {};
    for (const skillId of this.equippedSkillIds) {
      const skillDef = dataLoader.getSkill(skillId);
      if (skillDef) {
        const lastUsed = this.lastSkillUseTimes.get(skillId) || 0;
        if (lastUsed > 0) {
          const elapsed = sceneTime - lastUsed;
          const remaining = Math.max(0, skillDef.cooldownMs - elapsed);
          if (remaining > 0) {
            remainingCooldowns[skillId] = remaining;
          }
        }
      }
    }

    const progData = this.progression.getSnapshotData();

    // Two-bar system: Downed only occurs when BOTH Main HP and Critical HP reach zero.
    // When Main HP <= 0 but Critical HP > 0, the character is in Critical state (conscious, warning-only), NOT downed.
    const isDowned = (this.state === 'downed' || (this.hp <= 0 && this.criticalHp <= 0)) && this.hp <= 0 && this.criticalHp <= 0;
    const currentState = isDowned ? 'downed' : (this.state === 'downed' ? 'idle' : this.state);

    return {
      id: this.id,
      name: this.entityName,
      avatarKey: this.avatarTextureKey,
      avatarTextureKey: this.avatarTextureKey,
      x: this.gridPos.x,
      y: this.gridPos.y,
      hp: this.hp,
      criticalHp: this.criticalHp,
      energy: this.energy,
      equippedWeaponId: this.equippedWeapon.id,
      offhandWeaponId: this.offhandWeapon?.id ?? null,
      knownSkillIds: [...this.knownSkillIds],
      equippedSkillIds: [...this.equippedSkillIds],
      autocastMap: autocastObj,
      skillCooldownsRemainingMs: remainingCooldowns,
      activeClass: this.activeClass,
      proficiencies: progData.proficiencies,
      classLevels: progData.classLevels,
      classStats: progData.classStats,
      unlockedClasses: progData.unlockedClasses,
      activityCounts: progData.activityCounts,
      bookLearnedSkills: Array.from(this.bookLearnedSkills),
      hunger: this.hunger,
      mood: this.mood,
      state: currentState
    };
  }

  public restoreFromSnapshot(snapshot: CharacterSnapshot, sceneTime: number): void {
    const dataLoader = DataLoader.getInstance();
    if (snapshot.id) {
      this.id = snapshot.id;
    }
    if (snapshot.name) {
      this.entityName = snapshot.name;
      if (this.progression) {
        this.progression.ownerName = snapshot.name;
      }
    }
    this.hp = snapshot.hp;
    this.criticalHp = snapshot.criticalHp;
    this.energy = snapshot.energy;

    const mainWeapon = dataLoader.getWeapon(snapshot.equippedWeaponId);
    if (mainWeapon) {
      this.equippedWeapon = mainWeapon;
    }

    if (snapshot.offhandWeaponId) {
      const offWeapon = dataLoader.getWeapon(snapshot.offhandWeaponId);
      this.offhandWeapon = offWeapon ?? null;
    } else {
      this.offhandWeapon = null;
    }

    this.knownSkillIds = [...snapshot.knownSkillIds];
    this.equippedSkillIds = [...snapshot.equippedSkillIds];

    this.autocastMap.clear();
    for (const [k, v] of Object.entries(snapshot.autocastMap)) {
      this.autocastMap.set(k, v);
    }

    if (snapshot.bookLearnedSkills) {
      this.bookLearnedSkills = new Set(snapshot.bookLearnedSkills);
    }
    if (snapshot.hunger !== undefined) {
      this.hunger = snapshot.hunger;
    }
    if (snapshot.mood !== undefined) {
      this.mood = snapshot.mood;
    }
    this.activeClass = snapshot.activeClass ?? null;

    this.progression.loadSnapshotData({
      proficiencies: snapshot.proficiencies,
      classLevels: snapshot.classLevels,
      classStats: snapshot.classStats,
      unlockedClasses: snapshot.unlockedClasses,
      activityCounts: snapshot.activityCounts
    });
    this.checkSkillUnlocks();

    // Re-anchor cooldowns in current scene clock
    this.lastSkillUseTimes.clear();
    if (snapshot.skillCooldownsRemainingMs) {
      for (const [skillId, remainingMs] of Object.entries(snapshot.skillCooldownsRemainingMs)) {
        const ms = Number(remainingMs);
        const skillDef = dataLoader.getSkill(skillId);
        if (skillDef && ms > 0) {
          const reanchoredLastUsed = sceneTime - (skillDef.cooldownMs - ms);
          this.lastSkillUseTimes.set(skillId, reanchoredLastUsed);
        }
      }
    }

    // Downed state restoration
    // Two-bar system: Downed only occurs when BOTH Main HP and Critical HP reach zero.
    // When Main HP <= 0 but Critical HP > 0, the character is in Critical state (conscious, warning-only), NOT downed.
    const isDowned = (snapshot.state === 'downed' || (this.hp <= 0 && this.criticalHp <= 0)) && this.hp <= 0 && this.criticalHp <= 0;
    if (isDowned) {
      this.state = 'downed';
      this.avatarSprite.setAngle(90);
      this.avatarSprite.setAlpha(0.6);
    } else {
      this.state = 'idle';
      this.avatarSprite.setAngle(0);
      this.avatarSprite.setAlpha(1);
    }

    this.drawHpBar();
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

    const quality = consumed.quality || 'common';
    const qualityDef = foodDef.qualities?.[quality];
    const baseHunger = foodDef.hungerRestored;
    const hungerRestored = qualityDef ? Math.round(baseHunger * qualityDef.hungerMultiplier) : baseHunger;

    const oldHunger = this.hunger;
    this.hunger = Math.min(this.maxHunger, this.hunger + hungerRestored);
    const restored = this.hunger - oldHunger;

    const buffDuration = qualityDef ? qualityDef.buffDurationMs : foodDef.buff.durationMs;
    const buffRegen = qualityDef ? qualityDef.hpRegenPerSec : foodDef.buff.hpRegenPerSec;

    // Refresh Well Fed buff (resets duration to quality duration, sets HP/sec rate)
    this.wellFedHpPerSec = buffRegen;
    this.wellFedRemainingMs = buffDuration;
    this.wellFedNextTickMs = 1000;

    const qualityLabel = quality !== 'common' ? ` [${quality.charAt(0).toUpperCase() + quality.slice(1)}]` : '';
    console.log(
      `%c[Player] 🍖 Ate ${foodDef.name}${qualityLabel}! Restored +${restored.toFixed(1)} Hunger (Now: ${this.hunger.toFixed(1)}/100). Well Fed buff refreshed (${(buffDuration / 1000).toFixed(0)}s @ +${this.wellFedHpPerSec} HP/s).`,
      'color: #10b981; font-weight: bold;'
    );
    this.createFloatingText(`+${restored.toFixed(0)} Hunger${qualityLabel} (Well Fed)`, '#10b981');
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
      // 1. Passive Energy regeneration over time (strictly out-of-combat)
      if (!this.inCombat && this.energy < this.maxEnergy) {
        this.energy = Math.min(this.maxEnergy, this.energy + (this.energyRegenPerSecond * delta) / 1000);
      }

      // 2. Hunger Drain over time
      if (this.hunger > 0) {
        this.hunger = Math.max(0, this.hunger - (this.hungerDrainPerSecond * delta) / 1000);
      }

      // 3. Auto-Eat when crossing low threshold
      if (this.hunger <= this.autoEatThreshold) {
        const gameState = GameState.getInstance();
        const foodItems = gameState.getFoodItems();
        if (foodItems.length > 0) {
          const foodToEat = foodItems[0].id;
          console.log(
            `%c[Auto-Eat] 🥣 Hunger dropped to ${this.hunger.toFixed(1)} <= ${this.autoEatThreshold}. Auto-eating ${foodToEat} from inventory...`,
            'color: #34d399; font-weight: bold;'
          );
          this.eatFood(foodToEat);
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

      // 4b. Energy & Mana Potion Buff Ticking
      if (this.energyPotionRemainingMs > 0) {
        this.energyPotionRemainingMs -= delta;
        if (this.energy < this.maxEnergy) {
          this.energy = Math.min(this.maxEnergy, this.energy + (this.energyPotionRegenPerSec * delta) / 1000);
        }
      }
      if (this.manaPotionRemainingMs > 0) {
        this.manaPotionRemainingMs -= delta;
        if (this.energy < this.maxEnergy) {
          this.energy = Math.min(this.maxEnergy, this.energy + (this.manaPotionRegenPerSec * delta) / 1000);
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
