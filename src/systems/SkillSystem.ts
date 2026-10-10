import { Player } from '../entities/Player.ts';
import { Enemy } from '../entities/Enemy.ts';
import { Entity } from '../entities/Entity.ts';
import { DataLoader } from '../utils/DataLoader.ts';
import type { SkillDef, SkillRole, SkillEffect } from '../types/game.ts';
import type { CombatSystem } from './CombatSystem.ts';

export class SkillSystem {
  private combatSystem: CombatSystem;

  constructor(combatSystem: CombatSystem) {
    this.combatSystem = combatSystem;
  }

  /**
   * Generic skill execution engine.
   * Processes all primitive effects defined in skillDef.effects.
   */
  public execute(
    caster: Player,
    skillDef: SkillDef,
    target?: Entity | Player,
    currentTime?: number
  ): boolean {
    const time = currentTime ?? Date.now();
    const dataLoader = DataLoader.getInstance();

    // 1. Cost & cooldown validation
    if (caster.energy < skillDef.energyCost) {
      console.warn(`[SkillSystem] Not enough energy for ${skillDef.name} (${caster.energy}/${skillDef.energyCost})`);
      return false;
    }
    if (caster.lastSkillUseTimes.has(skillDef.id)) {
      const lastUsed = caster.lastSkillUseTimes.get(skillDef.id)!;
      if (time - lastUsed < skillDef.cooldownMs) {
        console.warn(`[SkillSystem] ${skillDef.name} on cooldown!`);
        return false;
      }
    }

    // 2. Validate reactive window if any effect requires it
    for (const effect of skillDef.effects || []) {
      if (effect.type === 'reactive') {
        if (!caster.hasStatusEffect(effect.windowStatus)) {
          console.warn(`[SkillSystem] Reactive requirement ${effect.windowStatus} not met`);
          return false;
        }
      }
      if (effect.type === 'resource' && effect.hpCost) {
        const totalHp = caster.hp + (caster.criticalHp ?? 0);
        if (totalHp <= effect.hpCost) {
          console.warn(`[SkillSystem] Not enough HP for ${skillDef.name}`);
          return false;
        }
      }
    }

    // 3. Range check if applicable
    const range = skillDef.rangeTiles;
    if (range && target && target !== caster) {
      const cTile = { x: Math.floor(caster.x / caster.tileSize), y: Math.floor(caster.y / caster.tileSize) };
      const tTile = { x: Math.floor(target.x / target.tileSize), y: Math.floor(target.y / target.tileSize) };
      const dist = Math.max(Math.abs(cTile.x - tTile.x), Math.abs(cTile.y - tTile.y));
      if (dist > range) {
        console.warn(`[SkillSystem] Target out of range for ${skillDef.name} (${dist} > ${range})`);
        return false;
      }
    }

    // 4. Deduct costs and set timestamps
    caster.energy -= skillDef.energyCost;
    caster.lastSkillUseTimes.set(skillDef.id, time);
    caster.lastAttackTime = time;
    caster.state = 'attacking';

    // 5. Consume reactive windows if active
    for (const effect of skillDef.effects || []) {
      if (effect.type === 'reactive') {
        caster.removeStatusEffect(effect.windowStatus);
      }
    }

    // 6. Base weapon / spell parameters for scaling
    const effectiveWeapon = this.combatSystem.getEffectiveWeaponForAttack(caster);
    const weaponId = effectiveWeapon.proficiencyId ?? effectiveWeapon.id;
    const weaponLevel = caster.progression.getProficiencyLevel(weaponId);
    const dmgBonus = effectiveWeapon.levelBonus?.damagePerLevel ?? 0;
    const rawBase = effectiveWeapon.baseDamage + weaponLevel * dmgBonus;
    const moodTier = dataLoader.getMoodTier(caster.mood);
    const effBase = rawBase * moodTier.combatDamageMultiplier;

    // 7. Execute effects in order
    for (const effect of skillDef.effects || []) {
      this.executeEffect(effect, caster, skillDef, target, effBase, weaponId, time);
    }

    // 8. Visual feedback and proficiency EXP
    // Weapon damage skills award EXP on-hit via executeWeaponSkillAttack.
    // Every other skill (spell damage, heal, shield, buff, etc.) retains the standard +2 award.
    const hasWeaponDamageEffect = (skillDef.effects || []).some(
      (e) => e.type === 'damage' && e.scaling === 'weapon'
    );
    if (!hasWeaponDamageEffect) {
      const profToAward = weaponId;
      caster.progression.addProficiencyExp(profToAward, 2);
    }

    return true;
  }

