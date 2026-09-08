import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { HUD } from '../src/ui/HUD.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';
import type { ClassesData, ClassDef } from '../src/types/game.ts';

// Setup node mock fetch to read actual project JSON files
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

// Lightweight DOM mock for testing HUD in Node.js
class MockDOMElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public style: Record<string, any> = {};
  public dataset: Record<string, string> = {};
  public classList = {
    _classes: new Set<string>(),
    add: (c: string) => this.classList._classes.add(c),
    remove: (c: string) => this.classList._classes.delete(c),
    contains: (c: string) => this.classList._classes.has(c)
  };
  public children: MockDOMElement[] = [];
  public parentElement: MockDOMElement | null = null;
  public listeners: Record<string, ((e: any) => void)[]> = {};
  private _text: string = '';
  private _html: string = '';

  constructor(tagName: string = 'div') {
    this.tagName = tagName.toUpperCase();
  }

  get textContent(): string {
    return this._text;
  }
  set textContent(val: string) {
    this._text = String(val);
  }

  get innerText(): string {
    return this._text;
  }
  set innerText(val: string) {
    this._text = String(val);
  }

  get value(): string {
    return this._text;
  }
  set value(val: string) {
    this._text = String(val);
  }

  get innerHTML(): string {
    return this._html;
  }
  set innerHTML(val: string) {
    this._html = val;
  }

  get scrollTop(): number {
    return 0;
  }
  set scrollTop(_: number) {}

  get scrollHeight(): number {
    return 100;
  }

  public appendChild(child: MockDOMElement): MockDOMElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  public removeChild(child: MockDOMElement): MockDOMElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  get firstChild(): MockDOMElement | null {
    return this.children[0] || null;
  }

  public addEventListener(event: string, cb: (e: any) => void): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  public click(): void {
    const handlers = this.listeners['click'] || [];
    for (const h of handlers) h({ target: this });
  }

  public trigger(event: string, data?: any): void {
    const handlers = this.listeners[event] || [];
    for (const h of handlers) h({ target: this, ...data });
  }
}

const elementsMap = new Map<string, MockDOMElement>();
function getOrCreateMockElement(id: string, tagName: string = 'div'): MockDOMElement {
  if (!elementsMap.has(id)) {
    const el = new MockDOMElement(tagName);
    el.id = id;
    elementsMap.set(id, el);
  }
  return elementsMap.get(id)!;
}

(global as any).document = {
  getElementById: (id: string) => getOrCreateMockElement(id),
  createElement: (tag: string) => new MockDOMElement(tag)
};
(global as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {}
};

console.log('--- RUNNING MISSED UNLOCK ANNOUNCEMENT QUEUE & DEBUG PANEL TESTS ---');

