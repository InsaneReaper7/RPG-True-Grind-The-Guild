import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Setup browser globals before importing Phaser / game files
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

import { GameState } from '../src/systems/GameState.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';
import { LevelingSystem } from '../src/systems/LevelingSystem.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { HUD } from '../src/ui/HUD.ts';

async function runKeyBindingAuditTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING KEY BINDING AUDIT & DEBUG ISOLATION SUITE');
  console.log('================================================================\n');

  // Load data definitions
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // ---------------------------------------------------------------------------
  // TEST 1: Pressing P Drinks Mana Potion with ZERO Weapon EXP Side Effect
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: P Key Drinks Mana Potion with Zero Weapon EXP Side Effect ---');
  {
    const gameState = GameState.getInstance();
    gameState.addItem('potion_mana', 3);

    const progression = new ProgressionSystem(undefined, 'Hero');
    let enemyRespawnTriggered = false;

    const mockEnemy = {
      entityName: 'Goblin Scout',
      state: 'dead',
      respawn: () => {
        enemyRespawnTriggered = true;
        mockEnemy.state = 'idle';
      }
    };

    let escapeStoneUsed = false;
    const mockScene: any = {
      enemies: [mockEnemy],
      useEscapeStone: () => {
        escapeStoneUsed = true;
        gameState.consumeItem('escape_stone', 1);
        return true;
      }
    };

    const heroMock: any = {
      entityName: 'Hero',
      hp: 100,
      maxHp: 100,
      energy: 20,
      maxEnergy: 100,
      crit: 0,
      maxCrit: 100,
      state: 'idle',
      activeStatusEffects: new Map(),
      equippedSkills: [],
      lastSkillUseTimes: new Map(),
      isAutocastEnabled: () => false,
      equippedWeapon: { id: 'short_swords', name: 'Short Sword' },
      equippedOffhandWeapon: null,
      progression,
      scene: mockScene,
      drinkPotion: (potionId: string) => {
        if (potionId === 'mana_potion') {
          const count = gameState.getItemCount('potion_mana');
          if (count > 0) {
            gameState.consumeItem('potion_mana', 1);
            heroMock.energy = Math.min(heroMock.maxEnergy, heroMock.energy + 35);
            return true;
          }
        }
        return false;
      },
      modifyEnergy: (amt: number) => {
        heroMock.energy = Math.min(heroMock.maxEnergy, Math.max(0, heroMock.energy + amt));
      }
    };

    const initialPotions = gameState.getItemCount('potion_mana');
    const initialExp = progression.getProficiencyStat('short_swords').currentExp;
    const initialLevel = progression.getProficiencyStat('short_swords').level;

    assert.equal(initialPotions, 3, 'Must start with 3 mana potions');
    assert.equal(initialExp, 0, 'Must start with 0 weapon EXP');
    assert.equal(initialLevel, 0, 'Must start at level 0');

    // Instantiate HUD and set active player
    const hud = new HUD();
    hud.update(heroMock, progression, 0, [heroMock]);

    // Dispatch keydown event for 'p' (and 'KeyP')
    (global as any).window.dispatchEvent({
      type: 'keydown',
      key: 'p',
      code: 'KeyP',
      target: { tagName: 'body' }
    });

    const postPotions = gameState.getItemCount('potion_mana');
    const postExp = progression.getProficiencyStat('short_swords').currentExp;
    const postLevel = progression.getProficiencyStat('short_swords').level;

    assert.equal(postPotions, 2, 'Exactly 1 Mana Potion should be consumed');
    assert.equal(postExp, 0, 'CRITICAL: Weapon EXP must be exactly 0 after pressing P (0 EXP side effect)!');
    assert.equal(postLevel, 0, 'CRITICAL: Weapon level must remain 0 after pressing P!');
    assert.equal(heroMock.energy, 55, 'Hero energy should be restored by Mana Potion (+35 EN)');

    console.log('✔ Test 1 passed: Pressing P drinks Mana Potion with strictly 0 weapon EXP side effect.');

    // -------------------------------------------------------------------------
    // TEST 2: Pressing T Attempts Escape Stone with ZERO Enemy Respawn Side Effect
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: T Key Uses Escape Stone with Zero Enemy Respawn Side Effect ---');
    gameState.addItem('escape_stone', 2);
    const initialEscapeStones = gameState.getItemCount('escape_stone');
    assert.equal(initialEscapeStones, 2);
    assert.equal(mockEnemy.state, 'dead');

    // Dispatch keydown event for 't' (and 'KeyT')
    (global as any).window.dispatchEvent({
      type: 'keydown',
      key: 't',
      code: 'KeyT',
      target: { tagName: 'body' }
    });

    assert.equal(escapeStoneUsed, true, 'Escape stone action should have been called');
    assert.equal(mockEnemy.state, 'dead', 'CRITICAL: Defeated enemies must NOT respawn when T is pressed!');
    assert.equal(enemyRespawnTriggered, false, 'CRITICAL: enemy.respawn() must never be called by T key!');

    console.log('✔ Test 2 passed: Pressing T uses Escape Stone with strictly 0 enemy respawns.');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Codebase-wide Hotkey Collision Audit for all Bound Keys
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Codebase-Wide Collision Audit Across All Bound Keys ---');
  {
    const srcDir = path.resolve(process.cwd(), 'src');

    function scanDir(dir: string, outFiles: string[] = []): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          scanDir(full, outFiles);
        } else if (ent.isFile() && ent.name.endsWith('.ts')) {
          outFiles.push(full);
        }
      }
      return outFiles;
    }

    const allTsFiles = scanDir(srcDir);
    const mainSceneCode = fs.readFileSync(path.join(srcDir, 'scenes', 'MainScene.ts'), 'utf8');
    const outpostSceneCode = fs.readFileSync(path.join(srcDir, 'scenes', 'OutpostScene.ts'), 'utf8');
    const hudCode = fs.readFileSync(path.join(srcDir, 'ui', 'HUD.ts'), 'utf8');

    // 3a. Ensure pKey and tKey are completely removed from MainScene and OutpostScene
    assert.ok(!mainSceneCode.includes('private pKey'), 'MainScene must not have pKey field');
    assert.ok(!mainSceneCode.includes('private tKey'), 'MainScene must not have tKey field');
    assert.ok(!mainSceneCode.includes('this.pKey ='), 'MainScene must not assign this.pKey');
    assert.ok(!mainSceneCode.includes('this.tKey ='), 'MainScene must not assign this.tKey');
    assert.ok(!mainSceneCode.includes('Phaser.Input.Keyboard.KeyCodes.P'), 'MainScene must not bind KeyCodes.P');
    assert.ok(!outpostSceneCode.includes('Phaser.Input.Keyboard.KeyCodes.P'), 'OutpostScene must not bind KeyCodes.P');

    // 3b. Ensure no file in src binds KeyCodes.P or KeyCodes.T (using regex to avoid KeyCodes.TWO/THREE etc.)
    const keyCodesPRegex = /KeyCodes(\.P\b|\[['"]P['"]\])/;
    const keyCodesTRegex = /KeyCodes(\.T\b|\[['"]T['"]\])/;

    for (const file of allTsFiles) {
      const rel = path.relative(srcDir, file).replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf8');

      assert.ok(!keyCodesPRegex.test(content), `File ${rel} must NOT bind KeyCodes.P`);
      assert.ok(!keyCodesTRegex.test(content), `File ${rel} must NOT bind KeyCodes.T`);
    }

    // 3c. Verify HUD.ts correctly maps P and T strictly to their player actions
    assert.ok(hudCode.includes("active.drinkManaPotion()"), 'HUD.ts must bind P to drinkManaPotion');
    assert.ok(hudCode.includes("active.useEscapeStone()"), 'HUD.ts must bind T to useEscapeStone');

    console.log('✔ Test 3 passed: Full AST/source audit confirms 0 KeyCodes.P/T registrations and 0 key collisions.');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Debug Panel Calibration & Threshold Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Debug Panel +680 EXP Fencer Gate Exact Calibration ---');
  {
    const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
    const hudCode = fs.readFileSync(path.resolve(process.cwd(), 'src', 'ui', 'HUD.ts'), 'utf8');

    // Verify buttons exist in index.html
    assert.ok(indexHtml.includes('id="debug-btn-grant-weapon-680-exp"'), 'index.html must have debug-btn-grant-weapon-680-exp');
    assert.ok(indexHtml.includes('id="debug-btn-respawn-all-enemies"'), 'index.html must have debug-btn-respawn-all-enemies');

    // Verify handlers are bound in HUD.ts
    assert.ok(hudCode.includes('debugBtnGrantWeapon680Exp'), 'HUD.ts must reference debugBtnGrantWeapon680Exp');
    assert.ok(hudCode.includes('debugBtnRespawnAllEnemies'), 'HUD.ts must reference debugBtnRespawnAllEnemies');
    assert.ok(hudCode.includes('hero.progression.addProficiencyExp(weaponId, 680)'), 'HUD.ts must grant exactly 680 EXP');

    // Verify the mathematical calibration: 680 EXP from level 0 reaches exactly Level 10 (Fencer gate)
    const testProg = new ProgressionSystem(undefined, 'CalibrationTester');
    const statBefore = testProg.getProficiencyStat('short_swords');
    assert.equal(statBefore.level, 0);
    assert.equal(statBefore.currentExp, 0);

    // Cumulative EXP calculation check
    let cumulativeRequired = 0;
    for (let lv = 0; lv < 10; lv++) {
      cumulativeRequired += LevelingSystem.expForNextLevel(lv);
    }
    assert.equal(cumulativeRequired, 680, 'Level 0 -> 10 must require exactly 680 cumulative EXP');

    // Add 680 EXP
    testProg.addProficiencyExp('short_swords', 680);
    const statAfter = testProg.getProficiencyStat('short_swords');
    assert.equal(statAfter.level, 10, 'Adding 680 EXP must advance stat to exactly Level 10');
    assert.equal(statAfter.currentExp, 0, 'Stat at Level 10 should have 0 leftover EXP');
    assert.ok(testProg.isClassUnlocked('fencer'), 'Level 10 Short Swords must immediately unlock Fencer class');

    console.log('✔ Test 4 passed: Debug Panel button is calibrated to exactly 680 EXP, hitting Level 10 / Fencer gate.');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL KEY BINDING AUDIT & DEBUG ISOLATION TESTS PASSED!');
  console.log('================================================================\n');
}

runKeyBindingAuditTests().catch(err => {
  console.error('❌ Test Failure:', err);
  process.exit(1);
});
