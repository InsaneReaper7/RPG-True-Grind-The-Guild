import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DataLoader } from '../src/utils/DataLoader.ts';
import { ProgressionSystem } from '../src/systems/ProgressionSystem.ts';
import { LevelingSystem } from '../src/systems/LevelingSystem.ts';

console.log('--- RUNNING LIVE DROPDOWN PERSISTENCE SIMULATION TEST ---');

class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public dataset: Record<string, string> = {};
  public style: Record<string, any> = {};
  public classList = {
    _classes: new Set<string>(),
    add: (c: string) => this.classList._classes.add(c),
    remove: (c: string) => this.classList._classes.delete(c),
    contains: (c: string) => this.classList._classes.has(c)
  };
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public onchange: any = null;
  public onclick: any = null;
  public disabled: boolean = false;
  private _textContent: string = '';
  private _innerHTML: string = '';
  public innerHTMLSetCount: number = 0;

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

  get value(): string {
    return this._textContent;
  }
  set value(val: string) {
    this._textContent = String(val);
  }

  get innerHTML(): string {
    return this._innerHTML;
  }
  set innerHTML(html: string) {
    this._innerHTML = html;
    this.innerHTMLSetCount++;
    this.children = [];
    parseHTMLToTree(html, this);
  }

  querySelector<T extends MockElement>(selector: string): T | null {
    const all = this.querySelectorAll<T>(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll<T extends MockElement>(selector: string): T[] {
    const results: T[] = [];
    const match = (el: MockElement): boolean => {
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        return el.classList.contains(cls);
      }
      if (selector.startsWith('[')) {
        const attrMatch = /\[([a-zA-Z0-9-]+)(?:="([^"]*)")?\]/.exec(selector);
        if (attrMatch) {
          const attr = attrMatch[1];
          const val = attrMatch[2];
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
      return el.tagName.toLowerCase() === selector.toLowerCase();
    };

    const traverse = (el: MockElement) => {
      if (match(el)) results.push(el as unknown as T);
      for (const ch of el.children) {
        traverse(ch);
      }
    };

    for (const ch of this.children) {
      traverse(ch);
    }
    return results;
  }
}

function parseHTMLToTree(html: string, root: MockElement) {
  const tokenRegex = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z0-9]+)([^>]*?)(\/?)>|([^<]+)/g;
  const stack: MockElement[] = [root];
  let match;

  while ((match = tokenRegex.exec(html)) !== null) {
    if (match[0].startsWith('<!--')) continue;

    const isClosing = match[1] === '/';
    const tagName = match[2];
    const attrsStr = match[3];
    const isSelfClosing = match[4] === '/' || (tagName && ['br', 'hr', 'img', 'input'].includes(tagName.toLowerCase()));
    const textContent = match[5];

    if (textContent) {
      const trimmed = textContent.trim();
      if (trimmed && stack.length > 0) {
        stack[stack.length - 1].textContent = (stack[stack.length - 1].textContent || '') + trimmed;
      }
    } else if (tagName) {
      if (isClosing) {
        while (stack.length > 1) {
          const top = stack.pop()!;
          if (top.tagName.toLowerCase() === tagName.toLowerCase()) {
            break;
          }
        }
      } else {
        const el = new MockElement(tagName);
        el.parentElement = stack[stack.length - 1];

        if (attrsStr) {
          const classMatch = /class="([^"]*)"/.exec(attrsStr);
          if (classMatch) {
            el.className = classMatch[1];
            classMatch[1].split(/\s+/).forEach(c => c && el.classList.add(c));
          }

          const dataAttrRegex = /data-([a-zA-Z0-9-]+)="([^"]*)"/g;
          let dMatch;
          while ((dMatch = dataAttrRegex.exec(attrsStr)) !== null) {
            const rawKey = dMatch[1];
            const camelKey = rawKey.replace(/-([a-z])/g, (_, g) => g.toUpperCase());
            el.dataset[rawKey] = dMatch[2];
            el.dataset[camelKey] = dMatch[2];
            el.dataset['data-' + rawKey] = dMatch[2];
          }
        }

        stack[stack.length - 1].children.push(el);

        if (!isSelfClosing) {
          stack.push(el);
        }
      }
    }
  }
}

