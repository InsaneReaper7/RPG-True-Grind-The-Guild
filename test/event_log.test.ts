import assert from 'node:assert';
import { EventLog, LogEntry } from '../src/systems/EventLog.ts';

console.log('--- TEST SUITE: EventLog ---');

// 1. Ring buffer bounds (2,100 adds -> 2,000 kept, oldest dropped, order kept)
{
  console.log('1. Testing ring buffer bounds (2,100 adds -> 2,000 kept)...');
  const log = EventLog.resetInstance();
  for (let i = 1; i <= 2100; i++) {
    log.add('session', `Entry ${i}`);
  }

  const entries = log.getEntries();
  assert.strictEqual(entries.length, 2000, `Expected 2000 entries, got ${entries.length}`);
  assert.strictEqual(entries[0].msg, 'Entry 101', `Oldest retained entry should be Entry 101, got ${entries[0].msg}`);
  assert.strictEqual(entries[1999].msg, 'Entry 2100', `Newest entry should be Entry 2100, got ${entries[1999].msg}`);
  console.log('✓ Ring buffer bounds passed');
}

// 2. toText() formatting
{
  console.log('2. Testing toText() formatting...');
  const log = EventLog.resetInstance();
  log.setLocation(3);
  log.add('equip', 'Valerie: off-hand Daggers unequipped: Greatswords is two-handed');

  const text = log.toText();
  assert.match(text, /^\[\+\d{2}:\d{2}:\d{2}\.\d{3}\] F3\s{6}equip\s{7}Valerie: off-hand Daggers unequipped: Greatswords is two-handed/);
  console.log('✓ toText() format passed');
}

// 3. Location stamping before and after transitions
{
  console.log('3. Testing location stamping across transitions...');
  const log = EventLog.resetInstance();
  log.setLocation('Outpost');
  log.add('floor', 'In Outpost');

  log.setLocation(1);
  log.add('floor', 'Entered F1');

  log.setLocation(4);
  log.add('floor', 'Entered F4');

  const entries = log.getEntries();
  assert.strictEqual(entries[0].floor, 'Outpost');
  assert.strictEqual(entries[1].floor, 'F1');
  assert.strictEqual(entries[2].floor, 'F4');
  console.log('✓ Location stamping passed');
}

// 4. Item spam merging (50 calls in one tick -> 1 entry with count 50)
{
  console.log('4. Testing item transaction merging (50 calls -> 1 entry count 50)...');
  const log = EventLog.resetInstance();
  for (let i = 0; i < 50; i++) {
    log.logItemTransaction('Stockpile', '+', 'ore', 1);
  }

  const entries = log.getEntries();
  assert.strictEqual(entries.length, 1, `Expected exactly 1 merged entry, got ${entries.length}`);
  assert.strictEqual(entries[0].msg, 'Stockpile: +50 ore');
  assert.strictEqual(entries[0].data.count, 50);

  // Different member or item creates new entry
  log.logItemTransaction('Valerie', '+', 'wolf_pelt', 7);
  assert.strictEqual(log.getEntries().length, 2);
  assert.strictEqual(log.getEntries()[1].msg, 'Valerie: +7 wolf_pelt');
  console.log('✓ Item spam merging passed');
}

// 5. console.error capture and pass-through
{
  console.log('5. Testing console.error and console.warn capture...');
  const log = EventLog.resetInstance();
  let consoleErrorCalled = false;
  const originalError = console.error;
  console.error = (...args: any[]) => {
    consoleErrorCalled = true;
    originalError(...args);
  };

  log.installErrorHandlers();
  console.error('Test error message for EventLog');

  const errorEntries = log.getEntries().filter((e) => e.cat === 'error');
  assert.strictEqual(errorEntries.length, 1);
  assert.match(errorEntries[0].msg, /console\.error: Test error message for EventLog/);
  assert.strictEqual(consoleErrorCalled, true, 'Original console.error must still be invoked');
  log.uninstallErrorHandlers();
  console.error = originalError;
  console.log('✓ console.error capture and passthrough passed');
}

// 6. Re-entrancy guard: console.error inside wrapped console.error does not loop
{
  console.log('6. Testing console.error re-entrancy guard...');
  const log = EventLog.resetInstance();
  log.installErrorHandlers();

  // Trigger console.error
  console.error('Initial error trigger');

  const errs = log.getEntries().filter((e) => e.cat === 'error');
  assert.strictEqual(errs.length, 1);
  log.uninstallErrorHandlers();
  console.log('✓ Re-entrancy guard passed');
}

// 7. Crash prompt throttling (only on window.onerror, max once per 60s)
{
  console.log('7. Testing crash prompt throttling...');
  const log = EventLog.resetInstance();
  let promptCount = 0;
  log.setCrashPromptHandler(() => {
    promptCount++;
  });

  // Calling console.error should NEVER fire crash prompt
  log.installErrorHandlers();
  console.error('Regular error log');
  console.warn('Regular warning log');
  assert.strictEqual(promptCount, 0, 'console.error/warn must never fire crash prompt');

  // Triggering window.onerror (simulated via triggerCrashPrompt internal / event)
  (log as any).triggerCrashPrompt();
  assert.strictEqual(promptCount, 1, 'First crash should trigger prompt');

  // Second crash immediately after must be throttled
  (log as any).triggerCrashPrompt();
  assert.strictEqual(promptCount, 1, 'Second crash within 60s must be throttled');

  // Advance time by 61 seconds
  (log as any).lastCrashPromptTime = Date.now() - 61000;
  (log as any).triggerCrashPrompt();
  assert.strictEqual(promptCount, 2, 'Crash after 60s should trigger prompt');
  log.uninstallErrorHandlers();
  console.log('✓ Crash prompt throttling passed');
}

console.log('ALL EventLog tests passed!\n');
