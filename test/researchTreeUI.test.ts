import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

// Intercept phaser3spectorjs require if Phaser probes for it
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'phaser3spectorjs') return {};
  return originalRequire.apply(this, arguments);
};

// Setup mock DOM environment for Node.js
class MockDOMElement {
  public tagName: string;
  private _id: string = '';
  get id(): string {
    return this._id;
  }
  set id(val: string) {
    this._id = val;
    if (val) domRegistry.set(val, this);
  }
  private _className: string = '';
  public classList: any;
  public children: MockDOMElement[] = [];
  public parentElement: MockDOMElement | null = null;
  public style: Record<string, any> = {};
  public dataset: Record<string, string> = {};
  private _innerHTML: string = '';
  get innerHTML(): string {
    return this._innerHTML;
  }
  set innerHTML(val: string) {
    this._innerHTML = val;
    if (val === '') {
      this.children = [];
    }
  }
  public innerText: string = '';
  public textContent: string = '';
  public disabled: boolean = false;
  public title: string = '';
  public onclick: ((...args: any[]) => void) | null = null;
  public onmouseenter: ((...args: any[]) => void) | null = null;
  public onmouseleave: ((...args: any[]) => void) | null = null;
  private attributes: Map<string, string> = new Map();

  get className(): string {
    return this._className;
  }
  set className(val: string) {
    this._className = val;
    if (this.classList && this.classList._set) {
      this.classList._set.clear();
      val.split(' ').filter(Boolean).forEach(t => this.classList._set.add(t));
    }
  }

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
    const set = new Set<string>();
    this.classList = {
      _set: set,
      add: (...tokens: string[]) => {
        tokens.forEach(t => set.add(t));
        this._className = Array.from(set).join(' ');
      },
      remove: (...tokens: string[]) => {
        tokens.forEach(t => set.delete(t));
        this._className = Array.from(set).join(' ');
      },
      contains: (token: string) => {
        return set.has(token);
      }
    };
  }

  public setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
    if (name === 'class') {
      this.className = value;
      this.classList._set.clear();
      value.split(' ').filter(Boolean).forEach(t => this.classList._set.add(t));
    } else if (name.startsWith('data-')) {
      const prop = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[prop] = value;
    }
  }

  public getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  public appendChild(child: MockDOMElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  public getBoundingClientRect() {
    return { left: 50, top: 50, right: 350, bottom: 180, width: 300, height: 130 };
  }

  public querySelector<T = MockDOMElement>(selector: string): T | null {
    const all = this.querySelectorAll<T>(selector);
    return all.length > 0 ? all[0] : null;
  }

  public querySelectorAll<T = MockDOMElement>(selector: string): T[] {
    const results: MockDOMElement[] = [];

    const matches = (el: MockDOMElement): boolean => {
      if (selector.startsWith('#')) {
        return el.id === selector.slice(1);
      }
      if (selector.startsWith('.')) {
        return el.classList.contains(selector.slice(1));
      }
      if (selector.startsWith('[')) {
        const attrMatches = Array.from(selector.matchAll(/\[([a-zA-Z0-9_-]+)(?:=([^\]]+))?\]/g));
        if (attrMatches.length > 0) {
          return attrMatches.every(([_, rawAttr, rawVal]) => {
            const attr = rawAttr.trim();
            if (rawVal === undefined) return el.getAttribute(attr) !== null;
            const val = rawVal.trim().replace(/^["']|["']$/g, '');
            return el.getAttribute(attr) === val;
          });
        }
      }
      return el.tagName.toLowerCase() === selector.toLowerCase();
    };

    const traverse = (current: MockDOMElement) => {
      for (const child of current.children) {
        if (matches(child)) results.push(child);
        traverse(child);
      }
    };

    traverse(this);
    return results as unknown as T[];
  }

  public closest(selector: string): MockDOMElement | null {
    let curr: MockDOMElement | null = this;
    while (curr) {
      if (selector.startsWith('.') && curr.classList.contains(selector.slice(1))) {
        return curr;
      }
      curr = curr.parentElement;
    }
    return null;
  }
}

const domRegistry = new Map<string, MockDOMElement>();

function getOrCreateElement(id: string, tag: string = 'div'): MockDOMElement {
  if (!domRegistry.has(id)) {
    const el = new MockDOMElement(tag);
    el.id = id;
    domRegistry.set(id, el);
  }
  return domRegistry.get(id)!;
}

if (typeof (global as any).window === 'undefined') {
  const noop = () => {};
  (global as any).window = {
    addEventListener: noop,
    removeEventListener: noop,
    location: { href: 'http://localhost' },
    focus: noop,
    navigator: { userAgent: 'node' }
  };
  (global as any).document = {
    createElement: (tag: string) => {
      return new MockDOMElement(tag);
    },
    createElementNS: (_ns: string, tag: string) => {
      return new MockDOMElement(tag);
    },
    getElementById: (id: string) => {
      return domRegistry.get(id) || null;
    },
    querySelector: (selector: string) => {
      for (const el of domRegistry.values()) {
        const found = el.querySelector(selector);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll: (selector: string) => {
      const results: any[] = [];
      for (const el of domRegistry.values()) {
        results.push(...el.querySelectorAll(selector));
      }
      return results;
    },
    body: new MockDOMElement('body')
  };
}

(global as any).fetch = async (url: string) => {
  const cleanPath = url.startsWith('/') ? url.slice(1) : url;
  const content = fs.readFileSync(cleanPath, 'utf8');
  return {
    json: async () => JSON.parse(content)
  };
};

// Populate required modal elements into registry
getOrCreateElement('research-tree-modal');
getOrCreateElement('close-research-btn', 'button');
getOrCreateElement('research-points-count', 'span');
getOrCreateElement('research-nodes-container');
getOrCreateElement('research-progress-summary', 'span');
getOrCreateElement('research-tree-container');
getOrCreateElement('research-tier-badge');
getOrCreateElement('research-wood-badge');

import { DataLoader } from '../src/utils/DataLoader.ts';
import { GameState } from '../src/systems/GameState.ts';
import { ResearchSystem } from '../src/systems/ResearchSystem.ts';
import { HUD } from '../src/ui/HUD.ts';
import type { ResearchNodeDef } from '../src/types/game.ts';

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING 4X RESEARCH TREE UI OVERHAUL UNIT TESTS');
  console.log('================================================================\n');

  const dataLoader = DataLoader.getInstance();
  await dataLoader.loadAll();

  const gameState = GameState.getInstance();
  const researchSystem = ResearchSystem.getInstance();

  // Reset GameState for clean test run
  gameState.consumeResearchPoints(gameState.getResearchPoints());

  // ---------------------------------------------------------------------------
  // TEST 1: Longest-Path DAG Tier Computation Algorithm
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Longest-Path DAG Tier Depth Computation ---');
  const mockScene: any = {
    add: { existing: () => {} },
    events: { once: () => {}, on: () => {}, emit: () => {} }
  };
  const hud = new HUD(mockScene, true);

  const realNodes = dataLoader.getResearchNodes();
  const realTiers = hud.computeResearchTiers(realNodes);

  // Verify Tier 0 for root nodes
  assert.equal(realTiers.get('research_skinning'), 0, 'Skinning must be Tier 0 (depth 0)');
  assert.equal(realTiers.get('research_butchering'), 0, 'Butchering must be Tier 0 (depth 0)');
  assert.equal(realTiers.get('research_alchemy_station'), 0, 'Alchemy must be Tier 0');
  assert.equal(realTiers.get('research_blacksmithing_station'), 0, 'Blacksmithing must be Tier 0');
  assert.equal(realTiers.get('research_bowyer_station'), 0, 'Bowyer must be Tier 0');
  assert.equal(realTiers.get('research_digging'), 0, 'Digging must be Tier 0');

  // Verify Tier 1 for dependent nodes
  assert.equal(realTiers.get('research_armorsmithing_bench'), 1, 'Armorsmithing Bench must be Tier 1 (depth 1)');
  assert.equal(realTiers.get('research_cooking_station'), 1, 'Cooking Station must be Tier 1 (depth 1)');
  assert.equal(realTiers.get('research_gardening'), 1, 'Gardening must be Tier 1 (depth 1)');

  // Verify Multi-Hop and Uneven Branch Synthetic Test (N >= 3 hops)
  const syntheticNodes: ResearchNodeDef[] = [
    { id: 'node_a', name: 'A', cost: 10, prerequisites: [] },
    { id: 'node_b', name: 'B', cost: 10, prerequisites: ['node_a'] },
    { id: 'node_c', name: 'C', cost: 10, prerequisites: ['node_b'] },
    { id: 'node_d', name: 'D', cost: 10, prerequisites: ['node_c'] },
    // Multi-parent with uneven branches: requires node_a (depth 0) and node_c (depth 2) -> must be depth 3!
    { id: 'node_uneven', name: 'Uneven', cost: 10, prerequisites: ['node_a', 'node_c'] }
  ];

  const syntheticTiers = hud.computeResearchTiers(syntheticNodes);
  assert.equal(syntheticTiers.get('node_a'), 0, 'Node A depth must be 0');
  assert.equal(syntheticTiers.get('node_b'), 1, 'Node B depth must be 1');
  assert.equal(syntheticTiers.get('node_c'), 2, 'Node C depth must be 2');
  assert.equal(syntheticTiers.get('node_d'), 3, 'Node D depth must be 3 (multi-hop 4-node chain)');
  assert.equal(syntheticTiers.get('node_uneven'), 3, 'Node Uneven must take longest path (1 + max(0, 2) = 3)');

  console.log('✔ Test 1 passed: Longest-path topological DAG tier depth computation verified.');

  // ---------------------------------------------------------------------------
  // TEST 2: Initial Render — Padlock on Locked Nodes & Prerequisite Warnings
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Initial Render & Locked Node Padlocks ---');
  hud.renderResearchTreeModal();

  const container = getOrCreateElement('research-nodes-container');
  const canvas = container.querySelector('#research-tree-canvas') as MockDOMElement;
  assert.ok(canvas, '#research-tree-canvas must be created in research-nodes-container');

  const svg = canvas.querySelector('#research-tree-svg') as MockDOMElement;
  assert.ok(svg, '#research-tree-svg overlay must exist');

  // Verify Armorsmithing card is locked and shows padlock & prerequisite
  const armorCard = canvas.querySelector('#research-card-research_armorsmithing_bench') as MockDOMElement;
  assert.ok(armorCard, 'Armorsmithing Bench card must exist');
  assert.ok(armorCard.classList.contains('node-locked'), 'Armorsmithing Bench must have node-locked class');
  assert.ok(armorCard.innerHTML.includes('🔒 Locked'), 'Armorsmithing Bench must show 🔒 Locked status badge');
  assert.ok(armorCard.innerHTML.includes('Requires: Harvest Enemy Skin') || armorCard.innerHTML.includes('research_skinning'),
    'Armorsmithing Bench must explicitly name Harvest Enemy Skin prerequisite');

  // Verify Cooking Station card is locked and shows padlock & prerequisite
  const cookingCard = canvas.querySelector('#research-card-research_cooking_station') as MockDOMElement;
  assert.ok(cookingCard, 'Cooking Station card must exist');
  assert.ok(cookingCard.classList.contains('node-locked'), 'Cooking Station must have node-locked class');
  assert.ok(cookingCard.innerHTML.includes('🔒 Locked'), 'Cooking Station must show 🔒 Locked status badge');
  assert.ok(cookingCard.innerHTML.includes('Requires: Harvest Enemy Meat') || cookingCard.innerHTML.includes('research_butchering'),
    'Cooking Station must explicitly name Harvest Enemy Meat prerequisite');

  // Verify Gardening card is locked and shows padlock & prerequisite
  const gardeningCard = canvas.querySelector('#research-card-research_gardening') as MockDOMElement;
  assert.ok(gardeningCard, 'Gardening card must exist');
  assert.ok(gardeningCard.classList.contains('node-locked'), 'Gardening must have node-locked class');
  assert.ok(gardeningCard.innerHTML.includes('🔒 Locked'), 'Gardening must show 🔒 Locked status badge');
  assert.ok(gardeningCard.innerHTML.includes('Requires: Digging') || gardeningCard.innerHTML.includes('research_digging'),
    'Gardening must explicitly name Digging prerequisite');

  // Verify Root nodes (e.g. Skinning, Butchering, Blacksmithing) are available, NOT locked
  const skinningCard = canvas.querySelector('#research-card-research_skinning') as MockDOMElement;
  assert.ok(skinningCard.classList.contains('node-available'), 'Skinning must be node-available, NOT node-locked');
  assert.ok(!skinningCard.innerHTML.includes('node-prereq-alert'), 'Root node must have no prerequisite alert');

  console.log('✔ Test 2 passed: Initial locked cards correctly show padlocks and explicit prerequisite requirements.');

  // ---------------------------------------------------------------------------
  // TEST 3: SVG Connector Lines Between Prerequisites and Dependents
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: SVG Connector Lines (Skinning->Armor, Butchering->Cooking, Digging->Gardening) ---');
  const connectorLines = svg.querySelectorAll('.research-connector-line');
  assert.equal(connectorLines.length, 3, 'Exactly 3 prerequisite connector lines must be drawn');

  const skinningLine = svg.querySelector('[data-source-node="research_skinning"][data-target-node="research_armorsmithing_bench"]') as MockDOMElement;
  assert.ok(skinningLine, 'Connector line from research_skinning to research_armorsmithing_bench must exist');
  assert.equal(skinningLine.getAttribute('stroke'), '#64748b', 'Unresearched prerequisite connector must have muted slate stroke');
  assert.equal(skinningLine.getAttribute('stroke-dasharray'), '5 4', 'Unresearched connector must be dashed');

  const butcheringLine = svg.querySelector('[data-source-node="research_butchering"][data-target-node="research_cooking_station"]') as MockDOMElement;
  assert.ok(butcheringLine, 'Connector line from research_butchering to research_cooking_station must exist');
  assert.equal(butcheringLine.getAttribute('stroke'), '#64748b');

  const diggingLine = svg.querySelector('[data-source-node="research_digging"][data-target-node="research_gardening"]') as MockDOMElement;
  assert.ok(diggingLine, 'Connector line from research_digging to research_gardening must exist');
  assert.equal(diggingLine.getAttribute('stroke'), '#64748b');

  console.log('✔ Test 3 passed: SVG connector lines correctly connect prerequisite pairs.');

  // ---------------------------------------------------------------------------
  // TEST 4: Dynamic Transition on Unlock (Checkmarks & Connector State)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 4: Unlock Skinning -> Armorsmithing Transition & Checkmark ---');
  gameState.addResearchPoints(20);

  // Unlock Skinning
  const skinningNode = dataLoader.getResearchNode('research_skinning')!;
  const unlockSkinResult = researchSystem.unlockNode(skinningNode);
  assert.ok(unlockSkinResult.success, 'Skinning unlock must succeed');

  // Re-render modal to reflect state change
  hud.renderResearchTreeModal();

  const canvasAfterSkin = container.querySelector('#research-tree-canvas') as MockDOMElement;
  const svgAfterSkin = canvasAfterSkin.querySelector('#research-tree-svg') as MockDOMElement;

  const updatedSkinningCard = canvasAfterSkin.querySelector('#research-card-research_skinning') as MockDOMElement;
  assert.ok(updatedSkinningCard.classList.contains('node-completed'), 'Skinning must now have node-completed class');
  assert.ok(updatedSkinningCard.innerHTML.includes('✓ Researched') || updatedSkinningCard.innerHTML.includes('✓ Complete'),
    'Skinning must show checkmark for completed research');

  // Armorsmithing Bench must now be unlocked from prerequisite jail -> AVAILABLE!
  const updatedArmorCard = canvasAfterSkin.querySelector('#research-card-research_armorsmithing_bench') as MockDOMElement;
  assert.ok(updatedArmorCard.classList.contains('node-available'), 'Armorsmithing Bench must now be node-available!');
  assert.ok(!updatedArmorCard.classList.contains('node-locked'), 'Armorsmithing Bench must NOT be node-locked anymore');

  // Connector line from Skinning to Armorsmithing must now be solid cyan (active!)
  const updatedSkinningLine = svgAfterSkin.querySelector('[data-source-node="research_skinning"][data-target-node="research_armorsmithing_bench"]') as MockDOMElement;
  assert.equal(updatedSkinningLine.getAttribute('stroke'), '#38bdf8', 'Connector line must transition to cyan active stroke');
  assert.equal(updatedSkinningLine.getAttribute('stroke-dasharray'), null, 'Connector line must now be solid (no dasharray)');

  console.log('✔ Test 4 passed: Dynamic unlock transition, checkmark display, and active connector line verified.');

  // ---------------------------------------------------------------------------
  // TEST 5: Action Button Attributes & Multi-hop Unlock Complete
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 5: Unlock Armorsmithing Bench -> Green Glow Connector ---');
  const armorsmithNode = dataLoader.getResearchNode('research_armorsmithing_bench')!;
  const unlockArmorResult = researchSystem.unlockNode(armorsmithNode);
  assert.ok(unlockArmorResult.success, 'Armorsmithing Bench unlock must succeed');

  hud.renderResearchTreeModal();

  const canvasAfterArmor = container.querySelector('#research-tree-canvas') as MockDOMElement;
  const svgAfterArmor = canvasAfterArmor.querySelector('#research-tree-svg') as MockDOMElement;

  const finalArmorCard = canvasAfterArmor.querySelector('#research-card-research_armorsmithing_bench') as MockDOMElement;
  assert.ok(finalArmorCard.classList.contains('node-completed'), 'Armorsmithing Bench must now be node-completed');
  assert.ok(finalArmorCard.innerHTML.includes('✓ Complete'), 'Armorsmithing Bench must display checkmark');

  // Both are completed: connector line must transition to emerald green!
  const completedLine = svgAfterArmor.querySelector('[data-source-node="research_skinning"][data-target-node="research_armorsmithing_bench"]') as MockDOMElement;
  assert.equal(completedLine.getAttribute('stroke'), '#10b981', 'Completed-to-completed connector must be green');
  assert.equal(completedLine.getAttribute('marker-end'), 'url(#arrow-completed)', 'Completed connector must use arrow-completed marker');

  // Cooking Station must STILL be locked because Butchering has not been researched
  const stillLockedCooking = canvasAfterArmor.querySelector('#research-card-research_cooking_station') as MockDOMElement;
  assert.ok(stillLockedCooking.classList.contains('node-locked'), 'Cooking Station must remain locked');

  console.log('✔ Test 5 passed: Armorsmithing completed state and green connector verified.');

  console.log('\n================================================================');
  console.log('🎉 ALL 5 4X RESEARCH TREE UI UNIT TESTS PASSED SUCCESSFULLY! ✓');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
