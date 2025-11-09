import { TcScheduler, TcStorage } from '../tcStorage.js';

const DEFAULT_CHUNK_SIZE = 128;
const DEFAULT_STATE_KEY = 'tc.tape.state';
const DEFAULT_TAPE_PREFIX = 'tc.tape.chunk.';
const DEFAULT_WINDOW_RADIUS = null;

const MOVE_DELTAS = Object.freeze({
  L: -1,
  R: 1,
  N: 0
});

const normalizeMove = (value) => {
  const move = typeof value === 'string' ? value.toUpperCase() : 'N';
  return move in MOVE_DELTAS ? move : 'N';
};

const ensureObject = (value, fallback = {}) => (value && typeof value === 'object') ? value : { ...fallback };

const TapeMachineRegistry = (() => {
  const machines = new Map();

  return Object.freeze({
    register(idOrMachine, definition = null, options = {}) {
      let id = null;
      let descriptor = null;
      if (typeof idOrMachine === 'string') {
        id = idOrMachine;
        descriptor = definition;
      } else if (idOrMachine && typeof idOrMachine === 'object') {
        descriptor = idOrMachine;
        id = idOrMachine.id || null;
      }
      if (!descriptor || typeof descriptor !== 'object') {
        throw new Error('TapeMachineRegistry.register expects a machine descriptor.');
      }
      const normalized = normalizeTapeMachine(descriptor, { id });
      if (machines.has(normalized.id) && options.overwrite === false) {
        return machines.get(normalized.id);
      }
      machines.set(normalized.id, normalized);
      return normalized;
    },

    get(id) {
      return machines.get(id) || null;
    },

    has(id) {
      return machines.has(id);
    },

    unregister(id) {
      return machines.delete(id);
    },

    clear() {
      machines.clear();
    },

    list() {
      return Array.from(machines.keys());
    },

    entries() {
      return Array.from(machines.entries());
    },

    size() {
      return machines.size;
    }
  });
})();

const normalizeTapeMachine = (machine, options = {}) => {
  if (!machine || typeof machine !== 'object') {
    throw new Error('Invalid tape machine descriptor: expected object.');
  }
  const id = machine.id || options.id;
  if (!id) {
    throw new Error('Tape machine descriptor is missing an id.');
  }
  const alphabetSource = Array.isArray(machine.alphabet) ? machine.alphabet : null;
  if (!alphabetSource || alphabetSource.length === 0) {
    throw new Error(`Tape machine '${id}' is missing alphabet definition.`);
  }
  const alphabet = [];
  const symbolToCode = new Map();
  alphabetSource.forEach((symbol) => {
    const normalizedSymbol = typeof symbol === 'string' ? symbol : String(symbol ?? '');
    if (!symbolToCode.has(normalizedSymbol)) {
      symbolToCode.set(normalizedSymbol, alphabet.length);
      alphabet.push(normalizedSymbol);
    }
  });
  const blankSymbol = typeof machine.blank === 'string' ? machine.blank : (typeof machine.blankSymbol === 'string' ? machine.blankSymbol : null);
  if (!blankSymbol || !symbolToCode.has(blankSymbol)) {
    throw new Error(`Tape machine '${id}' references missing blank symbol '${blankSymbol}'.`);
  }
  const blankCode = symbolToCode.get(blankSymbol);
  const codeToSymbol = alphabet.slice();
  const initialState = machine.initialState || machine.startState;
  if (!initialState || typeof initialState !== 'string') {
    throw new Error(`Tape machine '${id}' is missing an initial state.`);
  }
  const rawStates = machine.states || machine.transitions;
  if (!rawStates || typeof rawStates !== 'object') {
    throw new Error(`Tape machine '${id}' is missing state transition tables.`);
  }
  const haltStates = new Set(Array.isArray(machine.haltStates) ? machine.haltStates : []);
  const normalizedStates = {};
  for (const [stateName, transitions] of Object.entries(rawStates)) {
    if (!transitions || typeof transitions !== 'object') {
      normalizedStates[stateName] = {};
      continue;
    }
    const normalizedTransitions = {};
    for (const [symbolKey, action] of Object.entries(transitions)) {
      if (!action) continue;
      const targetSymbol = symbolKey;
      const resolvedWrite = action.write ?? action.writeSymbol ?? targetSymbol;
      const writeSymbol = typeof resolvedWrite === 'string' ? resolvedWrite : String(resolvedWrite ?? '');
      if (!symbolToCode.has(writeSymbol)) {
        throw new Error(`Tape machine '${id}' writes unknown symbol '${writeSymbol}' in state '${stateName}'.`);
      }
      const move = normalizeMove(action.move ?? action.direction ?? 'N');
      const nextState = typeof action.next === 'string' ? action.next : (typeof action.nextState === 'string' ? action.nextState : stateName);
      normalizedTransitions[targetSymbol] = {
        write: writeSymbol,
        move,
        next: nextState,
        halt: Boolean(action.halt)
      };
    }
    normalizedStates[stateName] = normalizedTransitions;
  }
  const metadata = ensureObject(machine.metadata);
  if (!metadata.machineId) {
    metadata.machineId = id;
  }
  const snapshotSchema = typeof machine.snapshotSchema === 'string'
    ? machine.snapshotSchema
    : (machine.schema && typeof machine.schema === 'string' ? machine.schema : null);

  return Object.freeze({
    id,
    alphabet,
    blank: blankSymbol,
    blankCode,
    symbolToCode,
    codeToSymbol,
    states: normalizedStates,
    haltStates,
    initialState,
    metadata,
    snapshotSchema: snapshotSchema || null
  });
};

