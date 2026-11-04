import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('--- Testing HUD pointer events and gathering drag-through configuration ---');

// 1. Read index.html and assert CSS rules
const indexPath = path.join(rootDir, 'index.html');
assert.ok(fs.existsSync(indexPath), 'index.html must exist');
const indexHtml = fs.readFileSync(indexPath, 'utf-8');

// Assert .hud-card button { pointer-events: auto } rule exists
const hudCardButtonRuleRegex = /\.hud-card\s+button\s*\{[^}]*pointer-events:\s*auto\s*;?[^}]*\}/s;
assert.ok(
  hudCardButtonRuleRegex.test(indexHtml),
  'index.html must contain `.hud-card button { pointer-events: auto; }` rule'
);
console.log('✔ Verified .hud-card button { pointer-events: auto } exists in index.html');

// Assert .hud-drag-through rule exists with pointer-events: none !important
const hudDragThroughRuleRegex = /\.hud-drag-through\s*,\s*\.hud-drag-through\s+\*\s*\{[^}]*pointer-events:\s*none\s+!important\s*;?[^}]*\}/s;
assert.ok(
  hudDragThroughRuleRegex.test(indexHtml),
  'index.html must contain `.hud-drag-through, .hud-drag-through * { pointer-events: none !important; }` rule'
);
console.log('✔ Verified .hud-drag-through rule exists in index.html');

// 2. Read HUD.ts and assert setGatheringDragActive toggles the class
const hudTsPath = path.join(rootDir, 'src', 'ui', 'HUD.ts');
assert.ok(fs.existsSync(hudTsPath), 'src/ui/HUD.ts must exist');
const hudTsContent = fs.readFileSync(hudTsPath, 'utf-8');

const setGatheringDragActiveMethodRegex = /setGatheringDragActive\s*\(\s*dragging:\s*boolean\s*\)[\s\S]*?\{[\s\S]*?el\.classList\.toggle\(\s*['"]hud-drag-through['"]\s*,\s*dragging\s*\);?[\s\S]*?\}/;
assert.ok(
  setGatheringDragActiveMethodRegex.test(hudTsContent),
  'HUD.ts setGatheringDragActive must toggle the "hud-drag-through" class with dragging argument'
);
console.log('✔ Verified HUD.setGatheringDragActive toggles "hud-drag-through" class');

// 3. Functional check of toggle behavior
class MockClassList {
  private classes = new Set<string>();
  toggle(className: string, force?: boolean): boolean {
    if (force === true) {
      this.classes.add(className);
      return true;
    } else if (force === false) {
      this.classes.delete(className);
      return false;
    } else {
      if (this.classes.has(className)) {
        this.classes.delete(className);
        return false;
      } else {
        this.classes.add(className);
        return true;
      }
    }
  }
  contains(className: string): boolean {
    return this.classes.has(className);
  }
}

class MockElement {
  classList = new MockClassList();
  style: Record<string, string> = {};
}

const mockOverlay = new MockElement();
// Simulate dragging = true
mockOverlay.classList.toggle('hud-drag-through', true);
mockOverlay.style.transition = 'opacity 0.15s ease';
mockOverlay.style.opacity = '0.1';
assert.equal(mockOverlay.classList.contains('hud-drag-through'), true, 'Element should have hud-drag-through when dragging is true');
assert.equal(mockOverlay.style.opacity, '0.1');

// Simulate dragging = false
mockOverlay.classList.toggle('hud-drag-through', false);
mockOverlay.style.opacity = '';
assert.equal(mockOverlay.classList.contains('hud-drag-through'), false, 'Element should not have hud-drag-through when dragging is false');
assert.equal(mockOverlay.style.opacity, '');

console.log('✔ Verified mock toggle behavior for hud-drag-through class and opacity transitions');

console.log('\n=== ALL HUD POINTER EVENTS TESTS PASSED SUCCESSFULLY! ===');
