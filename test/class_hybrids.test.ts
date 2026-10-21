import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

// Intercept phaser3spectorjs require if Phaser WebGL debug probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// Setup minimal browser globals for Phaser import under Node
if (typeof (globalThis as any).window === 'undefined') {
  const noop = () => {};
  (globalThis as any).window = {
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
  (globalThis as any).document = {
    createElement: () => ({
      getContext: () => dummyCtx,
      style: {}
    }),
    addEventListener: noop,
    removeEventListener: noop,
    documentElement: {},
    body: {}
  };
  (globalThis as any).Image = class Image {};
  (globalThis as any).HTMLCanvasElement = class HTMLCanvasElement {};
  (globalThis as any).HTMLVideoElement = class HTMLVideoElement {};
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Node mock fetch for DataLoader
(globalThis as any).fetch = async (url: string) => {
  const filePath = path.join(rootDir, url.replace(/^\//, ''));
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    ok: true,
    json: async () => JSON.parse(content)
  };
};

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { SkillSystem } = await import('../src/systems/SkillSystem.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');

function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createMockScene(): any {
  const createMockObj = () => {
    const obj: any = {
      on: () => obj,
      once: () => obj,
      off: () => obj,
      emit: () => obj,
      destroy: () => {},
      setOrigin: () => obj,
      setDepth: () => obj,
      setLineWidth: () => obj,
      setVisible: () => obj,
      setAngle: () => obj,
      setAlpha: () => obj,
      setTint: () => obj,
      clearTint: () => obj,
      setInteractive: () => obj,
      play: () => obj,
      anims: { play: () => {} },
      clear: () => obj,
      fillStyle: () => obj,
      fillRect: () => obj,
      lineStyle: () => obj,
      strokeRect: () => obj,
      strokeLineShape: () => obj,
      beginPath: () => obj,
      moveTo: () => obj,
      lineTo: () => obj,
      strokePath: () => obj,
      setText: () => obj,
      setColor: () => obj,
      removeFromDisplayList: () => {},
      addedToScene: () => {},
      removedFromScene: () => {},
      addedToContainer: () => {},
      removedFromContainer: () => {},
      x: 0,
      y: 0
    };
    return obj;
  };

  return {
    tileSize: 32,
    sound: { play: () => {} },
    time: { now: 1000, addEvent: () => ({ remove: () => {} }) },
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
      updateList: { add: () => {}, remove: () => {} }
    },
    add: {
      text: () => createMockObj(),
      graphics: () => createMockObj(),
      rectangle: () => createMockObj(),
      circle: () => createMockObj(),
      sprite: () => createMockObj(),
      line: () => createMockObj(),
      existing: (item: any) => item
    },
    tweens: {
      add: (config: any) => {
        if (config && config.onComplete) config.onComplete();
        return { stop: () => {} };
      }
    }
  };
}

async function run() {
  console.log('=== CLASS HYBRIDS TEST SUITE ===\n');

  await DataLoader.getInstance().loadAll();
  const dl = DataLoader.getInstance();
  const gameState = GameState.getInstance();
  const classesData = dl.getClassesData();

  function createTestPlayer(id: string, name: string, activeClass: string, weaponId: string): Player {
    const pData = dl.getPlayer();
    const wpn = dl.getWeapon(weaponId)!;
    const prog = new ProgressionSystem(classesData);
    const mockScene = createMockScene();
    const player = new Player(mockScene, 10, 10, pData, wpn, 16, 'player', prog);
    player.id = id;
    player.entityName = name;
    player.activeClass = activeClass;
    (prog as any).activeClassId = activeClass;
    prog.setClassLevel(activeClass, 50);
    return player;
  }

  function createTestEnemy(id = 'training_dummy'): Enemy {
    const eDef = dl.getEnemy(id) || {
      id,
      name: 'Training Dummy',
      hp: 1000,
      attackIntervalMs: 2000,
      baseDamage: 5,
      speed: 0,
      exp: 10
    };
    const mockScene = createMockScene();
    return new Enemy(mockScene, 12, 10, eDef as any, 16);
  }

  // ------------------------------------------------------------------------
  // 1. Expected-Table Guards for 4 Hybrids and 20 Skills
  // ------------------------------------------------------------------------
  console.log('1. Checking Expected-Table Guards for 4 Hybrid Kits...');

  const expectedHybrids: Record<string, {
    primaryAttribute: string;
    hiddenBonusKey: string;
    hiddenBonusVal: number;
    selfCraftedWeaponBonus?: number;
    spellDamageMultiplier?: number;
    skills: Array<{
      id: string;
      level: number;
      energyCost: number;
      cooldownMs: number;
      role: string;
      priority: number;
    }>;
  }> = {
    battlesmith: {
      primaryAttribute: 'str',
      hiddenBonusKey: 'resilience',
      hiddenBonusVal: 0.05,
      selfCraftedWeaponBonus: 0.10,
      skills: [
        { id: 'tempered_strike', level: 1, energyCost: 16, cooldownMs: 3000, role: 'rotation', priority: 30 },
        { id: 'forge_guard', level: 10, energyCost: 20, cooldownMs: 16000, role: 'defensive', priority: 60 },
        { id: 'hammerfall', level: 20, energyCost: 26, cooldownMs: 9000, role: 'rotation', priority: 45 },
        { id: 'whetstone', level: 30, energyCost: 22, cooldownMs: 18000, role: 'support', priority: 50 },
        { id: 'masterwork_blow', level: 40, energyCost: 40, cooldownMs: 16000, role: 'finisher', priority: 70 }
      ]
    },
    runeblade: {
      primaryAttribute: 'str',
      hiddenBonusKey: 'mana_regen',
      hiddenBonusVal: 0.05,
      skills: [
        { id: 'rune_slash', level: 1, energyCost: 16, cooldownMs: 3000, role: 'rotation', priority: 30 },
        { id: 'rune_ward', level: 10, energyCost: 22, cooldownMs: 18000, role: 'defensive', priority: 60 },
        { id: 'sigil_burst', level: 20, energyCost: 26, cooldownMs: 9000, role: 'rotation', priority: 45 },
        { id: 'inscribe_blade', level: 30, energyCost: 24, cooldownMs: 20000, role: 'support', priority: 50 },
        { id: 'runic_cataclysm', level: 40, energyCost: 42, cooldownMs: 18000, role: 'finisher', priority: 70 }
      ]
    },
    alchemical_bomber: {
      primaryAttribute: 'dex',
      hiddenBonusKey: 'counterattack',
      hiddenBonusVal: 0.05,
      skills: [
        { id: 'volatile_flask', level: 1, energyCost: 18, cooldownMs: 3000, role: 'rotation', priority: 30 },
        { id: 'smoke_bomb', level: 10, energyCost: 20, cooldownMs: 16000, role: 'defensive', priority: 60 },
        { id: 'acid_vial', level: 20, energyCost: 26, cooldownMs: 9000, role: 'rotation', priority: 45 },
        { id: 'toxic_cloud', level: 30, energyCost: 28, cooldownMs: 12000, role: 'rotation', priority: 50 },
        { id: 'grand_detonation', level: 40, energyCost: 44, cooldownMs: 18000, role: 'finisher', priority: 70 }
      ]
    },
    herbwarden: {
      primaryAttribute: 'int',
      hiddenBonusKey: 'health_regen',
      hiddenBonusVal: 0.05,
      spellDamageMultiplier: 1.40,
      skills: [
        { id: 'bramble_lash', level: 1, energyCost: 20, cooldownMs: 3000, role: 'rotation', priority: 30 },
        { id: 'bark_ward', level: 10, energyCost: 22, cooldownMs: 16000, role: 'defensive', priority: 60 },
        { id: 'harvest_bloom', level: 20, energyCost: 28, cooldownMs: 10000, role: 'support', priority: 65 },
        { id: 'snaring_roots', level: 30, energyCost: 26, cooldownMs: 10000, role: 'rotation', priority: 45 },
        { id: 'verdant_wrath', level: 40, energyCost: 44, cooldownMs: 18000, role: 'finisher', priority: 70 }
      ]
    }
  };

  let totalSkillsChecked = 0;
  for (const [classId, def] of Object.entries(expectedHybrids)) {
    const cls = dl.getClass(classId);
    assert.ok(cls, `Class "${classId}" must exist in classes.json`);
    assert.equal(cls.tier, 'expert', `${classId} must be tier "expert"`);
    assert.equal(cls.primaryAttribute, def.primaryAttribute, `${classId} primaryAttribute must be ${def.primaryAttribute}`);
    assert.equal(cls.hiddenSkillBonuses?.[def.hiddenBonusKey], def.hiddenBonusVal, `${classId} hidden bonus ${def.hiddenBonusKey} must be ${def.hiddenBonusVal}`);

    if (def.selfCraftedWeaponBonus !== undefined) {
      assert.equal(cls.selfCraftedWeaponBonus, def.selfCraftedWeaponBonus, `${classId} selfCraftedWeaponBonus must be ${def.selfCraftedWeaponBonus}`);
    }
    if (def.spellDamageMultiplier !== undefined) {
      assert.equal(cls.spellDamageMultiplier, def.spellDamageMultiplier, `${classId} spellDamageMultiplier must be ${def.spellDamageMultiplier}`);
    }

    // Verify 5 skills
    assert.equal(def.skills.length, 5, `${classId} must have exactly 5 skills`);
    for (const sExp of def.skills) {
      const s = dl.getSkill(sExp.id);
      assert.ok(s, `Skill "${sExp.id}" must exist in skills.json`);
      assert.equal(s.energyCost, sExp.energyCost, `${sExp.id} energyCost must be ${sExp.energyCost}`);
      assert.equal(s.cooldownMs, sExp.cooldownMs, `${sExp.id} cooldownMs must be ${sExp.cooldownMs}`);
      assert.equal(s.ai.role, sExp.role, `${sExp.id} ai.role must be ${sExp.role}`);
      assert.equal(s.ai.priority, sExp.priority, `${sExp.id} ai.priority must be ${sExp.priority}`);

      const lvlReq = (s.requirements || []).find((r: any) => r.type === 'classLevel' && r.target === classId);
      assert.ok(lvlReq, `${sExp.id} must require classLevel in ${classId}`);
      assert.equal(lvlReq.value, sExp.level, `${sExp.id} required level must be ${sExp.level}`);
      totalSkillsChecked++;
    }
  }
  assert.equal(totalSkillsChecked, 20, 'All 20 hybrid skills verified');
  console.log('✓ PASS: All 4 hybrid classes and 20 skills match expected tables.\n');

  // ------------------------------------------------------------------------
  // 2. Unlock Gates Test (including Battlesmith anyOf)
  // ------------------------------------------------------------------------
  console.log('2. Checking Unlock Gates for Hybrid Classes...');

  // 2a. Battlesmith anyOf test
  console.log('  2a. Battlesmith unlock gates (testing anyOf with different weapon proficiencies)...');
  const weaponProfs = [
    'katana', 'short_swords', 'longswords', 'greatswords', 'daggers', 'mace',
    'spears', 'bows', 'crossbows', 'throwing_weapons', 'staff', 'fist'
  ];

  for (const wpnProf of weaponProfs) {
    const prog = new ProgressionSystem(classesData);
    (prog as any).unlockedClasses.add('journeyman_smith');
    prog.getClassStat('journeyman_smith').level = 15;
    prog.getProficiencyStat('blacksmithing').level = 30;

    // Initially with 0 weapon prof
    prog.checkClassUnlocks();
    assert.equal(prog.isClassUnlocked('battlesmith'), false, 'Battlesmith must not unlock without 60 weapon prof');

    // Give 60 in this specific physical weapon proficiency
    prog.getProficiencyStat(wpnProf).level = 60;
    prog.checkClassUnlocks();
    assert.equal(prog.isClassUnlocked('battlesmith'), true, `Battlesmith must unlock with ${wpnProf} at 60`);
  }
  console.log('    ✓ Battlesmith unlocks correctly across any of the 12 Weaponmaster proficiencies at 60.');

  // 2b. Runeblade unlock gates
  console.log('  2b. Runeblade unlock gates...');
  const rbProg = new ProgressionSystem(classesData);
  (rbProg as any).unlockedClasses.add('journeyman_enchanter');
  rbProg.getClassStat('journeyman_enchanter').level = 15;
  rbProg.getProficiencyStat('enchanting').level = 29;
  rbProg.getProficiencyStat('arcane_magic').level = 60;
  rbProg.checkClassUnlocks();
  assert.equal(rbProg.isClassUnlocked('runeblade'), false, 'Runeblade locked when enchanting < 30');

  rbProg.getProficiencyStat('enchanting').level = 30;
  rbProg.checkClassUnlocks();
  assert.equal(rbProg.isClassUnlocked('runeblade'), true, 'Runeblade unlocked at enchanting 30 + arcane 60 + jny enchanter Lv 15');
  console.log('    ✓ Runeblade unlock gates verified.');

  // 2c. Alchemical Bomber unlock gates
  console.log('  2c. Alchemical Bomber unlock gates...');
  const abProg = new ProgressionSystem(classesData);
  (abProg as any).unlockedClasses.add('journeyman_alchemist');
  abProg.getClassStat('journeyman_alchemist').level = 15;
  abProg.getProficiencyStat('alchemy').level = 30;
  abProg.getProficiencyStat('throwing_weapons').level = 59;
  abProg.checkClassUnlocks();
  assert.equal(abProg.isClassUnlocked('alchemical_bomber'), false, 'Bomber locked when throwing < 60');

  abProg.getProficiencyStat('throwing_weapons').level = 60;
  abProg.checkClassUnlocks();
  assert.equal(abProg.isClassUnlocked('alchemical_bomber'), true, 'Bomber unlocked at alchemy 30 + throwing 60 + jny alchemist Lv 15');
  console.log('    ✓ Alchemical Bomber unlock gates verified.');

  // 2d. Herbwarden unlock gates
  console.log('  2d. Herbwarden unlock gates...');
  const hwProg = new ProgressionSystem(classesData);
  hwProg.getProficiencyStat('gardening').level = 60;
  hwProg.getProficiencyStat('foraging').level = 60;
  hwProg.getProficiencyStat('nature_magic').level = 29;
  hwProg.checkClassUnlocks();
  assert.equal(hwProg.isClassUnlocked('herbwarden'), false, 'Herbwarden locked when nature magic < 30');

  hwProg.getProficiencyStat('nature_magic').level = 30;
  hwProg.checkClassUnlocks();
  assert.equal(hwProg.isClassUnlocked('herbwarden'), true, 'Herbwarden unlocked at gardening 60 + foraging 60 + nature magic 30');
  console.log('    ✓ Herbwarden unlock gates verified.\n');

  // ------------------------------------------------------------------------
  // 3. Battlesmith selfCraftedWeaponBonus Test
  // ------------------------------------------------------------------------
  console.log('3. Checking Battlesmith selfCraftedWeaponBonus (1.10x main weapon damage)...');

  // Setup hero and companion
  const heroBattlesmith = createTestPlayer('hero_123', 'HeroSmith', 'battlesmith', 'mace');
  const companionBattlesmith = createTestPlayer('comp_456', 'CompanionSmith', 'battlesmith', 'mace');

  // Register identical crafted maces:
  // Inst A: crafted by hero_123
  const heroMaceId = 'gear_mace_hero_crafted';
  gameState.registerGearInstance({
    instanceId: heroMaceId,
    baseItemId: 'mace',
    crafterId: heroBattlesmith.id,
    crafterName: heroBattlesmith.entityName,
    bonusPercent: 10,
    craftedAt: Date.now()
  });

  // Inst B: crafted by another crafter (e.g. comp_456)
  const otherMaceId = 'gear_mace_other_crafted';
  gameState.registerGearInstance({
    instanceId: otherMaceId,
    baseItemId: 'mace',
    crafterId: companionBattlesmith.id,
    crafterName: companionBattlesmith.entityName,
    bonusPercent: 10,
    craftedAt: Date.now()
  });

  // Inst C: legacy instance without crafterId
  const legacyMaceId = 'gear_mace_legacy_no_id';
  gameState.registerGearInstance({
    instanceId: legacyMaceId,
    baseItemId: 'mace',
    crafterName: heroBattlesmith.entityName, // name matches, but crafterId is undefined
    bonusPercent: 10,
    craftedAt: Date.now()
  });

  const resolvedHeroMace = dl.getWeapon(heroMaceId)!;
  const resolvedOtherMace = dl.getWeapon(otherMaceId)!;
  const resolvedLegacyMace = dl.getWeapon(legacyMaceId)!;

  const mockScene = createMockScene();
  const emptyGrid = Array.from({ length: 40 }, () => new Array(40).fill(0));
  const pathfinder = new Pathfinder(emptyGrid);
  const combat = new CombatSystem(mockScene, pathfinder);

  // Measure damage using tempered_strike (Lv 1 Battlesmith skill)
  const temperedStrike = dl.getSkill('tempered_strike')!;

  // Helper to cast with identical seed and clean state
  const executeStrike = (caster: Player, weapon: any, target: Enemy, time: number) => {
    caster.equippedWeapon = weapon;
    caster.energy = 100;
    caster.lastSkillUseTimes.clear();
    Math.random = mulberry32(424242);
    const hpBefore = target.hp;
    const ok = combat.castSkill(caster, 'tempered_strike', target, time);
    assert.ok(ok, 'tempered_strike must cast successfully');
    return hpBefore - target.hp;
  };

  // 1. Hero with self-crafted weapon
  const dummy1 = createTestEnemy('dummy_1');
  dummy1.hp = 1000;
  const dmgSelfCrafted = executeStrike(heroBattlesmith, resolvedHeroMace, dummy1, 1000);

  // 2. Hero with other's weapon
  const dummy2 = createTestEnemy('dummy_2');
  dummy2.hp = 1000;
  const dmgOtherCrafted = executeStrike(heroBattlesmith, resolvedOtherMace, dummy2, 5000);

  // 3. Hero with legacy weapon (no crafterId)
  const dummy3 = createTestEnemy('dummy_3');
  dummy3.hp = 1000;
  const dmgLegacy = executeStrike(heroBattlesmith, resolvedLegacyMace, dummy3, 9000);

  // 4. Companion wearing the hero's weapon (should NOT get hero's bonus)
  const dummy4 = createTestEnemy('dummy_4');
  dummy4.hp = 1000;
  const dmgCompanion = executeStrike(companionBattlesmith, resolvedHeroMace, dummy4, 13000);

  console.log(`  Damage with self-crafted weapon: ${dmgSelfCrafted.toFixed(2)}`);
  console.log(`  Damage with other character's weapon: ${dmgOtherCrafted.toFixed(2)}`);
  console.log(`  Damage with legacy weapon (no crafterId): ${dmgLegacy.toFixed(2)}`);
  console.log(`  Damage by companion wearing hero's weapon: ${dmgCompanion.toFixed(2)}`);

  const ratio = dmgSelfCrafted / dmgOtherCrafted;
  console.log(`  Ratio (self / other): ${ratio.toFixed(4)} (expected 1.1000)`);
  assert.ok(Math.abs(ratio - 1.10) < 0.001, `Damage ratio ${ratio} must be exactly 1.10x`);
  assert.equal(dmgOtherCrafted, dmgLegacy, 'Legacy weapon without crafterId must deal identical damage to other-crafted weapon');
  assert.equal(dmgOtherCrafted, dmgCompanion, 'Companion wearing hero weapon must NOT get self-crafted bonus');
  console.log('✓ PASS: Battlesmith self-crafted weapon bonus (+10%) verified strictly by Player.id.\n');

  // ------------------------------------------------------------------------
  // 4. Kit Smoke Tests & Fillers Cap & No DurationMs Guard
  // ------------------------------------------------------------------------
  console.log('4. Checking Skills Execution, Fillers Cap, and DurationMs Guard...');

  const skillSystem = new SkillSystem(combat);

  for (const [classId, def] of Object.entries(expectedHybrids)) {
    const testCaster = createTestPlayer('caster_' + classId, 'TestCaster', classId, 'short_swords');
    combat.party = [testCaster];

    for (const sInfo of def.skills) {
      const sDef = dl.getSkill(sInfo.id)!;
      const targetDummy = createTestEnemy('dummy_target_' + sInfo.id);
      testCaster.energy = 100;
      testCaster.lastSkillUseTimes.clear();

      // Execute skill smoke test
      const executed = skillSystem.execute(testCaster, sDef, targetDummy, 1000);
      assert.ok(executed !== false, `Skill ${sInfo.id} must execute cleanly without error`);

      // DurationMs guard: no durationMs on applyStatus except poison
      for (const eff of sDef.effects || []) {
        if (eff.type === 'applyStatus' && eff.durationMs !== undefined) {
          assert.equal(eff.status, 'poison', `Skill "${sInfo.id}" has durationMs on non-poison status "${eff.status}"`);
          assert.equal(eff.durationMs, 6000, `Poison status durationMs on "${sInfo.id}" must be 6000ms`);
        }
      }

      // Filler efficiency check: cooldown <= 3000ms must be <= +25% vs baseline
      if (sDef.cooldownMs <= 3000) {
        const dmgEff = (sDef.effects || []).find((e: any) => e.type === 'damage');
        if (dmgEff) {
          if (dmgEff.scaling === 'weapon') {
            // Baseline blade_strike is 1.4x
            const mult = dmgEff.multiplier;
            assert.ok(mult <= 1.4 * 1.25, `Weapon filler "${sInfo.id}" multiplier (${mult}x) exceeds +25% of blade_strike (1.75x)`);
          } else if (dmgEff.scaling === 'spell') {
            // Baseline spell filler is 1.0 - 1.2x
            const mult = dmgEff.multiplier;
            assert.ok(mult <= 1.25 * 1.25, `Spell filler "${sInfo.id}" multiplier (${mult}x) exceeds +25% of basic cast`);
          }
        }
      }
    }
  }
  console.log('✓ PASS: All 20 hybrid skills executed cleanly; fillers <= +25%; no inline durationMs except poison 6s.\n');

  console.log('🎉 ALL CLASS HYBRIDS TESTS PASSED PERFECTLY!');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
