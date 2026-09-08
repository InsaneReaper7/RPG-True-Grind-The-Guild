import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { LevelingSystem } from '../src/systems/LevelingSystem.ts';
import { DataLoader } from '../src/utils/DataLoader.ts';
import type { ClassesData } from '../src/types/game.ts';

// Setup node mock fetch to read actual project JSON files
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

console.log('--- RUNNING MILESTONE 9.0: UNIVERSAL HIDDEN-UNTIL-LEVEL-1 UNIT TESTS ---');

const mockClassesData: ClassesData = {
  classes: [
    {
      id: 'fencer',
      name: 'Fencer',
      tier: 'novice',
      requirements: [{ type: 'proficiency', target: 'short_swords', value: 10 }],
      fantasy: 'Quick, light-footed duelist'
    }
  ]
};

const ALL_13_TRAINABLE_STATS = [
  'short_swords',
  'daggers',
  'shields',
  'dual_wielding',
  'construction',
  'alchemy',
  'evasion',
  'parry',
  'block',
  'counterattack',
  'resilience',
  'health_regen',
  'mana_regen'
] as const;

async function run() {
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  // -----------------------------------------------------------------------------
  // TEST 1: Fresh character shows zero revealed trainable stats
  // -----------------------------------------------------------------------------
  {
    const prog = new ProgressionSystem(mockClassesData);
    const stats = prog.getAllProficiencyStats();

    assert.equal(stats.size, 13, 'Must track exactly 13 trainable stats');

    for (const statId of ALL_13_TRAINABLE_STATS) {
      assert.ok(stats.has(statId), `Stat '${statId}' must be initialized in progression`);
      const stat = stats.get(statId)!;
      assert.equal(stat.level, 0, `'${statId}' must start at Level 0`);
      assert.equal(stat.currentExp, 0, `'${statId}' must start at 0 EXP`);
      assert.equal(prog.isStatRevealed(statId), false, `'${statId}' must NOT be revealed at Level 0`);
      assert.equal(prog.isHiddenSkillRevealed(statId), false, `Compatibility isHiddenSkillRevealed must return false for '${statId}'`);
    }

    console.log('✔ Test 1 passed: Fresh character shows zero revealed trainable stats across all 13 stats');
  }

  // -----------------------------------------------------------------------------
  // TEST 2: Accumulating partial EXP (up to 49 EXP) produces ZERO revealed stats
  // -----------------------------------------------------------------------------
  {
    const prog = new ProgressionSystem(mockClassesData);
    let discoveredCount = 0;
    prog.onSkillDiscovered(() => {
      discoveredCount++;
    });

    // Grant 49 EXP across weapons, professions, techniques, and hidden skills
    for (const statId of ALL_13_TRAINABLE_STATS) {
      prog.addProficiencyExp(statId, 49);
      assert.equal(prog.getProficiencyLevel(statId), 0, `'${statId}' must strictly remain Level 0 after 49 EXP`);
      assert.equal(prog.isStatRevealed(statId), false, `'${statId}' must strictly remain UNREVEALED after 49 EXP`);
    }

    assert.equal(discoveredCount, 0, 'Zero discovery events must fire while stats are at Level 0 (49/50 EXP)');
    console.log('✔ Test 2 passed: Partial EXP (49/50) leaves all 13 stats strictly unrevealed with 0 discovery events');
  }

  // -----------------------------------------------------------------------------
  // TEST 3: Crossing Level 1 (50 EXP) triggers uniform Skill Discovered event
  // -----------------------------------------------------------------------------
  {
    const prog = new ProgressionSystem(mockClassesData);
    const discoveredEvents: Array<{ skillId: string; level: number }> = [];

    prog.onSkillDiscovered((e) => {
      discoveredEvents.push(e);
    });

    // Cross Level 1 on Short Swords, Daggers, Shields, Construction, Alchemy, Dual Wielding
    const testStats = ['short_swords', 'daggers', 'shields', 'construction', 'alchemy', 'dual_wielding', 'evasion'];

    for (const statId of testStats) {
      const res = prog.addProficiencyExp(statId, 50);
      assert.equal(res.leveledUp, true, `Adding 50 EXP to '${statId}' must level up`);
      assert.equal(prog.getProficiencyLevel(statId), 1, `'${statId}' must now be Level 1`);
      assert.equal(prog.isStatRevealed(statId), true, `'${statId}' must now be revealed`);
    }

    assert.equal(discoveredEvents.length, testStats.length, 'Each stat reaching Level 1 must fire discovery once');

    for (let i = 0; i < testStats.length; i++) {
      const expectedId = testStats[i];
      assert.equal(discoveredEvents[i].skillId, expectedId, `Discovered event skillId mismatch at index ${i}`);
      assert.equal(discoveredEvents[i].level, 1, `Discovered event level must be 1`);
    }

    // Level 1 -> 2 advancement (e.g. +54 EXP): Discovery must NOT fire again
    prog.addProficiencyExp('short_swords', 54);
    assert.equal(prog.getProficiencyLevel('short_swords'), 2);
    assert.equal(discoveredEvents.length, testStats.length, 'Advancing Level 1->2 must not fire discovery again');

    console.log('✔ Test 3 passed: Crossing Level 1 triggers uniform Skill Discovered event across weapons, professions & techniques');
  }

  // -----------------------------------------------------------------------------
  // TEST 4: DataLoader.getTrainableStatDef returns valid definitions for all 13 stats
  // -----------------------------------------------------------------------------
  {
    for (const statId of ALL_13_TRAINABLE_STATS) {
      const def = dataLoader.getTrainableStatDef(statId);
      assert.ok(def, `DataLoader must return definition for '${statId}'`);
      assert.ok(def.name && def.name.length > 0, `Definition for '${statId}' must have non-empty name`);
      assert.ok(def.description && def.description.length > 0, `Definition for '${statId}' must have non-empty description`);
    }

    console.log('✔ Test 4 passed: DataLoader.getTrainableStatDef provides valid metadata for all 13 stats');
  }

  // -----------------------------------------------------------------------------
  // TEST 5: Multi-member progression isolation
  // -----------------------------------------------------------------------------
  {
    const leaderProg = new ProgressionSystem(mockClassesData);
    const companionProg = new ProgressionSystem(mockClassesData);

    let leaderDiscovery: string | null = null;
    let companionDiscovery: string | null = null;

    leaderProg.onSkillDiscovered((e) => {
      leaderDiscovery = e.skillId;
    });
    companionProg.onSkillDiscovered((e) => {
      companionDiscovery = e.skillId;
    });

    // Companion trains Daggers to Level 1
    companionProg.addProficiencyExp('daggers', 50);
    assert.equal(companionDiscovery, 'daggers', 'Companion must discover Daggers');
    assert.equal(companionProg.isStatRevealed('daggers'), true, 'Companion Daggers must be revealed');

    // Leader's Daggers must remain strictly unrevealed at Level 0
    assert.equal(leaderProg.getProficiencyLevel('daggers'), 0, "Leader's Daggers must remain Level 0");
    assert.equal(leaderProg.isStatRevealed('daggers'), false, "Leader's Daggers must remain unrevealed");
    assert.equal(leaderDiscovery, null, 'Leader must receive NO discovery event from companion progress');

    // Leader trains Shields to Level 1
    leaderProg.addProficiencyExp('shields', 50);
    assert.equal(leaderDiscovery, 'shields', 'Leader must discover Shields');
    assert.equal(leaderProg.isStatRevealed('shields'), true, 'Leader Shields must be revealed');

    // Companion's Shields must remain strictly unrevealed at Level 0
    assert.equal(companionProg.getProficiencyLevel('shields'), 0, "Companion's Shields must remain Level 0");
    assert.equal(companionProg.isStatRevealed('shields'), false, "Companion's Shields must remain unrevealed");

    console.log('✔ Test 5 passed: Multi-member isolation strictly verified with zero state leakage');
  }

  // -----------------------------------------------------------------------------
  // TEST 6: Party Overview live DOM simulation with in-place mid-session reveal
  // -----------------------------------------------------------------------------
  {
    class MockDOMElement {
      public tagName: string;
      public dataset: Record<string, string> = {};
      public style: Record<string, any> = {};
      public children: MockDOMElement[] = [];
      public innerHTMLSetCount: number = 0;
      private _textContent: string = '';
      private _innerHTML: string = '';

      constructor(tagName: string) {
        this.tagName = tagName.toUpperCase();
      }

      get textContent(): string {
        return this._textContent;
      }
      set textContent(val: string) {
        this._textContent = String(val);
      }

      get innerText(): string {
        return this._textContent;
      }
      set innerText(val: string) {
        this._textContent = String(val);
      }

      get innerHTML(): string {
        return this._innerHTML;
      }
      set innerHTML(html: string) {
        this._innerHTML = html;
        this.innerHTMLSetCount++;
      }

      querySelector(selector: string): MockDOMElement | null {
        const match = (el: MockDOMElement): boolean => {
          if (selector.startsWith('[')) {
            const m = /\[([a-zA-Z0-9-]+)(?:="([^"]*)")?\]/.exec(selector);
            if (m) {
              const attr = m[1];
              const val = m[2];
              const dataKey = attr.startsWith('data-') ? attr.slice(5) : attr;
              const camelKey = dataKey.replace(/-([a-z])/g, (_, g) => g.toUpperCase());
              const hasAttr = el.dataset[attr] !== undefined || el.dataset[dataKey] !== undefined || el.dataset[camelKey] !== undefined;
              if (!hasAttr) return false;
              if (val !== undefined) {
                return el.dataset[attr] === val || el.dataset[dataKey] === val || el.dataset[camelKey] === val;
              }
              return true;
            }
          }
          return false;
        };

        const traverse = (el: MockDOMElement): MockDOMElement | null => {
          if (match(el)) return el;
          for (const ch of el.children) {
            const res = traverse(ch);
            if (res) return res;
          }
          return null;
        };

        return traverse(this);
      }
    }

    // Build simulated Party Overview card for a member
    const memberProg = new ProgressionSystem(mockClassesData);
    const card = new MockDOMElement('div');

    const noProfEl = new MockDOMElement('div');
    noProfEl.dataset['partyNoProf'] = '0';
    noProfEl.style['display'] = 'block';
    noProfEl.textContent = 'No proficiencies discovered';
    card.children.push(noProfEl);

    const rowMap = new Map<string, { row: MockDOMElement; val: MockDOMElement }>();

    for (const statId of ALL_13_TRAINABLE_STATS) {
      const row = new MockDOMElement('div');
      row.dataset['partyProfRow'] = `0-${statId}`;
      row.style['display'] = 'none'; // strictly hidden until level >= 1

      const val = new MockDOMElement('span');
      val.dataset['partyProfVal'] = `0-${statId}`;
      val.textContent = 'Lv 0 (0/50)';
      row.children.push(val);

      card.children.push(row);
      rowMap.set(statId, { row, val });
    }

    // Phase A: Fresh character verification
    assert.equal(noProfEl.style['display'], 'block');
    for (const statId of ALL_13_TRAINABLE_STATS) {
      const entry = rowMap.get(statId)!;
      assert.equal(entry.row.style['display'], 'none', `'${statId}' row must be hidden at Level 0`);
    }

    // Phase B: Simulate live gameplay tick where Short Swords crosses Level 1
    memberProg.addProficiencyExp('short_swords', 50);
    assert.equal(memberProg.getProficiencyLevel('short_swords'), 1);

    // In-place live update function (mirrors HUD.updatePartyOverviewLiveStats)
    function updateLiveStats() {
      let hasAnyRevealed = false;
      for (const [statId, stat] of memberProg.getAllProficiencyStats().entries()) {
        const row = card.querySelector(`[data-party-prof-row="0-${statId}"]`);
        const val = card.querySelector(`[data-party-prof-val="0-${statId}"]`);
        if (stat.level >= 1) {
          hasAnyRevealed = true;
          if (row && row.style['display'] !== 'flex') {
            row.style['display'] = 'flex';
          }
          if (val) {
            const nextExp = LevelingSystem.expForNextLevel(stat.level);
            val.textContent = `Lv ${stat.level} (${stat.currentExp}/${nextExp})`;
          }
        } else {
          if (row && row.style['display'] !== 'none') {
            row.style['display'] = 'none';
          }
        }
      }
      const noProf = card.querySelector('[data-party-no-prof="0"]');
      if (noProf) {
        noProf.style['display'] = hasAnyRevealed ? 'none' : 'block';
      }
    }

    updateLiveStats();

    // Verify Short Swords is revealed and noProf is hidden
    assert.equal(noProfEl.style['display'], 'none', 'No-prof message must be hidden once any stat is revealed');
    assert.equal(rowMap.get('short_swords')!.row.style['display'], 'flex', 'Short Swords row must become visible');
    assert.equal(rowMap.get('short_swords')!.val.textContent, 'Lv 1 (0/54)', 'Short Swords text must update to Lv 1 (0/54)');

    // Verify all other stats remain strictly hidden
    for (const statId of ALL_13_TRAINABLE_STATS) {
      if (statId === 'short_swords') continue;
      assert.equal(rowMap.get(statId)!.row.style['display'], 'none', `'${statId}' must remain hidden at Level 0`);
    }

    // Phase C: Multi-stat reveal mid-session (Shields & Construction reach Level 1)
    memberProg.addProficiencyExp('shields', 50);
    memberProg.addProficiencyExp('construction', 50);
    updateLiveStats();

    assert.equal(rowMap.get('shields')!.row.style['display'], 'flex', 'Shields must reveal on reaching Level 1');
    assert.equal(rowMap.get('shields')!.val.textContent, 'Lv 1 (0/54)');
    assert.equal(rowMap.get('construction')!.row.style['display'], 'flex', 'Construction must reveal on reaching Level 1');
    assert.equal(rowMap.get('construction')!.val.textContent, 'Lv 1 (0/54)');

    // Still unrevealed stats remain hidden
    assert.equal(rowMap.get('alchemy')!.row.style['display'], 'none');
    assert.equal(rowMap.get('daggers')!.row.style['display'], 'none');
    assert.equal(rowMap.get('dual_wielding')!.row.style['display'], 'none');

    console.log('✔ Test 6 passed: Party Overview in-place DOM transitions verify 0 visible stats at Lv0, followed by independent in-place reveals');
  }

  console.log('\nALL MILESTONE 9.0 UNIT TESTS PASSED SUCCESSFULLY! 🎉\n');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
