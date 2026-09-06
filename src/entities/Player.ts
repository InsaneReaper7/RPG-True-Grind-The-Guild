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