const computeChunkIndex = (position, chunkSize) => {
  const index = Math.floor(position / chunkSize);
  const offset = position - index * chunkSize;
  return { index, offset };
};

const createTapeMachineStepper = (options = {}) => {
  const {
    machine: machineInput = null,
    machineId = null,
    storage = TcStorage,
    stateKey = DEFAULT_STATE_KEY,
    tapePrefix = DEFAULT_TAPE_PREFIX,
    chunkSize = DEFAULT_CHUNK_SIZE,
    window: windowOptions = {},
    initialTape = null,
    initialHeadPosition = 0,
    initialize = true,
    onCapture = null,
    onCommit = null,
    metadata: overrideMetadata = null
  } = options;

  let machine = machineInput;
  if (!machine && machineId) {
    machine = TapeMachineRegistry.get(machineId);
  }
  if (!machine) {
    throw new Error('createTapeMachineStepper requires a machine definition or machineId.');
  }
  if (!machine.symbolToCode || !machine.codeToSymbol) {
    machine = normalizeTapeMachine(machine, { id: machine.id || machineId });
  }
  const windowRadius = typeof windowOptions.radius === 'number'
    ? Math.max(0, Math.floor(windowOptions.radius))
    : DEFAULT_WINDOW_RADIUS;

  const chunkCache = new Map();
  let pendingAction = null;

  const encodeSymbol = (symbol) => {
    const normalizedSymbol = typeof symbol === 'string' ? symbol : String(symbol ?? '');
    const code = machine.symbolToCode.get(normalizedSymbol);
    if (code === undefined) {
      throw new Error(`Unknown tape symbol '${normalizedSymbol}' for machine '${machine.id}'.`);
    }
    return code;
  };

  const decodeCode = (code) => {
    if (typeof code !== 'number' || Number.isNaN(code)) {
      return machine.blank;
    }
    return machine.codeToSymbol[code] ?? machine.blank;
  };

  const getChunkKey = (chunkIndex) => `${tapePrefix}${chunkIndex}`;

  const getChunkEntry = (chunkIndex) => {
    if (chunkCache.has(chunkIndex)) {
      return chunkCache.get(chunkIndex);
    }
    const key = getChunkKey(chunkIndex);
    const data = storage.getChunk(key);
    if (data instanceof Uint8Array && data.length === chunkSize) {
      const entry = { key, data };
      chunkCache.set(chunkIndex, entry);
      return entry;
    }
    return null;
  };

  const ensureChunkEntry = (chunkIndex) => {
    const cached = getChunkEntry(chunkIndex);
    if (cached) return cached;
    const key = getChunkKey(chunkIndex);
    const buffer = new Uint8Array(chunkSize);
    buffer.fill(machine.blankCode);
    const data = storage.setChunk(key, buffer, { dirty: false, meta: { chunkIndex } });
    const entry = { key, data };
    chunkCache.set(chunkIndex, entry);
    return entry;
  };

  const readSymbolCode = (position) => {
    const { index, offset } = computeChunkIndex(position, chunkSize);
    const entry = ensureChunkEntry(index);
    return entry.data[offset];
  };

  const writeSymbolCode = (position, code) => {
    const { index, offset } = computeChunkIndex(position, chunkSize);
    const entry = ensureChunkEntry(index);
    entry.data[offset] = code;
    storage.markDirty(entry.key, true);
    return entry.data[offset];
  };

  const ensureState = () => {
    let state = storage.getChunk(stateKey);
    if (!state || typeof state !== 'object' || !state.head) {
      state = {
        head: {
          position: initialHeadPosition,
          state: machine.initialState,
          halted: false,
          direction: 'N'
        },
        bounds: {
          min: initialHeadPosition,
          max: initialHeadPosition
        },
        metadata: { machineId: machine.id, ...(overrideMetadata || {}) }
      };
      storage.setChunk(stateKey, state, { dirty: false });
    } else {
      state.head.position = Number.isInteger(state.head.position) ? state.head.position : initialHeadPosition;
      state.head.state = typeof state.head.state === 'string' ? state.head.state : machine.initialState;
      state.head.halted = Boolean(state.head.halted);
      state.head.direction = typeof state.head.direction === 'string' ? state.head.direction : 'N';
      state.bounds = state.bounds && typeof state.bounds === 'object'
        ? state.bounds
        : { min: state.head.position, max: state.head.position };
      state.bounds.min = Number.isInteger(state.bounds.min) ? state.bounds.min : state.head.position;
      state.bounds.max = Number.isInteger(state.bounds.max) ? state.bounds.max : state.head.position;
      state.metadata = { machineId: machine.id, ...(state.metadata || {}), ...(overrideMetadata || {}) };
    }
    return state;
  };

  const updateBounds = (position) => {
    const state = ensureState();
    state.bounds.min = Math.min(state.bounds.min, position);
    state.bounds.max = Math.max(state.bounds.max, position);
    return state.bounds;
  };

  const clearTape = () => {
    for (const entry of chunkCache.values()) {
      entry.data.fill(machine.blankCode);
      storage.markDirty(entry.key, true);
    }
    chunkCache.clear();
    storage.markDirty(stateKey, true);
  };

  const normalizeInitialTape = (source) => {
    if (!source) {
      return { offset: 0, cells: [] };
    }
    if (typeof source === 'string') {
      return { offset: 0, cells: Array.from(source) };
    }
    if (Array.isArray(source)) {
      return { offset: 0, cells: source.slice() };
    }
    if (typeof source === 'object') {
      const offset = Number.isInteger(source.offset) ? source.offset : (Number.isInteger(source.origin) ? source.origin : 0);
      if (typeof source.cells === 'string') {
        return { offset, cells: Array.from(source.cells) };
      }
      if (Array.isArray(source.cells)) {
        return { offset, cells: source.cells.slice() };
      }
    }
    return { offset: 0, cells: [] };
  };

  const applyInitialTape = (source) => {
    const state = ensureState();
    clearTape();
    const { offset, cells } = normalizeInitialTape(source);
    state.head.position = initialHeadPosition;
    state.head.state = machine.initialState;
    state.head.halted = false;
    state.head.direction = 'N';
    state.bounds.min = state.head.position;
    state.bounds.max = state.head.position;
    if (Array.isArray(cells) && cells.length > 0) {
      for (let i = 0; i < cells.length; i++) {
        const position = offset + i;
        const symbol = cells[i];
        const code = encodeSymbol(symbol);
        writeSymbolCode(position, code);
        updateBounds(position);
      }
    }
    storage.markDirty(stateKey, true);
    pendingAction = null;
  };

  if (initialize) {
    applyInitialTape(initialTape);
  } else {
    ensureState();
  }

  const computeAction = () => {
    const state = ensureState();
    if (state.head.halted) {
      pendingAction = null;
      return null;
    }
    const currentStateName = state.head.state;
    const transitions = machine.states[currentStateName] || {};
    const position = state.head.position;
    const currentCode = readSymbolCode(position);
    const currentSymbol = decodeCode(currentCode);
    let action = transitions[currentSymbol];
    if (!action && transitions['*']) {
      action = transitions['*'];
    }
    if (!action) {
      pendingAction = {
        position,
        writeCode: currentCode,
        direction: 'N',
        moveDelta: 0,
        nextState: currentStateName,
        halt: true
      };
      return pendingAction;
    }
    const writeCode = encodeSymbol(action.write);
    const direction = normalizeMove(action.move);
    const moveDelta = MOVE_DELTAS[direction] ?? 0;
    const nextState = action.next || currentStateName;
    const halt = Boolean(action.halt || machine.haltStates.has(nextState));
    pendingAction = {
      position,
      writeCode,
      direction,
      moveDelta,
      nextState,
      halt
    };
    return pendingAction;
  };

  const buildSnapshot = (tick = 0) => {
    const state = ensureState();
    const headPosition = state.head.position;
    const boundsMin = Math.min(state.bounds.min, headPosition);
    const boundsMax = Math.max(state.bounds.max, headPosition);
    let windowStart = boundsMin;
    let windowEnd = boundsMax + 1;
    if (windowRadius !== null) {
      windowStart = Math.min(windowStart, headPosition - windowRadius);
      windowEnd = Math.max(windowEnd, headPosition + windowRadius + 1);
    }
    const tape = [];
    for (let pos = windowStart; pos < windowEnd; pos++) {
      const symbolCode = readSymbolCode(pos);
      tape.push(decodeCode(symbolCode));
    }
    const payload = {
      type: 'tc.turing_tape.snapshot',
      tick,
      head: {
        position: headPosition,
        state: state.head.state,
        halted: Boolean(state.head.halted),
        direction: state.head.direction || 'N'
      },
      tape
    };
    if (windowStart !== 0 || windowEnd !== tape.length) {
      payload.window = { start: windowStart, end: windowEnd };
    } else {
      payload.window = { start: windowStart, end: windowEnd };
    }
    const metadata = { machineId: machine.id, ...(state.metadata || {}) };
    payload.metadata = metadata;
    return payload;
  };

  const capture = (ctx = {}) => {
    const tick = ctx.tick ?? 0;
    const snapshot = buildSnapshot(tick);
    if (typeof onCapture === 'function') {
      onCapture({ tick, payload: snapshot });
    }
    return snapshot;
  };

  const compute = (_ctx = {}) => {
    const action = computeAction();
    return action || null;
  };

  const commit = (ctx = {}) => {
    const state = ensureState();
    if (state.head.halted) {
      pendingAction = null;
      const snapshot = buildSnapshot(ctx.tick ?? 0);
      if (typeof onCommit === 'function') {
        onCommit({ tick: ctx.tick ?? 0, payload: snapshot });
      }
      return snapshot;
    }
    const action = pendingAction || computeAction();
    if (!action) {
      const snapshot = buildSnapshot(ctx.tick ?? 0);
      if (typeof onCommit === 'function') {
        onCommit({ tick: ctx.tick ?? 0, payload: snapshot });
      }
      return snapshot;
    }
    writeSymbolCode(action.position, action.writeCode);
    updateBounds(action.position);
    const newPosition = action.position + action.moveDelta;
    updateBounds(newPosition);
    state.head.position = newPosition;
    state.head.state = action.nextState;
    state.head.direction = action.direction;
    state.head.halted = Boolean(action.halt);
    storage.markDirty(stateKey, true);
    pendingAction = null;
    const snapshot = buildSnapshot(ctx.tick ?? 0);
    if (typeof onCommit === 'function') {
      onCommit({ tick: ctx.tick ?? 0, payload: snapshot });
    }
    return snapshot;
  };

  const getState = () => {
    const state = ensureState();
    return {
      head: { ...state.head },
      bounds: { ...state.bounds },
      metadata: { ...(state.metadata || {}) },
      machineId: machine.id
    };
  };

  const setCell = (position, symbol) => {
    const code = encodeSymbol(symbol);
    writeSymbolCode(position, code);
    updateBounds(position);
    storage.markDirty(stateKey, true);
  };

  const getCell = (position) => {
    const code = readSymbolCode(position);
    return decodeCode(code);
  };

  const reset = (source = initialTape) => {
    applyInitialTape(source);
  };

  const getTapeWindow = (start = null, end = null) => {
    const state = ensureState();
    const windowStart = start === null ? state.bounds.min : start;
    const windowEnd = end === null ? state.bounds.max + 1 : end;
    const tape = [];
    for (let pos = windowStart; pos < windowEnd; pos++) {
      tape.push(getCell(pos));
    }
    return { start: windowStart, end: windowEnd, tape };
  };

  return {
    getMachine() {
      return machine;
    },
    getState,
    capture,
    compute,
    commit,
    reset,
    setCell,
    getCell,
    getTapeWindow,
    buildSnapshot
  };
};

const registerTapeMachine = (options = {}) => {
  const { machineId = null, machine = null } = options;
  if (!machine && !machineId) {
    throw new Error('registerTapeMachine requires a machine or machineId option.');
  }
  const stepper = createTapeMachineStepper(options);
  const unsubscribe = TcScheduler.registerHooks({
    capture(ctx) {
      stepper.capture(ctx);
    },
    compute(ctx) {
      stepper.compute(ctx);
    },
    commit(ctx) {
      stepper.commit(ctx);
    }
  });
  return { stepper, unsubscribe };
};

export {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_STATE_KEY,
  DEFAULT_TAPE_PREFIX,
  TapeMachineRegistry,
  normalizeTapeMachine,
  createTapeMachineStepper,
  registerTapeMachine
};

if (typeof window !== 'undefined') {
  window.TcTape = {
    TapeMachineRegistry,
    createTapeMachineStepper,
    registerTapeMachine
  };
}
