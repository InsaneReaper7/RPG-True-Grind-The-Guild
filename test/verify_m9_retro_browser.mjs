import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function run() {
  console.log('=== Starting Milestone 9.0 Full Browser Verification ===');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  page.on('console', msg => {
    console.log(`  [BROWSER ${msg.type().toUpperCase()}]`, msg.text());
  });
  page.on('pageerror', err => {
    console.log('  [PAGE ERROR]', err.message);
  });

  console.log('Navigating to http://localhost:4173 ...');
  await page.goto('http://localhost:4173', { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));

  // ---------------------------------------------------------------------------
  // STEP 1: Fresh character verification on HUD
  // ---------------------------------------------------------------------------
  console.log('\n--- STEP 1: Verifying Fresh Character HUD (Zero visible stats) ---');
  const hudVisibility = await page.evaluate(() => {
    const profRow = document.getElementById('hud-proficiency-row');
    const constRow = document.getElementById('hud-construction-row');
    const alchRow = document.getElementById('hud-alchemy-row');
    const discSection = document.getElementById('hud-discovered-skills-section');
    return {
      profDisplay: profRow ? window.getComputedStyle(profRow).display : null,
      constDisplay: constRow ? window.getComputedStyle(constRow).display : null,
      alchDisplay: alchRow ? window.getComputedStyle(alchRow).display : null,
      discDisplay: discSection ? window.getComputedStyle(discSection).display : null,
    };
  });

  assert.equal(hudVisibility.profDisplay, 'none', 'Equipped weapon proficiency row must be hidden');
  assert.equal(hudVisibility.constDisplay, 'none', 'Construction row must be hidden');
  assert.equal(hudVisibility.alchDisplay, 'none', 'Alchemy row must be hidden');
  assert.equal(hudVisibility.discDisplay, 'none', 'Discovered skills section must be hidden');
  console.log('✔ HUD Check passed: All 4 trainable stat sections are strictly hidden (display: none)');

  await page.screenshot({ path: 'C:/Users/insan/.gemini/antigravity/brain/4fb66230-2c20-4d96-9e54-6bed35305478/fresh_hud.png' });

  // ---------------------------------------------------------------------------
  // STEP 2: Fresh character verification on Party Overview Modal
  // ---------------------------------------------------------------------------
  console.log('\n--- STEP 2: Verifying Fresh Character Party Overview Modal ---');
  const debugInfo = await page.evaluate(() => {
    const scene = window.game?.scene?.getScene('OutpostScene');
    const hud = scene?.hud;
    return {
      hasGame: !!window.game,
      hasScene: !!scene,
      hasHud: !!hud,
      partyModalEl: !!document.getElementById('party-overview-modal'),
      hudHasPartyModalEl: !!hud?.partyOverviewModalEl,
      modalClass: document.getElementById('party-overview-modal')?.className
    };
  });
  console.log('DEBUG INFO:', debugInfo);

  await page.evaluate(() => {
    const scene = window.game?.scene?.getScene('OutpostScene');
    scene?.hud?.openPartyOverviewModal();
  });
  await new Promise(r => setTimeout(r, 500));

  const partyOverviewFresh = await page.evaluate(() => {
    const modal = document.getElementById('party-overview-modal');
    const noProf = document.querySelector('[data-party-no-prof="0"]');
    const statRows = Array.from(document.querySelectorAll('[data-party-prof-row^="0-"]')).map(el => ({
      id: el.getAttribute('data-party-prof-row'),
      display: window.getComputedStyle(el).display
    }));
    return {
      isOpen: modal?.classList.contains('active'),
      noProfDisplay: noProf ? window.getComputedStyle(noProf).display : null,
      visibleRowsCount: statRows.filter(r => r.display !== 'none').length,
      totalRowsCount: statRows.length
    };
  });

  assert.equal(partyOverviewFresh.isOpen, true, 'Party Overview modal must be open');
  assert.equal(partyOverviewFresh.noProfDisplay, 'block', '"No proficiencies discovered" message must be visible');
  assert.equal(partyOverviewFresh.visibleRowsCount, 0, 'ZERO proficiency rows must be visible at Level 0');
  assert.equal(partyOverviewFresh.totalRowsCount, 13, 'All 13 trainable stats must have pre-rendered rows');
  console.log('✔ Party Overview Check passed: Exactly 0 visible stats, "No proficiencies discovered" shown');

  await page.screenshot({ path: 'C:/Users/insan/.gemini/antigravity/brain/4fb66230-2c20-4d96-9e54-6bed35305478/fresh_party_overview.png' });

  await page.keyboard.press('o'); // Close party overview
  await new Promise(r => setTimeout(r, 400));

  // ---------------------------------------------------------------------------
  // STEP 3: Debug Panel shows all 13 stats at Level 0 (0/50 EXP)
  // ---------------------------------------------------------------------------
  console.log('\n--- STEP 3: Verifying Debug Panel Tooling (13 stats visible) ---');
  await page.keyboard.press('Backquote');
  await new Promise(r => setTimeout(r, 400));

  const debugPanelStats = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#debug-skills-list .debug-skill-row'));
    return rows.map(r => r.textContent?.trim());
  });

  assert.equal(debugPanelStats.length, 13, 'Debug panel must display exactly 13 trainable stats');
  assert.ok(debugPanelStats.some(s => s.includes('short_swords: Level 0 (0/50 EXP)')), 'Short swords visible in debug');
  assert.ok(debugPanelStats.some(s => s.includes('shields: Level 0 (0/50 EXP)')), 'Shields visible in debug');
  assert.ok(debugPanelStats.some(s => s.includes('daggers: Level 0 (0/50 EXP)')), 'Daggers visible in debug');
  assert.ok(debugPanelStats.some(s => s.includes('construction: Level 0 (0/50 EXP)')), 'Construction visible in debug');
  console.log('✔ Debug Panel Check passed: All 13 stats present with real Level 0 (0/50 EXP)');

  await page.screenshot({ path: 'C:/Users/insan/.gemini/antigravity/brain/4fb66230-2c20-4d96-9e54-6bed35305478/fresh_debug_panel.png' });
  await page.keyboard.press('Backquote'); // Close debug panel
  await new Promise(r => setTimeout(r, 400));

  // ---------------------------------------------------------------------------
  // STEP 4: Grant Partial EXP (25 EXP) across multiple stats simultaneously
  // ---------------------------------------------------------------------------
  console.log('\n--- STEP 4: Partial EXP Progress (25 EXP across 5 stats) ---');
  await page.evaluate(() => {
    window.__grantExp('short_swords', 25, 0);
    window.__grantExp('shields', 25, 0);
    window.__grantExp('construction', 25, 0);
    window.__grantExp('alchemy', 25, 0);
    window.__grantExp('evasion', 25, 0);
  });
  await new Promise(r => setTimeout(r, 400));

  const hudPartialVisibility = await page.evaluate(() => {
    const profRow = document.getElementById('hud-proficiency-row');
    const constRow = document.getElementById('hud-construction-row');
    const alchRow = document.getElementById('hud-alchemy-row');
    const discSection = document.getElementById('hud-discovered-skills-section');
    return {
      profDisplay: window.getComputedStyle(profRow).display,
      constDisplay: window.getComputedStyle(constRow).display,
      alchDisplay: window.getComputedStyle(alchRow).display,
      discDisplay: window.getComputedStyle(discSection).display,
    };
  });

  assert.equal(hudPartialVisibility.profDisplay, 'none', 'Equipped weapon must STILL be hidden at 25 EXP');
  assert.equal(hudPartialVisibility.constDisplay, 'none', 'Construction must STILL be hidden at 25 EXP');
  assert.equal(hudPartialVisibility.alchDisplay, 'none', 'Alchemy must STILL be hidden at 25 EXP');
  assert.equal(hudPartialVisibility.discDisplay, 'none', 'Discovered skills must STILL be hidden at 25 EXP');
  console.log('✔ Partial EXP Check passed: Zero stats revealed anywhere on HUD despite having 25 EXP each');

  // ---------------------------------------------------------------------------
  // STEP 5: Spawn companion Valerie
  // ---------------------------------------------------------------------------
  console.log('\n--- STEP 5: Spawning Companion Valerie ---');
  await page.evaluate(() => {
    window.__spawnTestCompanion();
  });
  await new Promise(r => setTimeout(r, 600));

  // ---------------------------------------------------------------------------
  // STEP 6: Multi-stat Level 1 reveals across leader and companion
  // ---------------------------------------------------------------------------
  console.log('\n--- STEP 6: Crossing Level 1 independently for Leader & Companion ---');

  // A. Leader crosses Level 1 on Short Swords (+25 EXP -> 50 total)
  await page.evaluate(() => {
    window.__grantExp('short_swords', 25, 0);
  });
  await new Promise(r => setTimeout(r, 500));

  const leaderModal = await page.evaluate(() => {
    const modal = document.getElementById('skill-discovered-modal');
    const name = document.getElementById('discovered-skill-name')?.textContent;
    return {
      isActive: modal?.classList.contains('active'),
      skillName: name
    };
  });

  assert.equal(leaderModal.isActive, true, 'Skill Discovered modal must appear for Leader Short Swords');
  assert.equal(leaderModal.skillName, 'Short Swords', 'Modal must show Short Swords');
  console.log('✔ Leader Short Swords discovery modal fired successfully!');
  await page.screenshot({ path: 'C:/Users/insan/.gemini/antigravity/brain/4fb66230-2c20-4d96-9e54-6bed35305478/skill_discovered_leader_swords.png' });

  // B. Leader crosses Level 1 on Shields (+25 EXP -> 50 total) and Construction (+25 EXP -> 50 total)
  await page.evaluate(() => {
    window.__grantExp('shields', 25, 0);
    window.__grantExp('construction', 25, 0);
  });
  await new Promise(r => setTimeout(r, 500));

  // C. Companion Valerie crosses Level 1 on Daggers (+50 EXP -> Level 1)
  await page.evaluate(() => {
    window.__grantExp('daggers', 50, 1);
  });
  await new Promise(r => setTimeout(r, 500));

  const companionModal = await page.evaluate(() => {
    const modal = document.getElementById('skill-discovered-modal');
    const name = document.getElementById('discovered-skill-name')?.textContent;
    return {
      isActive: modal?.classList.contains('active'),
      skillName: name
    };
  });

  assert.equal(companionModal.isActive, true, 'Skill Discovered modal must appear for Companion Daggers');
  assert.equal(companionModal.skillName, 'Daggers', 'Modal must show Daggers');
  console.log('✔ Companion Valerie Daggers discovery modal fired successfully!');
  await page.screenshot({ path: 'C:/Users/insan/.gemini/antigravity/brain/4fb66230-2c20-4d96-9e54-6bed35305478/skill_discovered_companion_daggers.png' });

  // ---------------------------------------------------------------------------
  // STEP 7: Verify Multi-Member Party Overview with independent reveals
  // ---------------------------------------------------------------------------
  console.log('\n--- STEP 7: Inspecting Party Overview with Multiple Independent Reveals ---');
  await page.keyboard.press('o');
  await new Promise(r => setTimeout(r, 500));

  const partyOverviewRevealed = await page.evaluate(() => {
    // Leader (member 0)
    const leaderSwords = window.getComputedStyle(document.querySelector('[data-party-prof-row="0-short_swords"]')).display;
    const leaderShields = window.getComputedStyle(document.querySelector('[data-party-prof-row="0-shields"]')).display;
    const leaderConst = window.getComputedStyle(document.querySelector('[data-party-prof-row="0-construction"]')).display;
    const leaderDaggers = window.getComputedStyle(document.querySelector('[data-party-prof-row="0-daggers"]')).display;
    const leaderNoProf = window.getComputedStyle(document.querySelector('[data-party-no-prof="0"]')).display;

    // Companion (member 1)
    const compDaggers = window.getComputedStyle(document.querySelector('[data-party-prof-row="1-daggers"]')).display;
    const compSwords = window.getComputedStyle(document.querySelector('[data-party-prof-row="1-short_swords"]')).display;
    const compShields = window.getComputedStyle(document.querySelector('[data-party-prof-row="1-shields"]')).display;
    const compNoProf = window.getComputedStyle(document.querySelector('[data-party-no-prof="1"]')).display;

    return {
      leader: {
        short_swords: leaderSwords,
        shields: leaderShields,
        construction: leaderConst,
        daggers: leaderDaggers,
        noProf: leaderNoProf
      },
      companion: {
        daggers: compDaggers,
        short_swords: compSwords,
        shields: compShields,
        noProf: compNoProf
      }
    };
  });

  // Leader assertions
  assert.equal(partyOverviewRevealed.leader.short_swords, 'flex', 'Leader Short Swords must be revealed');
  assert.equal(partyOverviewRevealed.leader.shields, 'flex', 'Leader Shields must be revealed');
  assert.equal(partyOverviewRevealed.leader.construction, 'flex', 'Leader Construction must be revealed');
  assert.equal(partyOverviewRevealed.leader.daggers, 'none', 'Leader Daggers must strictly remain HIDDEN');
  assert.equal(partyOverviewRevealed.leader.noProf, 'none', 'Leader noProf message must be hidden');

  // Companion assertions (zero leakage from leader)
  assert.equal(partyOverviewRevealed.companion.daggers, 'flex', 'Companion Daggers must be revealed');
  assert.equal(partyOverviewRevealed.companion.short_swords, 'none', 'Companion Short Swords must strictly remain HIDDEN');
  assert.equal(partyOverviewRevealed.companion.shields, 'none', 'Companion Shields must strictly remain HIDDEN');
  assert.equal(partyOverviewRevealed.companion.noProf, 'none', 'Companion noProf message must be hidden');

  console.log('✔ Multi-member Party Overview passed: Leader shows Short Swords/Shields/Construction, Companion shows Daggers, unlearned stats strictly hidden!');
  await page.screenshot({ path: 'C:/Users/insan/.gemini/antigravity/brain/4fb66230-2c20-4d96-9e54-6bed35305478/multi_member_revealed_party_overview.png' });

  await page.keyboard.press('o'); // Close party overview
  await new Promise(r => setTimeout(r, 400));

  // ---------------------------------------------------------------------------
  // STEP 8: Inspect Normal HUD with revealed stats
  // ---------------------------------------------------------------------------
  console.log('\n--- STEP 8: Inspecting Normal HUD with Revealed Stats ---');
  const hudFinalVisibility = await page.evaluate(() => {
    const profRow = document.getElementById('hud-proficiency-row');
    const constRow = document.getElementById('hud-construction-row');
    const alchRow = document.getElementById('hud-alchemy-row');
    return {
      profDisplay: window.getComputedStyle(profRow).display,
      constDisplay: window.getComputedStyle(constRow).display,
      alchDisplay: window.getComputedStyle(alchRow).display,
      profText: document.getElementById('proficiency-text')?.textContent,
      constText: document.getElementById('construction-prof-text')?.textContent
    };
  });

  assert.equal(hudFinalVisibility.profDisplay, 'flex', 'Equipped weapon proficiency row must now be VISIBLE');
  assert.equal(hudFinalVisibility.constDisplay, 'flex', 'Construction row must now be VISIBLE');
  assert.equal(hudFinalVisibility.alchDisplay, 'none', 'Alchemy row must STILL be hidden at Level 0');
  assert.ok(hudFinalVisibility.profText.includes('Level 1'), 'Proficiency text must display Level 1');
  assert.ok(hudFinalVisibility.constText.includes('Level 1'), 'Construction text must display Level 1');

  console.log('✔ Normal HUD passed: Short Swords & Construction revealed at Level 1, Alchemy strictly hidden');
  await page.screenshot({ path: 'C:/Users/insan/.gemini/antigravity/brain/4fb66230-2c20-4d96-9e54-6bed35305478/revealed_hud.png' });

  console.log('\n======================================================');
  console.log('ALL BROWSER VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('======================================================\n');

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
