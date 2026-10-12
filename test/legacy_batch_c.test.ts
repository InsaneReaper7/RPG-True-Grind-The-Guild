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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Setup mock fetch for DataLoader in node
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const filePath = path.resolve(rootDir, cleanPath);
  const content = fs.readFileSync(filePath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

const { DataLoader } = await import('../src/utils/DataLoader.ts');
const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
const { Player } = await import('../src/entities/Player.ts');
const { Enemy } = await import('../src/entities/Enemy.ts');
const { Pathfinder } = await import('../src/utils/Pathfinder.ts');
import type { EnemyDef, WeaponDef } from '../src/types/game.ts';

function createMockScene(gridWidth: number = 30, gridHeight: number = 30): any {
  const grid: number[][] = [];
  for (let y = 0; y < gridHeight; y++) {
    grid[y] = [];
    for (let x = 0; x < gridWidth; x++) {
      grid[y][x] = 0;
    }
  }
  const pathfinder = new Pathfinder(grid);

  const createMockObj = () => {
    const obj: any = new Proxy({
      x: 0,
      y: 0,
      parentContainer: null,
      destroy: () => {}
    }, {
      get(target, prop) {
        if (prop in target) return (target as any)[prop];
        return () => obj;
      },
      set(target, prop, value) {
        (target as any)[prop] = value;
        return true;
      }
    });
    return obj;
  };

  const scene: any = {
    gridWidth,
    gridHeight,
    tileSize: 32,
    grid,
    pathfinder,
    lastFloatingText: '',
    lastFloatingColor: '',
    floatingTexts: [] as Array<{ text: string; color: string }>,
    time: {
      now: 1000,
      addEvent: () => ({ remove: () => {} })
    },
    events: { emit: () => {} },
    sound: { play: () => {} },
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
      updateList: { add: () => {}, remove: () => {} }
    },
    tweens: {
      add: (config: any) => {
        if (config.onComplete) {
          config.onComplete();
        }
        return { stop: () => {}, remove: () => {} };
      }
    },
    add: {
      graphics: () => createMockObj(),
      sprite: () => createMockObj(),
      text: (x: number, y: number, text: string, style: any) => {
        const textObj = createMockObj();
        textObj.text = text;
        scene.lastFloatingText = text;
        scene.lastFloatingColor = style?.color ?? '';
        scene.floatingTexts.push({ text, color: style?.color ?? '' });
        return textObj;
      },
      particles: () => createMockObj(),
      container: () => createMockObj(),
      circle: () => createMockObj(),
      zone: () => createMockObj(),
      line: () => createMockObj(),
      rectangle: () => createMockObj(),
      existing: (item: any) => item
    }
  };
  return scene;
}

function createDummyEnemy(scene: any, x: number, y: number, name: string = 'Test Fiend', hp: number = 200): Enemy {
  const def: EnemyDef = {
    id: 'test_enemy',
    name,
    tier: 'common',
    hp,
    criticalHpMax: 0,
    meleeDamage: 10,
    aggroRadius: 6,
    attackIntervalMs: 1500,
    moveSpeed: 1.0,
    harvest: []
  };
  const enemy = new Enemy(scene, x, y, def, scene.pathfinder);
  enemy.hp = hp;
  enemy.maxHp = hp;
  enemy.setGridPosition(x, y);
  return enemy;
}

