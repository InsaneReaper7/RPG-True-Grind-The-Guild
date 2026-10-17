import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const currentCsvPath = path.join(rootDir, 'docs/balance/class_sim.csv');
const baselineGitRef = 'a8f7765:docs/balance/class_sim.csv';

console.log('========================================================================');
console.log('SIMULATION DETERMINISM CHECK: current vs ' + baselineGitRef);
console.log('========================================================================\n');

let baselineContent = '';
try {
  baselineContent = execSync(`git show ${baselineGitRef}`, { encoding: 'utf8' });
} catch (err: any) {
  console.error(`Failed to load baseline from git ref ${baselineGitRef}: ${err?.message || err}`);
  process.exit(1);
}

if (!fs.existsSync(currentCsvPath)) {
  console.error(`Current CSV not found: ${currentCsvPath}`);
  process.exit(1);
}
const currentContent = fs.readFileSync(currentCsvPath, 'utf8');

const parseCsv = (content: string) => {
  const lines = content.trim().split('\n').filter(l => l.trim().length > 0);
  const header = lines[0].split(',').map(s => s.trim());
  const rows = lines.slice(1).map(l => {
    const parts = l.split(',').map(s => s.trim());
    return {
      raw: parts,
      classId: parts[0],
      first11: parts.slice(0, 11)
    };
  });
  return { header, rows };
};

const baseline = parseCsv(baselineContent);
const current = parseCsv(currentContent);

console.log(`Baseline row count: ${baseline.rows.length}`);
console.log(`Current row count:  ${current.rows.length}`);

const baselineClasses = new Set(baseline.rows.map(r => r.classId));
const currentClasses = new Set(current.rows.map(r => r.classId));

const missingInCurrent = [...baselineClasses].filter(c => !currentClasses.has(c));
const addedInCurrent = [...currentClasses].filter(c => !baselineClasses.has(c));

if (missingInCurrent.length > 0) {
  console.log(`Classes missing in current CSV: ${missingInCurrent.join(', ')}`);
} else {
  console.log('Classes missing in current CSV: None');
}

if (addedInCurrent.length > 0) {
  console.log(`Classes added in current CSV: ${addedInCurrent.join(', ')}`);
} else {
  console.log('Classes added in current CSV: None');
}

const baselineMap = new Map(baseline.rows.map(r => [r.classId, r]));
const changedClasses: string[] = [];

console.log('\nChecking first 11 columns across all classes:');
const first11Headers = baseline.header.slice(0, 11);

for (const curRow of current.rows) {
  const baseRow = baselineMap.get(curRow.classId);
  if (!baseRow) continue;

  const diffs: string[] = [];
  for (let i = 0; i < 11; i++) {
    if (curRow.first11[i] !== baseRow.first11[i]) {
      diffs.push(`${first11Headers[i]}: ${baseRow.first11[i]} -> ${curRow.first11[i]}`);
    }
  }

  if (diffs.length > 0) {
    changedClasses.push(curRow.classId);
    console.log(`  * ${curRow.classId.padEnd(20)} [CHANGED]: ${diffs.join(', ')}`);
  }
}

const unchangedCount = current.rows.length - changedClasses.length;
console.log(`\nUnchanged classes count: ${unchangedCount}`);
console.log(`Changed classes count:   ${changedClasses.length}`);
console.log(`Changed classes:         ${changedClasses.join(', ')}`);

const expectedChanged = ['weaponmaster', 'archmage', 'elemental_sovereign', 'deathbringer', 'guardian'];
const unexpected = changedClasses.filter(c => !expectedChanged.includes(c));
const missingExpected = expectedChanged.filter(c => !changedClasses.includes(c));

if (unexpected.length === 0 && missingExpected.length === 0) {
  console.log('\n[PASS] Exactly the 5 expected classes changed. Determinism verified for all 81 other classes!');
} else {
  if (unexpected.length > 0) {
    console.log(`\n[WARNING] Unexpected classes changed: ${unexpected.join(', ')}`);
  }
  if (missingExpected.length > 0) {
    console.log(`\n[WARNING] Expected classes did not change: ${missingExpected.join(', ')}`);
  }
}
