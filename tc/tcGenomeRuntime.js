import { TcStorage, TcScheduler, mixSeed } from '../tcStorage.js';
import { CONFIG } from '../config.js';

const CONTEXT_KEY = '__tcGenomeRuntime__';
const DEFAULT_STATE_KEY = 'tc.genome.state';
const DEFAULT_BUFFER_KEY = 'tc.genome.buffer';
const DEFAULT_PROGRAM_KEY = 'tc.genome.program';

const GENOME_SNAPSHOT_TYPE = 'tc.genome.snapshot';

const OPCODES = Object.freeze({
  IF_HUNGER_GT: 'IF_HUNGER_GT',
  IF_CHI_LT: 'IF_CHI_LT',
  SET_EXPLORE: 'SET_EXPLORE',
  SET_BOND_THRESHOLD: 'SET_BOND_THRESHOLD',
  GOTO: 'GOTO'
});

const GENOME_OPCODE_LIST = Object.freeze(Object.values(OPCODES));

const clamp = (value, min, max) => {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const clamp01 = (value) => clamp(value, 0, 1);
const clampIndex = (value, lastIndex) => {
  if (!Number.isFinite(value)) return 0;
  if (lastIndex < 0) return 0;
  const maxIndex = Math.max(0, lastIndex);
  const normalized = Math.floor(value);
  if (normalized < 0) return 0;
  if (normalized > maxIndex) return maxIndex;
  return normalized;
};

const toFiniteNumber = (value, fallback = 0) => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const ensureStateChunk = (storage, key) => {
  let chunk = storage.getChunk(key);
  if (!chunk || typeof chunk !== 'object') {
    chunk = {
      ip: 0,
      halted: true,
      lastTick: -1
    };
    chunk = storage.setChunk(key, chunk, { dirty: false });
  } else {
    if (!Number.isFinite(chunk.ip)) chunk.ip = 0;
    chunk.ip = Math.floor(chunk.ip);
    chunk.halted = Boolean(chunk.halted);
    if (!Number.isFinite(chunk.lastTick)) chunk.lastTick = -1;
  }
  return chunk;
};

const ensureBufferChunk = (storage, key, state) => {
  let chunk = storage.getChunk(key);
  if (!chunk || typeof chunk !== 'object') {
    chunk = {
      ipCurrent: state.ip,
      nextIp: state.ip,
      halted: state.halted,
      executed: null,
      biasUpdates: {}
    };
    chunk = storage.setChunk(key, chunk, { dirty: false });
  } else {
    chunk.ipCurrent = Number.isFinite(chunk.ipCurrent) ? Math.floor(chunk.ipCurrent) : state.ip;
    chunk.nextIp = Number.isFinite(chunk.nextIp) ? Math.floor(chunk.nextIp) : state.ip;
    chunk.halted = Boolean(chunk.halted);
    chunk.executed = chunk.executed && typeof chunk.executed === 'object' ? chunk.executed : null;
    if (!chunk.biasUpdates || typeof chunk.biasUpdates !== 'object') {
      chunk.biasUpdates = {};
    }
  }
  return chunk;
};

const ensureProgramChunk = (storage, key) => {
  let chunk = storage.getChunk(key);
  if (!Array.isArray(chunk)) {
    chunk = storage.setChunk(key, [], { dirty: false });
  }
  return chunk;
};

const resetBuffer = (buffer, state) => {
  buffer.ipCurrent = state.ip;
  buffer.nextIp = state.ip;
  buffer.halted = state.halted;
  buffer.executed = null;
  buffer.canMutate = false;
  const updates = buffer.biasUpdates;
  if (updates && typeof updates === 'object') {
    for (const key of Object.keys(updates)) {
      delete updates[key];
    }
  } else {
    buffer.biasUpdates = {};
  }
};

const cloneInstruction = (instruction) => ({
  op: instruction.op,
  args: Array.isArray(instruction.args) ? instruction.args.slice() : []
});

const buildSnapshotPayload = (tick, state, buffer, program, info = {}) => {
  const payload = {
    type: GENOME_SNAPSHOT_TYPE,
    tick,
    ip: state.ip,
    nextIp: buffer.nextIp,
    halted: Boolean(state.halted || buffer.halted),
    program: program.map(cloneInstruction)
  };
  if (buffer.executed) {
    payload.executed = { ...buffer.executed };
  }
  if (buffer.biasUpdates && Object.keys(buffer.biasUpdates).length > 0) {
    payload.biasUpdates = { ...buffer.biasUpdates };
  }
  const metadata = { ...(info.metadata || {}) };
  if (info.origin) payload.origin = info.origin;
  if (info.manifestKey) payload.manifestKey = info.manifestKey;
  if (Object.keys(metadata).length > 0) {
    payload.metadata = metadata;
  }
  return payload;
};

const MAX_CHI_THRESHOLD = CONFIG.startChi * 4;

const INSTRUCTION_SPECS = {
  [OPCODES.IF_HUNGER_GT]: {
    prepareArgs(args = []) {
      return [toFiniteNumber(args[0], 0), toFiniteNumber(args[1], 0)];
    },
    finalizeArgs(prepared, context) {
      const threshold = clamp01(prepared[0]);
      const target = clampIndex(prepared[1], context.lastIndex);
      return [threshold, target];
    }
  },
  [OPCODES.IF_CHI_LT]: {
    prepareArgs(args = []) {
      return [toFiniteNumber(args[0], 0), toFiniteNumber(args[1], 0)];
    },
    finalizeArgs(prepared, context) {
      const threshold = clamp(prepared[0], 0, MAX_CHI_THRESHOLD);
      const target = clampIndex(prepared[1], context.lastIndex);
      return [threshold, target];
    }
  },
  [OPCODES.SET_EXPLORE]: {
    prepareArgs(args = []) {
      return [toFiniteNumber(args[0], 0)];
    },
    finalizeArgs(prepared) {
      return [clamp01(prepared[0])];
    }
  },
  [OPCODES.SET_BOND_THRESHOLD]: {
    prepareArgs(args = []) {
      return [toFiniteNumber(args[0], 0)];
    },
    finalizeArgs(prepared) {
      return [clamp01(prepared[0])];
    }
  },
  [OPCODES.GOTO]: {
    prepareArgs(args = []) {
      return [toFiniteNumber(args[0], 0)];
    },
    finalizeArgs(prepared, context) {
      return [clampIndex(prepared[0], context.lastIndex)];
    }
  }
};

const normalizeInstruction = (rawInstruction) => {
  if (!rawInstruction) return null;
  if (typeof rawInstruction === 'string') {
    const op = rawInstruction.toUpperCase();
    return INSTRUCTION_SPECS[op] ? { op, args: [] } : null;
  }
  if (Array.isArray(rawInstruction)) {
    if (rawInstruction.length === 0) return null;
    const [opInput, ...rest] = rawInstruction;
    if (typeof opInput !== 'string') return null;
    const op = opInput.toUpperCase();
    if (!INSTRUCTION_SPECS[op]) return null;
    return { op, args: rest };
  }
  if (typeof rawInstruction === 'object') {
    const opInput = rawInstruction.op || rawInstruction.instruction || rawInstruction.code;
    if (typeof opInput !== 'string') return null;
    const op = opInput.toUpperCase();
    if (!INSTRUCTION_SPECS[op]) return null;
    const args = Array.isArray(rawInstruction.args) ? rawInstruction.args : [];
    return { op, args };
  }
  return null;
};

const normalizeGenomeProgram = (programInput = []) => {
  if (!Array.isArray(programInput)) return [];
  const prepared = [];
  for (const entry of programInput) {
    const normalized = normalizeInstruction(entry);
    if (!normalized) continue;
    const spec = INSTRUCTION_SPECS[normalized.op];
    const preparedArgs = spec ? spec.prepareArgs(normalized.args) : [];
    prepared.push({ op: normalized.op, args: preparedArgs });
  }
  const lastIndex = prepared.length - 1;
  const normalized = prepared.map((entry) => {
    const spec = INSTRUCTION_SPECS[entry.op];
    const finalized = spec ? spec.finalizeArgs(entry.args, { lastIndex }) : [];
    return Object.freeze({
      op: entry.op,
      args: finalized
    });
  });
  return Object.freeze(normalized);
};

const normalizeInitializerResult = (result) => {
  if (!result) {
    return { program: [], origin: null, metadata: null, manifestKey: null };
  }
  if (Array.isArray(result)) {
    return { program: result, origin: null, metadata: null, manifestKey: null };
  }
  if (typeof result === 'object') {
    const program = Array.isArray(result.program)
      ? result.program
      : (Array.isArray(result.instructions) ? result.instructions : []);
    return {
      program,
      origin: typeof result.origin === 'string' ? result.origin : (result.origin ?? null),
      metadata: result.metadata && typeof result.metadata === 'object' ? { ...result.metadata } : null,
      manifestKey: typeof result.manifestKey === 'string' ? result.manifestKey : (result.manifestKey ?? null)
    };
  }
  return { program: [], origin: null, metadata: null, manifestKey: null };
};

const createMulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const createSeededRng = (seedValue, label = 0) => {
  const mixed = mixSeed(seedValue, label);
  return createMulberry32(mixed);
};

const genomeEmptyInitializer = () => ({
  program: [],
  origin: 'empty',
  metadata: { length: 0 }
});

const genomeRandomInitializer = (options = {}) => {
  const {
    seed = 0,
    minLength = 3,
    maxLength = 9,
    allowGoto = true,
    includeChi = true
  } = options || {};
  const min = Math.max(0, Math.floor(minLength));
  const max = Math.max(min, Math.floor(maxLength));
  const rng = createSeededRng(seed, 0x47534e4d);
  const length = min === max ? min : (min + Math.floor(rng() * (max - min + 1)));
  const program = [];
  const opcodePool = GENOME_OPCODE_LIST.filter((op) => {
    if (op === OPCODES.GOTO) return allowGoto;
    if (op === OPCODES.IF_CHI_LT) return includeChi;
    return true;
  });
  const lastIndex = Math.max(0, length - 1);
  for (let i = 0; i < length; i++) {
    const op = opcodePool[Math.floor(rng() * opcodePool.length)] || OPCODES.SET_EXPLORE;
    switch (op) {
      case OPCODES.IF_HUNGER_GT: {
        const threshold = rng();
        const target = Math.floor(rng() * (lastIndex + 1));
        program.push({ op, args: [threshold, target] });
        break;
      }
      case OPCODES.IF_CHI_LT: {
        const threshold = rng() * MAX_CHI_THRESHOLD;
        const target = Math.floor(rng() * (lastIndex + 1));
        program.push({ op, args: [threshold, target] });
        break;
      }
      case OPCODES.SET_BOND_THRESHOLD: {
        const threshold = rng();
        program.push({ op, args: [threshold] });
        break;
      }
      case OPCODES.GOTO: {
        const target = Math.floor(rng() * (lastIndex + 1));
        program.push({ op, args: [target] });
        break;
      }
      case OPCODES.SET_EXPLORE:
      default: {
        const intensity = rng();
        program.push({ op: OPCODES.SET_EXPLORE, args: [intensity] });
        break;
      }
    }
  }
  return {
    program,
    origin: 'prng',
    metadata: {
      seed,
      length: program.length,
      minLength: min,
      maxLength: max,
      allowGoto,
      includeChi
    }
  };
};

const GENOME_INITIALIZERS = Object.freeze({
  empty: genomeEmptyInitializer,
  random: genomeRandomInitializer
});

const resolveGenomeInitializer = (name, options = {}) => {
  const key = typeof name === 'string' ? name.toLowerCase() : '';
  const initializer = GENOME_INITIALIZERS[key] || GENOME_INITIALIZERS.empty;
  return initializer(options);
};

const createGenomeRuntime = (options = {}) => {
  const {
    storage = TcStorage,
    stateKey = DEFAULT_STATE_KEY,
    bufferKey = DEFAULT_BUFFER_KEY,
    programKey = DEFAULT_PROGRAM_KEY,
    initializer = null,
    initializerOptions = {},
    program: initialProgram = null,
    onCapture = null,
    onCommit = null,
    metadata: initialMetadata = {},
    origin: initialOrigin = null,
    manifestKey: initialManifestKey = null,
    initialize = true
  } = options;

  const keys = { state: stateKey, buffer: bufferKey, program: programKey };

  const stateInfo = {
    metadata: { ...initialMetadata },
    origin: initialOrigin,
    manifestKey: initialManifestKey
  };

  const ensureChunks = () => {
    const state = ensureStateChunk(storage, keys.state);
    const buffer = ensureBufferChunk(storage, keys.buffer, state);
    const program = ensureProgramChunk(storage, keys.program);
    return { state, buffer, program };
  };

  const setProgram = (programSource = [], info = {}) => {
    const normalized = normalizeGenomeProgram(programSource);
    storage.setChunk(keys.program, normalized, { dirty: false });
    const { state, buffer } = ensureChunks();
    state.ip = 0;
    state.halted = normalized.length === 0;
    state.lastTick = -1;
    resetBuffer(buffer, state);
    storage.markDirty(stateKey, true);
    storage.markDirty(bufferKey, false);
    if (info.metadata) {
      stateInfo.metadata = { ...stateInfo.metadata, ...info.metadata };
    }
    if (typeof info.origin !== 'undefined') {
      stateInfo.origin = info.origin;
    }
    if (typeof info.manifestKey !== 'undefined') {
      stateInfo.manifestKey = info.manifestKey;
    }
    return normalized;
  };

  const applyInitializer = (init, initOptions = {}) => {
    const descriptor = typeof init === 'string'
      ? resolveGenomeInitializer(init, initOptions)
      : (typeof init === 'function' ? init(initOptions) : init);
    const normalizedResult = normalizeInitializerResult(descriptor);
    return setProgram(normalizedResult.program, {
      metadata: normalizedResult.metadata,
      origin: normalizedResult.origin,
      manifestKey: normalizedResult.manifestKey
    });
  };

  if (initialize) {
    if (initializer) {
      applyInitializer(initializer, initializerOptions);
    } else if (initialProgram) {
      setProgram(initialProgram);
    } else {
      ensureChunks();
    }
  } else {
    ensureChunks();
  }

  const getTickContext = (ctx = {}) => {
    let bag = ctx[CONTEXT_KEY];
    if (!bag) {
      const chunks = ensureChunks();
      bag = chunks;
      ctx[CONTEXT_KEY] = bag;
    }
    if (!Array.isArray(bag.program)) {
      bag.program = ensureProgramChunk(storage, keys.program);
    }
    return bag;
  };

  const getProgramSnapshot = () => {
    const program = ensureProgramChunk(storage, keys.program);
    return program.map(cloneInstruction);
  };

  return {
    get origin() {
      return stateInfo.origin;
    },
    get metadata() {
      return { ...stateInfo.metadata };
    },
    get manifestKey() {
      return stateInfo.manifestKey;
    },
    getState() {
      const { state } = ensureChunks();
      return { ip: state.ip, halted: state.halted, lastTick: state.lastTick };
    },
    getProgram() {
      return getProgramSnapshot();
    },
    setProgram,
    applyInitializer,
    capture(ctx = {}) {
      const bag = getTickContext(ctx);
      resetBuffer(bag.buffer, bag.state);
      storage.markDirty(bufferKey, false);
      if (typeof onCapture === 'function') {
        const tick = ctx.tick ?? 0;
        const payload = buildSnapshotPayload(tick, bag.state, bag.buffer, bag.program, stateInfo);
        onCapture({ tick, payload, state: bag.state, buffer: bag.buffer, program: bag.program });
      }
      return bag.buffer;
    },
    compute(ctx = {}) {
      const bag = getTickContext(ctx);
      const { state, buffer, program } = bag;
      const tick = ctx.tick ?? 0;
      if (state.lastTick === tick) {
        return buffer;
      }
      if (!Array.isArray(program) || program.length === 0) {
        state.halted = true;
        buffer.halted = true;
        buffer.nextIp = state.ip;
        storage.markDirty(bufferKey, true);
        return buffer;
      }
      if (state.halted) {
        buffer.halted = true;
        buffer.nextIp = state.ip;
        storage.markDirty(bufferKey, true);
        return buffer;
      }
      const lastIndex = program.length - 1;
      let ip = state.ip;
      if (ip < 0 || ip > lastIndex) {
        buffer.halted = true;
        buffer.nextIp = clampIndex(ip, lastIndex);
        state.halted = true;
        storage.markDirty(bufferKey, true);
        return buffer;
      }
      const instruction = program[ip];
      if (!instruction) {
        buffer.halted = true;
        buffer.nextIp = clampIndex(ip, lastIndex);
        state.halted = true;
        storage.markDirty(bufferKey, true);
        return buffer;
      }
      const executed = { index: ip, op: instruction.op, args: instruction.args.slice() };
      buffer.executed = executed;
      buffer.ipCurrent = ip;
      const bundle = ctx.bundle || null;
      const canMutate = Boolean(bundle && bundle.alive !== false);
      let nextIp = ip + 1;

      switch (instruction.op) {
        case OPCODES.IF_HUNGER_GT: {
          const threshold = instruction.args[0] ?? 0;
          const hunger = bundle ? clamp01(toFiniteNumber(bundle.hunger, 0)) : 0;
          if (hunger > threshold) {
            nextIp = instruction.args[1] ?? nextIp;
          }
          break;
        }
        case OPCODES.IF_CHI_LT: {
          const threshold = instruction.args[0] ?? 0;
          const chi = bundle ? clamp(bundle.chi ?? 0, 0, MAX_CHI_THRESHOLD) : 0;
          if (chi < threshold) {
            nextIp = instruction.args[1] ?? nextIp;
          }
          break;
        }
        case OPCODES.SET_EXPLORE: {
          const intensity = clamp01(instruction.args[0] ?? 0);
          buffer.biasUpdates.distress = intensity;
          break;
        }
        case OPCODES.SET_BOND_THRESHOLD: {
          const threshold = clamp01(instruction.args[0] ?? 0);
          const conflictBias = clamp01(1 - threshold);
          buffer.biasUpdates.bond = conflictBias;
          break;
        }
        case OPCODES.GOTO: {
          nextIp = instruction.args[0] ?? nextIp;
          break;
        }
        default:
          break;
      }

      if (nextIp < 0 || nextIp > lastIndex) {
        buffer.halted = true;
        buffer.nextIp = nextIp < 0 ? 0 : nextIp;
      } else {
        buffer.halted = false;
        buffer.nextIp = Math.floor(nextIp);
      }

      buffer.canMutate = canMutate;
      storage.markDirty(bufferKey, true);
      return buffer;
    },
    commit(ctx = {}) {
      const bag = getTickContext(ctx);
      const { state, buffer, program } = bag;
      const tick = ctx.tick ?? 0;
      const nextIp = Number.isFinite(buffer.nextIp) ? Math.floor(buffer.nextIp) : state.ip;
      const lastIndex = program.length - 1;
      state.ip = nextIp;
      const halted = buffer.halted || nextIp < 0 || nextIp > lastIndex || program.length === 0;
      state.halted = halted;
      state.lastTick = tick;

      const bundle = ctx.bundle || null;
      if (bundle && buffer.biasUpdates) {
        const updates = buffer.biasUpdates;
        if (!bundle.interpretation_bias || typeof bundle.interpretation_bias !== 'object') {
          bundle.interpretation_bias = {};
        }
        if (buffer.canMutate) {
          if (Object.prototype.hasOwnProperty.call(updates, 'distress')) {
            bundle.interpretation_bias.distress = clamp01(updates.distress);
          }
          if (Object.prototype.hasOwnProperty.call(updates, 'bond')) {
            bundle.interpretation_bias.bond = clamp01(updates.bond);
          }
        }
      }

      storage.markDirty(stateKey, true);
      storage.markDirty(bufferKey, false);

      if (typeof onCommit === 'function') {
        const payload = buildSnapshotPayload(tick, state, buffer, program, stateInfo);
        onCommit({ tick, payload, state, buffer, program });
      }
      buffer.canMutate = false;
      return state;
    },
    buildSnapshot(tick = 0) {
      const { state, buffer, program } = ensureChunks();
      return buildSnapshotPayload(tick, state, buffer, program, stateInfo);
    }
  };
};

const registerGenomeRuntime = (options = {}) => {
  const runtime = createGenomeRuntime(options);
  const unsubscribe = TcScheduler.registerHooks({
    capture(ctx) {
      runtime.capture(ctx);
    },
    compute(ctx) {
      runtime.compute(ctx);
    },
    commit(ctx) {
      runtime.commit(ctx);
    }
  });
  return { runtime, unsubscribe };
};

export {
  OPCODES as GENOME_OPCODES,
  GENOME_OPCODE_LIST,
  GENOME_INITIALIZERS,
  normalizeGenomeProgram,
  resolveGenomeInitializer,
  genomeEmptyInitializer,
  genomeRandomInitializer,
  createGenomeRuntime,
  registerGenomeRuntime
};