async function runBatchCTests() {
  console.log('========================================================================');
  console.log('RUNNING LEGACY KIT MIGRATION BATCH C TEST SUITE');
  console.log('========================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const scene = createMockScene();
  const combat = new CombatSystem(scene);
  const playerData = dataLoader.getPlayer();

  const fixedTestWeapon: WeaponDef = {
    id: 'test_fixed_sword',
    name: 'Test Fixed Sword',
    type: 'melee',
    category: 'swords',
    tier: 'common',
    baseDamage: 10,
    baseAccuracy: 1.0, // 100% accuracy to ensure deterministic hits unless testing misses
    attackSpeed: 1.0,
    attackRangeTiles: 1,
    energyCostPerAttack: 10,
    scaling: { stat: 'strength', factor: 0.0 }
  };

  const createTester = (skillId: string, weapon: WeaponDef = fixedTestWeapon, x: number = 10, y: number = 10, skipClasses: boolean = false) => {
    const tester = new Player(scene, x, y, playerData, weapon, 32);
    if (!skipClasses) {
      for (const c of [
        'fencer', 'combat_medic', 'vanguard', 'restoration_mage', 'brawler',
        'scout', 'dark_knight', 'swordsman', 'ronin', 'samurai', 'javelin',
        'loader', 'arcane_initiate', 'spellsword', 'thrower'
      ]) {
        tester.progression.setClassLevel(c as any, 50);
      }
    }
    tester.mood = 50; // 1.0 multiplier
    tester.energy = 100;
    tester.hp = 100;
    tester.maxHp = 100;
    tester.equippedSkillIds = [skillId];
    tester.setGridPosition(x, y);
    return tester;
  };

  const originalRandom = Math.random;
  Math.random = () => 0.05; // Default hit guaranteed, no accidental crits unless forced

  try {
    // -----------------------------------------------------------------------
    // DATA INTEGRITY TEST: All 240 skills have non-empty effects and an ai
    // -----------------------------------------------------------------------
    console.log('--- TEST 0: Data Integrity (Every skill has effects and ai) ---');
    const allSkills = dataLoader.getSkills();
    assert.strictEqual(allSkills.length, 240, 'skills.json has exactly 240 skills');
    for (const s of allSkills) {
      assert.strictEqual(
        Array.isArray(s.effects) && s.effects.length > 0,
        true,
        `Skill ${s.id} must have non-empty effects`
      );
      assert.strictEqual(
        s.ai !== undefined && s.ai !== null && typeof s.ai === 'object',
        true,
        `Skill ${s.id} must have an ai definition`
      );
    }
    console.log(`  ✓ All ${allSkills.length} skills have data-driven effects and ai!`);

    // -----------------------------------------------------------------------
    // BLESSED WEAPONS CLEANUP
    // -----------------------------------------------------------------------
    console.log('--- TEST 0B: statusEffects.json blessed_weapons cleanup ---');
    const blessed = dataLoader.getStatusEffect('blessed_weapons');
    assert.strictEqual(blessed.flatBonusDamage, 5, 'blessed_weapons flatBonusDamage is 5');
    assert.strictEqual((blessed as any).holyBonusDamage, undefined, 'blessed_weapons holyBonusDamage removed');
    console.log('  ✓ blessed_weapons clean.');

    // -----------------------------------------------------------------------
    // TEST 1: LIFESTEAL (soul_drain: 0.5)
    // -----------------------------------------------------------------------
    console.log('--- TEST 1: lifesteal (soul_drain) ---');
    // soul_drain: weapon scaling, multiplier 1.8. fixedTestWeapon has baseDamage: 10, dark_magic/longswords lvl 0.
    // hitDamage = 10 * 1.8 = 18.
    // lifesteal: 0.5 -> heal = round(18 * 0.5) = 9 HP.
    {
      const tester = createTester('soul_drain');
      tester.hp = 40; // missing 60 HP
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 200);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'soul_drain', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(enemy.hp, 200 - 18, 'Enemy took 18 damage (200 -> 182)');
      assert.strictEqual(tester.hp, 40 + 9, 'Tester healed for 9 HP (40 -> 49, 50% of 18 damage dealt)');

      // Kill shot: enemy has 10 HP left.
      const lowEnemy = createDummyEnemy(scene, 10, 11, 'Low Target', 10);
      const killTester = createTester('soul_drain');
      combat.party = [killTester];
      combat.enemies = [lowEnemy];
      killTester.hp = 50;
      const killOk = combat.castSkill(killTester, 'soul_drain', lowEnemy, 1000);
      assert.strictEqual(killOk, true);
      assert.strictEqual(lowEnemy.hp, 0, 'Enemy HP reduced to 0');
      assert.strictEqual(lowEnemy.state, 'dead', 'Enemy marked dead');
      assert.strictEqual(killTester.hp, 50 + 9, 'Tester healed for 9 HP (50 -> 59) even when enemy had 10 HP remaining');
    }
    console.log('  ✓ Lifesteal works on normal hit and lethal hit.');

    // -----------------------------------------------------------------------
    // TEST 2: RESOURCE DUMP (oblivion_strike & heavenly_decapitation: 25 max, 0.04 per EN)
    // -----------------------------------------------------------------------
    console.log('--- TEST 2: resourceDump ---');
    // oblivion_strike: baseCost 35, baseMultiplier 3.0. Weapon baseDamage 10.
    // Case A: 25 surplus EN.
    // Tester starting energy = 35 (cost) + 25 (surplus) = 60 EN.
    // Cast deducts 35 EN -> 25 EN surplus remaining.
    // resourceDump consumes 25 EN -> 0 EN remaining.
    // multiplier = 3.0 + 25 * 0.04 = 3.0 + 1.0 = 4.0.
    // Damage = 10 * 4.0 = 40.
    {
      const tester = createTester('oblivion_strike');
      tester.energy = 60;
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 200);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'oblivion_strike', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(tester.energy, 0, 'Tester spent 35 base + 25 surplus = 60 EN total');
      assert.strictEqual(enemy.hp, 200 - 40, `Enemy took 40 damage (10 * 4.0): ${enemy.hp}`);
    }

    // Case B: 10 surplus EN.
    // Tester starting energy = 35 + 10 = 45 EN.
    // Cast deducts 35 EN -> 10 EN surplus remaining.
    // resourceDump consumes 10 EN -> 0 EN remaining.
    // multiplier = 3.0 + 10 * 0.04 = 3.0 + 0.4 = 3.4.
    // Damage = 10 * 3.4 = 34.
    {
      const tester = createTester('oblivion_strike');
      tester.energy = 45;
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 200);
      combat.party = [tester];
      combat.enemies = [enemy];
      const ok = combat.castSkill(tester, 'oblivion_strike', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(tester.energy, 0, 'Tester spent 35 base + 10 surplus = 45 EN total');
      assert.strictEqual(enemy.hp, 200 - 34, `Enemy took 34 damage (10 * 3.4): ${enemy.hp}`);
    }
    console.log('  ✓ resourceDump accurately consumes surplus EN and scales damage.');

    // -----------------------------------------------------------------------
    // TEST 3: DISTANCE BONUS (heartseeker_hurl: 0.10 per tile)
    // -----------------------------------------------------------------------
    console.log('--- TEST 3: distanceBonus (heartseeker_hurl) ---');
    // heartseeker_hurl: multiplier 2.8, distanceBonus: 0.10 per tile. Base damage 10.
    // At 1 tile: dist = 1 -> multiplier = 2.8 * (1 + 1 * 0.10) = 2.8 * 1.1 = 3.08.
    // Damage = 10 * 3.08 = 30.8.
    {
      const tester = createTester('heartseeker_hurl', fixedTestWeapon, 10, 10);
      const enemy1 = createDummyEnemy(scene, 10, 11, 'Target 1 Tile', 200);
      combat.party = [tester];
      combat.enemies = [enemy1];
      const ok1 = combat.castSkill(tester, 'heartseeker_hurl', enemy1, 1000);
      assert.strictEqual(ok1, true);
      const damage1 = 200 - enemy1.hp;
      assert.strictEqual(damage1.toFixed(1), '30.8', `Damage at 1 tile is 30.8: ${damage1}`);

      // At 5 tiles: (10, 10) to (10, 15) -> dist = 5.
      // multiplier = 2.8 * (1 + 5 * 0.10) = 2.8 * 1.5 = 4.2.
      // Damage = 10 * 4.2 = 42.0.
      const enemy5 = createDummyEnemy(scene, 10, 15, 'Target 5 Tiles', 200);
      combat.enemies = [enemy5];
      const ok5 = combat.castSkill(tester, 'heartseeker_hurl', enemy5, 15000); // after cooldown
      assert.strictEqual(ok5, true);
      const damage5 = 200 - enemy5.hp;
      assert.strictEqual(damage5.toFixed(1), '42.0', `Damage at 5 tiles is 42.0: ${damage5}`);
    }
    console.log('  ✓ distanceBonus scales damage at 1 tile (+10%) and 5 tiles (+50%).');

    // -----------------------------------------------------------------------
    // TEST 4: REQUIRES SELF STATUS (blade_beam & blade_barrage)
    // -----------------------------------------------------------------------
    console.log('--- TEST 4: requiresSelfStatus ---');
    // blade_beam: base multiplier 2.6.
    // requiresSelfStatus 'runic_infusion': multiplier 1.2, energyRefund: 10, area: cleave 60%.
    // Base weapon damage 10.
    // Case A: Without runic_infusion:
    // Damage = 10 * 2.6 = 26. No cleave. No refund. Cost = 35.
    {
      const tester = createTester('blade_beam');
      tester.energy = 40; // cost is 35, 5 remaining
      const target = createDummyEnemy(scene, 10, 11, 'Target', 200);
      const adjacent = createDummyEnemy(scene, 11, 11, 'Adjacent', 200);
      combat.party = [tester];
      combat.enemies = [target, adjacent];
      const ok = combat.castSkill(tester, 'blade_beam', target, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(target.hp, 200 - 26, `Target took 26 damage: ${target.hp}`);
      assert.strictEqual(adjacent.hp, 200, 'Adjacent enemy took 0 damage (no cleave)');
      assert.strictEqual(tester.energy, 5, 'Energy is 40 - 35 = 5 (no refund)');
    }

    // Case B: With runic_infusion:
    // runic_infusion has: bonusDamagePercent: 0.25, energySiphonOnHit: 4.
    // blade_beam requiresSelfStatus gives: *1.2 multiplier, +10 EN refund, 60% cleave.
    // Base scaled: 10 * (2.6 * 1.2) = 31.2.
    // With status bonusDamagePercent (+25%): 31.2 * 1.25 = 39 damage.
    // Cleave to adjacent: 60% of 39 = 23.4 -> 23.4 damage.
    // Energy: 40 - 35 = 5 + 10 (refund) + 4 (siphon on hit) = 19 EN.
    {
      const tester = createTester('blade_beam');
      tester.energy = 40;
      const runic = dataLoader.getStatusEffect('runic_infusion');
      tester.applyStatusEffect(runic);
      const target = createDummyEnemy(scene, 10, 11, 'Target', 200);
      const adjacent = createDummyEnemy(scene, 11, 11, 'Adjacent', 200);
      combat.party = [tester];
      combat.enemies = [target, adjacent];
      const ok = combat.castSkill(tester, 'blade_beam', target, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(target.hp, 200 - 39, `Target took 39 damage: ${target.hp}`);
      assert.strictEqual((200 - adjacent.hp).toFixed(1), '23.4', `Adjacent took 23.4 cleave damage: ${adjacent.hp}`);
      assert.strictEqual(tester.energy, 19, `Tester has 19 EN (5 + 10 refund + 4 siphon): ${tester.energy}`);
    }
    console.log('  ✓ requiresSelfStatus grants damage multiplier, energy refund, and cleave area.');

    // -----------------------------------------------------------------------
    // TEST 5: REVIVE EFFECT (mass_revive: radius 6 tiles)
    // -----------------------------------------------------------------------
    console.log('--- TEST 5: revive effect (mass_revive) ---');
    {
      const caster = createTester('mass_revive', fixedTestWeapon, 10, 10);
      const allyIn1 = createTester('none', fixedTestWeapon, 10, 12); // dist 2 <= 6
      allyIn1.entityName = 'Ally Dist 2';
      allyIn1.hp = 0;
      allyIn1.state = 'downed';

      const allyIn2 = createTester('none', fixedTestWeapon, 16, 10); // dist 6 <= 6
      allyIn2.entityName = 'Ally Dist 6';
      allyIn2.hp = 0;
      allyIn2.state = 'downed';

      const allyOut = createTester('none', fixedTestWeapon, 17, 10); // dist 7 > 6
      allyOut.entityName = 'Ally Dist 7';
      allyOut.hp = 0;
      allyOut.state = 'downed';

      combat.party = [caster, allyIn1, allyIn2, allyOut];
      const initialRevives = caster.progression.getActivityCount('Ally Revived');
      const ok = combat.castSkill(caster, 'mass_revive', caster, 1000);
      assert.strictEqual(ok, true);

      assert.notStrictEqual(allyIn1.state, 'downed', 'Ally at 2 tiles revived (not downed)');
      assert.strictEqual(allyIn1.hp > 0, true, 'Ally at 2 tiles has positive HP');
      assert.notStrictEqual(allyIn2.state, 'downed', 'Ally at 6 tiles revived (not downed)');
      assert.strictEqual(allyIn2.hp > 0, true, 'Ally at 6 tiles has positive HP');
      assert.strictEqual(allyOut.state, 'downed', 'Ally at 7 tiles was NOT revived');

      const finalRevives = caster.progression.getActivityCount('Ally Revived');
      assert.strictEqual(finalRevives - initialRevives, 2, 'Ally Revived counter incremented by 2');
    }
    console.log('  ✓ mass_revive revives downed allies in 6 tiles and increments stats.');

    // -----------------------------------------------------------------------
    // TEST 6: ENERGY SIPHON ON HIT (runic_infusion: +4 EN)
    // -----------------------------------------------------------------------
    console.log('--- TEST 6: energySiphonOnHit (+4 EN on basic attack & skill) ---');
    {
      const tester = createTester('blade_strike');
      tester.energy = 50;
      const runic = dataLoader.getStatusEffect('runic_infusion');
      tester.applyStatusEffect(runic);
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 200);
      combat.party = [tester];
      combat.enemies = [enemy];

      // Basic attack: cost 0 EN -> 50 + 4 siphon = 54 EN.
      combat.executePlayerBasicAttack(tester, enemy);
      assert.strictEqual(tester.energy, 54, `Basic attack with siphon resulted in 54 EN: ${tester.energy}`);

      // Skill attack (blade_strike): cost 15 EN -> 54 - 15 = 39 + 4 siphon = 43 EN.
      const okSkill = combat.castSkill(tester, 'blade_strike', enemy, 1000);
      assert.strictEqual(okSkill, true);
      assert.strictEqual(tester.energy, 43, `Skill attack with siphon resulted in 43 EN: ${tester.energy}`);
    }
    console.log('  ✓ energySiphonOnHit restores EN on basic attacks and skill attacks.');

    // -----------------------------------------------------------------------
    // TEST 7: MANA SHIELD (damageToEnergyPercent: 0.50)
    // -----------------------------------------------------------------------
    console.log('--- TEST 7: mana_shield (damageToEnergyPercent) ---');
    {
      const player = createTester('none');
      player.hp = 100;
      player.energy = 20;
      const manaShield = dataLoader.getStatusEffect('mana_shield');
      player.applyStatusEffect(manaShield);

      // Incoming damage 40: 50% converted to energy deduction (-20 EN), remaining 20 dealt to HP (100 -> 80)
      player.takeDamage(40);
      assert.strictEqual(player.hp, 80, `HP after 40 damage with mana_shield is 80: ${player.hp}`);
      assert.strictEqual(player.energy, 0, `Energy after mana_shield conversion is 0 (20 - 20): ${player.energy}`);
    }
    console.log('  ✓ mana_shield generically converts 50% damage to energy.');

    // -----------------------------------------------------------------------
    // TEST 8: KENJUTSU DEFLECTION (reflectPercent: 0.50 on shield)
    // -----------------------------------------------------------------------
    console.log('--- TEST 8: kenjutsu_deflection (reflectPercent) ---');
    {
      const player = createTester('none', fixedTestWeapon, 10, 10, true);
      player.hp = 100;
      const kenjutsu = dataLoader.getStatusEffect('kenjutsu_deflection');
      player.applyStatusEffect(kenjutsu);
      const attacker = createDummyEnemy(scene, 10, 11, 'Attacker', 100);
      attacker.enemyData.meleeDamage = 30;
      attacker.enemyData.attackIntervalMs = 100;
      attacker.isAggroed = true;
      attacker.lastAttackTime = 0;
      combat.party = [player];
      combat.enemies = [attacker];
      (combat as any).enemyTargets.set(attacker, player);

      // Attacker hits player for 30 damage.
      // Shield HP = 40: absorbs 30 completely (player takes 0 damage).
      // Reflects 50% of 30 absorbed damage to attacker = 15 damage (attacker 100 -> 85).
      combat.update(1000, 16);
      assert.strictEqual(player.hp, 100, `Player HP undamaged: ${player.hp}`);
      assert.strictEqual(attacker.hp, 85, `Attacker took 15 reflected damage: ${attacker.hp}`);
    }
    console.log('  ✓ kenjutsu_deflection absorbs damage and reflects 50% back to attacker.');

    // -----------------------------------------------------------------------
    // TEST 9: RETALIATE (counterOnHit: { consume: true })
    // -----------------------------------------------------------------------
    console.log('--- TEST 9: retaliate (counterOnHit) ---');
    {
      const player = createTester('none', fixedTestWeapon, 10, 10, true);
      const retaliateDef = dataLoader.getStatusEffect('retaliate');
      player.applyStatusEffect(retaliateDef);
      const attacker = createDummyEnemy(scene, 10, 11, 'Attacker', 100);
      attacker.enemyData.baseDamage = 10;
      attacker.enemyData.attackIntervalMs = 100;
      attacker.isAggroed = true;
      attacker.lastAttackTime = 0;
      combat.party = [player];
      combat.enemies = [attacker];
      (combat as any).enemyTargets.set(attacker, player);

      assert.strictEqual(player.hasStatusEffect('retaliate'), true, 'Player has retaliate before hit');
      combat.update(1000, 16);

      // Status consumed
      assert.strictEqual(player.hasStatusEffect('retaliate'), false, 'Retaliate consumed after hit');
      assert.strictEqual(attacker.hp < 100, true, `Attacker hit by counterattack (hp: ${attacker.hp})`);

      // Second hit triggers no counterattack
      const hpAfterFirst = attacker.hp;
      combat.update(1200, 16);
      assert.strictEqual(attacker.hp, hpAfterFirst, 'No counterattack triggered on second hit');
    }
    console.log('  ✓ retaliate triggers exactly 1 counterattack and consumes itself.');

    // -----------------------------------------------------------------------
    // TEST 10: OVERCHARGE (nextSpell: 1.75 damage, 1.50 EN cost)
    // -----------------------------------------------------------------------
    console.log('--- TEST 10: overcharge (nextSpell) ---');
    {
      const tester = createTester('arcane_bolt');
      tester.energy = 80;
      const overchargeDef = dataLoader.getStatusEffect('overcharge');
      tester.applyStatusEffect(overchargeDef);
      const enemy1 = createDummyEnemy(scene, 10, 11, 'Target 1', 200);
      combat.party = [tester];
      combat.enemies = [enemy1];

      // arcane_bolt: cost 12, damageMultiplier 1.4. fixedTestWeapon effBase = 10.
      // With overcharge:
      // cost: 12 + round(12 * 0.50) = 18 EN.
      // damage: 10 * 1.4 * 1.75 = 24.5 damage.
      const ok1 = combat.castSkill(tester, 'arcane_bolt', enemy1, 1000);
      assert.strictEqual(ok1, true);
      assert.strictEqual(tester.energy, 80 - 18, `Tester energy spent 18 EN: ${tester.energy}`);
      assert.strictEqual((200 - enemy1.hp).toFixed(1), '24.5', `Enemy took 24.5 damage: ${enemy1.hp}`);
      assert.strictEqual(tester.hasStatusEffect('overcharge'), false, 'overcharge consumed after spell');

      // Subsequent spell is normal:
      // cost 12 EN -> 62 - 12 = 50 EN.
      // damage: 10 * 1.4 = 14 damage.
      const enemy2 = createDummyEnemy(scene, 10, 11, 'Target 2', 200);
      combat.enemies = [enemy2];
      const ok2 = combat.castSkill(tester, 'arcane_bolt', enemy2, 10000); // after cooldown
      assert.strictEqual(ok2, true);
      assert.strictEqual(tester.energy, 50, `Tester energy after second spell is 50: ${tester.energy}`);
      assert.strictEqual((200 - enemy2.hp).toFixed(1), '14.0', `Enemy 2 took normal 14 damage: ${enemy2.hp}`);
    }
    console.log('  ✓ overcharge modifies exactly the next spell cast.');

    // -----------------------------------------------------------------------
    // TEST 11: RIPOSTE (consumeStatus riposte_window + asCounterattack)
    // -----------------------------------------------------------------------
    console.log('--- TEST 11: riposte ---');
    {
      const tester = createTester('riposte');
      const riposteWin = dataLoader.getStatusEffect('riposte_window');
      tester.applyStatusEffect(riposteWin);
      assert.strictEqual(tester.hasStatusEffect('riposte_window'), true);
      const enemy = createDummyEnemy(scene, 10, 11, 'Target', 200);
      combat.party = [tester];
      combat.enemies = [enemy];

      const ok = combat.castSkill(tester, 'riposte', enemy, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(tester.hasStatusEffect('riposte_window'), false, 'riposte_window consumed');
      assert.strictEqual(enemy.hp < 200, true, 'Enemy took counterattack damage');
    }
    console.log('  ✓ riposte consumes riposte_window and executes counterattack.');

    // -----------------------------------------------------------------------
    // TEST 12: ARCANE NOVA (radius 4 without line of sight check)
    // -----------------------------------------------------------------------
    console.log('--- TEST 12: arcane_nova radius AoE ---');
    {
      const caster = createTester('arcane_nova', fixedTestWeapon, 10, 10);
      const inRadius = createDummyEnemy(scene, 10, 14, 'In Radius (dist 4)', 200);
      const outRadius = createDummyEnemy(scene, 10, 15, 'Out Radius (dist 5)', 200);
      combat.party = [caster];
      combat.enemies = [inRadius, outRadius];

      // Base damage: 10 * 2.6 = 26 damage
      const ok = combat.castSkill(caster, 'arcane_nova', caster, 1000);
      assert.strictEqual(ok, true);
      assert.strictEqual(inRadius.hp, 200 - 26, `Enemy in radius took 26 damage: ${inRadius.hp}`);
      assert.strictEqual(outRadius.hp, 200, `Enemy out of radius took 0 damage: ${outRadius.hp}`);
    }
    console.log('  ✓ arcane_nova damages targets within 4 tiles.');

    console.log('\n========================================================================');
    console.log('✓ ALL LEGACY KIT MIGRATION BATCH C TESTS PASSED CLEANLY!');
    console.log('========================================================================\n');
  } finally {
    Math.random = originalRandom;
  }
}

await runBatchCTests();
