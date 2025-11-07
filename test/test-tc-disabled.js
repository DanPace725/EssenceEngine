import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { TcScheduler, TcStorage } from '../tcStorage.js';
import { registerRule110Stepper } from '../tc/tcRule110.js';
import { TapeMachineRegistry, registerTapeMachine } from '../tc/tcTape.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rule110FixturePath = path.resolve(__dirname, '../analysis/fixtures/rule110-hashes.json');
const tapeFixturePath = path.resolve(__dirname, '../analysis/fixtures/tape-unary-incrementer-hashes.json');
const tapeMachinePath = path.resolve(__dirname, '../tc/machines/unary_incrementer.json');

const loadJson = (targetPath) => {
  const contents = fs.readFileSync(targetPath, 'utf8');
  return JSON.parse(contents);
};

const encodeCells = (cells) => {
  let binary = '';
  for (let i = 0; i < cells.length; i++) {
    binary += cells[i] ? '1' : '0';
  }
  return binary;
};

const hashCells = (cells) => {
  const binary = encodeCells(cells);
  return createHash('sha256').update(binary, 'utf8').digest('hex');
};

const hashSnapshot = (snapshot) => {
  const serialized = JSON.stringify(snapshot);
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
};

const runRule110Case = (testCase) => {
  const { label, initializer, width, steps, initializerOptions = {} } = testCase;

  TcScheduler.reset();
  TcStorage.clear();
  TcScheduler.configure({ enabled: false, baseSeed: 0 });

  const { stepper, unsubscribe } = registerRule110Stepper({
    width,
    initializer,
    initializerOptions,
    stateKey: `disabled.${label}.state`,
    bufferKey: `disabled.${label}.buffer`
  });

  const hashes = [];
  for (let tick = 0; tick < steps; tick++) {
    const context = TcScheduler.beginTick({ tick, dt: 1 });
    TcScheduler.runPhase('capture', context);
    TcScheduler.runPhase('compute', context);
    TcScheduler.runPhase('commit', context);
    TcScheduler.endTick(context);
    hashes.push(hashCells(stepper.getState()));
  }

  unsubscribe();
  TcScheduler.configure({ enabled: false });
  return hashes;
};

const runTapeTrace = (fixture) => {
  const machine = loadJson(tapeMachinePath);
  TapeMachineRegistry.clear();
  TapeMachineRegistry.register(machine, null, { overwrite: true });

  TcScheduler.reset();
  TcStorage.clear();
  TcScheduler.configure({ enabled: false, baseSeed: 0 });

  const { chunkSize = 64, windowRadius = null, steps = 0, initialTape = null } = fixture;
  const { stepper, unsubscribe } = registerTapeMachine({
    machineId: fixture.machineId || machine.id,
    chunkSize,
    window: windowRadius === null ? {} : { radius: windowRadius },
    stateKey: 'disabled.tape.state',
    tapePrefix: 'disabled.tape.chunk.',
    initialTape,
    initialize: true
  });

  const hashes = [];
  for (let tick = 0; tick < steps; tick++) {
    const context = TcScheduler.beginTick({ tick, dt: 1 });
    TcScheduler.runPhase('capture', context);
    TcScheduler.runPhase('compute', context);
    TcScheduler.runPhase('commit', context);
    TcScheduler.endTick(context);
    hashes.push(hashSnapshot(stepper.buildSnapshot(tick)));
  }

  unsubscribe();
  TcScheduler.configure({ enabled: false });
  TapeMachineRegistry.clear();
  return hashes;
};

const rule110Fixtures = loadJson(rule110FixturePath);
const tapeFixture = loadJson(tapeFixturePath);

let failures = 0;

for (const testCase of rule110Fixtures.cases) {
  try {
    const hashes = runRule110Case(testCase);
    if (!Array.isArray(testCase.hashes) || hashes.length !== testCase.hashes.length) {
      throw new Error(`Fixture mismatch for ${testCase.label}: expected ${testCase.hashes?.length ?? 'unknown'} hashes, received ${hashes.length}`);
    }
    for (let i = 0; i < hashes.length; i++) {
      if (hashes[i] !== testCase.hashes[i]) {
        throw new Error(`Hash mismatch at step ${i}: expected ${testCase.hashes[i]}, got ${hashes[i]}`);
      }
    }
    console.log(`TC disabled Rule110 case '${testCase.label}' passed (${hashes.length} steps).`);
  } catch (err) {
    failures += 1;
    console.error(`TC disabled Rule110 case '${testCase.label}' failed:`, err.message);
  }
}

try {
  const hashes = runTapeTrace(tapeFixture);
  if (!Array.isArray(tapeFixture.hashes) || hashes.length !== tapeFixture.hashes.length) {
    throw new Error(`Tape fixture hash count mismatch: expected ${tapeFixture.hashes?.length ?? 'unknown'}, got ${hashes.length}`);
  }
  for (let i = 0; i < hashes.length; i++) {
    if (hashes[i] !== tapeFixture.hashes[i]) {
      throw new Error(`Tape hash mismatch at step ${i}: expected ${tapeFixture.hashes[i]}, got ${hashes[i]}`);
    }
  }
  console.log(`TC disabled tape trace '${tapeFixture.machineId}' passed (${hashes.length} steps).`);
} catch (err) {
  failures += 1;
  console.error(`TC disabled tape trace '${tapeFixture.machineId}' failed:`, err.message);
}

if (failures > 0) {
  console.error(`TC disabled regression tests failed (${failures} cases).`);
  process.exit(1);
}

console.log('TC disabled regression tests passed.');
