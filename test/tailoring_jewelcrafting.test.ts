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
const mockStorage: Record<string, string> = {};
const noop = () => {};
(global as any).localStorage = {
  getItem: (k: string) => mockStorage[k] ?? null,
  setItem: (k: string, v: string) => { mockStorage[k] = String(v); },
  removeItem: (k: string) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }
};
const mockWindow: any = {
  addEventListener: noop,
  removeEventListener: noop,
  location: { href: 'http://localhost' },
  focus: noop,
  navigator: { userAgent: 'node' },
  localStorage: (global as any).localStorage,
  confirm: (_msg: string) => true
};
(global as any).window = mockWindow;
(globalThis as any).window = mockWindow;
  const dummyCtx: any = new Proxy({
    fillStyle: '',
    globalCompositeOperation: '',
    getImageData: () => ({ data: [0, 0, 0, 0] }),
    createImageData: () => ({ data: [0, 0, 0, 0] }),
    fillRect: noop,
    clearRect: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    stroke: noop,
    fill: noop,
    arc: noop,
    closePath: noop,
    measureText: () => ({ width: 0 }),
    save: noop,
    restore: noop,
    scale: noop,
    rotate: noop,
    translate: noop,
    transform: noop,
    setTransform: noop,
    drawImage: noop
  }, {
    get: (target, prop) => (prop in target ? target[prop] : noop)
  });

  const domElements = new Map<string, any>();
  const createMockElement = (id: string, tag: string = 'div') => {
    const el: any = {
      id,
      tagName: tag.toUpperCase(),
      style: {},
      getContext: () => dummyCtx,
      classList: {
        _classes: new Set<string>(),
        add: (c: string) => el.classList._classes.add(c),
        remove: (c: string) => el.classList._classes.delete(c),
        contains: (c: string) => el.classList._classes.has(c),
        toggle: (c: string) => {
          if (el.classList._classes.has(c)) el.classList._classes.delete(c);
          else el.classList._classes.add(c);
        }
      },
      innerHTML: '',
      innerText: '',
      children: [] as any[],
      dataset: {} as Record<string, string>,
      appendChild: (child: any) => {
        el.children.push(child);
        return child;
      },
      removeChild: (child: any) => {
        const idx = el.children.indexOf(child);
        if (idx >= 0) el.children.splice(idx, 1);
        return child;
      },
      querySelector: (selector: string) => {
        const matchDataAttr = selector.match(/\[data-([a-zA-Z0-9_-]+)="([^"]+)"\]/);
        if (matchDataAttr) {
          const key = matchDataAttr[1];
          const val = matchDataAttr[2];
          const searchNode = (node: any): any => {
            if (node.dataset && node.dataset[key] === val) return node;
            if (node.children) {
              for (const c of node.children) {
                const found = searchNode(c);
                if (found) return found;
              }
            }
            return null;
          };
          return searchNode(el);
        }
        return null;
      },
      querySelectorAll: () => [],
      getBoundingClientRect: () => ({ top: 100, left: 100, width: 200, height: 40, bottom: 140, right: 300 }),
      onclick: null
    };
    domElements.set(id, el);
    return el;
  };

  (global as any).document = {
    createElement: (tag: string) => createMockElement('', tag),
    getElementById: (id: string) => {
      if (!domElements.has(id)) {
        return createMockElement(id);
      }
      return domElements.get(id);
    },
    querySelector: (selector: string) => null,
    querySelectorAll: () => [],
    addEventListener: noop,
    removeEventListener: noop,
    elementFromPoint: (x: number, y: number) => {
      const matching: any[] = [];
      const checkEl = (el: any) => {
        if (!el || !el.getBoundingClientRect) return;
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          matching.push(el);
        }
        if (el.children) {
          for (const child of el.children) {
            checkEl(child);
          }
        }
      };
      for (const el of domElements.values()) {
        checkEl(el);
      }
      const valid = matching.filter(el => el.id !== 'body');
      if (valid.length > 0) {
        const btn = valid.find(el => el.tagName === 'BUTTON');
        if (btn) {
          const br = btn.getBoundingClientRect();
          if (x >= br.left && x <= br.right && y >= br.top && y <= br.bottom) {
            return btn;
          }
        }
        const active = valid.filter(el => el.classList && el.classList.contains('active'));
        if (active.length > 0) return active[active.length - 1];
        return valid[valid.length - 1];
      }
      return matching[0] ?? null;
    },
    body: createMockElement('body'),
    documentElement: {}
  };

  (global as any).HTMLCanvasElement = class {};
  (global as any).Image = class {};
  (global as any).performance = { now: () => Date.now() };