const elementCache = new Map<string, MockElement>();

(global as any).window = {
  addEventListener: () => {},
  removeEventListener: () => {}
};
(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};
(global as any).document = {
  getElementById: (id: string) => {
    if (!elementCache.has(id)) {
      const el = new MockElement('div');
      el.id = id;
      elementCache.set(id, el);
    }
    return elementCache.get(id)!;
  },
  createElement: (tag: string) => new MockElement(tag),
  addEventListener: () => {}
};

async function run() {
  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const { HUD } = await import('../src/ui/HUD.ts');
  const hud = new HUD(null as any);

  const mockPlayer: any = {
    id: 'hero_1',
    entityName: 'Guild Hero',
    state: 'normal',
    hp: 50,
    maxHp: 50,
    criticalHp: 25,
    maxCriticalHp: 25,
    energy: 100,
    maxEnergy: 100,
    hunger: 100,
    maxHunger: 100,
    mood: 80,
    maxMood: 100,
    equippedWeapon: { id: 'short_swords', name: 'Short Swords', baseDamage: 5, category: 'melee_1h', twoHanded: false },
    offhandWeapon: null,
    equippedSkillIds: [],
    knownSkillIds: [],
    lastSkillUseTimes: new Map(),
    progression: new ProgressionSystem({ classes: [] }),
    activeStatusEffects: new Map(),
    isAutocastEnabled: () => false,
    equipWeapon: function(w: any) { this.equippedWeapon = w; },
    equipOffhandWeapon: function(w: any) { this.offhandWeapon = w; }
  };

  // Normal game lifecycle: update is called with initial player & party
  hud.update(mockPlayer, mockPlayer.progression, 0, [mockPlayer]);

  // Open the Party Overview modal
  hud.openPartyOverviewModal();

  const rosterEl: any = (hud as any).partyOverviewRosterEl;
  assert.ok(rosterEl, 'partyOverviewRosterEl must exist');

  assert.equal(hud.isPartyOverviewModalOpen(), true, 'Modal should be open');
  assert.equal(rosterEl.innerHTMLSetCount, 1, 'Initial open should build DOM once');

  const mainSelectBefore = rosterEl.querySelector('.party-main-select');
  assert.ok(mainSelectBefore, 'Main weapon select element must exist');

  console.log('Simulating 500ms of game ticks with live stat changes while dropdown is open...');

  const times = [0, 50, 100, 150, 200, 300, 400, 500];
  for (const t of times) {
    mockPlayer.hp = 50 - (t / 50); // drops from 50 to 40
    mockPlayer.energy = 100 - (t / 20); // drops from 100 to 75
    hud.update(mockPlayer, mockPlayer.progression, t, [mockPlayer]);
  }

  console.log(`rosterEl.innerHTMLSetCount after 500ms of ticks: ${rosterEl.innerHTMLSetCount}`);
  assert.equal(rosterEl.innerHTMLSetCount, 1, 'rosterEl.innerHTML MUST NOT have been called during live stat ticks!');

  const mainSelectAfter = rosterEl.querySelector('.party-main-select');
  assert.equal(mainSelectAfter, mainSelectBefore, 'CRITICAL: <select> element MUST be the exact same object reference (NOT destroyed or recreated)');

  const hpEl = rosterEl.querySelector('[data-party-hp="0"]');
  assert.ok(hpEl, 'HP element must exist');
  assert.equal(hpEl.textContent, '40 / 50', 'Main HP must have updated in-place to 40 / 50');

  const energyEl = rosterEl.querySelector('[data-party-energy="0"]');
  assert.ok(energyEl, 'Energy element must exist');
  assert.equal(energyEl.textContent, '75 / 100', 'Energy must have updated in-place to 75 / 100');

  console.log('✔ Test passed: Dropdown remained open and completely untouched across 500ms of live stat ticks');
  console.log('✔ Test passed: Stat values (HP, Energy) updated in-place without touching interactive DOM elements');

  // Test weapon selection without closing or rebuilding
  const changeEvent = { target: mainSelectBefore };
  mainSelectBefore.value = 'daggers';
  rosterEl.onchange(changeEvent);

  assert.equal(mockPlayer.equippedWeapon.id, 'daggers', 'Weapon should now be daggers');
  assert.equal(rosterEl.innerHTMLSetCount, 1, 'Selecting weapon MUST NOT cause innerHTML rebuild');
  console.log('✔ Test passed: Selecting a weapon equips it in-place without triggering innerHTML card rebuild');

  // Now simulate Dual Wielding unlock
  console.log('\nSimulating Dual Wielding unlock...');
  mockPlayer.progression.getProficiencyStat('short_swords').level = 30;
  mockPlayer.progression.getProficiencyStat('daggers').level = 30;
  mockPlayer.progression.checkDualWieldUnlock();
  assert.equal(mockPlayer.progression.isDualWieldUnlocked(), true, 'DW should now be unlocked');

  // Next game tick detects the unlock flip and does exactly ONE structural rebuild
  hud.update(mockPlayer, mockPlayer.progression, 600, [mockPlayer]);
  assert.equal(rosterEl.innerHTMLSetCount, 2, 'Unlocking DW must cause exactly ONE structural card rebuild');

  const offhandSelectBefore = rosterEl.querySelector('.party-offhand-select');
  assert.ok(offhandSelectBefore, 'Offhand weapon select must now be present and active');

  // Simulate leaving offhand dropdown open across 500ms of live stat ticks
  console.log('Simulating 500ms of ticks with offhand dropdown open...');
  for (const t of [650, 700, 800, 900, 1100]) {
    mockPlayer.hp = 30 + (t / 100);
    hud.update(mockPlayer, mockPlayer.progression, t, [mockPlayer]);
  }

  assert.equal(rosterEl.innerHTMLSetCount, 2, 'Offhand select must NOT be destroyed during live stat ticks');
  const offhandSelectAfter = rosterEl.querySelector('.party-offhand-select');
  assert.equal(offhandSelectAfter, offhandSelectBefore, 'Offhand <select> must remain the exact same DOM node');
  console.log('✔ Test passed: Offhand dropdown persists completely intact across live stat ticks');

  // Advance DW from Level 30 -> 31 (penalty stays 10%, tier boundary stays Adept)
  mockPlayer.progression.getProficiencyStat('dual_wielding').level = 31;
  hud.update(mockPlayer, mockPlayer.progression, 1200, [mockPlayer]);
  assert.equal(rosterEl.innerHTMLSetCount, 2, 'DW level 30->31 must NOT cause card rebuild');

  // Advance DW to Level 60 (penalty changes from 10% to 5%)
  mockPlayer.progression.getProficiencyStat('dual_wielding').level = 60;
  hud.update(mockPlayer, mockPlayer.progression, 1300, [mockPlayer]);
  assert.equal(rosterEl.innerHTMLSetCount, 2, 'DW tier change to Lv60 (-5% penalty) must NOT cause card rebuild');

  const dwPenaltyEl = rosterEl.querySelector('[data-party-dw-penalty="0"]');
  assert.ok(dwPenaltyEl, 'DW penalty element must exist');
  assert.equal(dwPenaltyEl.textContent, 'Dual Wield Penalty: -5% Hit Rate (DW Lv 60)', 'Penalty text must update in-place');
  console.log('✔ Test passed: DW penalty tier changes update in-place without rebuilding card');

  // Equip offhand weapon in-place
  const offhandChangeEvent = { target: offhandSelectBefore };
  offhandSelectBefore.value = 'daggers';
  rosterEl.onchange(offhandChangeEvent);
  assert.equal(mockPlayer.offhandWeapon?.id, 'daggers', 'Offhand weapon must now be equipped');
  assert.equal(rosterEl.innerHTMLSetCount, 2, 'Equipping offhand weapon must NOT cause card rebuild');
  console.log('✔ Test passed: Equipping offhand weapon updates in-place with zero rebuild');

  console.log('\nALL EXTENDED LIVE DROPDOWN PERSISTENCE TESTS PASSED! 🎉');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