const mockClassesData: ClassesData = {
  classes: [
    {
      id: 'fencer',
      name: 'Fencer',
      tier: 'novice',
      requirements: [{ type: 'proficiency', target: 'short_swords', value: 10 }],
      fantasy: 'Quick, light-footed duelist'
    },
    {
      id: 'combat_medic',
      name: 'Combat Medic',
      tier: 'novice',
      requirements: [{ type: 'activityCount', target: 'Ally Revived', value: 5 }],
      fantasy: 'Field triage specialist'
    }
  ]
};

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // ---------------------------------------------------------------------------
  // TEST 1: Simultaneous 3+ Unlocks in the Same Tick (FIFO Queueing & Non-Dropping)
  // ---------------------------------------------------------------------------
  {
    console.log('\n[TEST 1] Testing 3+ Simultaneous Unlocks in the Exact Same Tick...');
    const hud = new HUD();
    hud.clearAnnouncementQueue();

    const combatMedicDef: ClassDef = {
      id: 'combat_medic',
      name: 'Combat Medic',
      tier: 'novice',
      requirements: [{ type: 'activityCount', target: 'Ally Revived', value: 5 }],
      fantasy: 'Field triage specialist'
    };
    const parrySkillDef = { name: 'Parry', description: 'Deflects melee attacks' };
    const dualWieldSkillDef = { name: 'Dual Wielding', description: 'Wield two weapons' };

    // Fire all three in the exact same synchronous frame with distinct party member attribution
    hud.showClassUnlockModal(combatMedicDef, 'Valerie', 100);
    hud.showSkillDiscoveredModal(parrySkillDef, 'Valerie', 100);
    hud.showSkillDiscoveredModal(dualWieldSkillDef, 'Kaelen', 100);

    // 1. Immediately: Modal 1 is displayed; Queue has 2 pending items
    assert.equal(hud.isAnnouncementShowing(), true, 'First announcement must be active');
    assert.equal(hud.getPendingAnnouncementCount(), 2, 'Queue must hold remaining 2 announcements');
    assert.equal(hud.getActiveAnnouncement()?.data.name, 'Combat Medic');
    assert.equal(hud.getActiveAnnouncement()?.memberName, 'Valerie');

    const unlockModal = getOrCreateMockElement('unlock-modal');
    const skillModal = getOrCreateMockElement('skill-discovered-modal');
    const unlockedClassName = getOrCreateMockElement('unlocked-class-name');

    assert.ok(unlockModal.classList.contains('active'), 'unlock-modal must be active for Class Unlock');
    assert.equal(skillModal.classList.contains('active'), false, 'skill-discovered-modal must NOT be active while class modal is showing');
    assert.equal(unlockedClassName.innerText, 'Valerie unlocked Combat Medic!', 'Announcement must explicitly attribute Valerie');

    // 2. Wait for auto-dismiss timer of Modal 1 (100ms) + transition delay (200ms)
    await sleep(350);

    // 3. Modal 2 must now be displayed automatically (No AFK stall)
    assert.equal(hud.isAnnouncementShowing(), true, 'Second announcement must be active');
    assert.equal(hud.getPendingAnnouncementCount(), 1, 'Queue must hold 1 remaining announcement');
    assert.equal(hud.getActiveAnnouncement()?.data.name, 'Parry');
    assert.equal(hud.getActiveAnnouncement()?.memberName, 'Valerie');

    const discoveredSkillName = getOrCreateMockElement('discovered-skill-name');
    assert.equal(unlockModal.classList.contains('active'), false, 'unlock-modal must now be hidden');
    assert.ok(skillModal.classList.contains('active'), 'skill-discovered-modal must now be active');
    assert.equal(discoveredSkillName.innerText, 'Valerie discovered Parry!', 'Announcement must explicitly attribute Valerie for Parry');

    // 4. Wait for auto-dismiss timer of Modal 2 (100ms) + transition delay (200ms)
    await sleep(350);

    // 5. Modal 3 must now be displayed automatically for Kaelen
    assert.equal(hud.isAnnouncementShowing(), true, 'Third announcement must be active');
    assert.equal(hud.getPendingAnnouncementCount(), 0, 'Queue must now be empty');
    assert.equal(hud.getActiveAnnouncement()?.data.name, 'Dual Wielding');
    assert.equal(hud.getActiveAnnouncement()?.memberName, 'Kaelen');
    assert.equal(discoveredSkillName.innerText, 'Kaelen discovered Dual Wielding!', 'Announcement must explicitly attribute Kaelen');

    // 6. Wait for Modal 3 auto-dismiss (100ms) + transition (200ms)
    await sleep(350);

    assert.equal(hud.isAnnouncementShowing(), false, 'All announcements finished');
    assert.equal(unlockModal.classList.contains('active'), false);
    assert.equal(skillModal.classList.contains('active'), false);

    hud.destroy();
    console.log('✔ Test 1 passed: 3 simultaneous same-tick unlocks queued and auto-advanced with zero drops or overwrites');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Dual Dismissal & Early-Click Timer Cancellation Test
  // ---------------------------------------------------------------------------
  {
    console.log('\n[TEST 2] Testing Early Click Dismissal & Auto-Dismiss Timer Cancellation...');
    const hud = new HUD();
    hud.clearAnnouncementQueue();

    const skill1 = { name: 'Resilience', description: 'Reduces damage' };
    const skill2 = { name: 'Evasion', description: 'Dodges attacks' };

    // Set a long auto-dismiss timeout of 2000ms
    hud.showSkillDiscoveredModal(skill1, 'Valerie', 2000);
    hud.showSkillDiscoveredModal(skill2, 'Barris', 2000);

    assert.equal(hud.getActiveAnnouncement()?.data.name, 'Resilience');
    assert.equal(hud.getPendingAnnouncementCount(), 1);

    // User clicks modal early after 100ms
    await sleep(100);
    const skillModal = getOrCreateMockElement('skill-discovered-modal');
    skillModal.click(); // Triggers dismissCurrentAnnouncement()

    // Modal 1 closes immediately, and 200ms transition brings up Modal 2
    await sleep(250);
    assert.equal(hud.getActiveAnnouncement()?.data.name, 'Evasion');
    assert.equal(hud.getActiveAnnouncement()?.memberName, 'Barris');

    // CRITICAL USER VERIFICATION:
    // If Modal 1's 2000ms timer was NOT cancelled on early dismissal, it would fire around t=2000ms.
    // Let's advance time to t=2100ms and verify Modal 2 did NOT get prematurely killed by Modal 1's ghost timer!
    await sleep(400); // Now well after the click
    assert.equal(hud.getActiveAnnouncement()?.data.name, 'Evasion', 'Modal 2 must remain active; Modal 1 timer must not have killed it');
    assert.equal(hud.isAnnouncementShowing(), true);

    // Now click Modal 2 to dismiss early as well
    skillModal.click();
    await sleep(250);
    assert.equal(hud.isAnnouncementShowing(), false, 'Queue fully dismissed');

    hud.destroy();
    console.log('✔ Test 2 passed: Early click dismissal successfully cancels auto-dismiss timer and advances queue safely');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Full EXP Transaction Log Across Multiple Party Members
  // ---------------------------------------------------------------------------
  {
    console.log('\n[TEST 3] Testing Live EXP Transaction Log Across Multiple Party Members...');
    ProgressionSystem.clearExpLog();

    const heroProg = new ProgressionSystem(mockClassesData, 'Guild Hero');
    const valerieProg = new ProgressionSystem(mockClassesData, 'Valerie');
    const kaelenProg = new ProgressionSystem(mockClassesData, 'Kaelen');

    // Grant EXP across different characters and stats
    heroProg.addProficiencyExp('foraging', 15);
    valerieProg.addProficiencyExp('short_swords', 2);
    kaelenProg.addProficiencyExp('alchemy', 25);
    valerieProg.addProficiencyExp('daggers', 5);

    const log = ProgressionSystem.getExpLog();
    assert.equal(log.length, 4, 'Must have recorded exactly 4 EXP transactions');

    assert.equal(log[0].id, 'foraging');
    assert.equal(log[0].amount, 15);
    assert.equal(log[0].memberName, 'Guild Hero');

    assert.equal(log[1].id, 'short_swords');
    assert.equal(log[1].amount, 2);
    assert.equal(log[1].memberName, 'Valerie');

    assert.equal(log[2].id, 'alchemy');
    assert.equal(log[2].amount, 25);
    assert.equal(log[2].memberName, 'Kaelen');

    assert.equal(log[3].id, 'daggers');
    assert.equal(log[3].amount, 5);
    assert.equal(log[3].memberName, 'Valerie');

    // Verify DOM rendering via HUD
    const hud = new HUD();
    const expLogList = getOrCreateMockElement('debug-exp-log-list');
    assert.ok(expLogList.children.length >= 4, 'DOM list must contain the 4 entries');

    const firstChildHtml = expLogList.children[0].innerHTML;
    assert.ok(firstChildHtml.includes('+15 EXP'));
    assert.ok(firstChildHtml.includes('foraging'));
    assert.ok(firstChildHtml.includes('(Guild Hero)'));

    // Test Clear button
    const clearBtn = getOrCreateMockElement('debug-clear-exp-log-btn');
    clearBtn.click();
    assert.equal(ProgressionSystem.getExpLog().length, 0, 'EXP log must be cleared');
    assert.equal(expLogList.innerHTML, '', 'DOM list must be cleared');

    hud.destroy();
    console.log('✔ Test 3 passed: Live EXP transaction logging tracks all members and formats accurately');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Debug Panel Party Member Switcher & Multi-Member Stat Sheets
  // ---------------------------------------------------------------------------
  {
    console.log('\n[TEST 4] Testing Debug Panel Party Member Switcher...');
    const heroProg = new ProgressionSystem(mockClassesData, 'Guild Hero');
    const valerieProg = new ProgressionSystem(mockClassesData, 'Valerie');

    // Give distinct stats
    heroProg.addProficiencyExp('short_swords', 50); // Lv1
    valerieProg.addProficiencyExp('daggers', 50); // Lv1
    valerieProg.addProficiencyExp('evasion', 25); // Lv0 (25/50)

    const heroMock: any = {
      id: 'hero',
      entityName: 'Guild Hero',
      progression: heroProg,
      equippedWeapon: { id: 'short_swords', name: 'Short Sword' },
      equippedSkillIds: [],
      activeStatusEffects: new Set(),
      wellFedRemainingMs: 0,
      hp: 50,
      maxHp: 50,
      criticalHp: 50,
      maxCriticalHp: 50,
      energy: 100,
      maxEnergy: 100,
      hunger: 100,
      maxHunger: 100,
      mood: 80,
      maxMood: 100,
      state: 'idle'
    };
    const valerieMock: any = {
      id: 'valerie',
      entityName: 'Valerie',
      progression: valerieProg,
      equippedWeapon: { id: 'daggers', name: 'Iron Dagger' },
      equippedSkillIds: [],
      activeStatusEffects: new Set(),
      wellFedRemainingMs: 0,
      hp: 40,
      maxHp: 40,
      criticalHp: 40,
      maxCriticalHp: 40,
      energy: 100,
      maxEnergy: 100,
      hunger: 100,
      maxHunger: 100,
      mood: 80,
      maxMood: 100,
      state: 'idle'
    };

    const hud = new HUD();
    hud.setDebugSkillsPanelVisible(true);

    // Initial update with party of 2
    hud.update(heroMock, heroProg, 0, [heroMock, valerieMock]);

    const selectEl = getOrCreateMockElement('debug-member-select') as any;
    assert.ok(selectEl.innerHTML.includes('Guild Hero (Leader)'));
    assert.ok(selectEl.innerHTML.includes('Valerie'));

    const debugSkillsList = getOrCreateMockElement('debug-skills-list');

    // When Leader (index 0) is selected: short_swords is Lv1, daggers is Lv0
    assert.ok(debugSkillsList.innerHTML.includes('short_swords:</span> Level 1'));
    assert.ok(debugSkillsList.innerHTML.includes('daggers:</span> Level 0 (0/50 EXP)'));

    // Switch dropdown to Valerie (index 1)
    selectEl.value = '1';
    selectEl.trigger('change');

    // Next frame update with party
    hud.update(heroMock, heroProg, 16, [heroMock, valerieMock]);

    // When Valerie is selected: short_swords is Lv0, daggers is Lv1, evasion has 25 EXP
    assert.ok(debugSkillsList.innerHTML.includes('short_swords:</span> Level 0 (0/50 EXP)'));
    assert.ok(debugSkillsList.innerHTML.includes('daggers:</span> Level 1 (0/54 EXP)'));
    assert.ok(debugSkillsList.innerHTML.includes('evasion:</span> Level 0 (25/50 EXP)'));

    hud.destroy();
    console.log('✔ Test 4 passed: Debug panel successfully switches between party members, displaying hidden progress for companions');
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Combat Medic 5th Revive Scenario with Coinciding Level 1 Unlock
  // ---------------------------------------------------------------------------
  {
    console.log('\n[TEST 5] Testing Combat Medic 5th Revive Scenario with Coinciding Unlock...');
    const hud = new HUD();
    hud.clearAnnouncementQueue();

    const valerieProg = new ProgressionSystem(mockClassesData, 'Valerie');

    // Wire callbacks as scenes do
    valerieProg.onClassUnlocked((event) => {
      hud.showClassUnlockModal(event.classDef, event.memberName || 'Valerie', 100);
    });
    valerieProg.onSkillDiscovered((event) => {
      const def = dataLoader.getTrainableStatDef(event.skillId);
      if (def) hud.showSkillDiscoveredModal(def, event.memberName || 'Valerie', 100);
    });

    // Revives 1 through 4
    for (let i = 1; i <= 4; i++) {
      valerieProg.recordActivity('Ally Revived', 1);
    }
    assert.equal(valerieProg.isClassUnlocked('combat_medic'), false);
    assert.equal(hud.isAnnouncementShowing(), false);

    // On the 5th revive, Valerie also gains 50 EXP in short_swords crossing Level 1 in the exact same tick
    valerieProg.recordActivity('Ally Revived', 1); // Triggers Combat Medic unlock
    valerieProg.addProficiencyExp('short_swords', 50); // Triggers short_swords discovery

    assert.equal(valerieProg.isClassUnlocked('combat_medic'), true);
    assert.equal(valerieProg.getProficiencyLevel('short_swords'), 1);

    // Both announcements must be queued sequentially!
    assert.equal(hud.isAnnouncementShowing(), true);
    assert.equal(hud.getPendingAnnouncementCount(), 1, 'Second unlock must be waiting in queue, not dropped');

    // First modal is Combat Medic
    assert.equal(hud.getActiveAnnouncement()?.data.name, 'Combat Medic');
    assert.equal(hud.getActiveAnnouncement()?.memberName, 'Valerie');

    // Wait for auto-dismiss (100ms) + transition (200ms)
    await sleep(350);

    // Second modal is Short Swords
    assert.equal(hud.getActiveAnnouncement()?.data.name, 'Short Swords');
    assert.equal(hud.getActiveAnnouncement()?.memberName, 'Valerie');

    // Wait for auto-dismiss (100ms) + transition (200ms)
    await sleep(350);
    assert.equal(hud.isAnnouncementShowing(), false, 'Both announcements fully shown in sequence');

    hud.destroy();
    console.log('✔ Test 5 passed: Combat Medic on 5th revive reliably announced alongside coinciding level up');
  }

  console.log('\n========================================');
  console.log('ALL PRE-MILESTONE-13 TESTS PASSED! 🎉');
  console.log('========================================\n');
}

run().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
