import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { fileURLToPath } from 'node:url';

// 1. Intercept phaser3spectorjs require if Phaser WebGL debug probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// 2. Setup minimal browser globals for Phaser import under Node
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

// Setup mock fetch for DataLoader in node
(globalThis as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(rootDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    ok: true,
    json: async () => JSON.parse(content)
  };
};

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { SkillSystem } = await import('../src/systems/SkillSystem.ts');
const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
const { LockpickingSystem } = await import('../src/systems/LockpickingSystem.ts');
const { CraftingSystem } = await import('../src/systems/CraftingSystem.ts');
const { GameState } = await import('../src/systems/GameState.ts');
const { computeDetectionChance } = await import('../src/utils/perception.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { MainScene } = await import('../src/scenes/MainScene.ts');

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
      setScale: () => obj,
      setPosition: () => obj,
      setText: () => obj,
      setColor: () => obj,
      setStroke: () => obj,
      setFillStyle: () => obj,
      setScrollFactor: () => obj,
      play: () => obj,
      anims: { play: () => obj, stop: () => obj, currentAnim: null },
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
      lineBetween: () => obj,
      strokeCircle: () => obj,
      fillCircle: () => obj,
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
      existing: (obj: any) => obj,
      text: () => createMockObj(),
      sprite: () => createMockObj(),
      graphics: () => createMockObj(),
      particles: () => createMockObj(),
      line: () => createMockObj(),
      circle: () => createMockObj(),
      rectangle: () => createMockObj(),
      container: () => {
        const c = createMockObj();
        c.list = [];
        c.add = (item: any) => { c.list.push(item); return c; };
        return c;
      }
    },
    tweens: {
      add: (config: any) => {
        if (config && config.onComplete) config.onComplete();
        return { stop: () => {} };
      }
    }
  };
}

