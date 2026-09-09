import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { HUD } from '../src/ui/HUD.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';
import type { ClassesData } from '../src/types/game.ts';

// Mock fetch for DataLoader
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

// Lightweight DOM mock
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
    this._html = String(val);
    this.children = [];
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

  public addEventListener(event: string, cb: (e: any) => void): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  public dispatchEvent(e: { type: string }): void {
    const handlers = this.listeners[e.type] || [];
    for (const h of handlers) h(e);
  }

  public querySelector<T = MockDOMElement>(_selector: string): T | null {
    return null;
  }

  public querySelectorAll(_selector: string): MockDOMElement[] {
    return [];
  }
}

const mockDOM: Record<string, MockDOMElement> = {};
function getOrCreateMockElement(id: string): MockDOMElement {
  if (!mockDOM[id]) {
    mockDOM[id] = new MockDOMElement('div');
    mockDOM[id].id = id;
  }
  return mockDOM[id];
}

(global as any).document = {
  getElementById: (id: string) => getOrCreateMockElement(id),
  createElement: (tag: string) => new MockDOMElement(tag)
};
(global as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {}
};

console.log('--- RUNNING LOCKED CONTENT VISIBILITY & EXP AUDIT TESTS ---');

async function run() {
  await DataLoader.getInstance().loadAll();
  const dl = DataLoader.getInstance();
  const classesData: ClassesData = dl.getClassesData();

  // --------------------------------------------------------------------------
  // TEST 1: Fresh character state — Skill Loadout Modal has 0 classes & 0 skills
  // --------------------------------------------------------------------------
  console.log('\n[TEST 1] Fresh Character State in Skill Loadout Modal...');
  ProgressionSystem.clearExpLog();
  ProgressionSystem.resetExpListeners();

  const heroProg = new ProgressionSystem(classesData, 'Guild Hero');
  const hud = new HUD();
  hud.setLocation('Guild Outpost (Safe Zone)', true);

  const mockHero: any = {
    id: 'hero',
    entityName: 'Guild Hero',
    activeClass: null,
    knownSkillIds: [],
    equippedSkillIds: [],
    progression: heroProg,
    hp: 100,
    maxHp: 100,
    energy: 100,
    maxEnergy: 100,
    equippedWeapon: { id: 'rusty_shortsword', name: 'Rusty Shortsword' },
    lastSkillUseTimes: new Map(),
    activeStatusEffects: new Map(),
    state: 'idle',
    isAutocastEnabled: () => true,
    setActiveClass: function(cls: string | null) { this.activeClass = cls; },
    isSkillLearnedFromBook: () => false
  };

  hud.openLoadoutModal(mockHero, heroProg);

  const activeClassContainer = getOrCreateMockElement('active-class-container');
  const knownSkillsContainer = getOrCreateMockElement('known-skills-container');
  const equipSlotsContainer = getOrCreateMockElement('equip-slots-container');

  console.log('Active Class cards rendered:', activeClassContainer.children.length);
  console.log('Known Skills cards rendered:', knownSkillsContainer.children.length);
  console.log('Equipped Slots rendered:', equipSlotsContainer.children.length);

  assert.equal(activeClassContainer.children.length, 0, 'Fresh character must show ZERO active class cards');
  assert.equal(knownSkillsContainer.children.length, 0, 'Fresh character must show ZERO known skill cards');
  assert.equal(equipSlotsContainer.children.length, 5, 'Must render 5 empty equip slots');
  console.log('✔ Test 1 passed: Fresh character shows zero classes and zero skills in Skill Loadout modal');

  // --------------------------------------------------------------------------
  // TEST 2: Dynamic Class Unlock & Reveal
  // --------------------------------------------------------------------------
  console.log('\n[TEST 2] Dynamic Class Unlock & Reveal (Short Swords -> Level 10 -> Fencer)...');
  heroProg.addProficiencyExp('short_swords', 680); // Level 10

  // Verify Fencer is unlocked
  assert.equal(heroProg.isClassUnlocked('fencer'), true, 'Fencer should now be unlocked');
  assert.equal(heroProg.getClassLevel('fencer'), 1, 'Fencer should be Level 1');

  // Simulate Player's checkSkillUnlocks
  mockHero.knownSkillIds.push('power_strike', 'thrust');
  mockHero.equippedSkillIds.push('power_strike', 'thrust');
  mockHero.activeClass = 'fencer';

  // Re-render loadout modal
  hud.renderLoadoutModal(mockHero, heroProg);

  console.log('Active Class cards after unlock:', activeClassContainer.children.length);
  console.log('Known Skills cards after unlock:', knownSkillsContainer.children.length);

  assert.equal(activeClassContainer.children.length, 1, 'Exactly 1 active class card (Fencer) rendered');
  assert.equal(knownSkillsContainer.children.length, 2, 'Exactly 2 skills (Power Strike, Thrust) rendered');
  console.log('✔ Test 2 passed: Fencer and its skills revealed dynamically upon unlock, other classes remain hidden');

  // --------------------------------------------------------------------------
  // TEST 3: Companion Isolation
  // --------------------------------------------------------------------------
  console.log('\n[TEST 3] Companion Isolation in Skill Loadout Modal...');
  const valerieProg = new ProgressionSystem(classesData, 'Valerie');
  const mockValerie: any = {
    id: 'companion_1',
    entityName: 'Valerie',
    activeClass: null,
    knownSkillIds: [],
    equippedSkillIds: [],
    progression: valerieProg,
    hp: 80,
    maxHp: 80,
    energy: 90,
    maxEnergy: 90,
    equippedWeapon: { id: 'apprentice_wand', name: 'Apprentice Wand' },
    lastSkillUseTimes: new Map(),
    activeStatusEffects: new Map(),
    state: 'idle',
    isAutocastEnabled: () => true,
    setActiveClass: function(cls: string | null) { this.activeClass = cls; },
    isSkillLearnedFromBook: () => false
  };

  hud.update(mockHero, heroProg, 0, [mockHero, mockValerie]);

  // Render Valerie's loadout
  hud.renderLoadoutModal(mockValerie, valerieProg);

  assert.equal(activeClassContainer.children.length, 0, 'Valerie must have ZERO active class cards (Fencer is locked for her)');
  assert.equal(knownSkillsContainer.children.length, 0, 'Valerie must have ZERO known skills cards');

  // Now unlock Combat Medic for Valerie
  for (let i = 0; i < 5; i++) {
    valerieProg.recordActivity('Ally Revived', 1);
  }
  assert.equal(valerieProg.isClassUnlocked('combat_medic'), true, 'Combat Medic unlocked for Valerie');
  assert.equal(heroProg.isClassUnlocked('combat_medic'), false, 'Combat Medic remains locked for Guild Hero');

  mockValerie.knownSkillIds.push('first_aid');
  mockValerie.equippedSkillIds.push('first_aid');
  mockValerie.activeClass = 'combat_medic';

  hud.renderLoadoutModal(mockValerie, valerieProg);
  assert.equal(activeClassContainer.children.length, 1, 'Valerie now shows Combat Medic card');
  assert.equal(knownSkillsContainer.children.length, 1, 'Valerie now shows First Aid card');

  // Switch back to Hero: Hero has Fencer, NOT Combat Medic
  hud.renderLoadoutModal(mockHero, heroProg);
  assert.equal(activeClassContainer.children.length, 1, 'Hero still shows Fencer');
  assert.equal(knownSkillsContainer.children.length, 2, 'Hero still shows Power Strike and Thrust');
  console.log('✔ Test 3 passed: Complete per-character loadout and unlock isolation verified');

  // --------------------------------------------------------------------------
  // TEST 4: 10 Successive Scene Transitions & EXP Listener Lifecycle Audit
  // --------------------------------------------------------------------------
  console.log('\n[TEST 4] 10 Successive Scene Transitions & EXP Transaction Lifecycle Audit...');
  ProgressionSystem.clearExpLog();
  const expLogList = getOrCreateMockElement('debug-exp-log-list');
  expLogList.innerHTML = '';

  let currentHud = hud;

  // Simulate 10 scene transitions: Outpost -> Main -> Outpost -> Main ...
  for (let i = 0; i < 10; i++) {
    // Shutdown old HUD
    currentHud.destroy();
    // Instantiate new HUD in new scene
    currentHud = new HUD();
    currentHud.setLocation(i % 2 === 0 ? 'Dungeon Floor 1' : 'Guild Outpost', i % 2 !== 0);
  }

  // Verify only 1 active listener exists in ProgressionSystem
  const initialExp = heroProg.getProficiencyStat('health_regen').currentExp;
  const initialLogCount = ProgressionSystem.getExpLog().length;
  const initialDomCount = expLogList.children.length;

  console.log('Granting +1 EXP to health_regen after 10 scene transitions...');
  heroProg.addProficiencyExp('health_regen', 1);

  const updatedExp = heroProg.getProficiencyStat('health_regen').currentExp;
  const updatedLogCount = ProgressionSystem.getExpLog().length;
  const updatedDomCount = expLogList.children.length;

  console.log(`Stat currentExp: ${initialExp} -> ${updatedExp} (+${updatedExp - initialExp})`);
  console.log(`ExpLog entries: ${initialLogCount} -> ${updatedLogCount} (+${updatedLogCount - initialLogCount})`);
  console.log(`DOM entries added: ${updatedDomCount - initialDomCount}`);

  assert.equal(updatedExp - initialExp, 1, 'Stat must have increased by exactly 1');
  assert.equal(updatedLogCount - initialLogCount, 1, 'ExpLog must have recorded exactly 1 transaction');
  assert.equal(updatedDomCount - initialDomCount, 1, 'DOM must have received exactly 1 entry (ZERO duplicate broadcasts)');

  // Grant another EXP to Valerie
  valerieProg.addProficiencyExp('alchemy', 10);
  const valerieUpdatedDomCount = expLogList.children.length;
  assert.equal(valerieUpdatedDomCount - updatedDomCount, 1, 'Valerie grant must produce exactly 1 log entry');

  currentHud.destroy();
  console.log('✔ Test 4 passed: Zero orphaned listener leakage across 10 successive scene transitions; stat and log match 1:1');

  console.log('\n======================================================');
  console.log('ALL LOCKED CONTENT & EXP AUDIT TESTS PASSED! 🎉');
  console.log('======================================================');
}

run().catch((err) => {
  console.error('[FAILED] Test error:', err);
  process.exit(1);
});
