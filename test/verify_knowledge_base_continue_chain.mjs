import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('================================================================');
  console.log('REAL LIVE BROWSER VERIFICATION: KNOWLEDGE BASE CONTINUE-CHAIN PERSISTENCE');
  console.log('================================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[MainScene]') ||
        text.includes('[OutpostScene]') ||
        text.includes('[Combat]') ||
        text.includes('[KnowledgeBase]') ||
        text.includes('[Bestiary]') ||
        text.includes('[Gathering') ||
        text.includes('Continuing descent') ||
        text.includes('[DISCOVERY]')
      ) {
        console.log('  [BROWSER]', text);
      }
    });

    console.log('Connecting to live game at http://localhost:3000...');
    await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
    await sleep(2000);

    // -------------------------------------------------------------
    // SETUP: Transition Outpost -> MainScene (Floor 1)
    // -------------------------------------------------------------
    console.log('\n--- Transitioning Outpost -> MainScene (Floor 1) ---');
    await page.evaluate(() => {
      const outpost = window.game.scene.getScene('OutpostScene');
      if (outpost) {
        outpost.executeTransitionToDungeon();
      }
    });

    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      return main && main.scene.isActive() && main.player;
    }, { timeout: 10000 });
    await sleep(1000);

    const floor1Num = await page.evaluate(() => {
      return window.GameState.getInstance().getDungeonFloorCount();
    });
    console.log(`✓ Active in MainScene on Floor: ${floor1Num}`);
    assert.strictEqual(floor1Num, 1, 'Initial dungeon floor must be 1');

    // -------------------------------------------------------------
    // STEP 1: Encounter Enemy, Harvest Node, Trigger Status & Class
    // -------------------------------------------------------------
    console.log('\n--- Step 1: Generating Live In-Game Discoveries on Floor 1 ---');

    // 1a. Encounter enemy in combat
    const enemyInfo = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const enemy = scene.enemies[0];
      if (!enemy) throw new Error('No enemies spawned in MainScene on Floor 1');

      const enemyDefId = enemy.enemyData.id;
      const enemyName = enemy.enemyData.name || enemy.entityName;

      // Engage in combat to trigger CombatSystem.recordBestiaryEncounter
      scene.engageEnemy(enemy);
      // Also ensure Bestiary encounter trigger fires directly in live combat loop
      scene.combatSystem.recordBestiaryEncounter(enemy);

      return {
        id: enemyDefId,
        name: enemyName,
        isEncountered: window.GameState.getInstance().isEnemyEncountered(enemyDefId)
      };
    });
    console.log(`  1a. Combat Encounter: ${enemyInfo.name} (${enemyInfo.id})`);
    console.log(`      isEnemyEncountered: ${enemyInfo.isEncountered}`);
    assert.strictEqual(enemyInfo.isEncountered, true, 'Enemy must be recorded as encountered in GameState');

    // 1b. Harvest at least one gathering node
    const harvestInfo = await page.evaluate(async () => {
      const scene = window.game.scene.getScene('MainScene');

      // Defeat aggressive enemies so combat hits do not interrupt the gathering channel
      for (const e of scene.enemies) {
        e.hp = 0;
        e.state = 'dead';
        e.setVisible(false);
      }

      const node = scene.gatheringNodes[0];
      if (!node) throw new Error('No gathering nodes found on Floor 1');

      const nodeId = node.nodeDef.id;
      const nodeName = node.nodeDef.name;

      // Select player and start gathering channel directly
      scene.selectMemberByIndex(0, false);
      scene.startGatherChannel(scene.player, node);

      return { id: nodeId, name: nodeName };
    });
    console.log(`  1b. Harvesting node: ${harvestInfo.name} (${harvestInfo.id})...`);

    // Wait for gathering channel to complete (2500ms channel duration)
    let harvested = false;
    const startHarvestWait = Date.now();
    while (Date.now() - startHarvestWait < 7000) {
      harvested = await page.evaluate((nodeId) => {
        const gs = window.GameState.getInstance();
        return gs.isGatheringNodeDiscovered(nodeId);
      }, harvestInfo.id);
      if (harvested) break;
      await sleep(300);
    }
    console.log(`      Node Harvested & Discovered: ${harvested}`);
    assert.strictEqual(harvested, true, 'Gathering node must be discovered after channel completion');

    // 1c. Trigger status effect discovery and class unlock
    const extraDiscoveries = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const hero = scene.player;

      // Apply Bleed status effect to hero
      const bleedDef = window.DataLoader.getInstance().getStatusEffect('bleed');
      if (bleedDef) {
        hero.applyStatusEffect(bleedDef);
      }

      // Unlock Vanguard class by fulfilling prerequisites
      hero.progression.getProficiencyStat('short_swords').level = 30;
      hero.progression.getProficiencyStat('shields').level = 30;
      hero.progression.setClassLevel('fencer', 5);
      hero.progression.setClassLevel('guardian', 5);
      hero.progression.checkClassUnlocks();
      hero.setActiveClass('vanguard');

      const gs = window.GameState.getInstance();
      return {
        bleedDiscovered: gs.isStatusEffectDiscovered('bleed'),
        vanguardUnlocked: hero.progression.isClassUnlocked('vanguard'),
        shortSwordsDiscovered: gs.isProficiencyDiscovered('short_swords')
      };
    });
    console.log(`  1c. Status Effect (Bleed) Discovered: ${extraDiscoveries.bleedDiscovered}`);
    console.log(`      Class (Vanguard) Unlocked: ${extraDiscoveries.vanguardUnlocked}`);
    console.log(`      Weapon (Short Swords) Discovered: ${extraDiscoveries.shortSwordsDiscovered}`);
    assert.strictEqual(extraDiscoveries.bleedDiscovered, true, 'Bleed status effect must be discovered');
    assert.strictEqual(extraDiscoveries.vanguardUnlocked, true, 'Vanguard class must be unlocked');

    // -------------------------------------------------------------
    // STEP 2: Open Knowledge Base & Confirm All Entries Genuinely Present
    // -------------------------------------------------------------
    console.log('\n--- Step 2: Opening Knowledge Base on Floor 1 & Verifying Rendered Content ---');

    // Press 'K' key to toggle Knowledge Base
    await page.keyboard.press('k');
    await sleep(500);

    const modalStateF1 = await page.evaluate(() => {
      const modal = document.getElementById('knowledge-base-modal');
      const isOpen = modal?.classList.contains('active') ?? false;

      const getTabCards = (tabName) => {
        const hud = window.game.scene.getScene('MainScene').hud;
        hud.setKnowledgeBaseTab(tabName);
        const container = document.getElementById('knowledge-entries-container');
        const cards = Array.from(container.querySelectorAll('.knowledge-card'));
        return cards.map(c => ({
          title: c.querySelector('.knowledge-card-title')?.textContent?.trim(),
          badge: c.querySelector('.knowledge-card-badge')?.textContent?.trim()
        }));
      };

      const counts = {
        weapons: document.getElementById('knowledge-count-weapons')?.innerText,
        classes: document.getElementById('knowledge-count-classes')?.innerText,
        gathering: document.getElementById('knowledge-count-gathering')?.innerText,
        statusEffects: document.getElementById('knowledge-count-status_effects')?.innerText,
        bestiary: document.getElementById('knowledge-count-bestiary')?.innerText,
      };

      return {
        isOpen,
        counts,
        bestiaryCards: getTabCards('bestiary'),
        gatheringCards: getTabCards('gathering'),
        statusEffectCards: getTabCards('status_effects'),
        classCards: getTabCards('classes'),
        weaponCards: getTabCards('weapons')
      };
    });

    console.log(`  Knowledge Base Modal Open: ${modalStateF1.isOpen}`);
    console.log(`  Category Tab Counts on Floor 1:`, modalStateF1.counts);
    console.log(`  Bestiary Entries:`, modalStateF1.bestiaryCards.map(c => c.title));
    console.log(`  Gathering Entries:`, modalStateF1.gatheringCards.map(c => c.title));
    console.log(`  Status Effect Entries:`, modalStateF1.statusEffectCards.map(c => c.title));
    console.log(`  Class Entries:`, modalStateF1.classCards.map(c => c.title));

    assert.strictEqual(modalStateF1.isOpen, true, 'Knowledge Base modal must be active when pressing K');
    assert.ok(modalStateF1.bestiaryCards.some(c => c.title.toLowerCase().includes(enemyInfo.name.toLowerCase())),
      `Bestiary must contain ${enemyInfo.name}`);
    assert.ok(modalStateF1.gatheringCards.some(c => c.title.toLowerCase().includes(harvestInfo.name.toLowerCase())),
      `Gathering must contain ${harvestInfo.name}`);
    assert.ok(modalStateF1.statusEffectCards.some(c => c.title.toLowerCase().includes('bleed')),
      'Status Effects must contain Bleed');
    assert.ok(modalStateF1.classCards.some(c => c.title.toLowerCase().includes('vanguard')),
      'Classes must contain Vanguard');

    // Close Knowledge Base modal via Escape key
    await page.keyboard.press('Escape');
    await sleep(300);

    // -------------------------------------------------------------
    // STEP 3: Live Continue Floor Transition (Real scene.restart())
    // -------------------------------------------------------------
    console.log('\n--- Step 3: Executing Genuine Continue Descent (Floor 1 -> Floor 2) ---');

    // Open Teleporter Crystal Modal
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      scene.openCrystalModal();
    });
    await sleep(300);

    const crystalModalOpen = await page.evaluate(() => {
      const modal = document.getElementById('teleporter-crystal-modal');
      return modal && modal.style.display === 'flex';
    });
    console.log(`  Teleporter Crystal Modal Display: ${crystalModalOpen ? 'flex' : 'hidden'}`);
    assert.strictEqual(crystalModalOpen, true, 'Crystal modal must be open');

    // Click Continue Descent button (#crystal-btn-continue)
    console.log('  Clicking #crystal-btn-continue to trigger executeContinueDescent -> this.scene.restart()...');
    await page.click('#crystal-btn-continue');

    // Wait for genuine scene restart and arrival on Floor 2
    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      const gs = window.GameState.getInstance();
      return main && main.scene.isActive() && main.player && gs.getDungeonFloorCount() === 2;
    }, { timeout: 10000 });
    await sleep(1000);

    const floor2Num = await page.evaluate(() => {
      return window.GameState.getInstance().getDungeonFloorCount();
    });
    console.log(`✓ Real scene.restart() completed! Current Dungeon Floor: ${floor2Num}`);
    assert.strictEqual(floor2Num, 2, 'Floor count must be 2 after Continue');

    // -------------------------------------------------------------
    // STEP 4: Re-open Knowledge Base on Floor 2 & Confirm All Entries Intact
    // -------------------------------------------------------------
    console.log('\n--- Step 4: Re-opening Knowledge Base on Floor 2 (Confirm Zero Data Loss) ---');

    // Press 'K' to open Knowledge Base on Floor 2
    await page.keyboard.press('k');
    await sleep(500);

    const modalStateF2 = await page.evaluate(() => {
      const modal = document.getElementById('knowledge-base-modal');
      const isOpen = modal?.classList.contains('active') ?? false;

      const getTabCards = (tabName) => {
        const hud = window.game.scene.getScene('MainScene').hud;
        hud.setKnowledgeBaseTab(tabName);
        const container = document.getElementById('knowledge-entries-container');
        const cards = Array.from(container.querySelectorAll('.knowledge-card'));
        return cards.map(c => ({
          title: c.querySelector('.knowledge-card-title')?.textContent?.trim(),
          badge: c.querySelector('.knowledge-card-badge')?.textContent?.trim()
        }));
      };

      const counts = {
        weapons: document.getElementById('knowledge-count-weapons')?.innerText,
        classes: document.getElementById('knowledge-count-classes')?.innerText,
        gathering: document.getElementById('knowledge-count-gathering')?.innerText,
        statusEffects: document.getElementById('knowledge-count-status_effects')?.innerText,
        bestiary: document.getElementById('knowledge-count-bestiary')?.innerText,
      };

      return {
        isOpen,
        counts,
        bestiaryCards: getTabCards('bestiary'),
        gatheringCards: getTabCards('gathering'),
        statusEffectCards: getTabCards('status_effects'),
        classCards: getTabCards('classes'),
        weaponCards: getTabCards('weapons')
      };
    });

    console.log(`  Knowledge Base Modal Open on Floor 2: ${modalStateF2.isOpen}`);
    console.log(`  Category Tab Counts on Floor 2:`, modalStateF2.counts);
    console.log(`  Bestiary Entries on Floor 2:`, modalStateF2.bestiaryCards.map(c => c.title));
    console.log(`  Gathering Entries on Floor 2:`, modalStateF2.gatheringCards.map(c => c.title));
    console.log(`  Status Effect Entries on Floor 2:`, modalStateF2.statusEffectCards.map(c => c.title));
    console.log(`  Class Entries on Floor 2:`, modalStateF2.classCards.map(c => c.title));

    assert.strictEqual(modalStateF2.isOpen, true, 'Knowledge Base modal must open on Floor 2');
    assert.ok(modalStateF2.bestiaryCards.some(c => c.title.toLowerCase().includes(enemyInfo.name.toLowerCase())),
      `Bestiary MUST still contain ${enemyInfo.name} on Floor 2`);
    assert.ok(modalStateF2.gatheringCards.some(c => c.title.toLowerCase().includes(harvestInfo.name.toLowerCase())),
      `Gathering MUST still contain ${harvestInfo.name} on Floor 2`);
    assert.ok(modalStateF2.statusEffectCards.some(c => c.title.toLowerCase().includes('bleed')),
      'Status Effects MUST still contain Bleed on Floor 2');
    assert.ok(modalStateF2.classCards.some(c => c.title.toLowerCase().includes('vanguard')),
      'Classes MUST still contain Vanguard on Floor 2');

    // Close Knowledge Base modal via Escape key
    await page.keyboard.press('Escape');
    await sleep(300);

    // -------------------------------------------------------------
    // BONUS: Second Multi-Floor Continue Transition (Floor 2 -> Floor 3)
    // -------------------------------------------------------------
    console.log('\n--- Step 5: Multi-Floor Chain Extension (Floor 2 -> Floor 3 Continue) ---');

    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      scene.openCrystalModal();
    });
    await sleep(300);

    console.log('  Clicking #crystal-btn-continue for Floor 2 -> Floor 3 descent...');
    await page.click('#crystal-btn-continue');

    await page.waitForFunction(() => {
      const main = window.game.scene.getScene('MainScene');
      const gs = window.GameState.getInstance();
      return main && main.scene.isActive() && main.player && gs.getDungeonFloorCount() === 3;
    }, { timeout: 10000 });
    await sleep(1000);

    const floor3Num = await page.evaluate(() => {
      return window.GameState.getInstance().getDungeonFloorCount();
    });
    console.log(`✓ Real scene.restart() completed! Current Dungeon Floor: ${floor3Num}`);
    assert.strictEqual(floor3Num, 3, 'Floor count must be 3 after second Continue');

    // Press 'K' to open Knowledge Base on Floor 3
    await page.keyboard.press('k');
    await sleep(500);

    const modalStateF3 = await page.evaluate(() => {
      const modal = document.getElementById('knowledge-base-modal');
      const isOpen = modal?.classList.contains('active') ?? false;

      const getTabCards = (tabName) => {
        const hud = window.game.scene.getScene('MainScene').hud;
        hud.setKnowledgeBaseTab(tabName);
        const container = document.getElementById('knowledge-entries-container');
        const cards = Array.from(container.querySelectorAll('.knowledge-card'));
        return cards.map(c => ({
          title: c.querySelector('.knowledge-card-title')?.textContent?.trim(),
          badge: c.querySelector('.knowledge-card-badge')?.textContent?.trim()
        }));
      };

      return {
        isOpen,
        bestiaryCards: getTabCards('bestiary'),
        gatheringCards: getTabCards('gathering'),
        statusEffectCards: getTabCards('status_effects'),
        classCards: getTabCards('classes')
      };
    });

    console.log(`  Knowledge Base Modal Open on Floor 3: ${modalStateF3.isOpen}`);
    console.log(`  Bestiary Entries on Floor 3:`, modalStateF3.bestiaryCards.map(c => c.title));
    console.log(`  Gathering Entries on Floor 3:`, modalStateF3.gatheringCards.map(c => c.title));
    console.log(`  Status Effect Entries on Floor 3:`, modalStateF3.statusEffectCards.map(c => c.title));
    console.log(`  Class Entries on Floor 3:`, modalStateF3.classCards.map(c => c.title));

    assert.ok(modalStateF3.bestiaryCards.some(c => c.title.toLowerCase().includes(enemyInfo.name.toLowerCase())),
      `Bestiary MUST still contain ${enemyInfo.name} on Floor 3`);
    assert.ok(modalStateF3.gatheringCards.some(c => c.title.toLowerCase().includes(harvestInfo.name.toLowerCase())),
      `Gathering MUST still contain ${harvestInfo.name} on Floor 3`);
    assert.ok(modalStateF3.statusEffectCards.some(c => c.title.toLowerCase().includes('bleed')),
      'Status Effects MUST still contain Bleed on Floor 3');
    assert.ok(modalStateF3.classCards.some(c => c.title.toLowerCase().includes('vanguard')),
      'Classes MUST still contain Vanguard on Floor 3');

    console.log('\n================================================================');
    console.log('ALL VERIFICATIONS PASSED CLEANLY! ZERO REGRESSION OR RESET ACROSS CONTINUES.');
    console.log('================================================================');

  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('\n❌ LIVE BROWSER VERIFICATION FAILED:', err);
  process.exit(1);
});
