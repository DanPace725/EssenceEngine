import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { TcScheduler, TcStorage } from '../../tcStorage.js';
import { registerRule110Stepper } from '../../tc/tcRule110.js';
import { TapeMachineRegistry, registerTapeMachine } from '../../tc/tcTape.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tapeMachinePath = path.resolve(__dirname, '../../tc/machines/unary_incrementer.json');

const loadJson = (targetPath) => JSON.parse(fs.readFileSync(targetPath, 'utf8'));

const withTcEnvironment = (enabled, fn) => {
  TcScheduler.reset();
  TcStorage.clear();
  TcScheduler.configure({ enabled, baseSeed: 0, tickSalt: 0x9e3779b9 });
  try {
    return fn();
  } finally {
    TcScheduler.configure({ enabled: false });
    TcStorage.clear();
  }
};

const measureRule110 = (options) => {
  const { width = 256, steps = 2000, initializer = 'ether', enabled } = options;
  const { stepper, unsubscribe } = registerRule110Stepper({
    width,
    initializer,
    stateKey: `perf.rule110.state.${enabled ? 'on' : 'off'}`,
    bufferKey: `perf.rule110.buffer.${enabled ? 'on' : 'off'}`
  });
  const cpuStart = process.cpuUsage();
  const wallStart = performance.now();
  for (let tick = 0; tick < steps; tick++) {
    const context = TcScheduler.beginTick({ tick, dt: 1 });
    TcScheduler.runPhase('capture', context);
    TcScheduler.runPhase('compute', context);
    TcScheduler.runPhase('commit', context);
    TcScheduler.endTick(context);
    // ensure the current state is touched so work isn't optimized away
    stepper.getState();
  }
  const wallElapsed = performance.now() - wallStart;
  const cpuElapsed = process.cpuUsage(cpuStart);
  unsubscribe();
  return { steps, wallElapsed, cpuElapsed };
};

const measureTapeMachine = (options) => {
  const { steps = 2000, enabled, chunkSize = 64, windowRadius = 1 } = options;
  const machine = loadJson(tapeMachinePath);
  TapeMachineRegistry.clear();
  TapeMachineRegistry.register(machine, null, { overwrite: true });
  const { stepper, unsubscribe } = registerTapeMachine({
    machineId: machine.id,
    chunkSize,
    window: { radius: windowRadius },
    stateKey: `perf.tape.state.${enabled ? 'on' : 'off'}`,
    tapePrefix: `perf.tape.chunk.${enabled ? 'on' : 'off'}`,
    initialTape: {
      cells: machine?.fixtures?.baselineTape?.cells || ['1', '1', '1'],
      offset: machine?.fixtures?.baselineTape?.offset || 0
    },
    initialize: true
  });
  const cpuStart = process.cpuUsage();
  const wallStart = performance.now();
  for (let tick = 0; tick < steps; tick++) {
    const context = TcScheduler.beginTick({ tick, dt: 1 });
    TcScheduler.runPhase('capture', context);
    TcScheduler.runPhase('compute', context);
    TcScheduler.runPhase('commit', context);
    TcScheduler.endTick(context);
    stepper.buildSnapshot(tick);
  }
  const wallElapsed = performance.now() - wallStart;
  const cpuElapsed = process.cpuUsage(cpuStart);
  unsubscribe();
  TapeMachineRegistry.clear();
  return { steps, wallElapsed, cpuElapsed };
};

const formatMeasurements = ({ steps, wallElapsed, cpuElapsed }) => {
  const wallSeconds = wallElapsed / 1000;
  const fps = wallSeconds > 0 ? steps / wallSeconds : null;
  const cpuUserMs = cpuElapsed.user / 1000;
  const cpuSystemMs = cpuElapsed.system / 1000;
  const cpuTotalMs = cpuUserMs + cpuSystemMs;
  const cpuPerStepMs = steps > 0 ? cpuTotalMs / steps : null;
  const wallPerStepMs = steps > 0 ? wallElapsed / steps : null;
  return {
    steps,
    wallElapsedMs: Number(wallElapsed.toFixed(3)),
    wallPerStepMs: wallPerStepMs === null ? null : Number(wallPerStepMs.toFixed(6)),
    fps: fps === null ? null : Number(fps.toFixed(2)),
    cpuUserMs: Number(cpuUserMs.toFixed(3)),
    cpuSystemMs: Number(cpuSystemMs.toFixed(3)),
    cpuTotalMs: Number(cpuTotalMs.toFixed(3)),
    cpuPerStepMs: cpuPerStepMs === null ? null : Number(cpuPerStepMs.toFixed(6))
  };
};

const measureScenario = (label, enabled, fn) => {
  return withTcEnvironment(enabled, () => {
    const raw = fn({ enabled });
    return formatMeasurements(raw);
  });
};

const rule110Enabled = measureScenario('rule110', true, measureRule110);
const rule110Disabled = measureScenario('rule110', false, measureRule110);
const tapeEnabled = measureScenario('tape', true, measureTapeMachine);
const tapeDisabled = measureScenario('tape', false, measureTapeMachine);

const report = {
  generatedAt: new Date().toISOString(),
  note: 'Wall time measured with performance.now(); CPU usage via process.cpuUsage(). Lower wall/cpu per step is better.',
  scenarios: {
    rule110: {
      description: 'Width 256 ether initializer for 2000 ticks.',
      enabled: rule110Enabled,
      disabled: rule110Disabled
    },
    tapeUnary: {
      description: 'Unary incrementer for 2000 ticks with window radius 1.',
      enabled: tapeEnabled,
      disabled: tapeDisabled
    }
  }
};

const outputPath = path.resolve(__dirname, 'tc-performance-report.json');
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`TC performance report written to ${outputPath}`);
console.log(JSON.stringify(report, null, 2));
