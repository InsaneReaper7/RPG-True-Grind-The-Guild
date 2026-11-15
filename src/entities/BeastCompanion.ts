import Phaser from 'phaser';
import { Entity } from './Entity.ts';
import type { Player } from './Player.ts';
import type { Enemy } from './Enemy.ts';
import { DataLoader } from '../utils/DataLoader.ts';
import { CombatSystem } from '../systems/CombatSystem.ts';
import { SkillSystem } from '../systems/SkillSystem.ts';

export class BeastCompanion extends Entity {
  public owner: Player;
  public tamedAnimal: { uid: string; speciesId: string; name: string };
  public speciesId: string;
  public customName: string;
  public combatSummaryName: string;

  public meleeDamage: number = 0;
  public baseAttackIntervalMs: number = 1200;
  public lastAttackTimeMs: number = 0;
  public targetEntity: Entity | null = null;

  public buffAttackSpeedPct: number = 0;
  public buffDamagePct: number = 0;
  public buffRemainingMs: number = 0;

  public get isDowned(): boolean {
    return this.state === 'downed' || this.hp <= 0;
  }

  public awardArmorWearExp(_type: string): void {}
  public hasShield(): boolean { return false; }

  public applyArmorMitigation(incomingDamage: number): { finalDamage: number; mitigatedAmount: number; effectiveRating: number; reductionPercent: number } {
    return {
      finalDamage: incomingDamage,
      mitigatedAmount: 0,
      effectiveRating: 0,
      reductionPercent: 0
    };
  }

