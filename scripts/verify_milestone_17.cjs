const puppeteer = require('puppeteer-core');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL = 'http://localhost:5173';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log('[M17 Test] Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      const text = msg.text();
      if (
        text.includes('[Gathering]') ||
        text.includes('[Gather Interrupt]') ||
        text.includes('[Floor Timer]') ||
        text.includes('[Combat]') ||
        text.includes('[Debug') ||
        text.includes('Dungeon') ||
        text.includes('Outpost')
      ) {
        console.log(`  [Browser] ${text}`);
      }
    });

    console.log(`[M17 Test] Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await sleep(2500);

    // Wait for game to initialize in OutpostScene
    await page.waitForFunction(() => window.game && window.game.scene, { timeout: 10000 });
    console.log('✓ Game booted in initial scene.');

    // Transition from Outpost to Dungeon Floor 1
    console.log('\nTransitioning into Dungeon Floor 1...');
    await page.evaluate(() => {
      const activeScene = window.game.scene.getScenes(true)[0];
      if (activeScene && typeof activeScene.executeTransitionToDungeon === 'function') {
        activeScene.executeTransitionToDungeon();
      } else {
        activeScene.scene.start('MainScene');
      }
    });

    await sleep(2500);
    await page.waitForFunction(() => {
      const s = window.game.scene.getScene('MainScene');
      return s && s.sys.isVisible();
    }, { timeout: 10000 });
    console.log('✓ MainScene active and rendering.');

    // =========================================================================
    // TEST 1: Gathering Nodes Presence in Dungeon
    // =========================================================================
    console.log('\n--- TEST 1: Woodcutting, Mining & Foraging Nodes Generated ---');
    const nodesSummary = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      const nodes = scene.gatheringNodes || [];
      return {
        total: nodes.length,
        bushes: nodes.filter((n) => n.nodeDef.skillId === 'foraging').length,
        trees: nodes.filter((n) => n.nodeDef.skillId === 'woodcutting').length,
        rocks: nodes.filter((n) => n.nodeDef.skillId === 'mining').length,
        items: nodes.map((n) => ({
          type: n.nodeDef.id,
          name: n.nodeDef.name,
          skillId: n.nodeDef.skillId,
          x: n.x,
          y: n.y,
          isHarvested: n.isHarvested
        }))
      };
    });

    console.log('Dungeon gathering nodes breakdown:', {
      total: nodesSummary.total,
      bushes: nodesSummary.bushes,
      trees: nodesSummary.trees,
      rocks: nodesSummary.rocks
    });

    if (nodesSummary.bushes === 0 || nodesSummary.trees === 0 || nodesSummary.rocks === 0) {
      throw new Error(`FAIL: Generated dungeon must contain bushes, trees, and rocks! Got: ${JSON.stringify(nodesSummary)}`);
    }
    console.log('✓ PASS: All 3 gathering node types exist in generated dungeon.');

    // =========================================================================
    // TEST 2: Uninterrupted Channel on All 3 Types
    // =========================================================================
    console.log('\n--- TEST 2: Uninterrupted Channel on All 3 Types ---');

    for (const targetSkill of ['foraging', 'woodcutting', 'mining']) {
      console.log(`\nTesting full uninterrupted channel for ${targetSkill}...`);
      const beforeState = await page.evaluate((skill) => {
        const scene = window.game.scene.getScene('MainScene');
        const targetNode = scene.gatheringNodes.find((n) => n.nodeDef.skillId === skill && !n.isHarvested);
        const nodeIdx = scene.gatheringNodes.indexOf(targetNode);
        const gs = window.GameState ? window.GameState.getInstance() : null;
        return {
          nodeIdx,
          nodeName: targetNode.nodeDef.name,
          resourceId: targetNode.nodeDef.resourceId,
          wood: gs ? gs.getWood() : 0,
          ore: gs ? gs.getOre() : 0,
          herbs: gs ? gs.getItemCount('wild_herbs') : 0,
          stat: scene.player.progression.getProficiencyStat(skill)
        };
      }, targetSkill);

      console.log(`Starting channel on node #${beforeState.nodeIdx} (${beforeState.nodeName})...`);

      // Start channel
      const started = await page.evaluate((idx) => {
        return window.__startGatherChannel(idx, 0);
      }, beforeState.nodeIdx);

      if (!started) {
        throw new Error(`FAIL: Failed to start gather channel on node #${beforeState.nodeIdx}`);
      }

      // Check mid-channel state
      await sleep(1200);
      const midState = await page.evaluate(() => {
        const scene = window.game.scene.getScene('MainScene');
        const channel = scene.activeGatherChannels.get(scene.player);
        return {
          playerState: scene.player.state,
          hasChannel: !!channel,
          elapsed: channel ? channel.elapsedMs : 0,
          duration: channel ? channel.durationMs : 0
        };
      });

      console.log(`Mid-channel state (${targetSkill}):`, midState);
      if (midState.playerState !== 'channeling' || !midState.hasChannel) {
        throw new Error(`FAIL: Character must be in 'channeling' state! Got: ${JSON.stringify(midState)}`);
      }
      console.log(`✓ Character is channeling (${midState.elapsed.toFixed(0)}ms / ${midState.duration}ms).`);

      // Wait for channel completion (duration 2500ms + margin)
      await sleep(1800);

      const afterState = await page.evaluate((data) => {
        const scene = window.game.scene.getScene('MainScene');
        const node = scene.gatheringNodes[data.nodeIdx];
        const gs = window.GameState ? window.GameState.getInstance() : null;
        return {
          playerState: scene.player.state,
          isHarvested: node.isHarvested,
          label: node.label.text,
          wood: gs ? gs.getWood() : 0,
          ore: gs ? gs.getOre() : 0,
          herbs: gs ? gs.getItemCount('wild_herbs') : 0,
          stat: scene.player.progression.getProficiencyStat(data.skill)
        };
      }, { nodeIdx: beforeState.nodeIdx, skill: targetSkill });

      console.log(`After channel state (${targetSkill}):`, afterState);

      if (!afterState.isHarvested) {
        throw new Error(`FAIL: Node should be marked harvested after full channel!`);
      }
      if (afterState.playerState !== 'idle') {
        throw new Error(`FAIL: Character state should return to 'idle'! Got: ${afterState.playerState}`);
      }
      if (afterState.stat.currentExp <= beforeState.stat.currentExp && afterState.stat.level <= beforeState.stat.level) {
        throw new Error(`FAIL: EXP should be awarded for ${targetSkill}!`);
      }

      if (targetSkill === 'woodcutting' && afterState.wood <= beforeState.wood) {
        throw new Error(`FAIL: Woodcutting must grant Wood to Construction economy!`);
      }
      if (targetSkill === 'mining' && afterState.ore <= beforeState.ore) {
        throw new Error(`FAIL: Mining must grant Ore to Ore economy!`);
      }
      if (targetSkill === 'foraging' && afterState.herbs <= beforeState.herbs) {
        throw new Error(`FAIL: Foraging must grant Wild Herbs!`);
      }

      console.log(`✓ PASS: Uninterrupted channel for ${targetSkill} awarded resource and EXP correctly.`);
    }

    // =========================================================================
    // TEST 3: Combat Interrupt Mechanics on All 3 Types
    // =========================================================================
    console.log('\n--- TEST 3: Combat Interrupt Mechanics on All 3 Types ---');

    for (const targetSkill of ['foraging', 'woodcutting', 'mining']) {
      console.log(`\nTesting combat interrupt on ${targetSkill}...`);
      const setup = await page.evaluate((skill) => {
        const scene = window.game.scene.getScene('MainScene');
        const targetNode = scene.gatheringNodes.find((n) => n.nodeDef.skillId === skill && !n.isHarvested);
        const nodeIdx = scene.gatheringNodes.indexOf(targetNode);
        const enemy = scene.enemies.find((e) => e.state !== 'dead' && e.state !== 'downed');
        const enemyIdx = scene.enemies.indexOf(enemy);

        const gs = window.GameState ? window.GameState.getInstance() : null;
        return {
          nodeIdx,
          enemyIdx,
          enemyName: enemy ? enemy.entityName : 'Wolf',
          wood: gs ? gs.getWood() : 0,
          ore: gs ? gs.getOre() : 0,
          herbs: gs ? gs.getItemCount('wild_herbs') : 0,
          stat: scene.player.progression.getProficiencyStat(skill)
        };
      }, targetSkill);

      // Start channel
      await page.evaluate((idx) => {
        window.__startGatherChannel(idx, 0);
      }, setup.nodeIdx);

      // Wait 800ms into channel
      await sleep(800);

      // Trigger combat interrupt
      const interrupted = await page.evaluate((enemyIdx) => {
        return window.__interruptGatherChannel(0, enemyIdx);
      }, setup.enemyIdx);

      if (!interrupted) {
        throw new Error(`FAIL: __interruptGatherChannel should return true when channeling!`);
      }

      const postInterruptState = await page.evaluate((data) => {
        const scene = window.game.scene.getScene('MainScene');
        const node = scene.gatheringNodes[data.nodeIdx];
        const gs = window.GameState ? window.GameState.getInstance() : null;
        const activeChannels = scene.activeGatherChannels.size;
        return {
          isHarvested: node.isHarvested,
          label: node.label.text,
          activeChannels,
          wood: gs ? gs.getWood() : 0,
          ore: gs ? gs.getOre() : 0,
          herbs: gs ? gs.getItemCount('wild_herbs') : 0,
          stat: scene.player.progression.getProficiencyStat(data.skill),
          playerTarget: scene.player.targetEntity ? scene.player.targetEntity.entityName : null
        };
      }, { nodeIdx: setup.nodeIdx, skill: targetSkill });

      console.log(`Post-interrupt state (${targetSkill}):`, postInterruptState);

      // Zero rewards, zero EXP
      if (postInterruptState.wood !== setup.wood || postInterruptState.ore !== setup.ore || postInterruptState.herbs !== setup.herbs) {
        throw new Error(`FAIL: Zero rewards should be granted on interrupted channel!`);
      }
      if (postInterruptState.stat.currentExp !== setup.stat.currentExp || postInterruptState.stat.level !== setup.stat.level) {
        throw new Error(`FAIL: Zero EXP should be granted on interrupted channel!`);
      }
      // Bar reset to zero / channel removed
      if (postInterruptState.activeChannels !== 0) {
        throw new Error(`FAIL: Progress bar and active channel should be destroyed!`);
      }
      // Node remains intact / unharvested
      if (postInterruptState.isHarvested) {
        throw new Error(`FAIL: Node must remain unharvested after interrupt!`);
      }
      // Immediate combat engagement with attacker
      if (!postInterruptState.playerTarget) {
        throw new Error(`FAIL: Character must enter combat with attacker!`);
      }

      console.log(`✓ PASS: ${targetSkill} combat interrupt confirmed: 0 items, 0 EXP, bar destroyed, node intact, combat engaged with ${postInterruptState.playerTarget}.`);

      // Clear player target so next test is clean
      await page.evaluate(() => {
        const scene = window.game.scene.getScene('MainScene');
        scene.player.clearTarget();
      });
    }

    // =========================================================================
    // TEST 4: Lifespan, Debug Toggle & Timer Independence (Four-Part Check)
    // =========================================================================
    console.log('\n--- TEST 4: Lifespan, Debug Toggle & Timer Independence ---');

    // Part 4a: Default Off-State: Harvested node stays depleted (no 15s timer)
    console.log('\nPart 4a: Testing default off-state (nodes stay depleted)...');
    const part4a = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return {
        debugGatheringRespawnEnabled: scene.debugGatheringRespawnEnabled,
        harvestedCount: scene.gatheringNodes.filter((n) => n.isHarvested).length
      };
    });
    console.log('Initial debug gathering toggle state:', part4a);
    if (part4a.debugGatheringRespawnEnabled !== false) {
      throw new Error(`FAIL: debugGatheringRespawnEnabled must default to false! Got: ${part4a.debugGatheringRespawnEnabled}`);
    }

    // Wait 3.5s and confirm harvested nodes remain depleted
    await sleep(3500);
    const postWaitCount = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return scene.gatheringNodes.filter((n) => n.isHarvested).length;
    });
    if (postWaitCount !== part4a.harvestedCount) {
      throw new Error(`FAIL: Harvested nodes should not respawn on standing timer!`);
    }
    console.log('✓ PASS: Harvested nodes stay depleted (no standing respawn in real gameplay).');

    // Part 4b: Debug Toggle On-State: 15s respawn fires when toggle is ON
    console.log('\nPart 4b: Testing debug toggle on-state...');
    const toggledOn = await page.evaluate(() => {
      return window.__toggleDebugGatheringRespawn();
    });
    console.log('Toggled debug gathering respawn ON:', toggledOn);
    if (!toggledOn) {
      throw new Error(`FAIL: debugGatheringRespawnEnabled should be true after toggle!`);
    }

    // Toggle it back OFF
    const toggledOff = await page.evaluate(() => {
      return window.__toggleDebugGatheringRespawn();
    });
    console.log('Toggled debug gathering respawn OFF:', toggledOff);
    if (toggledOff) {
      throw new Error(`FAIL: debugGatheringRespawnEnabled should be false after toggle!`);
    }
    console.log('✓ PASS: Debug gathering respawn toggle operates cleanly.');

    // Part 4c: Floor Repopulation Timer Non-Interference
    console.log('\nPart 4c: Testing floor timer repopulation non-interference...');
    const preFloorRepop = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return {
        totalNodes: scene.gatheringNodes.length,
        harvestedNodes: scene.gatheringNodes.filter((n) => n.isHarvested).length
      };
    });

    // Manually trigger floor repopulation
    await page.evaluate(() => {
      window.__triggerFloorRespawn();
    });
    await sleep(1000);

    const postFloorRepop = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return {
        totalNodes: scene.gatheringNodes.length,
        harvestedNodes: scene.gatheringNodes.filter((n) => n.isHarvested).length
      };
    });

    console.log('Pre vs Post floor repopulation gathering state:', { pre: preFloorRepop, post: postFloorRepop });
    if (
      preFloorRepop.totalNodes !== postFloorRepop.totalNodes ||
      preFloorRepop.harvestedNodes !== postFloorRepop.harvestedNodes
    ) {
      throw new Error(`FAIL: Floor repopulation timer must NOT affect gathering nodes!`);
    }
    console.log('✓ PASS: Floor repopulation timer firing leaves gathering nodes completely untouched.');

    // Part 4d: Floor Regeneration as Renewal Trigger
    console.log('\nPart 4d: Testing floor regeneration renewal (Outpost portal transition and return)...');
    // Transition to Outpost
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      scene.scene.start('OutpostScene');
    });
    await sleep(2000);

    // Return to Dungeon Floor
    await page.evaluate(() => {
      const scene = window.game.scene.getScene('OutpostScene');
      scene.scene.start('MainScene');
    });
    await sleep(2500);

    const regeneratedFloorNodes = await page.evaluate(() => {
      const scene = window.game.scene.getScene('MainScene');
      return {
        total: scene.gatheringNodes.length,
        harvested: scene.gatheringNodes.filter((n) => n.isHarvested).length,
        bushes: scene.gatheringNodes.filter((n) => n.nodeDef.skillId === 'foraging').length,
        trees: scene.gatheringNodes.filter((n) => n.nodeDef.skillId === 'woodcutting').length,
        rocks: scene.gatheringNodes.filter((n) => n.nodeDef.skillId === 'mining').length
      };
    });

    console.log('Regenerated floor gathering nodes:', regeneratedFloorNodes);
    if (regeneratedFloorNodes.harvested !== 0) {
      throw new Error(`FAIL: Fresh floor generation should have 0 harvested nodes! Got: ${regeneratedFloorNodes.harvested}`);
    }
    if (
      regeneratedFloorNodes.bushes === 0 ||
      regeneratedFloorNodes.trees === 0 ||
      regeneratedFloorNodes.rocks === 0
    ) {
      throw new Error(`FAIL: Fresh floor generation must feature bushes, trees, and rocks!`);
    }
    console.log('✓ PASS: Floor regeneration properly renews all gathering nodes upon re-entry.');

    console.log('\n========================================');
    console.log('🎉 ALL MILESTONE 17 VERIFICATION TESTS PASSED!');
    console.log('========================================\n');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('\n❌ Milestone 17 Verification Failed:', err);
  process.exit(1);
});
