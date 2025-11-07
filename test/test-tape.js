import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { TcScheduler, TcStorage } from '../tcStorage.js';
import { TapeMachineRegistry, registerTapeMachine } from '../tc/tcTape.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const machinePath = path.resolve(__dirname, '../tc/machines/unary_incrementer.json');
const fixturePath = path.resolve(__dirname, '../analysis/fixtures/tape-unary-incrementer-hashes.json');

const loadJson = (targetPath) => {
  const contents = fs.readFileSync(targetPath, 'utf8');
  return JSON.parse(contents);
};

const computeHash = (snapshot) => {
  const serialized = JSON.stringify(snapshot);
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
};

const runTrace = (fixture) => {
  const machine = loadJson(machinePath);
  TapeMachineRegistry.clear();
  TapeMachineRegistry.register(machine, null, { overwrite: true });

  TcScheduler.reset();
  TcStorage.clear();
  TcScheduler.configure({ enabled: true, baseSeed: 0 });

  const { chunkSize = 64, windowRadius = null, steps = 0, initialTape = null } = fixture;
  const stateKey = 'test.tape.state';
  const tapePrefix = 'test.tape.chunk.';

  const { stepper, unsubscribe } = registerTapeMachine({
    machineId: fixture.machineId || machine.id,
    chunkSize,
    window: windowRadius === null ? {} : { radius: windowRadius },
    stateKey,
    tapePrefix,
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
    const snapshot = stepper.buildSnapshot(tick);
    hashes.push(computeHash(snapshot));
  }

  unsubscribe();
  TcScheduler.configure({ enabled: false });
  TapeMachineRegistry.clear();
  return hashes;
};

const fixture = loadJson(fixturePath);

try {
  const hashes = runTrace(fixture);
  if (!Array.isArray(fixture.hashes) || fixture.hashes.length !== hashes.length) {
    throw new Error(`Fixture hash count mismatch: expected ${fixture.hashes.length}, got ${hashes.length}`);
  }
  for (let i = 0; i < hashes.length; i++) {
    if (hashes[i] !== fixture.hashes[i]) {
      throw new Error(`Hash mismatch at step ${i}: expected ${fixture.hashes[i]}, got ${hashes[i]}`);
    }
  }
  console.log(`Tape trace '${fixture.machineId}' passed (${hashes.length} steps).`);
  console.log('Tape determinism tests passed.');
} catch (err) {
  console.error(`Tape trace '${fixture.machineId}' failed:`, err.message);
  console.error('Tape determinism tests failed.');
  process.exit(1);
}
