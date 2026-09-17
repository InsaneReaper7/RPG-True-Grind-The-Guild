import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GameState } from '../src/systems/GameState.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';

// Setup node mock fetch to read actual project JSON files
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

console.log('=== RUNNING STOCKPILE OVERVIEW TESTS ===');

async function runTests() {
  await DataLoader.getInstance().loadAll();

// --- TEST 1: Bidirectional Wood & Ore Synchronization ---
{
  const gameState = GameState.getInstance();

  // Reset to known state
  const currentWood = gameState.getWood();
  gameState.consumeWood(currentWood);
  const currentOre = gameState.getOre();
  gameState.consumeOre(currentOre);

  assert.equal(gameState.getWood(), 0);
  assert.equal(gameState.getOre(), 0);
  assert.equal(gameState.getItemCount('wood'), 0);
  assert.equal(gameState.getItemCount('ore'), 0);

  // 1. Add wood and ore via traditional methods
  gameState.addWood(150);
  gameState.addOre(75);

  assert.equal(gameState.getWood(), 150);
  assert.equal(gameState.getOre(), 75);
  assert.equal(gameState.getItemCount('wood'), 150, 'getItemCount(wood) must match getWood()');
  assert.equal(gameState.getItemCount('ore'), 75, 'getItemCount(ore) must match getOre()');

  let stockpile = gameState.getAllStockpileCounts();
  assert.equal(stockpile['wood'], 150, 'getAllStockpileCounts must include wood');
  assert.equal(stockpile['ore'], 75, 'getAllStockpileCounts must include ore');

  // 2. Add wood and ore via general inventory addItem
  gameState.addItem('wood', 50);
  gameState.addItem('ore', 25);

  assert.equal(gameState.getWood(), 200, 'additem(wood) must increment wood in resources');
  assert.equal(gameState.getOre(), 100, 'additem(ore) must increment ore in resources');
  assert.equal(gameState.getItemCount('wood'), 200);
  assert.equal(gameState.getItemCount('ore'), 100);

  // 3. Consume wood and ore via general consumeItem
  const consumedWood = gameState.consumeItem('wood', 40);
  const consumedOre = gameState.consumeItem('ore', 20);

  assert.equal(consumedWood, true);
  assert.equal(consumedOre, true);
  assert.equal(gameState.getWood(), 160);
  assert.equal(gameState.getOre(), 80);
  assert.equal(gameState.getItemCount('wood'), 160);
  assert.equal(gameState.getItemCount('ore'), 80);

  // 4. Check getInventoryMap()
  const invMap = gameState.getInventoryMap();
  assert.equal(invMap.get('wood'), 160, 'getInventoryMap() must include wood');
  assert.equal(invMap.get('ore'), 80, 'getInventoryMap() must include ore');

  console.log('✔ Test 1 passed: Wood and Ore bidirectional synchronization is fully consistent.');
}

// --- TEST 2: Currencies (Research Points) & General Reagents in Stockpile ---
{
  const gameState = GameState.getInstance();

  const currentRp = gameState.getResearchPoints();
  gameState.consumeResearchPoints(currentRp);
  assert.equal(gameState.getResearchPoints(), 0);

  gameState.addResearchPoints(350);
  assert.equal(gameState.getResearchPoints(), 350);
  assert.equal(gameState.getItemCount('research_points'), 350);

  gameState.addItem('research_points', 50);
  assert.equal(gameState.getResearchPoints(), 400);

  gameState.consumeItem('research_points', 100);
  assert.equal(gameState.getResearchPoints(), 300);

  // General inventory items
  gameState.addItem('iron_bar', 24);
  gameState.addItem('slime_gel', 45);
  gameState.addItem('goblin_ear', 12);

  assert.equal(gameState.getItemCount('iron_bar'), 24);
  assert.equal(gameState.getItemCount('slime_gel'), 45);
  assert.equal(gameState.getItemCount('goblin_ear'), 12);

  gameState.consumeItem('iron_bar', 4);
  assert.equal(gameState.getItemCount('iron_bar'), 20);

  const allCounts = gameState.getAllStockpileCounts();
  assert.equal(allCounts['research_points'], 300);
  assert.equal(allCounts['iron_bar'], 20);
  assert.equal(allCounts['slime_gel'], 45);
  assert.equal(allCounts['goblin_ear'], 12);

  console.log('✔ Test 2 passed: Research points and crafting reagents properly tracked in stockpile counts.');
}

// --- TEST 3: Food Items in Stockpile ---
{
  const gameState = GameState.getInstance();

  gameState.addFoodItem('ration', 5);
  gameState.addFoodItem('herb_stew', 2);

  assert.ok(gameState.getItemCount('ration') >= 5);
  assert.ok(gameState.getItemCount('herb_stew') >= 2);

  const allCounts = gameState.getAllStockpileCounts();
  assert.ok(allCounts['ration'] >= 5, 'Ration must be in getAllStockpileCounts');
  assert.ok(allCounts['herb_stew'] >= 2, 'Herb stew must be in getAllStockpileCounts');

  // General addItem / consumeItem on food
  const beforeRations = gameState.getItemCount('ration');
  gameState.addItem('ration', 3);
  assert.equal(gameState.getItemCount('ration'), beforeRations + 3);

  const consumed = gameState.consumeItem('ration', 2);
  assert.equal(consumed, true);
  assert.equal(gameState.getItemCount('ration'), beforeRations + 1);

  console.log('✔ Test 3 passed: Food items correctly tracked and integrated into stockpile.');
}

// --- TEST 4: Verification of HTML Markup in index.html ---
{
  const htmlPath = path.resolve(process.cwd(), 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Verify HUD button
  assert.ok(html.includes('id="open-stockpile-btn"'), 'index.html must contain #open-stockpile-btn');
  assert.ok(html.includes('Stockpile Overview [I]'), 'HUD button must contain hotkey label [I]');

  // Verify Modal structure
  assert.ok(html.includes('id="stockpile-modal"'), 'index.html must contain #stockpile-modal');
  assert.ok(html.includes('id="close-stockpile-btn"'), 'index.html must contain #close-stockpile-btn');
  assert.ok(html.includes('id="stockpile-search-input"'), 'index.html must contain #stockpile-search-input');
  assert.ok(html.includes('id="stockpile-clear-search-btn"'), 'index.html must contain #stockpile-clear-search-btn');
  assert.ok(html.includes('id="stockpile-toggle-held-btn"'), 'index.html must contain #stockpile-toggle-held-btn');

  // Verify Category Tabs
  assert.ok(html.includes('data-stockpile-category="all"'), 'Category tabs must have "all"');
  assert.ok(html.includes('data-stockpile-category="gathering"'), 'Category tabs must have "gathering"');
  assert.ok(html.includes('data-stockpile-category="reagents"'), 'Category tabs must have "reagents"');
  assert.ok(html.includes('data-stockpile-category="consumables"'), 'Category tabs must have "consumables"');
  assert.ok(html.includes('data-stockpile-category="currencies"'), 'Category tabs must have "currencies"');
  assert.ok(html.includes('data-stockpile-category="equipment"'), 'Category tabs must have "equipment"');

  // Verify Metrics Bar
  assert.ok(html.includes('id="stockpile-metric-distinct"'), 'Metrics bar must include distinct count element');
  assert.ok(html.includes('id="stockpile-metric-total"'), 'Metrics bar must include total count element');
  assert.ok(html.includes('id="stockpile-metric-rp"'), 'Metrics bar must include RP element');
  assert.ok(html.includes('id="stockpile-metric-wood"'), 'Metrics bar must include wood element');
  assert.ok(html.includes('id="stockpile-metric-ore"'), 'Metrics bar must include ore element');

  // Verify Items Container
  assert.ok(html.includes('id="stockpile-items-container"'), 'index.html must contain #stockpile-items-container');

  // Verify CSS styles
  assert.ok(html.includes('#stockpile-modal'), 'CSS must include #stockpile-modal');
  assert.ok(html.includes('.stockpile-card'), 'CSS must include .stockpile-card');
  assert.ok(html.includes('.stockpile-card.card-held'), 'CSS must include card-held styling');
  assert.ok(html.includes('.stockpile-card.card-empty'), 'CSS must include card-empty styling');

  console.log('✔ Test 4 passed: index.html markup and CSS classes verified.');
}

// --- TEST 5: Verify HUD.ts Hotkey and Modal Code Integrity ---
{
  const hudPath = path.resolve(process.cwd(), 'src', 'ui', 'HUD.ts');
  const hudCode = fs.readFileSync(hudPath, 'utf8');

  // Verify [I] hotkey binding with input guard
  assert.ok(hudCode.includes("e.code === 'KeyI'"), 'HUD.ts must bind KeyI hotkey');
  assert.ok(hudCode.includes("targetTag !== 'input'"), 'HUD.ts must guard against active INPUT tags');
  assert.ok(hudCode.includes("targetTag !== 'textarea'"), 'HUD.ts must guard against active TEXTAREA tags');
  assert.ok(hudCode.includes("active.toggleStockpileModal()"), 'KeyI must trigger toggleStockpileModal()');

  // Verify Escape handling closes stockpile modal
  assert.ok(hudCode.includes("this.isStockpileModalOpen()"), 'Escape key handler must check isStockpileModalOpen()');
  assert.ok(hudCode.includes("this.closeStockpileModal()"), 'Escape key handler must call closeStockpileModal()');

  // Verify updateStockpile method is called in HUD.update
  assert.ok(hudCode.includes("this.updateStockpile(time)"), 'HUD.update must invoke updateStockpile(time)');

  // Verify renderStockpileModal and updateStockpileLiveStats methods exist
  assert.ok(hudCode.includes("public renderStockpileModal"), 'HUD must define renderStockpileModal');
  assert.ok(hudCode.includes("public updateStockpileLiveStats"), 'HUD must define updateStockpileLiveStats');
  assert.ok(hudCode.includes("public getStockpileCatalog"), 'HUD must define getStockpileCatalog');

  console.log('✔ Test 5 passed: HUD.ts hotkey binding, guards, and stockpile lifecycle verified.');
}

// --- TEST 6: Codebase-wide Hotkey Collision Audit for 'I' ---
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
  const collisions: { file: string; match: string }[] = [];

  for (const file of allTsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.relative(srcDir, file).replace(/\\/g, '/');

    // Check for Phaser.Input.Keyboard.KeyCodes.I
    if (content.includes('KeyCodes.I') || content.includes('KeyCodes["I"]') || content.includes("KeyCodes['I']")) {
      collisions.push({ file: rel, match: 'KeyCodes.I' });
    }

    // Check for window/DOM key listeners using 'i' or 'KeyI' outside HUD stockpile handler
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (
        (trimmed.includes("'KeyI'") || trimmed.includes('"KeyI"') || trimmed.includes("'i'") || trimmed.includes('"i"')) &&
        (trimmed.includes('e.key') || trimmed.includes('e.code') || trimmed.includes('event.key') || trimmed.includes('event.code'))
      ) {
        // Exclude the authorized stockpile modal toggle in HUD.ts
        if (rel === 'ui/HUD.ts' && trimmed.includes('active.toggleStockpileModal()')) {
          return;
        }
        if (rel === 'ui/HUD.ts' && trimmed.includes("e.code === 'KeyI'")) {
          return;
        }
        collisions.push({ file: `${rel}:${idx + 1}`, match: trimmed });
      }
    });
  }

  assert.equal(
    collisions.length,
    0,
    `Key I collision detected: ${JSON.stringify(collisions, null, 2)}`
  );

  console.log('✔ Test 6 passed: Codebase-wide collision audit confirmed [I] is 100% collision-free.');
}

console.log('=== ALL STOCKPILE OVERVIEW TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

