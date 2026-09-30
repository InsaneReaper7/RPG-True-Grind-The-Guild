import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const testDir = path.join(rootDir, 'test');

const e2eFiles = fs.readdirSync(testDir)
  .filter(f => f.endsWith('.mjs') && (f.startsWith('verify_') || f.includes('browser') || f.includes('runner') || f.includes('reproduce')))
  .sort();

const targetSuite = process.argv[2];

if (!targetSuite) {
  console.log(`=======================================================`);
  console.log(`PUPPETEER / BROWSER E2E TEST SUITES (${e2eFiles.length} suites found)`);
  console.log(`=======================================================\n`);
  console.log(`To run a specific E2E suite, run:`);
  console.log(`  npm run test:e2e <filename>\n`);
  console.log(`Available E2E suites:`);
  for (const f of e2eFiles) {
    console.log(`  - test/${f}`);
  }
  process.exit(0);
}

const match = e2eFiles.find(f => f === targetSuite || f === path.basename(targetSuite));
if (!match) {
  console.error(`E2E suite not found: "${targetSuite}". Available suites:`);
  for (const f of e2eFiles) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log(`Running E2E suite: test/${match}`);
const child = spawnSync('node', [path.join(testDir, match)], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

process.exit(child.status ?? 0);
