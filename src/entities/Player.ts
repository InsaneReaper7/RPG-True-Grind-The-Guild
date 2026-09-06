import Phaser from 'phaser';
import { Entity } from './Entity';
import { PlayerData, WeaponDef } from '../types/game';

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

  public override update(time: number, delta: number): void {
    super.update(time, delta);

    if (this.state !== 'downed' && this.state !== 'dead') {
      // Passive Energy regeneration over time
      if (this.energy < this.maxEnergy) {
        this.energy = Math.min(this.maxEnergy, this.energy + (this.energyRegenPerSecond * delta) / 1000);
      }
    }
  }
}
