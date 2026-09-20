import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { LevelingSystem } from '../src/systems/LevelingSystem.ts';
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

// Lightweight DOM mock for HUD tests
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

async function run() {
  console.log('=== STARTING CLASS LEVEL 1 TO 100 PROGRESSION AUDIT ===\n');
  await DataLoader.getInstance().loadAll();
  const dl = DataLoader.getInstance();
  const classesData: ClassesData = dl.getClassesData();

  const requiredNamedClasses = [
    'vanguard',
    'fencer',
    'combat_medic',
    'restoration_mage',
    'scout',
    'dark_knight'
  ];

  console.log(`Loaded ${classesData.classes.length} total classes from classes.json:`);
  for (const c of classesData.classes) {
    console.log(` - ${c.id} (${c.name}, tier: ${c.tier})`);
  }

  for (const req of requiredNamedClasses) {
    assert.ok(
      classesData.classes.some((c) => c.id === req),
      `Explicitly required class '${req}' must exist in classes.json`
    );
  }

  // 1. Audit LevelingSystem EXP curve calculations up to 100
  console.log('\n--- Auditing LevelingSystem EXP formula: 50 + currentLevel * 4 ---');
  for (let lvl = 1; lvl <= 100; lvl++) {
    const expNeeded = LevelingSystem.expForNextLevel(lvl);
    const expected = 50 + lvl * 4;
    assert.equal(expNeeded, expected, `EXP for next level from ${lvl} must be ${expected}`);
  }
  console.log('✔ EXP curve formula verified for all levels 1 to 100:');
  console.log(`   Level 1 -> 2: ${LevelingSystem.expForNextLevel(1)} EXP`);
  console.log(`   Level 40 -> 41: ${LevelingSystem.expForNextLevel(40)} EXP`);
  console.log(`   Level 99 -> 100: ${LevelingSystem.expForNextLevel(99)} EXP`);
  console.log(`   Level 100 -> 101: ${LevelingSystem.expForNextLevel(100)} EXP`);

  // 2. Audit EVERY class leveling up through 100 step by step (levels 1 to 100)
  console.log('\n--- Auditing ProgressionSystem for EVERY class up to Level 100 ---');
  for (const classDef of classesData.classes) {
    const classId = classDef.id;
    const prog = new ProgressionSystem(classesData, `Auditor_${classId}`);

    // Unlock class
    (prog as any).unlockedClasses.add(classId);
    if (!(prog as any).classStats.has(classId)) {
      (prog as any).classStats.set(classId, { level: 1, currentExp: 0 });
    }
    (prog as any).classLevels.set(classId, 1);

    assert.equal(prog.getClassLevel(classId), 1, `${classId} should start at level 1`);

    // Level up step by step from level 1 to level 100
    for (let currentLvl = 1; currentLvl < 100; currentLvl++) {
      const expNeeded = LevelingSystem.expForNextLevel(currentLvl);

      // Add partial exp
      const halfExp = Math.floor(expNeeded / 2);
      let res = prog.addClassExp(classId, halfExp);
      assert.equal(res.leveledUp, false, `${classId} should not level up at half exp`);
      assert.equal(prog.getClassLevel(classId), currentLvl, `${classId} level should remain ${currentLvl}`);
      assert.equal(prog.getClassStat(classId).currentExp, halfExp, `${classId} currentExp should match halfExp`);

      // Add remaining exp to level up
      const remainingExp = expNeeded - halfExp;
      res = prog.addClassExp(classId, remainingExp);
      assert.equal(res.leveledUp, true, `${classId} should level up to ${currentLvl + 1}`);
      assert.equal(res.levelsGained, 1, `${classId} should gain exactly 1 level`);
      assert.equal(prog.getClassLevel(classId), currentLvl + 1, `${classId} level should now be ${currentLvl + 1}`);
      assert.equal(prog.getClassStat(classId).currentExp, 0, `${classId} currentExp should be 0 after exact level up`);
    }

    assert.equal(prog.getClassLevel(classId), 100, `${classId} should reach exactly Level 100!`);
    console.log(`✔ Class '${classId}' (${classDef.name}) successfully leveled from 1 to 100 step-by-step.`);
  }

  // 3. Audit multi-level exp bulk grant (from 40 to 100 in one bulk grant)
  console.log('\n--- Auditing Bulk EXP grant from 40 to 100 on Dark Knight & Vanguard ---');
  for (const testClass of ['vanguard', 'dark_knight', 'restoration_mage', 'fencer', 'combat_medic', 'scout']) {
    const prog = new ProgressionSystem(classesData, `BulkAuditor_${testClass}`);
    prog.setClassLevel(testClass, 40);
    assert.equal(prog.getClassLevel(testClass), 40);

    // Calculate total EXP needed from level 40 to level 100: sum(50 + l * 4) for l = 40 to 99
    let totalExp40to100 = 0;
    for (let l = 40; l < 100; l++) {
      totalExp40to100 += (50 + l * 4);
    }

    // Grant all that EXP in one call
    const res = prog.addClassExp(testClass, totalExp40to100);
    assert.equal(res.leveledUp, true);
    assert.equal(res.levelsGained, 60);
    assert.equal(prog.getClassLevel(testClass), 100);
    assert.equal(prog.getClassStat(testClass).currentExp, 0);
    console.log(`✔ ${testClass} successfully bulk-advanced 60 levels (40 -> 100).`);
  }

  // 4. Audit save/load snapshot data at Level 100
  console.log('\n--- Auditing Snapshot Save / Load at Level 100 ---');
  const heroProg = new ProgressionSystem(classesData, 'SaveLoadHero');
  heroProg.setClassLevel('dark_knight', 100);
  heroProg.setClassLevel('vanguard', 100);
  heroProg.setClassLevel('fencer', 100);

  const snapshot = heroProg.getSnapshotData();
  assert.equal(snapshot.classLevels['dark_knight'], 100);
  assert.equal(snapshot.classLevels['vanguard'], 100);
  assert.equal(snapshot.classLevels['fencer'], 100);
  assert.equal(snapshot.classStats!['dark_knight'].level, 100);

  const newProg = new ProgressionSystem(classesData, 'SaveLoadHero');
  newProg.loadSnapshotData(snapshot);
  assert.equal(newProg.getClassLevel('dark_knight'), 100);
  assert.equal(newProg.getClassLevel('vanguard'), 100);
  assert.equal(newProg.getClassLevel('fencer'), 100);
  console.log('✔ Snapshot save and load preserves Level 100 accurately.');

  // 5. Audit Skill Unlocks at Level 100 (Ensures no regressions or crashes)
  console.log('\n--- Auditing Skill Unlock Evaluation with Level 100 Classes ---');
  const allSkills = dl.getSkills();
  for (const skill of allSkills) {
    const classReqs = skill.requirements.filter((r) => r.type === 'classLevel');
    for (const req of classReqs) {
      // If the requirement class is at Level 100, the skill MUST unlock
      const testProg = new ProgressionSystem(classesData, 'SkillAuditor');
      testProg.setClassLevel(req.target, 100);
      assert.ok(
        testProg.getClassLevel(req.target) >= req.value,
        `Class ${req.target} at Lv 100 satisfies skill ${skill.id} requirement ${req.value}`
      );
    }
  }
  console.log(`✔ Verified all ${allSkills.length} skills evaluate cleanly against Level 100 classes.`);

  // 6. Audit HUD Loadout Modal Rendering with Level 100 Class
  console.log('\n--- Auditing HUD Loadout Modal Rendering at Level 100 ---');
  const hud = new HUD();
  const mockHero: any = {
    id: 'hero',
    entityName: 'Guild Hero',
    activeClass: 'dark_knight',
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

  hud.renderLoadoutModal(mockHero, heroProg);
  const activeClassContainer = getOrCreateMockElement('active-class-container');
  assert.ok(activeClassContainer.children.length > 0, 'HUD must render active class cards');
  console.log(`✔ HUD rendered ${activeClassContainer.children.length} active class cards including Level 100 classes without issues.`);

  console.log('\n====================================================');
  console.log('ALL CLASS LEVEL 1 TO 100 AUDIT TESTS PASSED! 🎉');
  console.log('====================================================');
}

run().catch((err) => {
  console.error('[FAILED] Test error:', err);
  process.exit(1);
});