  private executeEffect(
    effect: SkillEffect,
    caster: Player,
    skillDef: SkillDef,
    target: Entity | Player | undefined,
    effBase: number,
    weaponId: string,
    time: number
  ): void {
    const dataLoader = DataLoader.getInstance();

    switch (effect.type) {
      case 'damage': {
        const enemyTarget: any = (target && typeof (target as any).takeDamage === 'function' ? target : null) ||
          (caster.targetEntity && typeof (caster.targetEntity as any).takeDamage === 'function' ? caster.targetEntity : null);
        if (!enemyTarget || enemyTarget.isDowned?.() || enemyTarget.state === 'dead' || enemyTarget.state === 'downed') return;

        let totalMultiplier = effect.multiplier;

        // Execute / low health bonus
        if (effect.lowHealthBonus) {
          const ratio = enemyTarget.hp / enemyTarget.maxHp;
          if (ratio <= effect.lowHealthBonus.threshold) {
            totalMultiplier *= effect.lowHealthBonus.multiplier;
          }
        }

        // Status bonus (e.g. bleeding target takes bonus damage)
        if (effect.requiresTargetStatus) {
          if (enemyTarget.hasStatusEffect(effect.requiresTargetStatus.status)) {
            totalMultiplier *= effect.requiresTargetStatus.multiplier;
          }
        }

        // Overcharge multiplier if spell
        let overchargeMult = 1.0;
        if (effect.scaling === 'spell') {
          const overcharge = this.combatSystem.consumeOverchargeIfActive(caster, skillDef.energyCost);
          overchargeMult = overcharge.multiplier;
        }

        // Calculate single hit damage
        const flatBonus = effect.flatBonus ?? 0;
        let hitDamage = (effBase * totalMultiplier * overchargeMult) + flatBonus;

        // Generic status bonusDamagePercent across caster active statuses
        let statusBonusDamagePercent = 0;
        if (caster.activeStatusEffects) {
          for (const activeEffect of caster.activeStatusEffects.values()) {
            if (activeEffect.def?.bonusDamagePercent) {
              statusBonusDamagePercent += activeEffect.def.bonusDamagePercent;
            }
          }
        }
        if (statusBonusDamagePercent > 0) {
          hitDamage *= (1 + statusBonusDamagePercent);
        }

        // Blessed weapons holy bonus if caster has it
        if (caster.hasStatusEffect('blessed_weapons')) {
          hitDamage += 5;
          this.combatSystem.createFloatingText(enemyTarget.x, enemyTarget.y - 24, '+5 HOLY!', '#facc15');
        }

        // Apply hit(s)
        const hits = effect.hits ?? 1;
        const damagePerHit = hits > 1 ? hitDamage / hits : hitDamage;

        // Visual animations
        this.combatSystem.createSkillAttackEffect(caster.x, caster.y, enemyTarget.x, enemyTarget.y);

        if (effect.scaling === 'weapon') {
          const isHit = this.combatSystem.executeWeaponSkillAttack(
            caster,
            enemyTarget,
            skillDef,
            hitDamage,
            weaponId,
            time,
            hits
          );
          if (isHit && effect.area) {
            this.executeAreaDamage(effect.area, caster, enemyTarget, hitDamage, weaponId, time);
          }
        } else {
          // Spell scaling (matches legacy spell behavior: guaranteed hit, no weapon procs)
          if (enemyTarget.state !== 'dead' && enemyTarget.state !== 'downed') {
            (enemyTarget as any).isAggroed = true;
          }
          const floatColor = '#f97316';
          for (let h = 0; h < hits; h++) {
            if (enemyTarget.isDowned?.() || enemyTarget.state === 'dead' || enemyTarget.state === 'downed') break;
            this.combatSystem.createFloatingText(enemyTarget.x, enemyTarget.y - 10 - (h * 6), `${skillDef.name.toUpperCase()}! -${damagePerHit.toFixed(1)}`, floatColor);
            const downed = enemyTarget.takeDamage(damagePerHit);
            if (downed) {
              this.combatSystem.handleTargetDefeated(caster, enemyTarget, weaponId);
              break;
            }
          }
          if (effect.area) {
            this.executeAreaDamage(effect.area, caster, enemyTarget, hitDamage, weaponId, time);
          }
        }

        break;
      }

      case 'applyStatus': {
        const effTarget = target || (caster.targetEntity instanceof Enemy ? caster.targetEntity : caster);
        if (!effTarget || effTarget.state === 'dead' || effTarget.state === 'downed') return;

        const chance = effect.chance ?? 1.0;
        if (Math.random() <= chance) {
          const baseDef = dataLoader.getStatusEffect(effect.status);
          if (baseDef) {
            const effDef = effect.durationMs ? { ...baseDef, durationMs: effect.durationMs } : baseDef;
            effTarget.applyStatusEffect(effDef);
            if (effDef.disablesMovement) {
              effTarget.stopMovement();
            }
            if (effDef.interruptsAttack && 'state' in effTarget && (effTarget as any).state === 'attacking') {
              (effTarget as any).state = 'chasing';
            }
            this.combatSystem.createFloatingText(effTarget.x, effTarget.y - 25, `${effDef.name.toUpperCase()}!`, effDef.color || '#ef4444');
          }
        }
        break;
      }

      case 'heal': {
        let healTarget: Player | null = null;
        if (effect.target === 'self') {
          healTarget = caster;
        } else if (effect.target === 'party') {
          const amt = effect.amount ?? 20;
          for (const m of this.combatSystem.party) {
            if (m.state === 'dead' || m.state === 'downed') continue;
            const res = m.heal(amt);
            this.combatSystem.createHealEffect(m.x, m.y);
            this.combatSystem.createFloatingText(m.x, m.y - 12, `+${res} HP`, '#22c55e');
          }
          return;
        } else {
          // lowestAlly or target
          if (target instanceof Player && target.state !== 'dead' && target.state !== 'downed') {
            healTarget = target;
          } else {
            healTarget = this.findLowestHealthAlly(caster);
          }
        }

        if (healTarget && healTarget.state !== 'dead' && healTarget.state !== 'downed') {
          let amt = effect.amount ?? 20;
          if (effect.percent) {
            amt = Math.round(healTarget.maxHp * effect.percent);
          }
          const restored = healTarget.heal(amt);
          this.combatSystem.createHealEffect(healTarget.x, healTarget.y);
          this.combatSystem.createFloatingText(healTarget.x, healTarget.y - 12, `+${restored} HP`, '#22c55e');
        }
        break;
      }

      case 'healOverTime': {
        let hotTarget: Player | null = target instanceof Player ? target : caster;
        if (effect.target === 'lowestAlly') {
          hotTarget = this.findLowestHealthAlly(caster) || caster;
        }
        if (hotTarget && hotTarget.state !== 'dead' && hotTarget.state !== 'downed') {
          const hotDef = {
            id: skillDef.id,
            name: skillDef.name,
            durationMs: effect.durationMs,
            tickIntervalMs: effect.tickIntervalMs ?? 1000,
            damagePerTick: 0,
            healPerTick: effect.amountPerTick,
            color: '#22c55e'
          };
          hotTarget.applyStatusEffect(hotDef);
          this.combatSystem.createHealEffect(hotTarget.x, hotTarget.y);
          this.combatSystem.createFloatingText(hotTarget.x, hotTarget.y - 12, `${skillDef.name.toUpperCase()}!`, '#22c55e');
        }
        break;
      }

      case 'shield': {
        let shieldTarget: any = target || caster;
        if (effect.target === 'lowestAlly') {
          shieldTarget = this.findLowestHealthAlly(caster) || caster;
        }
        if (shieldTarget && shieldTarget.state !== 'dead' && shieldTarget.state !== 'downed') {
          const shieldDef = {
            id: skillDef.id,
            name: skillDef.name,
            durationMs: effect.durationMs,
            tickIntervalMs: effect.durationMs,
            damagePerTick: 0,
            shieldAmount: effect.shieldAmount,
            color: '#38bdf8'
          };
          shieldTarget.applyStatusEffect(shieldDef);
          this.combatSystem.createCleanseEffect(shieldTarget.x, shieldTarget.y);
          this.combatSystem.createFloatingText(shieldTarget.x, shieldTarget.y - 12, `+${effect.shieldAmount} SHIELD!`, '#38bdf8');
        }
        break;
      }

      case 'buff':
      case 'debuff': {
        const isSelf = effect.target === 'self' || !effect.target;
        const bTarget = isSelf ? caster : (target || caster);
        if (!bTarget || bTarget.state === 'dead' || bTarget.state === 'downed') return;

        const statObj: any = {
          id: skillDef.id,
          name: skillDef.name,
          durationMs: effect.durationMs,
          tickIntervalMs: effect.durationMs,
          damagePerTick: 0,
          color: effect.type === 'buff' ? '#38bdf8' : '#e11d48'
        };
        statObj[effect.stat] = effect.value;

        bTarget.applyStatusEffect(statObj);
        const floatTxt = `${skillDef.name.toUpperCase()}!`;
        this.combatSystem.createFloatingText(bTarget.x, bTarget.y - 12, floatTxt, statObj.color);
        break;
      }

      case 'cleanse': {
        if (effect.target === 'party') {
          for (const m of this.combatSystem.party) {
            if (m.state === 'dead' || m.state === 'downed') continue;
            m.removeHarmfulStatusEffects();
            this.combatSystem.createCleanseEffect(m.x, m.y);
          }
        } else {
          const cTarget: any = target || caster;
          if (typeof cTarget.removeHarmfulStatusEffects === 'function') {
            cTarget.removeHarmfulStatusEffects();
          } else if (cTarget.activeStatusEffects) {
            const entries: any[] = cTarget.activeStatusEffects instanceof Map ?
              Array.from(cTarget.activeStatusEffects.entries()) :
              Object.entries(cTarget.activeStatusEffects);
            for (const [id, eff] of entries) {
              const effVal = eff as any;
              if (effVal?.def?.isHarmful === true || effVal?.isHarmful === true || ['bleed', 'stun', 'shock', 'slow', 'burn', 'curse', 'blind'].includes(id as string)) {
                if (cTarget.activeStatusEffects.delete) {
                  cTarget.activeStatusEffects.delete(id);
                } else {
                  delete cTarget.activeStatusEffects[id];
                }
              }
            }
          }
          this.combatSystem.createCleanseEffect(cTarget.x, cTarget.y);
          this.combatSystem.createFloatingText(cTarget.x, cTarget.y - 12, 'CLEANSED!', '#38bdf8');
        }
        break;
      }

      case 'taunt': {
        const radius = effect.radiusTiles ?? 5;
        const dur = effect.durationMs ?? 6000;
        const tauntDef = dataLoader.getStatusEffect('taunted') || {
          id: 'taunted',
          name: 'Taunted',
          durationMs: dur,
          tickIntervalMs: dur,
          damagePerTick: 0,
          color: '#f97316'
        };
        const cTile = { x: Math.floor(caster.x / caster.tileSize), y: Math.floor(caster.y / caster.tileSize) };
        for (const enemy of this.combatSystem.enemies) {
          if (enemy.state === 'dead' || enemy.state === 'downed') continue;
          const eTile = { x: Math.floor(enemy.x / enemy.tileSize), y: Math.floor(enemy.y / enemy.tileSize) };
          const dist = Math.max(Math.abs(cTile.x - eTile.x), Math.abs(cTile.y - eTile.y));
          if (dist <= radius) {
            enemy.applyStatusEffect(tauntDef);
            enemy.tauntSource = caster;
            enemy.targetEntity = caster;
            enemy.isAggroed = true;
            enemy.state = 'chasing';
            this.combatSystem.createFloatingText(enemy.x, enemy.y - 20, 'TAUNTED!', '#f97316');
          }
        }
        this.combatSystem.createFloatingText(caster.x, caster.y - 12, 'TAUNT!', '#f97316');
        break;
      }

      case 'move': {
        const enemyTarget = (target instanceof Enemy ? target : null) || (caster.targetEntity instanceof Enemy ? caster.targetEntity : null);
        if (effect.moveType === 'dash' || effect.moveType === 'leap' || effect.moveType === 'teleportBehind') {
          if (enemyTarget) {
            const openTile = this.combatSystem.findOpenAttackTileForMember(enemyTarget, caster);
            if (openTile) {
              const oldX = caster.x;
              const oldY = caster.y;
              caster.setGridPosition(openTile.x, openTile.y);
              this.combatSystem.createAttackEffect(oldX, oldY, caster.x, caster.y, 0x60a5fa);
            }
          }
        }
        break;
      }

      case 'resource': {
        if (effect.hpCost) {
          const cost = effect.hpCost;
          if (caster.hp >= cost) {
            caster.hp -= cost;
          } else {
            const overflow = cost - caster.hp;
            caster.hp = 0;
            caster.criticalHp = Math.max(1, (caster.criticalHp ?? 0) - overflow);
          }
          if (typeof caster.drawHpBar === 'function') caster.drawHpBar();
          this.combatSystem.createFloatingText(caster.x, caster.y - 12, `-${cost} HP`, '#dc2626');
        }
        if (effect.energyRestore) {
          const maxEn = caster.maxEnergy ?? 100;
          caster.energy = Math.min(maxEn, caster.energy + effect.energyRestore);
          this.combatSystem.createFloatingText(caster.x, caster.y - 12, `+${effect.energyRestore} EN`, '#38bdf8');
        }
        break;
      }
    }
  }

