import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const testDir = path.join(rootDir, 'test');

const testFiles = fs.readdirSync(testDir)
  .filter(f => f.endsWith('.test.ts'))
  .sort();

console.log(`=======================================================`);
console.log(`RUNNING ${testFiles.length} TEST SUITES IN SEQUENCE`);
console.log(`=======================================================\n`);

const results = [];
const startTime = Date.now();
const isQuiet = process.argv.includes('--quiet');

const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

for (let i = 0; i < testFiles.length; i++) {
  const file = testFiles[i];
  const relativePath = `test/${file}`;

  if (!isQuiet) {
    process.stdout.write(`[${String(i + 1).padStart(2, ' ')}/${testFiles.length}] ${file.padEnd(45, ' ')} `);
  }
  const fileStart = Date.now();

  const child = spawnSync(npxCmd, ['tsx', `"${relativePath}"`], {
    cwd: rootDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 120000
  });

  const durationSec = ((Date.now() - fileStart) / 1000).toFixed(2);
  const passed = child.status === 0;

  if (passed) {
    if (!isQuiet) {
      process.stdout.write(`PASS (${durationSec}s)\n`);
    } else {
      process.stdout.write('.');
    }
    results.push({ file, passed: true, durationSec });
  } else {
    if (isQuiet) process.stdout.write('\n');
    process.stdout.write(`FAIL (${durationSec}s): ${file}\n`);
    const combinedOutput = (child.stdout || '') + '\n' + (child.stderr || '');
    let firstError = 'Unknown error';
    const lines = combinedOutput.split('\n');
    for (let l = 0; l < lines.length; l++) {
      const line = lines[l].trim();
      if (line.includes('AssertionError') || line.includes('Error') || line.includes('[FAILED]') || line.includes('❌') || line.includes('Failed:')) {
        firstError = line;
        if (lines[l + 1] && lines[l + 1].trim()) firstError += ' | ' + lines[l + 1].trim();
        if (lines[l + 2] && lines[l + 2].trim()) firstError += ' | ' + lines[l + 2].trim();
        break;
      }
    }
    results.push({ file, passed: false, durationSec, error: firstError, fullOutput: combinedOutput });
  }
}

const totalDurationSec = ((Date.now() - startTime) / 1000).toFixed(1);
const passedCount = results.filter(r => r.passed).length;
const failedCount = results.filter(r => !r.passed).length;

console.log(`\n=======================================================`);
console.log(`TEST RESULTS SUMMARY (${totalDurationSec}s total)`);
console.log(`=======================================================`);
console.log(`Total:  ${results.length}`);
console.log(`Passed: ${passedCount}`);
console.log(`Failed: ${failedCount}\n`);

if (failedCount > 0) {
  console.log(`FAILED SUITES:`);
  for (const r of results.filter(r => !r.passed)) {
    console.log(`  ❌ ${r.file}:`);
    console.log(`     ${r.error}`);
  }
  process.exit(1);
} else {
  console.log(`🎉 ALL ${results.length} SUITES PASSED!`);
  process.exit(0);
}