(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createMockScene(): any {
  const createMockObj = () => {
    const obj: any = new Proxy({
      x: 0,
      y: 0,
      parentContainer: null,
      destroy: () => {},
      removeFromDisplayList: () => {},
      addedToScene: () => {},
      removedFromScene: () => {}
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

  return {
    cameras: { main: { scrollX: 0, scrollY: 0 } },
    events: { emit: () => {}, on: () => {}, off: () => {} },
    time: { now: 1000, delayedCall: () => {} },
    sound: { play: () => {} },
    physics: { add: { existing: () => {} } },
    sys: {
      queueDepthSort: () => {},
      events: { once: () => {}, on: () => {}, off: () => {}, emit: () => {} },
      input: { enable: () => {}, disable: () => {} },
      displayList: { add: () => {}, remove: () => {}, queueDepthSort: () => {} },
      updateList: { add: () => {}, remove: () => {} }
    },
    add: new Proxy({
      sprite: createMockObj,
      graphics: createMockObj,
      text: createMockObj,
      container: createMockObj,
      line: createMockObj,
      circle: createMockObj,
      existing: (item: any) => item
    }, {
      get(target: any, prop: string) {
        if (prop in target) return target[prop];
        return createMockObj;
      }
    }),
    tweens: {
      add: () => ({ remove: () => {} })
    }
  };
}

async function runMilestoneSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING TAILORING & JEWELCRAFTING MILESTONE TEST SUITE');
  console.log('================================================================\n');

  const { DataLoader } = await import('../src/utils/DataLoader.ts');
  const { GameState } = await import('../src/systems/GameState.ts');
  const { Player } = await import('../src/entities/Player.ts');
  const { ProgressionSystem } = await import('../src/systems/ProgressionSystem.ts');
  const { CraftingSystem } = await import('../src/systems/CraftingSystem.ts');
  const { ConsumableSystem } = await import('../src/systems/ConsumableSystem.ts');
  const { MerchantSystem } = await import('../src/systems/MerchantSystem.ts');
  const { CombatSystem } = await import('../src/systems/CombatSystem.ts');
  const { SkillSystem } = await import('../src/systems/SkillSystem.ts');

  await DataLoader.getInstance().loadAll();
  const dl = DataLoader.getInstance();
  const gs = GameState.getInstance();

  // =========================================================================
  // SECTION 1: RESEARCH, BUILDABLES, ROOMS & STAT GAINS INTEGRITY
  // =========================================================================
  console.log('--- Section 1: Research, Buildables & Rooms Integrity ---');
  const buildablesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/buildables.json'), 'utf8')).buildables;
  const researchData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/researchTree.json'), 'utf8')).nodes;
  const roomsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/rooms.json'), 'utf8')).rules;
  const statGainsData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/statGains.json'), 'utf8'));

  // 1. Buildables
  const loom = buildablesData.find((b: any) => b.id === 'tailors_loom');
  const jewelBench = buildablesData.find((b: any) => b.id === 'jewelcrafting_bench');
  assert.ok(loom, 'tailors_loom must exist in buildables.json');
  assert.equal(loom.woodCost, 25);
  assert.equal(loom.footprint.width, 1);
  assert.equal(loom.footprint.height, 1);
  assert.equal(loom.indoorRequired, true);
  assert.equal(loom.walkable, false);
  assert.equal(loom.roomTag, 'tailoring');
  assert.equal(loom.lockedByDefault, true);

  assert.ok(jewelBench, 'jewelcrafting_bench must exist in buildables.json');
  assert.equal(jewelBench.woodCost, 25);
  assert.equal(jewelBench.footprint.width, 1);
  assert.equal(jewelBench.footprint.height, 1);
  assert.equal(jewelBench.indoorRequired, true);
  assert.equal(jewelBench.walkable, false);
  assert.equal(jewelBench.roomTag, 'jewelcrafting');
  assert.equal(jewelBench.lockedByDefault, true);

  // Armorsmith bench description check (Owner Decision #3)
  const armBench = buildablesData.find((b: any) => b.id === 'armorsmithing_bench');
  assert.ok(armBench);
  assert.equal(armBench.description, 'Guild bench for crafting heavy and medium armor from hides and metal. Requires a fully enclosed indoor room.');

  // 2. Research nodes
  const resTailoring = researchData.find((r: any) => r.id === 'research_tailoring');
  assert.ok(resTailoring, 'research_tailoring must exist');
  assert.equal(resTailoring.cost, 8);
  assert.deepEqual(resTailoring.prerequisites, ['research_skinning']);
  assert.equal(resTailoring.targetBuildableId, 'tailors_loom');

  const resJewel = researchData.find((r: any) => r.id === 'research_jewelcrafting');
  assert.ok(resJewel, 'research_jewelcrafting must exist');
  assert.equal(resJewel.cost, 8);
  assert.deepEqual(resJewel.prerequisites, ['research_skinning']);
  assert.equal(resJewel.targetBuildableId, 'jewelcrafting_bench');

  // 3. Rooms
  const tailorRoom = roomsData.find((r: any) => r.id === 'tailor_workshop');
  assert.ok(tailorRoom, 'tailor_workshop room must exist');
  assert.deepEqual(tailorRoom.requiredTags, ['tailoring']);
  assert.equal(tailorRoom.priority, 10);

  const jewelerRoom = roomsData.find((r: any) => r.id === 'jeweler_workshop');
  assert.ok(jewelerRoom, 'jeweler_workshop room must exist');
  assert.deepEqual(jewelerRoom.requiredTags, ['jewelcrafting']);
  assert.equal(jewelerRoom.priority, 10);

  // 4. statGains.json check (Owner Decision #1: no custom attribute keys, only assignment to "profession")
  assert.equal(statGainsData.assignments.tailoring, 'profession', 'tailoring must be assigned to "profession"');
  assert.equal(statGainsData.assignments.jewelcrafting, 'profession', 'jewelcrafting must be assigned to "profession"');
  assert.equal((statGainsData as any).perProficiencyAttributeGains, undefined, 'Must not invent perProficiencyAttributeGains key');
  console.log('✔ Section 1 Passed: Research, buildables, rooms, and stat gains verified.\n');

  // =========================================================================
  // SECTION 2: CRAFTING LADDERS & CRAFTING CLASSES
  // =========================================================================
  console.log('--- Section 2: Crafting Ladders & Perks ---');
  const ranksData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/craftingRanks.json'), 'utf8')).professions;
  const classesData = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/classes.json'), 'utf8')).classes;

  assert.ok(ranksData.tailoring, 'tailoring ladder must exist in craftingRanks.json');
  assert.equal(ranksData.tailoring.apprentice, 'apprentice_tailor');
  assert.equal(ranksData.tailoring.journeyman, 'journeyman_tailor');
  assert.equal(ranksData.tailoring.master, 'master_tailor');
  assert.equal(ranksData.tailoring.grandmaster, 'grandmaster_tailor');

  assert.ok(ranksData.jewelcrafting, 'jewelcrafting ladder must exist in craftingRanks.json');
  assert.equal(ranksData.jewelcrafting.apprentice, 'apprentice_jeweler');
  assert.equal(ranksData.jewelcrafting.journeyman, 'journeyman_jeweler');
  assert.equal(ranksData.jewelcrafting.master, 'master_jeweler');
  assert.equal(ranksData.jewelcrafting.grandmaster, 'grandmaster_jeweler');

  // Verify classes.json entries
  const appTailor = classesData.find((c: any) => c.id === 'apprentice_tailor');
  assert.ok(appTailor);
  assert.equal(appTailor.category, 'crafting');
  assert.equal(appTailor.hiddenSkillBonuses?.energy_regen, 0.05);

  const appJeweler = classesData.find((c: any) => c.id === 'apprentice_jeweler');
  assert.ok(appJeweler);
  assert.equal(appJeweler.category, 'crafting');
  assert.equal(appJeweler.hiddenSkillBonuses?.haggling, 0.05);

  // Verify Crafter Perks calculation
  const mockScene = createMockScene();
  const playerData = dl.getPlayer();
  const weapon = dl.getWeapon('short_swords')!;
  const testPlayer = new Player(mockScene, 0, 0, playerData, weapon);
  testPlayer.progression.setClassLevel('apprentice_tailor', 10);
  testPlayer.progression.setClassLevel('journeyman_tailor', 5);
  testPlayer.progression.setClassLevel('apprentice_jeweler', 10);

  const tailorPerks = CraftingSystem.getCrafterPerks(testPlayer, 'tailoring');
  assert.equal((tailorPerks.thriftyChance ?? 0) > 0, true, 'Journeyman tailor has thriftyChance > 0');
  assert.equal((tailorPerks.gearStatBonusPercent ?? 0) > 0, true, 'Apprentice tailor (tier 1+) has gearStatBonusPercent > 0');

  const jewelPerks = CraftingSystem.getCrafterPerks(testPlayer, 'jewelcrafting');
  assert.equal((jewelPerks.gearStatBonusPercent ?? 0) > 0, true, 'Apprentice jeweler has gearStatBonusPercent > 0');
  assert.equal((jewelPerks.thriftyChance ?? 0) === 0, true, 'Apprentice jeweler does not have Thrifty perk yet');
  console.log('✔ Section 2 Passed: 4-tier ladders, classes, hidden bonuses, and perks verified.\n');

  // =========================================================================
  // SECTION 3: 22 MOVED RECIPES INTEGRITY & EXP DISPATCH
  // =========================================================================
  console.log('--- Section 3: 22 Moved Recipes Integrity & EXP Dispatch ---');
  const asRecipes = dl.getArmorsmithRecipes();
  const tlRecipes = dl.getTailoringRecipes();
  const jcRecipes = dl.getJewelcraftingRecipes();

  const movedToTailoring = [
    'leather_cap', 'silk_cowl', 'frost_hood', 'boneguard_cap', 'rimewalker_hood',
    'padded_tunic', 'silk_robe', 'frost_robe', 'spidersilk_vestment',
    'ingredient_bag'
  ];

  const movedToJewelcrafting = [
    'bone_necklace', 'void_pendant', 'frost_pendant', 'magmaheart_pendant',
    'wolf_claw_ring', 'void_ring', 'frost_ring', 'sovereign_signet', 'heart_of_winter',
    'venom_charm', 'void_relic', 'frost_relic'
  ];

  for (const id of movedToTailoring) {
    assert.equal(asRecipes.some(r => r.id === id), false, `${id} must NOT be in armorsmithRecipes.json`);
    const found = tlRecipes.find(r => r.id === id);
    assert.ok(found, `${id} must be in tailoringRecipes.json`);
  }

  for (const id of movedToJewelcrafting) {
    assert.equal(asRecipes.some(r => r.id === id), false, `${id} must NOT be in armorsmithRecipes.json`);
    const found = jcRecipes.find(r => r.id === id);
    assert.ok(found, `${id} must be in jewelcraftingRecipes.json`);
  }

  // Test EXP dispatch on crafting
  testPlayer.inventory.clear();
  testPlayer.addItem('spider_silk', 20);
  testPlayer.addItem('wolf_pelt', 10);
  testPlayer.addItem('bone', 10);
  testPlayer.addItem('bowstring', 10);

  const initTailorExp = testPlayer.progression.getProficiencyStat('tailoring').currentExp;
  const silkRobeRecipe = dl.getTailoringRecipe('silk_robe')!;
  const craftRobeRes = CraftingSystem.applyCraft(testPlayer, silkRobeRecipe, 'tailoring');
  assert.equal(craftRobeRes.success, true);
  const tailorStat = testPlayer.progression.getProficiencyStat('tailoring');
  assert.equal(tailorStat.level >= 1 || tailorStat.currentExp > initTailorExp, true, 'Crafting silk_robe gave tailoring EXP');

  const initJewelExp = testPlayer.progression.getProficiencyStat('jewelcrafting').currentExp;
  const boneNeckRecipe = dl.getJewelcraftingRecipe('bone_necklace')!;
  const craftNeckRes = CraftingSystem.applyCraft(testPlayer, boneNeckRecipe, 'jewelcrafting');
  assert.equal(craftNeckRes.success, true);
  const jewelStat = testPlayer.progression.getProficiencyStat('jewelcrafting');
  assert.equal(jewelStat.level >= 1 || jewelStat.currentExp > initJewelExp, true, 'Crafting bone_necklace gave jewelcrafting EXP');

  // Test Scroll learning and duplicate scroll EXP dispatch
  // 1. Learn boneguard_cap scroll (Tailoring)
  const bgScrollId = 'gear_recipe_boneguard_cap';
  testPlayer.addItem(bgScrollId, 1);
  const learnBg = ConsumableSystem.useConsumable(bgScrollId, { party: [testPlayer], user: testPlayer });
  assert.equal(learnBg.success, true);
  assert.equal(gs.isGearRecipeKnown('boneguard_cap'), true);

  // Duplicate scroll grants Tailoring EXP
  const preDupTailorLvl = testPlayer.progression.getProficiencyStat('tailoring').level;
  const preDupTailorExp = testPlayer.progression.getProficiencyStat('tailoring').currentExp;
  testPlayer.addItem(bgScrollId, 1);
  const dupBg = ConsumableSystem.useConsumable(bgScrollId, { party: [testPlayer], user: testPlayer });
  assert.equal(dupBg.success, true);
  const postDupTailor = testPlayer.progression.getProficiencyStat('tailoring');
  assert.equal(postDupTailor.level > preDupTailorLvl || postDupTailor.currentExp > preDupTailorExp, true, 'Duplicate boneguard_cap scroll granted Tailoring EXP');

  // 2. Learn magmaheart_pendant scroll (Jewelcrafting)
  const mhScrollId = 'gear_recipe_magmaheart_pendant';
  testPlayer.addItem(mhScrollId, 1);
  const learnMh = ConsumableSystem.useConsumable(mhScrollId, { party: [testPlayer], user: testPlayer });
  assert.equal(learnMh.success, true);
  assert.equal(gs.isGearRecipeKnown('magmaheart_pendant'), true);

  // Duplicate scroll grants Jewelcrafting EXP
  const preDupJewelLvl = testPlayer.progression.getProficiencyStat('jewelcrafting').level;
  const preDupJewelExp = testPlayer.progression.getProficiencyStat('jewelcrafting').currentExp;
  testPlayer.addItem(mhScrollId, 1);
  const dupMh = ConsumableSystem.useConsumable(mhScrollId, { party: [testPlayer], user: testPlayer });
  assert.equal(dupMh.success, true);
  const postDupJewel = testPlayer.progression.getProficiencyStat('jewelcrafting');
  assert.equal(postDupJewel.level > preDupJewelLvl || postDupJewel.currentExp > preDupJewelExp, true, 'Duplicate magmaheart_pendant scroll granted Jewelcrafting EXP');

  console.log('✔ Section 3 Passed: 22 moved recipes and EXP dispatch verified.\n');

  // =========================================================================
  // SECTION 4: 8 NEW MAGE PIECES & MERCHANT INTEGRATION
  // =========================================================================
  console.log('--- Section 4: 8 New Mage Pieces & Merchant Integration ---');
  const expectedNewPieces = [
    { id: 'apprentice_hood', station: 'tailoring', slot: 'helmet', tier: 'starter', level: 1, hp: 12, rating: 2, weight: 0.8, spell: 2, energy: 5, regen: 0 },
    { id: 'apprentice_robe', station: 'tailoring', slot: 'body', tier: 'starter', level: 1, hp: 20, rating: 4, weight: 2, spell: 3, energy: 8, regen: 0 },
    { id: 'voidweave_hood', station: 'tailoring', slot: 'helmet', tier: 'void', level: 8, hp: 55, rating: 5, weight: 1.1, spell: 5, energy: 8, regen: 0.05 },
    { id: 'voidweave_robe', station: 'tailoring', slot: 'body', tier: 'void', level: 8, hp: 95, rating: 8, weight: 3.2, spell: 8, energy: 15, regen: 0.1 },
    { id: 'apprentice_focus_ring', station: 'jewelcrafting', slot: 'ring', tier: undefined, level: 2, hp: 8, rating: undefined, weight: 0.2, spell: 2, energy: 5, regen: 0 },
    { id: 'void_focus_pendant', station: 'jewelcrafting', slot: 'necklace', tier: undefined, level: 8, hp: 25, rating: undefined, weight: 0.5, spell: 4, energy: 0, regen: 0.1 },
    { id: 'frost_focus_ring', station: 'jewelcrafting', slot: 'ring', tier: undefined, level: 12, hp: 25, rating: undefined, weight: 0.2, spell: 5, energy: 10, regen: 0 },
    { id: 'frost_spellcharm', station: 'jewelcrafting', slot: 'accessory', tier: undefined, level: 12, hp: 45, rating: undefined, weight: 0.5, spell: 6, energy: 0, regen: 0.15 }
  ];

  for (const p of expectedNewPieces) {
    const armor = dl.getArmor(p.id);
    assert.ok(armor, `Armor piece ${p.id} must exist in armors.json`);
    assert.equal(armor.slot, p.slot);
    assert.equal(armor.hpBonus, p.hp);
    if (p.rating !== undefined) assert.equal(armor.armorRating, p.rating);
    assert.equal(armor.weight, p.weight);
    assert.equal(armor.spellDamagePercent || 0, p.spell);
    assert.equal(armor.maxEnergyBonus || 0, p.energy);
    assert.equal(armor.energyRegenBonus || 0, p.regen);

    // Recipe check
    const recipe = p.station === 'tailoring' ? dl.getTailoringRecipe(p.id) : dl.getJewelcraftingRecipe(p.id);
    assert.ok(recipe, `Recipe for ${p.id} must exist in ${p.station}Recipes.json`);
    assert.equal(recipe.requiredLevel, p.level);
    assert.equal(recipe.requiresScroll, undefined, `${p.id} is standard craftable, requiresScroll must be undefined`);

    // Merchant sellable check
    testPlayer.inventory.clear();
    testPlayer.addItem(p.id, 1);
    const sellRes = MerchantSystem.getInstance().sellItem(p.id, 1, testPlayer, 'bag');
    assert.equal(sellRes.success, true, `${p.id} must be sellable to merchant`);
    assert.equal(sellRes.goldGained > 0, true, `${p.id} must sell for positive gold`);
  }
  console.log('✔ Section 4 Passed: 8 new mage pieces stats and merchant integration verified.\n');

  // =========================================================================
  // SECTION 5: MAGE STATS CALCULATION, UNEQUIP, & MULTIPLIER DERIVATION
  // =========================================================================
  console.log('--- Section 5: Mage Stats & Single-Read Spell Multiplier ---');
  const hero = new Player(mockScene, 0, 0, playerData, weapon);

  const baseMaxEnergy = hero.maxEnergy;
  const baseEnergyRegen = hero.energyRegenPerSecond;
  assert.equal(hero.spellDamagePercent, 0);
  assert.equal(hero.getEffectiveSpellDamageMultiplier(), 1.0);

  // Equip frost_robe (+10% spell, +20 max energy, +0.2 regen) and frost_hood (+6% spell, +10 max energy, +0.1 regen)
  hero.equipArmorSlot('body', dl.getArmor('frost_robe')!, true);
  hero.equipArmorSlot('helmet', dl.getArmor('frost_hood')!, true);

  assert.equal(hero.spellDamagePercent, 16, 'Summed spell damage percent must be 16%');
  assert.equal(hero.getEffectiveSpellDamageMultiplier(), 1.16, 'Effective multiplier must be 1.16');
  assert.equal(hero.maxEnergy, baseMaxEnergy + 30, 'Max energy must increase by +30');
  assert.equal(Math.abs(hero.energyRegenPerSecond - (baseEnergyRegen + 0.3)) < 1e-6, true, 'Energy regen must increase by +0.3/s');

  // Unequip
  hero.equipArmorSlot('body', null, true);
  hero.equipArmorSlot('helmet', null, true);
  assert.equal(hero.spellDamagePercent, 0, 'Spell damage percent reset to 0 after unequip');
  assert.equal(hero.getEffectiveSpellDamageMultiplier(), 1.0, 'Effective multiplier reset to 1.0 after unequip');
  assert.equal(hero.maxEnergy, baseMaxEnergy, 'Max energy restored');
  assert.equal(Math.abs(hero.energyRegenPerSecond - baseEnergyRegen) < 1e-6, true, 'Energy regen restored');

  // Snapshot persistence check
  hero.equipArmorSlot('body', dl.getArmor('frost_robe')!, true);
  hero.equipArmorSlot('helmet', dl.getArmor('frost_hood')!, true);
  const snap = hero.getSnapshot(0);
  const restoredHero = new Player(mockScene, 0, 0, playerData, weapon);
  restoredHero.restoreFromSnapshot(snap, 0);
  assert.equal(restoredHero.spellDamagePercent, 16, 'Spell damage percent persists through save/load');
  assert.equal(restoredHero.getEffectiveSpellDamageMultiplier(), 1.16, 'Effective spell multiplier persists through save/load');
  assert.equal(restoredHero.maxEnergy, baseMaxEnergy + 30, 'Max energy bonus persists through save/load');

  // Single place / single read spell damage multiplier test:
  // Primary and secondary (splash/chain) hits test with frost_robe + frost_hood
  console.log('Testing primary and secondary spell hits with frost_robe + frost_hood (1.16x)...');
  const combatSystem = new CombatSystem(mockScene);
  const skillSystem = new SkillSystem(combatSystem);

  const createMockEnemy = (id: string, x: number, y: number) => {
    let currentHp = 1000;
    return {
      id,
      entityName: id,
      x,
      y,
      hp: currentHp,
      maxHp: 1000,
      criticalHp: 1000,
      maxCriticalHp: 1000,
      state: 'idle',
      isAggroed: false,
      gridPos: { x: Math.floor(x / 32), y: Math.floor(y / 32) },
      tileSize: 32,
      activeStatusEffects: new Map(),
      applyStatusEffect: (effectDef: any) => {},
      hasStatusEffect: (id: string) => false,
      takeDamage: (amount: number, _dealer?: any) => {
        currentHp -= amount;
        return currentHp <= 0;
      },
      getDamageTaken: () => 1000 - currentHp
    };
  };

  // Create caster with frost gear (1.16x) and unequipped caster (1.0x)
  const spellWeapon = dl.getWeapon('arcane_magic')!;
  const casterEquipped = new Player(mockScene, 0, 0, playerData, spellWeapon);
  casterEquipped.equipArmorSlot('body', dl.getArmor('frost_robe')!, true);
  casterEquipped.equipArmorSlot('helmet', dl.getArmor('frost_hood')!, true);

  const casterUnequipped = new Player(mockScene, 0, 0, playerData, spellWeapon);

  // 1. Spell skill with chain hits (chain_lightning)
  const chainDef = dl.getSkill('chain_lightning');
  assert.ok(chainDef, 'chain_lightning skill must exist');
  assert.equal(chainDef.effects?.[0]?.scaling, 'spell', 'chain_lightning effect must scale as spell');

  // Unequipped run
  const enemy1 = createMockEnemy('enemy1', 32, 0);
  const enemy2 = createMockEnemy('enemy2', 64, 0);
  combatSystem.enemies = [enemy1, enemy2];
  casterUnequipped.energy = 100;
  skillSystem.execute(casterUnequipped, chainDef, enemy1, 0);
  const primaryUnequipped = enemy1.getDamageTaken();
  const secondaryUnequipped = enemy2.getDamageTaken();

  // Equipped run
  const enemy3 = createMockEnemy('enemy3', 32, 0);
  const enemy4 = createMockEnemy('enemy4', 64, 0);
  combatSystem.enemies = [enemy3, enemy4];
  casterEquipped.energy = 100;
  skillSystem.execute(casterEquipped, chainDef, enemy3, 0);
  const primaryEquipped = enemy3.getDamageTaken();
  const secondaryEquipped = enemy4.getDamageTaken();

  assert.ok(primaryUnequipped > 0, 'Primary hit unequipped must deal damage');
  assert.ok(secondaryUnequipped > 0, 'Secondary chain hit unequipped must deal damage');

  const ratioPrimary = primaryEquipped / primaryUnequipped;
  const ratioSecondary = secondaryEquipped / secondaryUnequipped;
  assert.equal(Math.abs(ratioPrimary - 1.16) < 1e-4, true, `Primary spell hit ratio must be exactly 1.16 (got ${ratioPrimary.toFixed(4)})`);
  assert.equal(Math.abs(ratioSecondary - 1.16) < 1e-4, true, `Secondary chain hit ratio must be exactly 1.16 (got ${ratioSecondary.toFixed(4)})`);

  // 2. Basic magic attack with arcane_magic weapon
  const magicWeapon = dl.getWeapon('arcane_magic')!;
  const enemyBasic1 = createMockEnemy('b1', 32, 0);
  combatSystem.executePlayerBasicAttack(casterUnequipped, enemyBasic1, 1000, magicWeapon, 0, 10, 1.0);
  const basicUnequipped = enemyBasic1.getDamageTaken();

  const enemyBasic2 = createMockEnemy('b2', 32, 0);
  combatSystem.executePlayerBasicAttack(casterEquipped, enemyBasic2, 1000, magicWeapon, 0, 10, 1.0);
  const basicEquipped = enemyBasic2.getDamageTaken();

  const ratioBasic = basicEquipped / basicUnequipped;
  assert.equal(Math.abs(ratioBasic - 1.16) < 1e-4, true, `Basic magic attack ratio must be exactly 1.16 (got ${ratioBasic.toFixed(4)})`);

  // 3. Physical weapon attack (does NOT get spell damage bonus)
  const swordWeapon = dl.getWeapon('short_swords')!;
  const enemyPhys1 = createMockEnemy('p1', 32, 0);
  combatSystem.executePlayerBasicAttack(casterUnequipped, enemyPhys1, 1000, swordWeapon, 0, 10, 1.0);
  const physUnequipped = enemyPhys1.getDamageTaken();

  const enemyPhys2 = createMockEnemy('p2', 32, 0);
  combatSystem.executePlayerBasicAttack(casterEquipped, enemyPhys2, 1000, swordWeapon, 0, 10, 1.0);
  const physEquipped = enemyPhys2.getDamageTaken();

  assert.equal(physEquipped, physUnequipped, 'Physical weapon attack must NOT get spell damage bonus');

  // 4. Heal skill (flat/unaffected)
  const healDef = dl.getSkill('minor_heal');
  if (healDef && healDef.healAmount) {
    assert.equal(healDef.healAmount, 40, 'Heal amount is unmultiplied flat / attribute-based');
  }

  console.log('✔ Section 5 Passed: Mage stats, single-read multiplier, and secondary hit scaling verified.\n');



  console.log('================================================================');
  console.log('🎉 ALL TAILORING & JEWELCRAFTING MILESTONE TESTS PASSED PERFECTLY!');
  console.log('================================================================');
}

runMilestoneSuite().catch((err) => {
  console.error('❌ Milestone Test Failed:', err);
  process.exit(1);
});
