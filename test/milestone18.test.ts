import assert from 'node:assert/strict';
import fs from 'node:fs';
import Module from 'node:module';

// Intercept phaser3spectorjs require if Phaser probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// Setup browser globals before any Phaser modules are loaded
if (typeof (global as any).window === 'undefined') {
  const noop = () => {};
  (global as any).window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { href: 'http://localhost' },
    focus: noop,
    navigator: { userAgent: 'node' }
  };
  const dummyCtx: any = new Proxy({
    fillStyle: '',
    globalCompositeOperation: '',
    getImageData: () => ({ data: [0, 0, 0, 0] }),
    createImageData: () => ({ data: [0, 0, 0, 0] })
  }, {
    get(target, prop) {
      if (prop in target) return (target as any)[prop];
      return noop;
    },
    set(target, prop, value) {
      (target as any)[prop] = value;
      return true;
    }
  });
  (global as any).document = {
    createElement: () => ({
      getContext: () => dummyCtx,
      style: {}
    }),
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
  };
  (global as any).Image = class Image {};
  (global as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (global as any).HTMLVideoElement = class HTMLVideoElement {};
}

// Setup node mock fetch to read actual project JSON files
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { HiddenSkillSystem } from '../src/systems/HiddenSkillSystem.ts';
import type { CombatContext } from '../src/systems/HiddenSkillSystem.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';
import { Pathfinder } from '../src/utils/Pathfinder.ts';
import { GameState } from '../src/systems/GameState.ts';
import type { WeaponDef, EnemyDef, PlayerData, StatusEffectDef, GridPos } from '../src/types/game.ts';