  private hpBarGraphics?: Phaser.GameObjects.Graphics;
  private nameplateText?: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    owner: Player,
    tamedAnimal: { uid: string; speciesId: string; name: string },
    tileSize: number = 32,
    currentHp?: number
  ) {
    const dataLoader = DataLoader.getInstance();
    const enemyDef = dataLoader.getEnemy(tamedAnimal.speciesId);
    const config = dataLoader.getBeastCompanionConfig();

    const ownerBmLevel = owner.progression ? owner.progression.getClassLevel('beastmaster') : 1;
    const baseHp = enemyDef?.hp ?? 30;
    const calculatedMaxHp = Math.round(baseHp * (1 + config.hpPerClassLevel * ownerBmLevel));
    const baseDamage = enemyDef?.meleeDamage ?? 4;
    const calculatedDamage = baseDamage * (1 + config.damagePerClassLevel * ownerBmLevel);

    const textureKey = `${tamedAnimal.speciesId}-avatar`;
    const textureToUse = scene.textures?.exists(textureKey) ? textureKey : (scene.textures?.exists('wolf-avatar') ? 'wolf-avatar' : 'player-avatar');

    super(scene, x, y, textureToUse, tamedAnimal.name, calculatedMaxHp, 0, tileSize);

    this.owner = owner;
    this.tamedAnimal = tamedAnimal;
    this.speciesId = tamedAnimal.speciesId;
    this.customName = tamedAnimal.name;
    this.meleeDamage = calculatedDamage;
    this.baseAttackIntervalMs = enemyDef?.attackIntervalMs ?? 1200;
    this.moveSpeed = enemyDef?.moveSpeed ?? 140;

    if (currentHp !== undefined) {
      this.hp = Math.max(0, Math.min(calculatedMaxHp, currentHp));
      if (this.hp <= 0) {
        this.state = 'downed';
      }
    }

    const speciesDisplayName = enemyDef?.name ?? (tamedAnimal.speciesId.charAt(0).toUpperCase() + tamedAnimal.speciesId.slice(1).replace(/_/g, ' '));
    this.combatSummaryName = `${speciesDisplayName} (${owner.entityName}'s)`;

    this.initOverheadUI(scene);

    // Clicking the companion does nothing (no engage, no tame)
    this.disableInteractive();
  }

  private initOverheadUI(scene: Phaser.Scene): void {
    if (!scene || !scene.add) return;
    try {
      this.hpBarGraphics = scene.add.graphics();
      this.add(this.hpBarGraphics);

      this.nameplateText = scene.add.text(0, -22, this.customName, {
        fontSize: '9px',
        color: '#67e8f9',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 2
      }).setOrigin(0.5, 0.5);
      this.add(this.nameplateText);

      this.updateOverheadUI();
    } catch {
      // Mock / headless fallback
    }
  }

  public updateOverheadUI(): void {
    if (!this.hpBarGraphics) return;
    this.hpBarGraphics.clear();
    if (this.state === 'dead' || this.state === 'downed') {
      if (this.nameplateText) {
        this.nameplateText.setColor('#9ca3af');
      }
      return;
    }
    if (this.nameplateText) {
      this.nameplateText.setColor('#67e8f9');
    }

    const barWidth = 24;
    const barHeight = 3;
    const barX = -barWidth / 2;
    const barY = -14;

    this.hpBarGraphics.fillStyle(0x000000, 0.7);
    this.hpBarGraphics.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

    const ratio = Math.max(0, Math.min(1, this.hp / (this.maxHp || 1)));
    const color = ratio > 0.5 ? 0x22c55e : (ratio > 0.25 ? 0xf59e0b : 0xef4444);
    this.hpBarGraphics.fillStyle(color, 1);
    this.hpBarGraphics.fillRect(barX, barY, Math.round(barWidth * ratio), barHeight);
  }

  public getEffectiveAttackInterval(): number {
    if (this.buffAttackSpeedPct > 0) {
      return Math.round(this.baseAttackIntervalMs / (1 + this.buffAttackSpeedPct / 100));
    }
    return this.baseAttackIntervalMs;
  }

  public getEffectiveMeleeDamage(): number {
    if (this.buffDamagePct > 0) {
      return this.meleeDamage * (1 + this.buffDamagePct / 100);
    }
    return this.meleeDamage;
  }

  public applyBestialFury(attackSpeedPct: number, damagePct: number, durationMs: number): void {
    this.buffAttackSpeedPct = attackSpeedPct;
    this.buffDamagePct = damagePct;
    this.buffRemainingMs = durationMs;
    this.createFloatingDamageText?.(0, 0x38bdf8);
    CombatSystem.activeInstance?.createFloatingText(this.x, this.y - 20, 'BESTIAL FURY!', '#f59e0b');
  }

  public healBeast(fraction: number): void {
    const amount = this.maxHp * fraction;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.updateOverheadUI();
    CombatSystem.activeInstance?.createFloatingText(this.x, this.y - 20, `+${Math.round(amount)} HP`, '#22c55e');
  }

  public override takeDamage(amount: number, source?: Entity | string): boolean {
    const downed = super.takeDamage(amount, source);
    this.updateOverheadUI();
    if (downed) {
      this.state = 'downed';
      this.clearTarget();
    }
    return downed;
  }

  public updateBeastBehavior(time: number, delta: number, combatSystem: CombatSystem): void {
    if (this.state === 'dead' || this.state === 'downed') {
      return;
    }

    if (this.buffRemainingMs > 0) {
      this.buffRemainingMs -= delta;
      if (this.buffRemainingMs <= 0) {
        this.buffRemainingMs = 0;
        this.buffAttackSpeedPct = 0;
        this.buffDamagePct = 0;
      }
    }

    const config = DataLoader.getInstance().getBeastCompanionConfig();
    const owner = this.owner;
    const distToOwner = SkillSystem.getTileDistance(this, owner);

    // Rule 4: If farther than leashTiles from owner, drop target and return
    if (distToOwner > config.leashTiles) {
      this.clearTarget();
      this.followOwner(owner, config.followDistanceTiles);
      return;
    }

    // Rule 1: If owner has a living target, chase and attack it
    const ownerTarget = owner.targetEntity;
    const hasValidOwnerTarget = ownerTarget && ownerTarget.state !== 'dead' && ownerTarget.state !== 'downed';
    if (hasValidOwnerTarget) {
      this.targetEntity = ownerTarget;
      this.engageTarget(ownerTarget as Entity, time, combatSystem);
      return;
    }

    // Rule 2: Otherwise, attack nearest enemy within assistRadiusTiles of owner attacking party or companion
    const assistTarget = this.findAssistTarget(combatSystem, config.assistRadiusTiles);
    if (assistTarget) {
      this.targetEntity = assistTarget;
      this.engageTarget(assistTarget, time, combatSystem);
      return;
    }

    // Rule 3: Otherwise, follow owner to within followDistanceTiles
    this.clearTarget();
    this.followOwner(owner, config.followDistanceTiles);
  }

  private findAssistTarget(combatSystem: CombatSystem, assistRadius: number): Enemy | null {
    const owner = this.owner;
    const party = combatSystem.party;
    let closestEnemy: Enemy | null = null;
    let closestDist = Infinity;

    for (const enemy of combatSystem.enemies) {
      if (enemy.state === 'dead' || enemy.state === 'downed' || enemy.enemyData?.tier === 'critter') {
        continue;
      }

      // Must be engaged and targeting a party member or this companion
      const isTargetingPartyOrBeast = enemy.targetEntity && (party.includes(enemy.targetEntity as Player) || enemy.targetEntity === this);
      if (!isTargetingPartyOrBeast) {
        continue;
      }

      const distToOwner = SkillSystem.getTileDistance(owner, enemy);
      if (distToOwner <= assistRadius) {
        const distToBeast = SkillSystem.getTileDistance(this, enemy);
        if (distToBeast < closestDist) {
          closestDist = distToBeast;
          closestEnemy = enemy;
        }
      }
    }

    return closestEnemy;
  }

  private engageTarget(target: Entity, time: number, combatSystem: CombatSystem): void {
    const dist = SkillSystem.getTileDistance(this, target);
    if (dist <= 1) {
      // Within melee attack range (adjacent)
      this.stopMovement();
      const interval = this.getEffectiveAttackInterval();
      if (time - this.lastAttackTimeMs >= interval) {
        this.lastAttackTimeMs = time;
        const damage = this.getEffectiveMeleeDamage();
        const downed = target.takeDamage(damage, this);

        combatSystem.createAttackEffect?.(this.x, this.y, target.x, target.y, 0xef4444);
        combatSystem.createFloatingText(target.x, target.y - 14, `-${Math.round(damage * 10) / 10}`, '#f87171');

        if (downed) {
          this.handleBeastKill(target, combatSystem);
        }
      }
    } else {
      // Move towards target
      if (!this.isMoving()) {
        const scene: any = this.scene;
        if (scene && scene.findOpenAdjacentTile && scene.pathfinder) {
          const dest = scene.findOpenAdjacentTile(target.gridPos, this.gridPos, undefined, this);
          scene.pathfinder.findPath(this.gridPos, dest, scene.getPartyUnitObstacles?.(this)).then((path: any[]) => {
            if (path && path.length > 0) {
              this.followPath(path);
            }
          });
        }
      }
    }
  }

  public handleBeastKill(target: Entity, combatSystem: CombatSystem): void {
    const owner = this.owner;
    const config = DataLoader.getInstance().getBeastCompanionConfig();
    const weaponId = owner.equippedWeapon?.proficiencyId || owner.equippedWeapon?.id || 'bows';

    // Canonical kill credit route through CombatSystem
    combatSystem.handleTargetDefeated(owner, target, weaponId);

    // Taming EXP: +config.tamingExpPerKill to owner
    const tamingExp = config.tamingExpPerKill ?? 2;
    owner.progression.addProficiencyExp('taming', tamingExp);
    combatSystem.createFloatingText(owner.x, owner.y - 24, `+${tamingExp} Taming EXP`, '#34d399');

    this.clearTarget();
  }

  private followOwner(owner: Player, followDistance: number): void {
    const dist = SkillSystem.getTileDistance(this, owner);
    if (dist > followDistance && !this.isMoving()) {
      const scene: any = this.scene;
      if (scene && scene.findOpenAdjacentTile && scene.pathfinder) {
        const dest = scene.findOpenAdjacentTile(owner.gridPos, this.gridPos, undefined, this);
        scene.pathfinder.findPath(this.gridPos, dest, scene.getPartyUnitObstacles?.(this)).then((path: any[]) => {
          if (path && path.length > 0) {
            this.followPath(path);
          }
        });
      }
    }
  }

  public clearTarget(): void {
    this.targetEntity = null;
  }
}