  private executeAreaDamage(
    area: { shape: string; radius?: number; falloff?: number; maxTargets?: number; center?: 'target' | 'caster' },
    caster: Player,
    primaryTarget: any,
    baseDamage: number,
    weaponId: string,
    _time: number
  ): void {
    const getTile = (u: any) => {
      if (u.gridPos && typeof u.gridPos.x === 'number') {
        return { x: u.gridPos.x, y: u.gridPos.y };
      }
      const ts = u.tileSize || caster.tileSize || 16;
      return { x: Math.floor(u.x / ts), y: Math.floor(u.y / ts) };
    };

    if (area.shape === 'cleave') {
      const radius = area.radius ?? 1.5;
      const tTile = primaryTarget ? getTile(primaryTarget) : getTile(caster);
      for (const enemy of this.combatSystem.enemies) {
        if (enemy === primaryTarget || enemy.state === 'dead' || enemy.state === 'downed') continue;
        const eTile = getTile(enemy);
        const dist = Math.max(Math.abs(eTile.x - tTile.x), Math.abs(eTile.y - tTile.y));
        if (dist <= radius) {
          const cleaveDmg = baseDamage * (1 - (area.falloff ?? 0));
          this.combatSystem.createFloatingText(enemy.x, enemy.y - 10, `-${cleaveDmg.toFixed(1)} (Cleave)`, '#f97316');
          enemy.isAggroed = true;
          const downed = enemy.takeDamage(cleaveDmg);
          if (downed) this.combatSystem.handleTargetDefeated(caster, enemy, weaponId);
          break; // cleaves 1 adjacent secondary target
        }
      }
    } else if (area.shape === 'radius') {
      const radius = area.radius ?? 3;
      const centerEntity = (area.center === 'caster' || !primaryTarget) ? caster : primaryTarget;
      const cTile = getTile(centerEntity);
      for (const enemy of this.combatSystem.enemies) {
        if (enemy === primaryTarget || enemy.state === 'dead' || enemy.state === 'downed') continue;
        const eTile = getTile(enemy);
        const dist = Math.max(Math.abs(cTile.x - eTile.x), Math.abs(cTile.y - eTile.y));
        if (dist <= radius) {
          const splashDmg = baseDamage * (1 - (area.falloff ?? 0));
          this.combatSystem.createFloatingText(enemy.x, enemy.y - 10, `-${splashDmg.toFixed(1)} (Splash)`, '#f97316');
          enemy.isAggroed = true;
          const downed = enemy.takeDamage(splashDmg);
          if (downed) this.combatSystem.handleTargetDefeated(caster, enemy, weaponId);
        }
      }
    }
  }

