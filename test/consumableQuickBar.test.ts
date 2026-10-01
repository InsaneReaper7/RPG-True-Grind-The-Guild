import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Setup mock browser environment for headless execution
if (typeof (global as any).window === 'undefined') {
  const listeners: Record<string, Function[]> = {};
  const elements: Record<string, any> = {};

  (global as any).window = {
    addEventListener: (event: string, cb: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    },
    removeEventListener: (event: string, cb: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(fn => fn !== cb);
      }
    },
    dispatchEvent: (event: any) => {
      const cbs = listeners[event.type] || [];
      for (const cb of cbs) cb(event);
    },
    location: { href: 'http://localhost' },
    focus: () => {},
    navigator: { userAgent: 'node' }
  };

  (global as any).document = {
    getElementById: (id: string) => {
      if (!elements[id]) {
        elements[id] = {
          id,
          style: {},
          classList: {
            add: () => {},
            remove: () => {},
            toggle: () => {},
            contains: () => false
          },
          innerText: '',
          innerHTML: '',
          appendChild: () => {},
          removeChild: () => {},
          addEventListener: () => {},
          children: [],
          querySelectorAll: () => [],
          querySelector: () => null,
          focus: () => {},
          blur: () => {}
        };
      }
      return elements[id];
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag: string) => ({
      tagName: tag.toUpperCase(),
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      appendChild: () => {},
      removeChild: () => {},
      addEventListener: () => {}
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
    documentElement: { style: {} },
    body: { appendChild: () => {} }
  };
}

// Mock fetch for DataLoader JSON loading
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

import { DataLoader } from '../src/utils/DataLoader.ts';
import { GameState } from '../src/systems/GameState.ts';
import { ConsumableSystem } from '../src/systems/ConsumableSystem.ts';
import { HUD } from '../src/ui/HUD.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';

// Helper to create a controllable mock player
function createMockPlayer(id: string, name: string, overrides: Partial<any> = {}) {
  const inventory = new Map<string, number>();
  const activeStatusEffects = new Set<string>();

  const player: any = {
    id,
    entityName: name,
    hp: 100,
    maxHp: 100,
    criticalHp: 50,
    maxCriticalHp: 50,
    energy: 50,
    maxEnergy: 100,
    hunger: 50,
    maxHunger: 100,
    mood: 50,
    maxMood: 100,
    state: 'idle',
    inCombat: false,
    inventory,
    activeStatusEffects,
    equippedWeapon: { id: 'short_swords', name: 'Short Sword' },
    offhandWeapon: null,
    activeClass: null,
    isEncumbered: false,
    progression: new ProgressionSystem(undefined, name),
    x: 0,
    y: 0,
    gridPos: { x: 0, y: 0 },
    _atOutpost: false,

    isAtOutpost: () => player._atOutpost,
    setAtOutpost: (val: boolean) => { player._atOutpost = val; },

    getItemCount: (itemId: string) => player.inventory.get(itemId) || 0,
    addItem: (itemId: string, count: number = 1) => {
      const cur = player.inventory.get(itemId) || 0;
      player.inventory.set(itemId, cur + count);
    },
    removeItem: (itemId: string, count: number = 1) => {
      const cur = player.inventory.get(itemId) || 0;
      if (cur < count) return false;
      if (cur === count) player.inventory.delete(itemId);
      else player.inventory.set(itemId, cur - count);
      return true;
    },
    consumeCarriedConsumable: (itemId: string, count: number = 1) => {
      return player.removeItem(itemId, count);
    },
    drinkPotion: (potionId: string) => {
      if (potionId === 'energy_potion' || potionId === 'mana_potion') {
        player.energy = Math.min(player.maxEnergy, player.energy + 35);
        return true;
      }
      return false;
    },
    eatFood: (foodId: string) => {
      player.hunger = Math.min(player.maxHunger, player.hunger + 30);
      return true;
    },
    heal: (amount: number) => {
      let remaining = amount;
      if (player.criticalHp < player.maxCriticalHp) {
        const needed = player.maxCriticalHp - player.criticalHp;
        const add = Math.min(needed, remaining);
        player.criticalHp += add;
        remaining -= add;
      }
      if (remaining > 0 && player.hp < player.maxHp) {
        const needed = player.maxHp - player.hp;
        const add = Math.min(needed, remaining);
        player.hp += add;
        remaining -= add;
      }
      return amount - remaining;
    },
    getPartyMembers: () => player._party || [player],
    setParty: (partyList: any[]) => { player._party = partyList; },
    ...overrides
  };

  return player;
}

async function runConsumableQuickBarTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING CONSUMABLE QUICK BAR & SMART TARGETING TEST SUITE');
  console.log('================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const gameState = GameState.getInstance();
  const consumableSystem = ConsumableSystem.getInstance();

  // ---------------------------------------------------------------------------
  // TEST 1: Default Slots for New Game & Starting Empty for Existing Saves
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: New Game Default Slots vs Existing Save Persistence ---');
  {
    // New game defaults
    gameState.initializeNewGameSlots();
    const defaultSlots = gameState.getQuickSlots();
    assert.deepEqual(defaultSlots, ['revive_potion', 'bandage', 'energy_potion', 'antidote'], 'New game must default to Revive, Bandage, Energy, Antidote');

    // Custom assignment
    gameState.setQuickSlot(0, 'ration');
    gameState.setQuickSlot(3, null);
    assert.deepEqual(gameState.getQuickSlots(), ['ration', 'bandage', 'energy_potion', null]);

    // Save and reload snapshot with quickSlots
    const snapshot: any = {
      quickSlots: gameState.getQuickSlots(),
      party: [],
      foodItems: [],
      currentGameDay: 1,
      hp: 100,
      criticalHp: 50,
      energy: 100
    };
    assert.deepEqual(snapshot.quickSlots, ['ration', 'bandage', 'energy_potion', null]);

    // Test restoring an existing save snapshot that lacked quickSlots (undefined)
    const legacySnapshot: any = { ...snapshot, quickSlots: undefined };
    gameState.restoreFromLoadedSnapshot(legacySnapshot);
    assert.deepEqual(gameState.getQuickSlots(), [null, null, null, null], 'Existing saves without quickSlots start empty [null, null, null, null]');

    // Restore the modern snapshot
    gameState.restoreFromLoadedSnapshot(snapshot);
    assert.deepEqual(gameState.getQuickSlots(), ['ration', 'bandage', 'energy_potion', null], 'Save and reload retains custom quick slots');

    console.log('✔ Test 1 passed: New-game default slots and save/load persistence verified.');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Smart Targeting Table - Bandage (Selected if bleeding, otherwise any, no-consume if none)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Smart Targeting - Bandage ---');
  {
    const hero = createMockPlayer('hero', 'Guild Hero');
    const valerie = createMockPlayer('valerie', 'Valerie');
    const party = [hero, valerie];
    hero.setParty(party);
    valerie.setParty(party);

    // No one bleeding
    hero.addItem('bandage', 2);
    let check = consumableSystem.canUseConsumable('bandage', { party });
    assert.equal(check.canUse, false);
    assert.ok(check.reason?.includes('bleeding'), 'Should report no bleeding allies');

    let useRes = consumableSystem.useConsumable('bandage', { party });
    assert.equal(useRes.success, false);
    assert.equal(hero.getItemCount('bandage'), 2, 'Item must NOT be consumed when it cannot apply');

    // Valerie is bleeding, hero has the bandage
    valerie.activeStatusEffects.add('bleed');
    check = consumableSystem.canUseConsumable('bandage', { party });
    assert.equal(check.canUse, true);
    assert.equal(check.target?.id, 'valerie', 'Should auto-target the only bleeding ally');

    useRes = consumableSystem.useConsumable('bandage', { party });
    assert.equal(useRes.success, true);
    assert.ok(!valerie.activeStatusEffects.has('bleed'), 'Bleed status must be cured');
    assert.equal(hero.getItemCount('bandage'), 1, 'Bandage should be consumed from hero bag');

    // Both bleeding, preferred target selected
    hero.activeStatusEffects.add('bleed');
    valerie.activeStatusEffects.add('bleed');
    valerie.addItem('bandage', 1);

    useRes = consumableSystem.useConsumable('bandage', { party, preferredTarget: valerie });
    assert.equal(useRes.success, true);
    assert.ok(!valerie.activeStatusEffects.has('bleed'), 'Valerie cured when preferred');
    assert.ok(hero.activeStatusEffects.has('bleed'), 'Hero remains bleeding');
    assert.equal(valerie.getItemCount('bandage'), 0, 'Used from target bag first');

    console.log('✔ Test 2 passed: Bandage smart targeting, preferred selection, and non-consumption verified.');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Smart Targeting Table - Antidote (Selected if poisoned, otherwise any, no-consume if none)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Smart Targeting - Antidote ---');
  {
    const hero = createMockPlayer('hero', 'Guild Hero');
    const valerie = createMockPlayer('valerie', 'Valerie');
    const party = [hero, valerie];
    hero.setParty(party);
    valerie.setParty(party);

    hero.addItem('antidote', 1);

    // No one poisoned
    let check = consumableSystem.canUseConsumable('antidote', { party });
    assert.equal(check.canUse, false);
    let res = consumableSystem.useConsumable('antidote', { party });
    assert.equal(res.success, false);
    assert.equal(hero.getItemCount('antidote'), 1, 'No antidote consumed if nobody poisoned');

    // Hero poisoned
    hero.activeStatusEffects.add('poison');
    check = consumableSystem.canUseConsumable('antidote', { party });
    assert.equal(check.canUse, true);
    assert.equal(check.target?.id, 'hero');

    res = consumableSystem.useConsumable('antidote', { party });
    assert.equal(res.success, true);
    assert.ok(!hero.activeStatusEffects.has('poison'));
    assert.equal(hero.getItemCount('antidote'), 0);

    console.log('✔ Test 3 passed: Antidote smart targeting and non-consumption verified.');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Smart Targeting Table - Energy / Mana Potion
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Smart Targeting - Energy / Mana Potion ---');
  {
    const hero = createMockPlayer('hero', 'Guild Hero', { energy: 50, maxEnergy: 100 });
    const valerie = createMockPlayer('valerie', 'Valerie', { energy: 100, maxEnergy: 100 });
    const party = [hero, valerie];
    hero.setParty(party);
    valerie.setParty(party);

    hero.addItem('energy_potion', 2);

    // Selected valerie whose energy is full -> cannot apply
    let check = consumableSystem.canUseConsumable('energy_potion', { party, preferredTarget: valerie });
    assert.equal(check.canUse, false);
    assert.ok(check.reason?.includes('full'), 'Reason should mention full energy');

    let res = consumableSystem.useConsumable('energy_potion', { party, preferredTarget: valerie });
    assert.equal(res.success, false);
    assert.equal(hero.getItemCount('energy_potion'), 2, 'No consume when target energy is full');

    // Default targeting with no selection uses leader (hero) who has 50/100 energy
    check = consumableSystem.canUseConsumable('energy_potion', { party });
    assert.equal(check.canUse, true);
    assert.equal(check.target?.id, 'hero');

    res = consumableSystem.useConsumable('energy_potion', { party });
    assert.equal(res.success, true);
    assert.equal(hero.energy, 85, 'Hero drank energy potion +35');
    assert.equal(hero.getItemCount('energy_potion'), 1);

    console.log('✔ Test 4 passed: Energy potion targeting, full energy check, and consumption verified.');
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Smart Targeting Table - Revive Potion (Existing Flow Integration)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Smart Targeting - Revive Potion ---');
  {
    const hero = createMockPlayer('hero', 'Guild Hero', { state: 'idle', gridPos: { x: 5, y: 5 } });
    const comp1 = createMockPlayer('comp1', 'Companion 1', { state: 'downed', gridPos: { x: 6, y: 5 } }); // dist 1
    const comp2 = createMockPlayer('comp2', 'Companion 2', { state: 'downed', gridPos: { x: 10, y: 10 } }); // dist ~7
    const party = [hero, comp1, comp2];
    hero.setParty(party);

    hero.addItem('revive_potion', 2);

    // Closest to leader is comp1
    let check = consumableSystem.canUseConsumable('revive_potion', { party });
    assert.equal(check.canUse, true);
    assert.equal(check.target?.id, 'comp1', 'Closest downed ally to leader should be targeted');

    // Preferred target comp2
    check = consumableSystem.canUseConsumable('revive_potion', { party, preferredTarget: comp2 });
    assert.equal(check.canUse, true);
    assert.equal(check.target?.id, 'comp2', 'Preferred selected downed ally should be targeted');

    // Mock scene revive interaction flow
    let reviveInteractedAlly: any = null;
    const mockScene = {
      interactReviveAlly: (ally: any) => {
        reviveInteractedAlly = ally;
      }
    };

    const res = consumableSystem.useConsumable('revive_potion', { party, preferredTarget: comp2, scene: mockScene });
    assert.equal(res.success, true);
    assert.equal(reviveInteractedAlly?.id, 'comp2', 'Must initiate existing revive flow on target');

    // No one downed
    comp1.state = 'idle';
    comp2.state = 'idle';
    check = consumableSystem.canUseConsumable('revive_potion', { party });
    assert.equal(check.canUse, false);
    assert.ok(check.reason?.includes('downed'), 'Should say no downed allies');

    const noConsumeRes = consumableSystem.useConsumable('revive_potion', { party });
    assert.equal(noConsumeRes.success, false);
    assert.equal(hero.getItemCount('revive_potion'), 2, 'Revive potion never consumed if no downed ally');

    console.log('✔ Test 5 passed: Revive Potion targeting closest / selected downed ally & existing flow verified.');
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Smart Targeting Table - Health Potion (Future Item)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6: Smart Targeting - Health Potion ---');
  {
    const hero = createMockPlayer('hero', 'Guild Hero', { hp: 50, maxHp: 100 }); // 50% HP
    const valerie = createMockPlayer('valerie', 'Valerie', { hp: 30, maxHp: 100 }); // 30% HP
    const party = [hero, valerie];
    hero.setParty(party);
    valerie.setParty(party);

    hero.addItem('health_potion', 2);

    // Target with lowest HP% is Valerie
    let check = consumableSystem.canUseConsumable('health_potion', { party });
    assert.equal(check.canUse, true);
    assert.equal(check.target?.id, 'valerie', 'Lowest HP% member should be targeted');

    // If preferred target is hero, targets hero
    check = consumableSystem.canUseConsumable('health_potion', { party, preferredTarget: hero });
    assert.equal(check.canUse, true);
    assert.equal(check.target?.id, 'hero');

    const res = consumableSystem.useConsumable('health_potion', { party, preferredTarget: hero });
    assert.equal(res.success, true);
    assert.equal(hero.hp, 80, 'Healed 30 HP from 50 to 80');
    assert.equal(hero.getItemCount('health_potion'), 1);

    // 1. Immediately after use, hero is on cooldown
    let cdCheck = consumableSystem.canUseConsumable('health_potion', { party, preferredTarget: hero });
    assert.equal(cdCheck.canUse, false);
    assert.ok(cdCheck.reason?.includes('cooldown'), 'Should report hero on cooldown');

    // 2. Clear cooldown and test when all at full HP
    consumableSystem.setCooldown('health_potion', 0);
    hero.hp = 100;
    valerie.hp = 100;
    check = consumableSystem.canUseConsumable('health_potion', { party });
    assert.equal(check.canUse, false);
    assert.ok(check.reason?.includes('injured'), 'Should report no injured allies');

    console.log('✔ Test 6 passed: Health Potion lowest HP% targeting, cooldown tracking, and full HP prevention verified.');
  }

  // ---------------------------------------------------------------------------
  // TEST 6b: Smart Targeting Table - Escape Stone (Party-wide, combat block, outpost block)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 6b: Smart Targeting - Escape Stone ---');
  {
    const hero = createMockPlayer('hero', 'Guild Hero');
    const valerie = createMockPlayer('valerie', 'Valerie');
    const party = [hero, valerie];
    hero.setParty(party);
    valerie.setParty(party);

    // 1. None carried
    let check = consumableSystem.canUseConsumable('escape_stone', { party });
    assert.equal(check.canUse, false);
    assert.ok(check.reason?.includes('carried'), 'Reason should report none carried');

    let res = consumableSystem.useConsumable('escape_stone', { party });
    assert.equal(res.success, false);

    // 2. Already at Outpost
    hero.addItem('escape_stone', 1);
    hero.setAtOutpost(true);
    check = consumableSystem.canUseConsumable('escape_stone', { party });
    assert.equal(check.canUse, false);
    assert.ok(check.reason?.includes('Outpost'), 'Cannot escape while already at Outpost');

    res = consumableSystem.useConsumable('escape_stone', { party });
    assert.equal(res.success, false);
    assert.equal(hero.getItemCount('escape_stone'), 1, 'Escape stone not consumed when at Outpost');

    // 3. In combat in dungeon
    hero.setAtOutpost(false);
    valerie.inCombat = true;
    check = consumableSystem.canUseConsumable('escape_stone', { party });
    assert.equal(check.canUse, false);
    assert.ok(check.reason?.includes('combat'), 'Cannot escape while in combat');

    res = consumableSystem.useConsumable('escape_stone', { party });
    assert.equal(res.success, false);
    assert.equal(hero.getItemCount('escape_stone'), 1, 'Escape stone not consumed while in combat');

    // 4. Valid dungeon escape
    valerie.inCombat = false;
    check = consumableSystem.canUseConsumable('escape_stone', { party });
    assert.equal(check.canUse, true);

    res = consumableSystem.useConsumable('escape_stone', { party });
    assert.equal(res.success, true);
    assert.equal(hero.getItemCount('escape_stone'), 0, 'Escape stone consumed on successful teleport');

    console.log('✔ Test 6b passed: Escape Stone combat/outpost restrictions and party consumption verified.');
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Carried-Only Rule vs Outpost Food Exception
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 7: Carried-Only Rule and Outpost Food Exception ---');
  {
    const hero = createMockPlayer('hero', 'Guild Hero', { hunger: 50, maxHunger: 100 });
    const party = [hero];
    hero.setParty(party);

    const curB = gameState.getItemCount('bandage');
    if (curB > 0) gameState.consumeItem('bandage', curB);
    const curH = gameState.getItemCount('herb_stew');
    if (curH > 0) gameState.consumeItem('herb_stew', curH);

    gameState.addItem('bandage', 5); // Stockpile only
    gameState.addItem('herb_stew', 2); // Stockpile only

    // 1. Trying to use bandage from stockpile -> strictly disallowed
    let check = consumableSystem.canUseConsumable('bandage', { party, fromStockpile: true });
    assert.equal(check.canUse, false);
    assert.ok(check.reason?.includes('carried-only'));

    // 2. Trying to eat food from stockpile in Dungeon (not at Outpost) -> strictly disallowed
    hero.setAtOutpost(false);
    check = consumableSystem.canUseConsumable('herb_stew', { party, fromStockpile: true });
    assert.equal(check.canUse, false);
    assert.ok(check.reason?.includes('Outpost'));

    // 3. At Outpost, food from stockpile CAN be eaten
    hero.setAtOutpost(true);
    check = consumableSystem.canUseConsumable('herb_stew', { party, fromStockpile: true });
    assert.equal(check.canUse, true);

    const eatRes = consumableSystem.useConsumable('herb_stew', { party, fromStockpile: true });
    assert.equal(eatRes.success, true);
    assert.equal(gameState.getItemCount('herb_stew'), 1, 'Stockpile food decremented by 1');
    assert.equal(hero.hunger, 80, 'Hero hunger restored');

    // 4. Target bag first, then party member bag
    const valerie = createMockPlayer('valerie', 'Valerie');
    const hero2 = createMockPlayer('hero2', 'Hero 2');
    hero2.setParty([hero2, valerie]);
    valerie.setParty([hero2, valerie]);

    hero2.addItem('bandage', 1);
    valerie.addItem('bandage', 2);
    valerie.activeStatusEffects.add('bleed');

    // Valerie is target and has bandages -> Valerie bag used first
    const vRes = consumableSystem.useConsumable('bandage', { party: [hero2, valerie], preferredTarget: valerie });
    assert.equal(vRes.success, true);
    assert.equal(valerie.getItemCount('bandage'), 1, 'Target bag used first');
    assert.equal(hero2.getItemCount('bandage'), 1, 'Hero bag untouched');

    console.log('✔ Test 7 passed: Carried-only enforcement and Outpost food exception verified.');
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Hotkeys 1-4 for Quick Slots & F1-F4 for Party Selection
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 8: Hotkey Remapping (1-4 Quick Slots, F1-F4 Party Selection) ---');
  {
    const hud = new HUD();
    const hero = createMockPlayer('hero', 'Guild Hero');
    const valerie = createMockPlayer('valerie', 'Valerie');
    const party = [hero, valerie];
    hud.updatePartyPortraits(party);

    // Initial selection is all members [0, 1]
    assert.ok(hud.getSelectedMemberIndices().has(0));
    assert.ok(hud.getSelectedMemberIndices().has(1));

    // Simulate pressing F2 (Code: 'F2') with preventDefault tracker
    let f2Prevented = false;
    (global as any).window.dispatchEvent({
      type: 'keydown',
      key: 'F2',
      code: 'F2',
      preventDefault: () => { f2Prevented = true; },
      target: { tagName: 'body' }
    });

    assert.equal(f2Prevented, true, 'F2 event must call preventDefault() to prevent browser actions');
    const selectedAfterF2 = hud.getSelectedMemberIndices();
    assert.equal(selectedAfterF2.size, 1);
    assert.ok(selectedAfterF2.has(1), 'F2 must select member index 1 (Valerie)');

    // Simulate pressing F1
    let f1Prevented = false;
    (global as any).window.dispatchEvent({
      type: 'keydown',
      key: 'F1',
      code: 'F1',
      preventDefault: () => { f1Prevented = true; },
      target: { tagName: 'body' }
    });

    assert.equal(f1Prevented, true, 'F1 event must call preventDefault()');
    const selectedAfterF1 = hud.getSelectedMemberIndices();
    assert.equal(selectedAfterF1.size, 1);
    assert.ok(selectedAfterF1.has(0), 'F1 must select member index 0 (Hero)');

    // Assign slot 1 (index 0) to 'bandage' and slot 2 (index 1) to 'antidote'
    gameState.setQuickSlot(0, 'bandage');
    gameState.setQuickSlot(1, 'antidote');
    hero.addItem('bandage', 1);
    hero.activeStatusEffects.add('bleed');

    // Simulate pressing '1' (Code: 'Digit1') -> should use slot 1 (bandage)
    (global as any).window.dispatchEvent({
      type: 'keydown',
      key: '1',
      code: 'Digit1',
      preventDefault: () => {},
      target: { tagName: 'body' }
    });

    assert.ok(!hero.activeStatusEffects.has('bleed'), 'Pressing 1 must trigger slot 1 and cure bleed');
    assert.equal(hero.getItemCount('bandage'), 0, 'Bandage consumed via slot 1');

    console.log('✔ Test 8 passed: F1-F4 party selection with preventDefault and 1-4 quick slots verified.');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL CONSUMABLE QUICK BAR & SMART TARGETING TESTS PASSED!');
  console.log('================================================================\n');
}

runConsumableQuickBarTests().catch(err => {
  console.error('❌ Test Failure:', err);
  process.exit(1);
});