async function runTests() {
  console.log('========================================================================');
  console.log('RUNNING PASSIVE HYBRIDS PART B VALIDATION SUITE');
  console.log('Trickster, Bounty Hunter, Vampire, Treasure Hunter, Item 0');
  console.log('========================================================================\n');

  await DataLoader.getInstance().loadAll();
  const dl = DataLoader.getInstance();
  const classesData = dl.getClassesData();
  const skillsData = dl.getSkillsData();
  const statusEffectsData = dl.getStatusEffectsData();
  const luckConfig = dl.getLuckConfig();

  // ------------------------------------------------------------------------
    // ------------------------------------------------------------------------
  // 1. Item 0: Both key-driven behaviours
  // ------------------------------------------------------------------------
  console.log('--- TEST 1: Item 0 Key-Driven Behaviours ---');
  {
    // A. Verify duplicate Blessing keys deleted from luckConfig
    assert.strictEqual(
      (luckConfig as any).fortunesBlessingDamageBonus,
      undefined,
      'fortunesBlessingDamageBonus must be deleted from luckConfig'
    );
    assert.strictEqual(
      (luckConfig as any).fortunesBlessingDurationMs,
      undefined,
      'fortunesBlessingDurationMs must be deleted from luckConfig'
    );

    // B. Golden Touch reads goldenTouchIngredientDropChancePerPerk
    const mockScene = createMockScene();
    const combat = new CombatSystem(mockScene);
    const pData = dl.getPlayer();
    const wpn = dl.getWeapon('short_swords')!;
    const prog = new ProgressionSystem(classesData, 'GoldenHero');
    prog.setClassLevel('lady_fortune', 10); // perk = 10%
    const player = new Player(mockScene, 10, 10, pData, wpn, 16, 'player', prog);
    combat.party = [player];

    const slimeDef = dl.getEnemy('slime')!;
    // Slime has ingredient drop: slime_gel or similar ingredient
    const slimeWithIngredient = {
      ...slimeDef,
      ingredientDrops: [{ item: 'test_herb', weight: 1 }]
    };

    // Disable base cooking drops to isolate Golden Touch
    combat.enableCookingDrops = false;

    // Setting key to 0 disables Golden Touch (0 test_herb drops)
    const playerA = new Player(mockScene, 10, 10, pData, wpn, 16, 'player', prog);
    combat.party = [playerA];
    luckConfig.goldenTouchIngredientDropChancePerPerk = 0;
    combat.setLuckRng(() => 0.05);
    combat.setMaterialLootRng(() => 0.0);
    const slime1 = new Enemy(mockScene, 10, 10, slimeWithIngredient as any, 16);
    combat.handleTargetDefeated(playerA, slime1, 'short_swords');
    assert.strictEqual(playerA.getItemCount('test_herb'), 0, 'When goldenTouchIngredientDropChancePerPerk is 0, Golden Touch does not drop');

    // Setting key to 1.0 enables Golden Touch proc when roll (0.05) < 10% (0.10) (1 test_herb drops)
    const playerB = new Player(mockScene, 10, 10, pData, wpn, 16, 'player', prog);
    combat.party = [playerB];
    luckConfig.goldenTouchIngredientDropChancePerPerk = 1.0;
    combat.setLuckRng(() => 0.05);
    combat.setMaterialLootRng(() => 0.0);
    const slime2 = new Enemy(mockScene, 10, 10, slimeWithIngredient as any, 16);
    combat.handleTargetDefeated(playerB, slime2, 'short_swords');
    assert.strictEqual(playerB.getItemCount('test_herb'), 1, 'When goldenTouchIngredientDropChancePerPerk is 1.0, Golden Touch drops 1 ingredient');

    // cooking drops disabled for exact count

    // C. Jackpot reads jackpotExtraRollMultiplier
    // At Lv 20, Jackpot triggers on common enemy kill Fortune Trigger.
    prog.setClassLevel('lady_fortune', 20);
    const player2 = new Player(mockScene, 10, 10, pData, wpn, 16, 'player', prog);
    combat.party = [player2];

    // With multiplier = 1: 1 normal + 1 extra = 2 slime_gel
    luckConfig.jackpotExtraRollMultiplier = 1;
    combat.setLuckRng(() => 0.0); // Fortune trigger procs
    combat.setMaterialLootRng(() => 0.0);
    const slime3 = new Enemy(mockScene, 10, 10, slimeDef as any, 16);
    combat.handleTargetDefeated(player2, slime3, 'short_swords');
    assert.strictEqual(player2.getItemCount('slime_gel'), 2, 'With multiplier 1, extra count is 1 (1 + 1 = 2)');

    // With multiplier = 3: 1 normal + 3 extra = 4 slime_gel
    const player3 = new Player(mockScene, 10, 10, pData, wpn, 16, 'player', prog);
    combat.party = [player3];
    luckConfig.jackpotExtraRollMultiplier = 3;
    combat.setLuckRng(() => 0.0);
    combat.setMaterialLootRng(() => 0.0);
    const slime4 = new Enemy(mockScene, 10, 10, slimeDef as any, 16);
    combat.handleTargetDefeated(player3, slime4, 'short_swords');
    assert.strictEqual(player3.getItemCount('slime_gel'), 4, 'With multiplier 3, extra count is 3 (1 + 3 = 4)');
    combat.enableCookingDrops = true;

    // Restore starting values
    luckConfig.jackpotExtraRollMultiplier = 2;
    luckConfig.goldenTouchIngredientDropChancePerPerk = 1.0;

    console.log('✓ PASS: Item 0 key-driven behaviours verified.\n');
  }

  // ------------------------------------------------------------------------
  // 2. Expected-table guards for the 4 classes, 15 skills and 3 statuses
  // ------------------------------------------------------------------------
  console.log('--- TEST 2: Expected-Table Guards ---');
  {
    // Classes guard
    const expectedClasses: Record<string, {
      tier: string;
      primaryAttribute?: string;
      category?: string;
      requirements: { type: string; target: string; value: number }[];
      fantasy: string;
      hiddenBonusKey?: string;
      hiddenBonusVal?: number;
      spellDamageMultiplier?: number;
    }> = {
      trickster: {
        tier: 'adept',
        primaryAttribute: 'str',
        requirements: [
          { type: 'proficiency', target: 'daggers', value: 30 },
          { type: 'proficiency', target: 'luck', value: 10 }
        ],
        fantasy: 'Relies on blades and pure chance',
        hiddenBonusKey: 'counterattack',
        hiddenBonusVal: 0.05
      },
      bounty_hunter: {
        tier: 'adept',
        primaryAttribute: 'dex',
        requirements: [
          { type: 'proficiency', target: 'crossbows', value: 30 },
          { type: 'proficiency', target: 'perception', value: 30 }
        ],
        fantasy: "Tracks marks others can't find",
        hiddenBonusKey: 'evasion',
        hiddenBonusVal: 0.05
      },
      vampire: {
        tier: 'expert',
        primaryAttribute: 'int',
        requirements: [
          { type: 'proficiency', target: 'dark_magic', value: 30 },
          { type: 'proficiency', target: 'life_steal', value: 60 }
        ],
        fantasy: 'Sustains through stolen life force',
        hiddenBonusKey: 'mana_regen',
        hiddenBonusVal: 0.05,
        spellDamageMultiplier: 1.4
      },
      treasure_hunter: {
        tier: 'expert',
        category: 'crafting',
        requirements: [
          { type: 'proficiency', target: 'perception', value: 60 },
          { type: 'proficiency', target: 'luck', value: 10 },
          { type: 'proficiency', target: 'lockpicking', value: 30 }
        ],
        fantasy: 'Nothing stays hidden or locked for long'
      }
    };

    for (const [cId, expC] of Object.entries(expectedClasses)) {
      const cDef = dl.getClass(cId);
      assert.ok(cDef, `Class "${cId}" must exist in classes.json`);
      assert.strictEqual(cDef.tier, expC.tier, `${cId} tier must be ${expC.tier}`);
      if (expC.primaryAttribute) {
        assert.strictEqual(cDef.primaryAttribute, expC.primaryAttribute, `${cId} primaryAttribute mismatch`);
      }
      if (expC.category) {
        assert.strictEqual(cDef.category, expC.category, `${cId} category mismatch`);
      }
      assert.strictEqual(cDef.fantasy, expC.fantasy, `${cId} fantasy mismatch`);
      if (expC.hiddenBonusKey) {
        assert.strictEqual(cDef.hiddenSkillBonuses?.[expC.hiddenBonusKey], expC.hiddenBonusVal, `${cId} hidden bonus mismatch`);
      }
      if (expC.spellDamageMultiplier) {
        assert.strictEqual(cDef.spellDamageMultiplier, expC.spellDamageMultiplier, `${cId} spellDamageMultiplier mismatch`);
      }

      for (const req of expC.requirements) {
        const found = (cDef.requirements || []).find((r: any) => r.type === req.type && r.target === req.target);
        assert.ok(found, `Class "${cId}" missing requirement ${req.type}:${req.target}`);
        assert.strictEqual(found.value, req.value, `Class "${cId}" requirement value mismatch for ${req.target}`);
      }
    }

    // Skills guard: 15 skills
    const expectedSkills: Record<string, {
      classId: string;
      level: number;
      en: number;
      cd: number;
      role: string;
      priority: number;
      condition?: Record<string, any>;
    }> = {
      // Trickster
      sleight_cut: { classId: 'trickster', level: 1, en: 14, cd: 3000, role: 'rotation', priority: 30 },
      lucky_dodge: { classId: 'trickster', level: 10, en: 20, cd: 16000, role: 'defensive', priority: 60 },
      loaded_dice: { classId: 'trickster', level: 20, en: 22, cd: 8000, role: 'rotation', priority: 45 },
      fools_gambit: { classId: 'trickster', level: 30, en: 20, cd: 18000, role: 'support', priority: 50 },
      jackpot_strike: { classId: 'trickster', level: 40, en: 34, cd: 14000, role: 'finisher', priority: 70 },

      // Bounty Hunter
      marked_bolt: { classId: 'bounty_hunter', level: 1, en: 16, cd: 3000, role: 'rotation', priority: 30 },
      bounty_mark: { classId: 'bounty_hunter', level: 10, en: 18, cd: 12000, role: 'rotation', priority: 50 },
      net_shot: { classId: 'bounty_hunter', level: 20, en: 22, cd: 9000, role: 'rotation', priority: 45 },
      bounty_volley: { classId: 'bounty_hunter', level: 30, en: 26, cd: 10000, role: 'rotation', priority: 45, condition: { enemiesInRadius: 2 } },
      dead_or_alive: { classId: 'bounty_hunter', level: 40, en: 34, cd: 14000, role: 'finisher', priority: 70, condition: { enemyHpBelow: 0.5 } },

      // Vampire
      blood_bolt: { classId: 'vampire', level: 1, en: 20, cd: 3000, role: 'rotation', priority: 30 },
      bat_swarm: { classId: 'vampire', level: 10, en: 20, cd: 16000, role: 'defensive', priority: 60 },
      crimson_drain: { classId: 'vampire', level: 20, en: 26, cd: 9000, role: 'rotation', priority: 45 },
      blood_mist: { classId: 'vampire', level: 30, en: 26, cd: 10000, role: 'rotation', priority: 45, condition: { enemiesInRadius: 2 } },
      sanguine_feast: { classId: 'vampire', level: 40, en: 44, cd: 18000, role: 'finisher', priority: 70 }
    };

    for (const [sId, expS] of Object.entries(expectedSkills)) {
      const sDef = dl.getSkill(sId);
      assert.ok(sDef, `Skill "${sId}" must exist in skills.json`);
      assert.strictEqual(sDef.energyCost, expS.en, `${sId} energyCost mismatch`);
      assert.strictEqual(sDef.cooldownMs, expS.cd, `${sId} cooldownMs mismatch`);
      assert.strictEqual(sDef.ai.role, expS.role, `${sId} AI role mismatch`);
      assert.strictEqual(sDef.ai.priority, expS.priority, `${sId} AI priority mismatch`);

      const req = (sDef.requirements || []).find((r: any) => r.type === 'classLevel');
      assert.ok(req, `${sId} must require classLevel`);
      assert.strictEqual(req.target, expS.classId, `${sId} must target class ${expS.classId}`);
      assert.strictEqual(req.value, expS.level, `${sId} must require classLevel ${expS.level}`);

      if (expS.condition) {
        for (const [k, v] of Object.entries(expS.condition)) {
          const actualVal = sDef.ai.condition?.[k] ?? (sDef.ai as any)[k];
          assert.strictEqual(actualVal, v, `${sId} condition ${k} mismatch`);
        }
      }
    }

    // Statuses guard: 3 statuses
    const expectedStatuses: Record<string, {
      durationMs: number;
      tickIntervalMs: number;
      damagePerTick: number;
      isHarmful: boolean;
      evasionBonus?: number;
      bonusDamagePercent?: number;
    }> = {
      lucky_dodge: {
        durationMs: 6000,
        tickIntervalMs: 6000,
        damagePerTick: 0,
        isHarmful: false,
        evasionBonus: 0.25
      },
      fools_gambit: {
        durationMs: 8000,
        tickIntervalMs: 8000,
        damagePerTick: 0,
        isHarmful: false,
        bonusDamagePercent: 0.15
      },
      bat_swarm: {
        durationMs: 6000,
        tickIntervalMs: 6000,
        damagePerTick: 0,
        isHarmful: false,
        evasionBonus: 0.20
      }
    };

    for (const [stId, expSt] of Object.entries(expectedStatuses)) {
      const stDef = dl.getStatusEffect(stId);
      assert.ok(stDef, `Status "${stId}" must exist in statusEffects.json`);
      assert.strictEqual(stDef.durationMs, expSt.durationMs, `${stId} durationMs mismatch`);
      assert.strictEqual(stDef.tickIntervalMs, expSt.tickIntervalMs, `${stId} tickIntervalMs mismatch`);
      assert.strictEqual(stDef.damagePerTick, expSt.damagePerTick, `${stId} damagePerTick mismatch`);
      assert.strictEqual(stDef.isHarmful, expSt.isHarmful, `${stId} isHarmful mismatch`);
      if (expSt.evasionBonus !== undefined) {
        assert.strictEqual(stDef.evasionBonus, expSt.evasionBonus, `${stId} evasionBonus mismatch`);
      }
      if (expSt.bonusDamagePercent !== undefined) {
        assert.strictEqual(stDef.bonusDamagePercent, expSt.bonusDamagePercent, `${stId} bonusDamagePercent mismatch`);
      }
    }

    console.log('✓ PASS: Expected-table guards verified for 4 classes, 15 skills, 3 statuses.\n');
  }

  // ------------------------------------------------------------------------
    // ------------------------------------------------------------------------
  // 3. Unlock gates: each class including hidden-skill gates (Luck, Life Steal)
  // ------------------------------------------------------------------------
  console.log('--- TEST 3: Unlock Gates & Hidden Skills ---');
  {
    // Trickster: Daggers 30 + Luck 10
    {
      const prog = new ProgressionSystem(classesData, 'GateHero1');
      const cDef = dl.getClass('trickster');
      prog.getProficiencyStat('daggers').level = 30;
      prog.getProficiencyStat('luck').level = 9;
      assert.strictEqual(prog.evaluateRequirements(cDef), false, 'Trickster locked at Luck 9');
      prog.getProficiencyStat('luck').level = 10;
      assert.strictEqual(prog.evaluateRequirements(cDef), true, 'Trickster meets requirements at Daggers 30 + Luck 10');
      prog.checkClassUnlocks();
      assert.strictEqual(prog.isClassUnlocked('trickster'), true, 'Trickster unlocks via checkUnlocks()');
    }

    // Bounty Hunter: Crossbows 30 + Perception 30
    {
      const prog = new ProgressionSystem(classesData, 'GateHero2');
      const cDef = dl.getClass('bounty_hunter');
      prog.getProficiencyStat('crossbows').level = 30;
      prog.getProficiencyStat('perception').level = 29;
      assert.strictEqual(prog.evaluateRequirements(cDef), false, 'Bounty Hunter locked at Perception 29');
      prog.getProficiencyStat('perception').level = 30;
      assert.strictEqual(prog.evaluateRequirements(cDef), true, 'Bounty Hunter meets requirements at Crossbows 30 + Perception 30');
      prog.checkClassUnlocks();
      assert.strictEqual(prog.isClassUnlocked('bounty_hunter'), true, 'Bounty Hunter unlocks via checkUnlocks()');
    }

    // Vampire: Dark Magic 30 + Life Steal 60
    {
      const prog = new ProgressionSystem(classesData, 'GateHero3');
      const cDef = dl.getClass('vampire');
      prog.getProficiencyStat('dark_magic').level = 30;
      prog.getProficiencyStat('life_steal').level = 59;
      assert.strictEqual(prog.evaluateRequirements(cDef), false, 'Vampire locked at Life Steal 59');
      prog.getProficiencyStat('life_steal').level = 60;
      assert.strictEqual(prog.evaluateRequirements(cDef), true, 'Vampire meets requirements at Dark Magic 30 + Life Steal 60');
      prog.checkClassUnlocks();
      assert.strictEqual(prog.isClassUnlocked('vampire'), true, 'Vampire unlocks via checkUnlocks()');
    }

    // Treasure Hunter: Perception 60 + Luck 10 + Lockpicking 30
    {
      const prog = new ProgressionSystem(classesData, 'GateHero4');
      const cDef = dl.getClass('treasure_hunter');
      prog.getProficiencyStat('perception').level = 59;
      prog.getProficiencyStat('luck').level = 10;
      prog.getProficiencyStat('lockpicking').level = 30;
      assert.strictEqual(prog.evaluateRequirements(cDef), false, 'Treasure Hunter locked at Perception 59');
      prog.getProficiencyStat('perception').level = 60;
      assert.strictEqual(prog.evaluateRequirements(cDef), true, 'Treasure Hunter meets requirements at Perception 60 + Luck 10 + Lockpicking 30');
      prog.checkClassUnlocks();
      assert.strictEqual(prog.isClassUnlocked('treasure_hunter'), true, 'Treasure Hunter unlocks via checkUnlocks()');
    }

    console.log('✓ PASS: Unlock gates verified for all 4 classes.\n');
  }

  // ------------------------------------------------------------------------
  // 4. Cast smoke test for each skill through SkillSystem.execute
  // ------------------------------------------------------------------------
  console.log('--- TEST 4: Cast Smoke Test Through SkillSystem.execute ---');
  {
    const mockScene = createMockScene();
    const combat = new CombatSystem(mockScene);
    const skillSys = new SkillSystem(combat);
    const pData = dl.getPlayer();

    const skillIdsToTest = [
      'sleight_cut', 'lucky_dodge', 'loaded_dice', 'fools_gambit', 'jackpot_strike',
      'marked_bolt', 'bounty_mark', 'net_shot', 'bounty_volley', 'dead_or_alive',
      'blood_bolt', 'bat_swarm', 'crimson_drain', 'blood_mist', 'sanguine_feast'
    ];

    for (const skillId of skillIdsToTest) {
      const sDef = dl.getSkill(skillId);
      assert.ok(sDef, `Skill ${skillId} must exist`);

      const reqClass = (sDef.requirements || []).find((r: any) => r.type === 'classLevel')?.target || 'trickster';
      let wpnId = 'daggers';
      if (reqClass === 'bounty_hunter') wpnId = 'crossbows';
      if (reqClass === 'vampire') wpnId = 'dark_staff';

      const wpn = dl.getWeapon(wpnId)!;
      const prog = new ProgressionSystem(classesData, `Caster_${skillId}`);
      prog.setClassLevel(reqClass, 50);

      const caster = new Player(mockScene, 10, 10, pData, wpn, 16, 'player', prog);
      caster.activeClass = reqClass;
      caster.energy = 100;
      combat.party = [caster];

      // For dead_or_alive, use a damaged enemy (HP < 50% maxHp)
      const eDef = {
        id: `dummy_${skillId}`,
        name: 'Training Dummy',
        hp: skillId === 'dead_or_alive' ? 40 : 1000,
        maxHp: 1000,
        attackIntervalMs: 2000,
        baseDamage: 5,
        speed: 0,
        exp: 10
      };
      const enemy = new Enemy(mockScene, 11, 10, eDef as any, 16);
      enemy.hp = skillId === 'dead_or_alive' ? 40 : 1000;
      enemy.maxHp = 1000;
      combat.enemies = [enemy];

      const target = sDef.targetType === 'self' ? caster : enemy;
      const time = 5000;
      const initialEnergy = caster.energy;

      skillSys.execute(caster, sDef, target, time);

      assert.strictEqual(
        caster.energy,
        initialEnergy - sDef.energyCost,
        `${skillId} must consume exactly ${sDef.energyCost} energy`
      );
      assert.strictEqual(
        caster.lastSkillUseTimes.get(skillId),
        time,
        `${skillId} lastSkillUseTimes must record execution timestamp`
      );
    }

    console.log('✓ PASS: All 15 skills executed cleanly through SkillSystem.execute.\n');
  }

  // ------------------------------------------------------------------------
  // 5. Vampire lifesteal: blood_bolt heals exactly 15% of final damage
  // ------------------------------------------------------------------------
  console.log('--- TEST 5: Vampire Lifesteal & Melee Stacking ---');
  {
    const mockScene = createMockScene();
    const combat = new CombatSystem(mockScene);
    const skillSys = new SkillSystem(combat);
    const pData = dl.getPlayer();
    const bloodBoltDef = dl.getSkill('blood_bolt');

    // Case A: Staff equipped (dark_staff). Stacking does NOT occur.
    {
      const staffWpn = dl.getWeapon('dark_staff')!;
      const prog = new ProgressionSystem(classesData, 'VampStaff');
      prog.setClassLevel('vampire', 10);
      prog.getProficiencyStat('life_steal').level = 60; // 60 * 0.001 = 0.06

      const caster = new Player(mockScene, 10, 10, pData, staffWpn, 16, 'player', prog);
      caster.activeClass = 'vampire';
      caster.energy = 100;
      caster.hp = 10;
      caster.maxHp = 200;
      combat.party = [caster];

      const enemy = new Enemy(mockScene, 11, 10, {
        id: 'vamp_dummy',
        name: 'Vamp Dummy',
        hp: 1000,
        maxHp: 1000,
        attackIntervalMs: 2000,
        baseDamage: 5,
        speed: 0,
        exp: 10
      } as any, 16);
      combat.enemies = [enemy];

      const prevEnemyHp = enemy.hp;
      const prevCasterHp = caster.hp;
      skillSys.execute(caster, bloodBoltDef, enemy, 1000);

      const damageDealt = prevEnemyHp - enemy.hp;
      const healed = caster.hp - prevCasterHp;
      assert.ok(damageDealt > 0, 'Damage must be dealt');
      assert.strictEqual(
        healed,
        Math.max(1, Math.round(damageDealt * 0.15)),
        `Staff blood_bolt must heal exactly 15% of final damage (dealt: ${damageDealt}, healed: ${healed})`
      );
    }

    // Case B: Melee weapon equipped (short_swords). Stacks with Life Steal hidden skill.
    {
      const meleeWpn = dl.getWeapon('short_swords')!;
      const prog = new ProgressionSystem(classesData, 'VampMelee');
      prog.setClassLevel('vampire', 10);
      prog.getProficiencyStat('life_steal').level = 60; // +6.0% lifesteal (0.06)

      const caster = new Player(mockScene, 10, 10, pData, meleeWpn, 16, 'player', prog);
      caster.activeClass = 'vampire';
      caster.energy = 100;
      caster.hp = 10;
      caster.maxHp = 200;
      combat.party = [caster];

      const enemy = new Enemy(mockScene, 11, 10, {
        id: 'vamp_dummy_melee',
        name: 'Vamp Dummy',
        hp: 1000,
        maxHp: 1000,
        attackIntervalMs: 2000,
        baseDamage: 5,
        speed: 0,
        exp: 10
      } as any, 16);
      combat.enemies = [enemy];

      const prevEnemyHp = enemy.hp;
      const prevCasterHp = caster.hp;
      skillSys.execute(caster, bloodBoltDef, enemy, 2000);

      const damageDealt = prevEnemyHp - enemy.hp;
      const healed = caster.hp - prevCasterHp;
      assert.ok(damageDealt > 0, 'Damage must be dealt');
      // Total lifesteal = 0.15 + 0.06 = 0.21
      assert.strictEqual(
        healed,
        Math.max(1, Math.round(damageDealt * 0.21)),
        `Melee blood_bolt must stack with Life Steal (0.15 + 0.06 = 0.21, dealt: ${damageDealt}, healed: ${healed})`
      );
    }

    console.log('✓ PASS: Vampire lifesteal 15% and melee stacking verified.\n');
  }

  // ------------------------------------------------------------------------
  // 6. Treasure Hunter at Lv 15
  // ------------------------------------------------------------------------
  console.log('--- TEST 6: Treasure Hunter at Lv 15 ---');
  {
    const prog = new ProgressionSystem(classesData, 'TreasureHero');
    prog.setClassLevel('treasure_hunter', 15);

    // A. Keen Search +15 pp (exact)
    const baseChance = computeDetectionChance(0);
    const thPerks = CraftingSystem.getTreasureHunterPerks(prog);
    assert.strictEqual(thPerks.unlocked, true);
    assert.strictEqual(thPerks.perkPercent, 15);
    assert.strictEqual(thPerks.keenSearchBonus, 0.15);

    const boostedChance = computeDetectionChance(0, thPerks);
    const ppDiff = Math.round((boostedChance - baseChance) * 10000) / 10000;
    assert.strictEqual(ppDiff, 0.15, `Keen Search must add exactly +15 percentage points (got ${ppDiff})`);

    // B. Pickmaster +7.5 pp (exact)
    const lockSys = LockpickingSystem.getInstance();
    const baseSuccessRate = lockSys.calculateSuccessRate(0);
    assert.strictEqual(thPerks.pickmasterBonus, 0.075);
    const boostedSuccessRate = lockSys.calculateSuccessRate(0, thPerks.pickmasterBonus);
    const pickDiff = Math.round((boostedSuccessRate - baseSuccessRate) * 10000) / 10000;
    assert.strictEqual(pickDiff, 0.075, `Pickmaster must add exactly +7.5 percentage points (got ${pickDiff})`);

    // C. Treasure Sense 15% ± 1.5% over 5,000 seeded box openings
    const rng = mulberry32(133742);
    const luckRng = mulberry32(987654);
    const gameState = GameState.getInstance();
    gameState.addItem('locked_box', 6000);
    gameState.addItem('lockpick', 12000);

    let treasureSenseProcs = 0;
    const trials = 5000;

    for (let i = 0; i < trials; i++) {
      // Force success roll to always succeed on first try
      const forceSuccessRng = () => 0.01;
      const res = lockSys.attemptUnlock(prog, 'TreasureHero', forceSuccessRng, undefined, luckRng);
      assert.strictEqual(res.success, true);
      if (res.treasureSenseProcced) {
        treasureSenseProcs++;
      }
    }

    const procRate = treasureSenseProcs / trials;
    console.log(`Treasure Sense procs over ${trials} runs: ${treasureSenseProcs} (${(procRate * 100).toFixed(2)}%)`);
    assert.ok(
      procRate >= 0.135 && procRate <= 0.165,
      `Treasure Sense rate must be within 15% ± 1.5% [13.5%, 16.5%], got ${(procRate * 100).toFixed(2)}%`
    );

    // D. Class EXP for all 3 sources
    // Reset Treasure Hunter to Lv 0 (0 EXP)
    prog.setClassLevel('treasure_hunter', 50);
    assert.strictEqual(prog.getClassLevel('treasure_hunter'), 50);
    assert.strictEqual(prog.getClassStat('treasure_hunter').currentExp, 0);

    // Source 1: Hidden cache revealed (+25 EXP)
    const mockScene = createMockScene();
    const scene = new MainScene();
    (scene as any).hud = { showToast: () => {} };
    (scene as any).undiscoveredCaches = [{ x: 5, y: 5, roomIndex: 0 }];
    (scene as any).spawnGatheringNode = () => {};

    const pData = dl.getPlayer();
    const wpn = dl.getWeapon('short_swords')!;
    const player = new Player(mockScene, 5, 5, pData, wpn, 16, 'player', prog);

    scene.revealHiddenCache({ x: 5, y: 5, roomIndex: 0 }, player);
    assert.strictEqual(
      prog.getClassStat('treasure_hunter').currentExp,
      25,
      'Source 1: hidden cache reveal must award +25 Treasure Hunter EXP'
    );

    // Source 2 & 3: Successful pick (+35) and locked box opened (+25) = total +60 in attemptUnlock
    const expBefore = prog.getClassStat('treasure_hunter').currentExp;
    lockSys.attemptUnlock(prog, 'TreasureHero', () => 0.01, undefined, () => 0.5);
    const expAfter = prog.getClassStat('treasure_hunter').currentExp;
    assert.strictEqual(
      expAfter - expBefore,
      60,
      'Source 2 & 3: successful pick (+35) and locked box opened (+25) must award +60 Treasure Hunter EXP'
    );

    console.log('✓ PASS: Treasure Hunter Lv 15 perks and EXP verified.\n');
  }

  // ------------------------------------------------------------------------
  // 7. Fillers ≤ +25%; no durationMs outside poison
  // ------------------------------------------------------------------------
  console.log('--- TEST 7: Fillers & DurationMs Rule ---');
  {
    // Blade strike baseline: 1.1x weapon damage.
    // Fillers ≤ +25% vs blade_strike: max allowed is 1.1 * 1.25 = 1.375.
    const sleightCutDef = dl.getSkill('sleight_cut');
    const markedBoltDef = dl.getSkill('marked_bolt');
    const bloodBoltDef = dl.getSkill('blood_bolt');

    const scMult = (sleightCutDef.effects?.[0] as any)?.multiplier ?? 0;
    const mbMult = (markedBoltDef.effects?.[0] as any)?.multiplier ?? 0;
    const bbMult = (bloodBoltDef.effects?.[0] as any)?.multiplier ?? 0;

    assert.ok(scMult <= 1.375, `sleight_cut (${scMult}) must be <= +25% vs blade_strike (1.375)`);
    assert.ok(mbMult <= 1.375, `marked_bolt (${mbMult}) must be <= +25% vs blade_strike (1.375)`);
    assert.ok(bbMult <= 1.375, `blood_bolt (${bbMult}) must be <= +25% vs blade_strike (1.375)`);

    // No durationMs on applyStatus except poison or durationOverrideReason
    for (const skill of skillsData.skills) {
      for (const eff of skill.effects || []) {
        if (eff.type === 'applyStatus' && eff.durationMs !== undefined) {
          const isPoison = eff.status === 'poison';
          const hasReason = eff.durationOverrideReason !== undefined || (skill as any).durationOverrideReason !== undefined;
          assert.ok(
            isPoison || hasReason,
            `Skill "${skill.id}" has applyStatus.durationMs without being poison or having durationOverrideReason`
          );
        }
      }
    }

    console.log('✓ PASS: Fillers rule and applyStatus.durationMs rule verified.\n');
  }

  console.log('========================================================================');
  console.log('ALL PASSIVE HYBRIDS PART B TESTS PASSED PERFECTLY!');
  console.log('========================================================================');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