  public findLowestHealthAlly(caster: Player): Player | null {
    const damaged = this.combatSystem.party.filter(
      (m) => m.state !== 'dead' && m.state !== 'downed' && (m.hp < m.maxHp || m.criticalHp < m.maxCriticalHp)
    );
    if (damaged.length === 0) return null;

    damaged.sort((a, b) => {
      const aSelf = a === caster ? 1 : 0;
      const bSelf = b === caster ? 1 : 0;
      if (aSelf !== bSelf) return aSelf - bSelf;
      const aRatio = (a.hp + a.criticalHp) / (a.maxHp + a.maxCriticalHp);
      const bRatio = (b.hp + b.criticalHp) / (b.maxHp + b.maxCriticalHp);
      return aRatio - bRatio;
    });

    return damaged[0] || null;
  }

  /**
   * Generic companion AI skill selector.
   * Filters and prioritizes skills matching the desired context:
   * - context 'support': ally heals, shields, HoTs, cleanse, mass_revive
   * - context 'defensive': self buffs, postures, taunt
   * - context 'gapCloser': gap-closers or ranged approach attacks
   * - context 'rotation': in-range combat rotation
   */
  public selectSkillForCompanion(
    member: Player,
    context: 'support' | 'defensive' | 'gapCloser' | 'rotation',
    time: number,
    targetEnemy?: Enemy | null,
    distanceTiles?: number
  ): { skillDef: SkillDef; target: Entity | Player } | null {
    const dataLoader = DataLoader.getInstance();
    const candidates: { skillDef: SkillDef; target: Entity | Player; priority: number }[] = [];

    for (const skillId of member.equippedSkillIds) {
      if (!member.isAutocastEnabled(skillId)) continue;
      const skillDef = dataLoader.getSkill(skillId);
      if (!skillDef || !member.progression.isSkillUnlocked(skillDef, member)) continue;

      const isOffCooldown = !member.lastSkillUseTimes.has(skillId) || (time - member.lastSkillUseTimes.get(skillId)! >= skillDef.cooldownMs);
      const isAffordable = member.energy >= skillDef.energyCost;
      if (!isOffCooldown || !isAffordable) continue;

      const ai = skillDef.ai;
      const role = ai?.role ?? this.inferFallbackRole(skillDef);
      const priority = ai?.priority ?? 50;
      const cond = ai?.condition;

      // Handle context matching
      if (context === 'support') {
        if (role !== 'support') continue;

        // Mass Revive check
        if (skillId === 'mass_revive' || cond?.requiresDownedAlly) {
          const radius = skillDef.radiusTiles ?? 6;
          const cTile = { x: Math.floor(member.x / member.tileSize), y: Math.floor(member.y / member.tileSize) };
          const hasDowned = this.combatSystem.party.some((m) => {
            if (m === member || m.state !== 'downed') return false;
            const mTile = { x: Math.floor(m.x / m.tileSize), y: Math.floor(m.y / m.tileSize) };
            return Math.max(Math.abs(cTile.x - mTile.x), Math.abs(cTile.y - mTile.y)) <= radius;
          });
          if (hasDowned) {
            candidates.push({ skillDef, target: member, priority });
          }
          continue;
        }

        // Cleanse check
        if (skillId === 'cleanse' || cond?.requiresHarmfulStatus) {
          const debuffed = this.combatSystem.party.find(
            (m) => m.state !== 'dead' && m.state !== 'downed' &&
              Array.from(m.activeStatusEffects.values()).some((e) => e.def?.isHarmful === true)
          );
          if (debuffed) {
            candidates.push({ skillDef, target: debuffed, priority });
          }
          continue;
        }

        // Shields (Guardian's Ward, Barrier)
        if (skillId === 'guardian_ward' || skillId === 'barrier' || skillDef.effects?.some(e => e.type === 'shield')) {
          const shieldTargets = this.combatSystem.party.filter(
            (m) => m.state !== 'dead' && m.state !== 'downed' && !m.hasStatusEffect(skillId)
          );
          if (shieldTargets.length > 0) {
            shieldTargets.sort((a, b) => {
              const aInCombat = a.inCombat ? 1 : 0;
              const bInCombat = b.inCombat ? 1 : 0;
              if (aInCombat !== bInCombat) return bInCombat - aInCombat;
              return (a.hp / a.maxHp) - (b.hp / b.maxHp);
            });
            candidates.push({ skillDef, target: shieldTargets[0], priority });
          }
          continue;
        }

        // Regenerate HoT (follows owner's 70% combined-HP rule)
        if (skillId === 'regenerate' || skillDef.effects?.some(e => e.type === 'healOverTime')) {
          const threshold = cond?.allyHpBelow ?? 0.70;
          const hotCandidates = this.combatSystem.party.filter(
            (m) => {
              if (m.state === 'dead' || m.state === 'downed') return false;
              if (m.hasStatusEffect('regenerate') || m.hasStatusEffect(skillId)) return false;
              const ratio = (m.hp + (m.criticalHp ?? 0)) / (m.maxHp + (m.maxCriticalHp ?? 0));
              return ratio <= threshold;
            }
          );
          if (hotCandidates.length > 0) {
            hotCandidates.sort((a, b) => {
              const aRatio = (a.hp + a.criticalHp) / (a.maxHp + a.maxCriticalHp);
              const bRatio = (b.hp + b.criticalHp) / (b.maxHp + b.maxCriticalHp);
              return aRatio - bRatio;
            });
            candidates.push({ skillDef, target: hotCandidates[0], priority });
          }
          continue;
        }

        // Direct ally heal (follows owner's 70% combined-HP rule)
        const threshold = cond?.allyHpBelow ?? 0.70;
        const damagedAllies = this.combatSystem.party.filter((m) => {
          if (m.state === 'dead' || m.state === 'downed') return false;
          const ratio = (m.hp + (m.criticalHp ?? 0)) / (m.maxHp + (m.maxCriticalHp ?? 0));
          return ratio <= threshold;
        });

        if (damagedAllies.length > 0) {
          damagedAllies.sort((a, b) => {
            const aSelf = a === member ? 1 : 0;
            const bSelf = b === member ? 1 : 0;
            if (aSelf !== bSelf) return aSelf - bSelf;
            const aRatio = (a.hp + a.criticalHp) / (a.maxHp + a.maxCriticalHp);
            const bRatio = (b.hp + b.criticalHp) / (b.maxHp + b.maxCriticalHp);
            return aRatio - bRatio;
          });
          candidates.push({ skillDef, target: damagedAllies[0], priority });
        }
      } else if (context === 'defensive') {
        if (role !== 'defensive') continue;

        // Radius checks (Holy Nova, Arcane Nova)
        if (cond?.enemiesInRadius) {
          const radius = skillDef.radiusTiles ?? 4;
          const cTile = { x: Math.floor(member.x / member.tileSize), y: Math.floor(member.y / member.tileSize) };
          const livingNearby = this.combatSystem.enemies.filter((e) => {
            if (e.state === 'dead' || e.state === 'downed') return false;
            const eTile = { x: Math.floor(e.x / e.tileSize), y: Math.floor(e.y / e.tileSize) };
            return Math.max(Math.abs(cTile.x - eTile.x), Math.abs(cTile.y - eTile.y)) <= radius;
          }).length;
          if (livingNearby >= cond.enemiesInRadius) {
            candidates.push({ skillDef, target: member, priority });
          }
          continue;
        }

        // Self HP threshold check if specified (e.g. guard_up, unbreakable)
        if (cond?.selfHpBelow !== undefined) {
          const ratio = (member.hp + (member.criticalHp ?? 0)) / (member.maxHp + (member.maxCriticalHp ?? 0));
          if (ratio > cond.selfHpBelow) continue;
        }

        // Standard self buff / stance (don't recast if already active)
        if (member.hasStatusEffect(skillId)) continue;
        candidates.push({ skillDef, target: member, priority });
      } else if (context === 'gapCloser') {
        if (role !== 'gapCloser' && role !== 'opener') continue;
        if (!targetEnemy || targetEnemy.state === 'dead' || targetEnemy.state === 'downed') continue;

        const maxRange = skillDef.rangeTiles ?? 1;
        if (distanceTiles !== undefined && distanceTiles <= maxRange) {
          candidates.push({ skillDef, target: targetEnemy, priority });
        }
      } else if (context === 'rotation') {
        if (role !== 'rotation' && role !== 'opener' && role !== 'finisher') continue;
        if (!targetEnemy || targetEnemy.state === 'dead' || targetEnemy.state === 'downed') continue;

        // Range check: skip skills whose rangeTiles is less than distanceTiles
        const dist = distanceTiles !== undefined ? distanceTiles : (() => {
          const cTile = { x: Math.floor(member.x / member.tileSize), y: Math.floor(member.y / member.tileSize) };
          const tTile = { x: Math.floor(targetEnemy.x / (targetEnemy.tileSize || member.tileSize)), y: Math.floor(targetEnemy.y / (targetEnemy.tileSize || member.tileSize)) };
          return Math.max(Math.abs(cTile.x - tTile.x), Math.abs(cTile.y - tTile.y));
        })();
        if (skillDef.rangeTiles !== undefined && dist > skillDef.rangeTiles) {
          continue;
        }

        // AoE condition check: count living enemies within area radius around target (or caster if center: "caster")
        if (cond?.enemiesInRadius) {
          const dmgEffect = skillDef.effects?.find((e): e is import('../types/game.ts').SkillEffectDamage => e.type === 'damage' && e.area?.radius !== undefined);
          const areaRadius = dmgEffect?.area?.radius ?? skillDef.radiusTiles ?? 3;
          const isCasterCentered = dmgEffect?.area?.center === 'caster';
          const centerObj = isCasterCentered ? member : targetEnemy;
          const tTile = {
            x: Math.floor(centerObj.x / (centerObj.tileSize || member.tileSize)),
            y: Math.floor(centerObj.y / (centerObj.tileSize || member.tileSize))
          };
          let livingCount = 0;
          for (const e of this.combatSystem.enemies) {
            if (e.state === 'dead' || e.state === 'downed') continue;
            const eTile = {
              x: Math.floor(e.x / (e.tileSize || member.tileSize)),
              y: Math.floor(e.y / (e.tileSize || member.tileSize))
            };
            if (Math.max(Math.abs(tTile.x - eTile.x), Math.abs(tTile.y - eTile.y)) <= areaRadius) {
              livingCount++;
            }
          }
          if (livingCount < cond.enemiesInRadius) continue;
        }

        // Target HP threshold check (e.g. Kill Shot finisher requires enemy HP below threshold)
        if (cond?.enemyHpBelow !== undefined || cond?.targetHpBelow !== undefined) {
          const threshold = cond.enemyHpBelow ?? cond.targetHpBelow!;
          const curCritical = targetEnemy.criticalHp ?? 0;
          const maxCritical = (targetEnemy as any).maxCriticalHp ?? (targetEnemy as any).criticalHpMax ?? 0;
          const ratio = (targetEnemy.hp + curCritical) / (targetEnemy.maxHp + maxCritical);
          if (ratio > threshold) continue;
        }

        // Special HP condition check for skills like Dark Pact
        if (skillDef.hpCost || skillDef.effects?.some(e => e.type === 'resource' && e.hpCost)) {
          const hpCost = skillDef.hpCost ?? 10;
          if ((member.hp + (member.criticalHp ?? 0)) <= hpCost) continue;
        }

        // Special reactive condition check for Riposte
        if (skillId === 'riposte' || cond?.requiresRiposteReady) {
          if (!member.hasStatusEffect('riposte_window')) continue;
        }

        candidates.push({ skillDef, target: targetEnemy, priority });
      }
    }

    if (candidates.length === 0) return null;

    // Pick highest priority matching candidate
    candidates.sort((a, b) => b.priority - a.priority);
    return { skillDef: candidates[0].skillDef, target: candidates[0].target };
  }

  private inferFallbackRole(skillDef: SkillDef): SkillRole {
    if (skillDef.targetType === 'ally' || (skillDef.healAmount && skillDef.healAmount > 0)) {
      return 'support';
    }
    if (skillDef.targetType === 'self') {
      return 'defensive';
    }
    if (skillDef.rangeTiles && skillDef.rangeTiles > 1) {
      return 'gapCloser';
    }
    return 'rotation';
  }
}