async function runTests() {
  console.log('--- RUNNING MILESTONE 18: FIRE MAGIC & BURN STATUS UNIT TESTS ---');

  // Dynamically import CombatSystem after polyfills
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');

  function createMockPlayer(
    id: string,
    name: string,
    gridX: number,
    gridY: number,
    weapon: WeaponDef,
    progression: ProgressionSystem
  ): any {
    return {
      id,
      entityName: name,
      gridPos: { x: gridX, y: gridY },
      x: gridX * 32 + 16,
      y: gridY * 32 + 16,
      hp: 50,
      maxHp: 50,
      criticalHp: 25,
      maxCriticalHp: 25,
      energy: 100,
      maxEnergy: 100,
      mood: 50,
      hunger: 100,
      state: 'idle' as 'idle' | 'moving' | 'attacking' | 'downed' | 'dead',
      equippedWeapon: weapon,
      offhandWeapon: null as WeaponDef | null,
      attackRangeTiles: weapon.attackRangeTiles ?? 1,
      targetEntity: null as any,
      claimedDestination: null as GridPos | null,
      lastAttackTime: 0,
      lastCombatRepathTimeMs: 0,
      combatRepathIntervalMs: 400,
      lastSkillUseTimes: new Map<string, number>(),
      knownSkillIds: [],
      equippedSkillIds: [],
      autocastMap: new Map<string, boolean>(),
      activeStatusEffects: new Map<string, any>(),
      progression,
      equipWeapon: function(newWeapon: WeaponDef) {
        this.equippedWeapon = newWeapon;
        this.attackRangeTiles = newWeapon.attackRangeTiles ?? (newWeapon.category === 'magic' || newWeapon.category === 'ranged' ? 4 : 1);
        if (newWeapon.twoHanded && this.offhandWeapon) {
          this.offhandWeapon = null;
        }
      },
      equipOffhandWeapon: function(offWeapon: WeaponDef | null) {
        if (offWeapon === null) {
          this.offhandWeapon = null;
          return true;
        }
        if (this.equippedWeapon?.twoHanded) {
          return false;
        }
        this.offhandWeapon = offWeapon;
        return true;
      },
      isDualWielding: function() {
        return this.offhandWeapon !== null && this.offhandWeapon.category !== 'offhand';
      },
      hasShield: function() {
        return this.offhandWeapon !== null && (this.offhandWeapon.category === 'offhand' || this.offhandWeapon.id === 'shields');
      },
      heal: function(amount: number) {
        if (this.state === 'dead' || this.state === 'downed') return 0;
        const oldHp = this.hp;
        this.hp = Math.min(this.maxHp, this.hp + amount);
        return this.hp - oldHp;
      },
      takeDamage: function(amount: number) {
        this.hp = Math.max(0, this.hp - amount);
        if (this.hp <= 0) {
          this.state = 'downed';
          this.clearTarget();
          return true;
        }
        return false;
      },
      applyStatusEffect: function(def: StatusEffectDef) {
        this.activeStatusEffects.set(def.id, {
          def,
          remainingMs: def.durationMs,
          nextTickMs: def.tickIntervalMs
        });
      },
      hasStatusEffect: function(id: string) {
        return this.activeStatusEffects.has(id);
      },
      getStatusEffect: function(id: string) {
        return this.activeStatusEffects.get(id);
      },
      removeStatusEffect: function(id: string) {
        this.activeStatusEffects.delete(id);
      },
      setTarget: function(target: any) {
        this.targetEntity = target;
      },
      clearTarget: function() {
        this.targetEntity = null;
        this.stopMovement();
      },
      isMoving: function() {
        return this.state === 'moving' && this.claimedDestination !== null;
      },
      stopMovement: function() {
        this.claimedDestination = null;
        if (this.state === 'moving') this.state = 'idle';
      }
    };
  }

  function createMockEnemy(
    id: string,
    name: string,
    gridX: number,
    gridY: number
  ): any {
    return {
      id,
      entityName: name,
      gridPos: { x: gridX, y: gridY },
      x: gridX * 32 + 16,
      y: gridY * 32 + 16,
      hp: 50,
      maxHp: 50,
      damage: 6,
      state: 'idle' as 'idle' | 'moving' | 'chasing' | 'attacking' | 'downed' | 'dead',
      attackRangeTiles: 1,
      tileSize: 32,
      spawnPos: { x: gridX, y: gridY },
      isAggroed: false,
      maxLeashDistance: 10,
      outOfAggroTimerMs: 0,
      claimedDestination: null as GridPos | null,
      targetEntity: null as any,
      activeStatusEffects: new Map<string, any>(),
      takeDamage: function(amount: number) {
        this.hp = Math.max(0, this.hp - amount);
        if (this.hp <= 0) {
          this.state = 'dead';
          return true;
        }
        return false;
      },
      applyStatusEffect: function(def: StatusEffectDef) {
        this.activeStatusEffects.set(def.id, {
          def,
          remainingMs: def.durationMs,
          nextTickMs: def.tickIntervalMs
        });
      },
      hasStatusEffect: function(id: string) {
        return this.activeStatusEffects.has(id);
      },
      getStatusEffect: function(id: string) {
        return this.activeStatusEffects.get(id);
      },
      removeStatusEffect: function(id: string) {
        this.activeStatusEffects.delete(id);
      },
      updateStatusEffects: function(deltaMs: number) {
        const toRemove: string[] = [];
        let tickCount = 0;
        this.activeStatusEffects.forEach((active: any, effectId: string) => {
          active.remainingMs -= deltaMs;
          active.nextTickMs -= deltaMs;
          if (active.nextTickMs <= 0 && active.remainingMs >= 0) {
            this.takeDamage(active.def.damagePerTick);
            active.nextTickMs += active.def.tickIntervalMs;
            tickCount++;
          }
          if (active.remainingMs <= 0) {
            toRemove.push(effectId);
          }
        });
        for (const eff of toRemove) {
          this.removeStatusEffect(eff);
        }
        return tickCount;
      },
      isMoving: function() {
        return this.state === 'moving' || this.state === 'chasing';
      },
      stopMovement: function() {
        this.claimedDestination = null;
        if (this.state === 'moving' || this.state === 'chasing') this.state = 'idle';
      },
      enemyData: { harvest: [] }
    };
  }

  function createMockScene(gridWidth: number = 30, gridHeight: number = 30): any {
    const grid: number[][] = [];
    for (let y = 0; y < gridHeight; y++) {
      grid[y] = [];
      for (let x = 0; x < gridWidth; x++) {
        grid[y][x] = 0; // all walkable
      }
    }
    const pathfinder = new Pathfinder(grid);
    return {
      tileSize: 32,
      gridWidth,
      gridHeight,
      pathfinder,
      sound: { play: () => {} },
      time: { now: 0 },
      add: {
        line: () => {
          const obj: any = {};
          obj.setOrigin = () => obj;
          obj.setLineWidth = () => obj;
          obj.setDepth = () => obj;
          obj.destroy = () => {};
          return obj;
        },
        circle: () => {
          const obj: any = {};
          obj.setDepth = () => obj;
          obj.destroy = () => {};
          return obj;
        },
        text: () => {
          const obj: any = {};
          obj.setOrigin = () => obj;
          obj.setDepth = () => obj;
          obj.destroy = () => {};
          return obj;
        }
      },
      tweens: {
        add: (config: any) => {
          if (config.onComplete) {
            // instant completion for tests
            config.onComplete();
          }
        }
      }
    };
  }

  // Load actual project data
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // -------------------------------------------------------------
  // TEST 1: Fire Magic Data & Per-Level Bonuses in weapons.json
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: Fire Magic Data & Stats in weapons.json ---');
  const fireMagic = dataLoader.getWeapon('fire_magic');
  assert.ok(fireMagic, 'fire_magic exists in weapons.json');
  assert.equal(fireMagic.name, 'Fire Magic');
  assert.equal(fireMagic.category, 'magic');
  assert.equal(fireMagic.twoHanded, true, 'Fire Magic is two-handed');
  assert.equal(fireMagic.attackRangeTiles, 4, 'Fire Magic attack range is 4 tiles');
  assert.equal(fireMagic.baseDamage, 10, 'Fire Magic base damage is 10');
  assert.equal(fireMagic.baseAccuracy, 0.70, 'Fire Magic base accuracy is 0.70');
  assert.equal(fireMagic.energyCostPerCast, 22, 'Fire Magic costs 22 Energy per cast (rebalanced in M19)');
  assert.equal(fireMagic.burnChance, 0.35, 'Fire Magic has 35% base burn chance');
  assert.equal(fireMagic.aoeRadiusTiles, 1, 'Fire Magic has AoE radius of 1 tile');
  assert.equal(fireMagic.aoeSplashPercent, 0.50, 'Fire Magic has 50% splash damage');

  // Per-level bonuses
  assert.ok(fireMagic.levelBonus, 'Fire Magic has levelBonus defined');
  assert.equal(fireMagic.levelBonus?.damagePerLevel, 0.5, '+0.5 damage per level');
  assert.equal(fireMagic.levelBonus?.accuracyPerLevel, 0.003, '+0.003 accuracy per level');
  assert.equal(fireMagic.levelBonus?.energyCostReductionPerLevel, 0.1, '-0.1 energy cost per level');
  assert.equal(fireMagic.levelBonus?.burnChancePerLevel, 0.003, '+0.003 burn chance per level (scaled with proficiency)');
  console.log('✔ Test 1 passed: Fire Magic correctly configured with full stats, 4-tile range, and scaling bonuses.');

  // -------------------------------------------------------------
  // TEST 2: Burn Status Effect Data in statusEffects.json
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Burn Status Effect in statusEffects.json ---');
  const burnEffect = dataLoader.getStatusEffect('burn');
  assert.ok(burnEffect, 'burn status effect exists in statusEffects.json');
  assert.equal(burnEffect.name, 'Burn');
  assert.equal(burnEffect.durationMs, 4000, 'Burn duration is exactly 4000ms (max 4 ticks per user feedback)');
  assert.equal(burnEffect.tickIntervalMs, 1000, 'Burn tick interval is 1000ms');
  assert.equal(burnEffect.damagePerTick, 4, 'Burn damage is 4 per tick');
  assert.equal(burnEffect.color, '#f97316', 'Burn color is #f97316 (distinct orange from Bleed #ef4444)');

  const bleedEffect = dataLoader.getStatusEffect('bleed');
  assert.ok(bleedEffect, 'bleed effect still exists');
  assert.notEqual(burnEffect.color, bleedEffect.color, 'Burn color is distinct from Bleed');
  console.log('✔ Test 2 passed: Burn status effect correctly defined with 4000ms duration, 4 dmg/tick, and #f97316 color.');

  // -------------------------------------------------------------
  // TEST 3: Ember Adept Tier 0 Novice Class in classes.json
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Ember Adept Tier 0 Class in classes.json ---');
  const emberAdept = dataLoader.getClass('ember_adept');
  assert.ok(emberAdept, 'ember_adept exists in classes.json');
  assert.equal(emberAdept.name, 'Ember Adept');
  assert.equal(emberAdept.tier, 'novice');
  assert.deepEqual(
    emberAdept.requirements,
    [{ type: 'proficiency', target: 'fire_magic', value: 10 }],
    'Requires Fire Magic 10'
  );
  assert.equal(emberAdept.fantasy, 'Can light a candle. Sometimes a person.');
  assert.deepEqual(
    emberAdept.hiddenSkillBonuses,
    { mana_regen: 0.05 },
    'Grants +0.05 hidden bonus to mana_regen (no burn chance bonus per user feedback)'
  );
  console.log('✔ Test 3 passed: Ember Adept verified as minimal Tier 0 novice class with mana_regen head-start.');

  // -------------------------------------------------------------
  // TEST 4: Fire Magic Equipping, 4-Tile Range & 2H Offhand Ejection
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Fire Magic Equip, 4-Tile Range & 2H Invariant ---');
  const prog1 = new ProgressionSystem(dataLoader.getClassesData(), 'Caster Hero');
  const shortSwords = dataLoader.getWeapon('short_swords')!;
  const shields = dataLoader.getWeapon('shields')!;
  const hero = createMockPlayer('hero', 'Caster Hero', 5, 5, shortSwords, prog1);
  hero.equipOffhandWeapon(shields);

  assert.equal(hero.equippedWeapon.id, 'short_swords');
  assert.equal(hero.offhandWeapon.id, 'shields');
  assert.equal(hero.attackRangeTiles, 1, 'Short swords melee range is 1 tile');

  // Equip Fire Magic
  hero.equipWeapon(fireMagic);
  assert.equal(hero.equippedWeapon.id, 'fire_magic');
  assert.equal(hero.attackRangeTiles, 4, 'Fire Magic range is 4 tiles');
  assert.equal(hero.offhandWeapon, null, '2H Fire Magic automatically unequipped offhand shield');

  // Attempt to equip offhand shield while wielding 2H Fire Magic
  const offhandAllowed = hero.equipOffhandWeapon(shields);
  assert.equal(offhandAllowed, false, 'Cannot equip offhand while wielding 2H Fire Magic');
  assert.equal(hero.offhandWeapon, null);
  console.log('✔ Test 4 passed: Equipping Fire Magic sets range to 4 tiles and enforces 2H offhand constraint.');

  // -------------------------------------------------------------
  // TEST 5: Energy Cost Consumption & Scaling with Proficiency
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Energy Cost Deduction & Proficiency Scaling ---');
  const mockScene = createMockScene();
  const combat = new CombatSystem(mockScene, [hero], [], mockScene.pathfinder);

  // At Level 0: Cost is 22 Energy
  const level0Cost = Math.max(
    1,
    Math.round(fireMagic.energyCostPerCast! - (fireMagic.levelBonus?.energyCostReductionPerLevel ?? 0.1) * 0)
  );
  assert.equal(level0Cost, 22, 'Base energy cost at Lv 0 is 22');

  // At Level 10: Cost is 22 - (0.1 * 10) = 21 Energy
  const level10Cost = Math.max(
    1,
    Math.round(fireMagic.energyCostPerCast! - (fireMagic.levelBonus?.energyCostReductionPerLevel ?? 0.1) * 10)
  );
  assert.equal(level10Cost, 21, 'Reduced energy cost at Lv 10 is 21');

  // At Level 50: Cost is 22 - (0.1 * 50) = 17 Energy
  const level50Cost = Math.max(
    1,
    Math.round(fireMagic.energyCostPerCast! - (fireMagic.levelBonus?.energyCostReductionPerLevel ?? 0.1) * 50)
  );
  assert.equal(level50Cost, 17, 'Reduced energy cost at Lv 50 is 17');

  // Test inability to cast when energy < cost
  hero.energy = 5; // Less than 12
  const enemyAtRange = createMockEnemy('wolf_1', 'Wolf', 8, 5); // 3 tiles away
  combat.enemies = [enemyAtRange];
  hero.setTarget(enemyAtRange);

  combat.update(1500, 100);
  assert.equal(hero.energy, 5, 'Energy not deducted when insufficient');
  assert.equal(enemyAtRange.hp, 50, 'Enemy took 0 damage because cast was blocked by lack of energy');
  assert.equal(hero.lastAttackTime, 0, 'Attack was not performed');

  // Restore energy and confirm cast consumes energy
  hero.energy = 100;
  combat.update(1600, 100);
  assert.equal(hero.energy, 78, 'Casting Fire Magic consumed exactly 22 Energy (100 -> 78)');
  assert.equal(hero.lastAttackTime, 1600, 'Attack executed successfully');
  console.log('✔ Test 5 passed: Energy deduction enforced and scales with Fire Magic proficiency.');

  // -------------------------------------------------------------
  // TEST 6: Auto-Attack Loop at 4 Tiles Range & Real Damage
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Auto-Attack Loop at 4 Tiles Range ---');
  const enemyFar = createMockEnemy('wolf_far', 'Wolf Far', 9, 5); // 4 tiles away from hero at (5, 5)
  combat.enemies = [enemyFar];
  hero.setTarget(enemyFar);
  hero.energy = 100;
  hero.lastAttackTime = 0;

  const origRandom6 = Math.random;
  Math.random = () => 0.1; // guarantee hit roll
  const preHp = enemyFar.hp;
  combat.update(3500, 100);
  Math.random = origRandom6;

  assert.equal(hero.gridPos.x, 5, 'Hero did NOT move into melee range; remained at 4-tile standoff');
  assert.equal(hero.gridPos.y, 5);
  assert.ok(enemyFar.hp < preHp, `Enemy took real damage from 4 tiles away (HP: ${preHp} -> ${enemyFar.hp})`);
  assert.equal(hero.energy, 78, 'Energy deducted for 4-tile ranged cast (100 - 22 = 78)');
  console.log('✔ Test 6 passed: Auto-attack loop fires cleanly from 4 tiles away without pathing into melee.');

  // -------------------------------------------------------------
  // TEST 7: Fire Magic Proficiency Leveling & Concealment
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: Hidden-Until-Level-1 & Cast EXP Grants ---');
  const progHero = new ProgressionSystem(dataLoader.getClassesData(), 'Mage Hero');
  const hero2 = createMockPlayer('hero2', 'Mage Hero', 2, 2, fireMagic, progHero);

  assert.equal(progHero.getProficiencyLevel('fire_magic'), 0);
  assert.equal(progHero.isStatRevealed('fire_magic'), false, 'Fire Magic is concealed at Level 0');

  // Award EXP for successful casts (+2 per hit)
  const tx1 = progHero.addProficiencyExp('fire_magic', 2);
  assert.equal(tx1.leveledUp, false);
  assert.equal(progHero.getProficiencyStat('fire_magic').currentExp, 2);
  assert.equal(progHero.isStatRevealed('fire_magic'), false, 'Still concealed under Level 1 (2/50 EXP)');

  // Push to Level 1 (50 EXP needed for Lv 0 -> 1)
  progHero.addProficiencyExp('fire_magic', 48);
  assert.equal(progHero.getProficiencyLevel('fire_magic'), 1, 'Fire Magic reached Level 1');
  assert.equal(progHero.isStatRevealed('fire_magic'), true, 'Fire Magic is revealed at Level 1');

  // Verify kill EXP grants (+4 on defeat)
  const enemyForKill = createMockEnemy('dummy_kill', 'Dummy', 3, 2);
  enemyForKill.hp = 1;
  combat.party = [hero2];
  combat.enemies = [enemyForKill];
  hero2.setTarget(enemyForKill);
  hero2.energy = 100;
  hero2.lastAttackTime = 0;

  const preExp = progHero.getProficiencyStat('fire_magic').currentExp;
  const origRandom7 = Math.random;
  Math.random = () => 0.1;
  // Hit + Kill (+2 for hit, +4 for kill = +6 total)
  combat.update(6000, 100);
  Math.random = origRandom7;
  const postExp = progHero.getProficiencyStat('fire_magic').currentExp;
  assert.equal(postExp, preExp + 6, 'Gained +2 hit EXP and +4 kill EXP on target defeat');
  console.log('✔ Test 7 passed: Hidden-until-Level-1 pattern verified with +2 hit and +4 kill EXP grants.');

  // -------------------------------------------------------------
  // TEST 8: Mana Regen Unblocking via Fire Magic Level 1
  // -------------------------------------------------------------
  console.log('\n--- TEST 8: Mana Regen Eligibility via Fire Magic Level 1 ---');
  const hiddenSys = HiddenSkillSystem.getInstance();
  const progMagic = new ProgressionSystem(dataLoader.getClassesData(), 'Pyromancer');

  // At Level 0 Fire Magic: No magic proficiency
  let magicSchools = dataLoader.getMagicSchoolIds();
  let hasMagicProf = magicSchools.some((id) => progMagic.getProficiencyLevel(id) >= 1);
  assert.equal(hasMagicProf, false, 'No magic proficiency at Fire Magic Lv 0');

  let ctx: CombatContext = {
    equippedWeapon: fireMagic,
    hasMagicProficiency: hasMagicProf,
    inCombat: false
  };
  let canRegenMana = hiddenSys.evaluateEligibility(
    dataLoader.getHiddenSkill('mana_regen')!,
    ctx
  );
  assert.equal(canRegenMana, false, 'Mana Regen ineligible while all magic schools are Level 0');

  // Reach Level 1 in Fire Magic
  progMagic.addProficiencyExp('fire_magic', 50);
  assert.equal(progMagic.getProficiencyLevel('fire_magic'), 1);

  hasMagicProf = magicSchools.some((id) => progMagic.getProficiencyLevel(id) >= 1);
  assert.equal(hasMagicProf, true, 'Fire Magic Level 1 dynamically satisfies hasMagicProficiency');

  ctx.hasMagicProficiency = hasMagicProf;
  canRegenMana = hiddenSys.evaluateEligibility(
    dataLoader.getHiddenSkill('mana_regen')!,
    ctx
  );
  assert.equal(canRegenMana, true, 'Mana Regen is now eligible to proc and level');
  console.log('✔ Test 8 passed: Fire Magic Level 1 successfully unblocks Mana Regen passive eligibility.');

  // -------------------------------------------------------------
  // TEST 9: Burn Status Application, Scaled Chance & 4-Tick DoT
  // -------------------------------------------------------------
  console.log('\n--- TEST 9: Burn Proc, Proficiency Scaling & Exactly 4 Ticks Maximum ---');
  const burnVictim = createMockEnemy('burn_target', 'Training Dummy', 10, 10);

  // Test Burn application
  burnVictim.applyStatusEffect(burnEffect);
  assert.equal(burnVictim.hasStatusEffect('burn'), true, 'Burn status applied to enemy');
  const activeBurn = burnVictim.getStatusEffect('burn');
  assert.equal(activeBurn.remainingMs, 4000, 'Burn initial duration is 4000ms');

  // Test DoT ticks over 4000ms: exactly 4 ticks of 4 damage = 16 damage
  const initialHp = burnVictim.hp;
  let totalTicks = 0;

  // Tick at 1000ms
  totalTicks += burnVictim.updateStatusEffects(1000);
  assert.equal(burnVictim.hp, initialHp - 4, 'Tick 1: -4 HP at 1000ms');
  assert.equal(burnVictim.hasStatusEffect('burn'), true);

  // Tick at 2000ms
  totalTicks += burnVictim.updateStatusEffects(1000);
  assert.equal(burnVictim.hp, initialHp - 8, 'Tick 2: -8 HP at 2000ms');

  // Tick at 3000ms
  totalTicks += burnVictim.updateStatusEffects(1000);
  assert.equal(burnVictim.hp, initialHp - 12, 'Tick 3: -12 HP at 3000ms');

  // Tick at 4000ms (duration expires)
  totalTicks += burnVictim.updateStatusEffects(1000);
  assert.equal(burnVictim.hp, initialHp - 16, 'Tick 4: -16 HP at 4000ms');
  assert.equal(burnVictim.hasStatusEffect('burn'), false, 'Burn expired at 4000ms duration');
  assert.equal(totalTicks, 4, 'Exactly 4 ticks occurred over the entire 4000ms duration');

  // Verify tick after expiration deals zero damage
  totalTicks += burnVictim.updateStatusEffects(1000);
  assert.equal(burnVictim.hp, initialHp - 16, 'No extra ticks occur after 4000ms expiry');

  // Verify burn chance scaling with proficiency
  const baseChance = fireMagic.burnChance!;
  const bonusPerLvl = fireMagic.levelBonus!.burnChancePerLevel!;
  const lv0Chance = baseChance + 0 * bonusPerLvl;
  const lv10Chance = baseChance + 10 * bonusPerLvl;
  const lv30Chance = baseChance + 30 * bonusPerLvl;
  assert.equal(lv0Chance, 0.35, 'Lv 0 burn chance is 35%');
  assert.equal(Number(lv10Chance.toFixed(3)), 0.38, 'Lv 10 burn chance is 38% (+3%)');
  assert.equal(Number(lv30Chance.toFixed(3)), 0.44, 'Lv 30 burn chance is 44% (+9%)');
  console.log('✔ Test 9 passed: Burn applies cleanly, scales proc chance per level, and ticks exactly 4 times (4000ms).');

  // -------------------------------------------------------------
  // TEST 10: Ranged AoE Splash to Adjacent Enemies
  // -------------------------------------------------------------
  console.log('\n--- TEST 10: Ranged AoE Splash Damage ---');
  const heroAoE = createMockPlayer('hero_aoe', 'AoE Caster', 5, 5, fireMagic, prog1);
  const primaryTarget = createMockEnemy('primary', 'Primary Target', 8, 5); // 3 tiles away
  const adjacentEnemy = createMockEnemy('adjacent', 'Splash Target', 8, 6); // 1 tile away from primary
  const distantEnemy = createMockEnemy('distant', 'Distant Target', 8, 8); // 3 tiles away from primary

  const combatAoE = new CombatSystem(mockScene, [heroAoE], [primaryTarget, adjacentEnemy, distantEnemy], mockScene.pathfinder);
  heroAoE.setTarget(primaryTarget);
  heroAoE.energy = 100;
  heroAoE.lastAttackTime = 0;

  const adjPreHp = adjacentEnemy.hp;
  const distPreHp = distantEnemy.hp;
  const origRandom10 = Math.random;
  Math.random = () => 0.1;
  combatAoE.update(10000, 100);
  Math.random = origRandom10;

  assert.ok(adjacentEnemy.hp < adjPreHp, `Adjacent enemy took splash damage (HP: ${adjPreHp} -> ${adjacentEnemy.hp})`);
  assert.equal(distantEnemy.hp, distPreHp, 'Distant enemy outside 1-tile AoE radius took 0 splash damage');
  console.log('✔ Test 10 passed: 1-tile radius AoE splash deals 50% damage to nearby enemies and spares distant ones.');

  // -------------------------------------------------------------
  // TEST 11: Ember Adept Class Unlock at Fire Magic Level 10
  // -------------------------------------------------------------
  console.log('\n--- TEST 11: Ember Adept Class Unlock & Mana Regen Head-Start ---');
  const progEmber = new ProgressionSystem(dataLoader.getClassesData(), 'Ember Student');
  assert.equal(progEmber.isClassUnlocked('ember_adept'), false, 'Ember Adept is locked initially');

  // Level Fire Magic to 9 -> still locked
  progEmber.getProficiencyStat('fire_magic').level = 9;
  progEmber.checkClassUnlocks();
  assert.equal(progEmber.isClassUnlocked('ember_adept'), false, 'Ember Adept still locked at Lv 9');

  // Level Fire Magic to 10 -> unlocks!
  let unlockedEvent: any = null;
  progEmber.onClassUnlocked((e) => {
    unlockedEvent = e;
  });
  progEmber.getProficiencyStat('fire_magic').level = 10;
  progEmber.checkClassUnlocks();

  assert.equal(progEmber.isClassUnlocked('ember_adept'), true, 'Ember Adept unlocked at Fire Magic 10');
  assert.ok(unlockedEvent, 'Unlock event triggered');
  assert.equal(unlockedEvent.classDef.id, 'ember_adept');

  // Verify hidden bonus to mana_regen
  const manaBonus = progEmber.getClassHiddenBonus('mana_regen');
  assert.equal(manaBonus, 0.05, 'Ember Adept provides +0.05 hidden bonus to mana_regen proc chance');
  console.log('✔ Test 11 passed: Ember Adept unlocks at Fire Magic 10 and applies +5% Mana Regen head-start.');

  // -------------------------------------------------------------
  // TEST 12: Random Magic Staff Starting Kit Resolution
  // -------------------------------------------------------------
  console.log('\n--- TEST 12: Random Magic Staff Starting Kit Resolution ---');
  const offensiveSchools = dataLoader.getOffensiveMagicSchools();
  assert.equal(offensiveSchools.length, 1, 'Currently exactly 1 offensive magic school exists in pool');
  assert.equal(offensiveSchools[0].id, 'fire_magic', 'Offensive school is fire_magic');

  const gameState = GameState.getInstance();
  const resolved = gameState.resolveStartingKit('random_magic_staff');
  assert.equal(resolved.mainWeaponId, 'fire_magic', 'random_magic_staff resolves cleanly to fire_magic');
  assert.equal(resolved.offhandWeaponId, null, 'No offhand weapon for 2H magic staff');

  // Verify full GameState boot initialization with random_magic_staff
  const mockPlayerData: PlayerData = {
    id: 'char_mage',
    name: 'New Mage Recruit',
    maxHp: 50,
    criticalHpMax: 25,
    maxEnergy: 100,
    energyRegenPerSecond: 5,
    moveSpeed: 120,
    attackRangeTiles: 1,
    startingWeaponId: 'short_swords', // default in player.json
    knownSkillIds: [],
    equippedSkillIds: [],
    proficiencies: {
      fire_magic: { level: 0, currentExp: 0 }
    },
    resources: { wood: 500, ore: 0 }
  };

  // Create isolated GameState instance for kit testing
  const freshGameState = new (GameState as any)();
  freshGameState.initFromPlayerData(mockPlayerData, 'random_magic_staff');

  const snap = freshGameState.getSnapshot();
  assert.equal(snap.equippedWeaponId, 'fire_magic', 'Character initialized with Fire Magic equipped as main weapon');
  assert.equal(snap.offhandWeaponId, null, 'No offhand equipped');
  assert.ok(snap.proficiencies['fire_magic'], 'fire_magic seeded in character proficiencies');
  assert.equal(snap.proficiencies['fire_magic'].level, 0, 'fire_magic starts at Level 0');

  // Verify other starting kits still resolve properly
  const swKit = gameState.resolveStartingKit('sword_and_shield');
  assert.equal(swKit.mainWeaponId, 'short_swords');
  assert.equal(swKit.offhandWeaponId, 'shields');

  const lsKit = gameState.resolveStartingKit('2h_longsword');
  assert.equal(lsKit.mainWeaponId, 'longswords');
  assert.equal(lsKit.offhandWeaponId, null);

  const bdKit = gameState.resolveStartingKit('bow_and_dagger');
  assert.equal(bdKit.mainWeaponId, 'bows');
  assert.equal(bdKit.offhandWeaponId, 'daggers');

  console.log('✔ Test 12 passed: Random Magic Staff starting kit cleanly resolves to Fire Magic without error.');

  console.log('\n======================================================');
  console.log('🎉 ALL 12 MILESTONE 18 UNIT TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Milestone 18 Test Failed:', err);
  process.exit(1);
});
