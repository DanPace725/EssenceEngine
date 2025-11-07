import { clamp } from '../utils/math.js';
import { SignalField } from '../../signalField.js';

const noop = () => {};
const noopNumber = () => 0;

const EPSILON = 1e-6;
const DEFAULT_FORCE_FRACTION = 0.35;
const MIN_FADE = 1e-3;
const MIN_WAVE_INTENSITY = 1e-3;
const DEFAULT_WAVE_INTERVAL = 0.28;
const DEFAULT_WAVE_DISTANCE = 36;
const DEFAULT_WAVE_GROWTH_RATE = 320;

const MODE_CHANNELS = {
  resource: 0,
  distress: 1,
  bond: 2
};

const MODE_COLORS = {
  resource: { r: 64, g: 224, b: 208 },
  distress: { r: 255, g: 99, b: 132 },
  bond: { r: 153, g: 102, b: 255 }
};

const toFiniteNumber = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sanitizeForce = (force) => {
  if (!force || typeof force !== 'object') {
    return { ax: 0, ay: 0 };
  }
  const ax = toFiniteNumber(force.ax, 0);
  const ay = toFiniteNumber(force.ay, 0);
  return { ax, ay };
};

const resetForce = (stateRef) => {
  stateRef.lastForce = { ax: 0, ay: 0 };
};

const state = {
  mode: 'idle',
  isActive: false,
  cursor: { x: 0, y: 0, visible: false },
  activeFields: new Map(),
  pointerEmitters: new Map(),
  signalWaves: [],
  waveSequence: 0,
  timers: {
    elapsed: 0,
    delta: 0,
    modeStart: 0,
    inactiveTime: 0
  },
  lastForce: { ax: 0, ay: 0 }
};

const hooks = {
  configResolver: () => ({}),
  onUpdate: noop,
  onApplyForce: noop,
  onSampleEnergy: noopNumber,
  onSampleSignal: noopNumber,
  onDraw: noop
};

const pointerHooks = {
  onPointerDown: noop,
  onPointerMove: noop,
  onPointerUp: noop,
  onPointerCancel: noop
};

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const toColor = (value, fallback = { r: 255, g: 255, b: 255 }) => {
  if (Array.isArray(value) && value.length >= 3) {
    const [r, g, b] = value;
    return {
      r: clamp(Math.round(toFiniteNumber(r, fallback.r)), 0, 255),
      g: clamp(Math.round(toFiniteNumber(g, fallback.g)), 0, 255),
      b: clamp(Math.round(toFiniteNumber(b, fallback.b)), 0, 255)
    };
  }
  if (value && typeof value === 'object') {
    return {
      r: clamp(Math.round(toFiniteNumber(value.r, fallback.r)), 0, 255),
      g: clamp(Math.round(toFiniteNumber(value.g, fallback.g)), 0, 255),
      b: clamp(Math.round(toFiniteNumber(value.b, fallback.b)), 0, 255)
    };
  }
  if (typeof value === 'string') {
    const match = value.trim().match(/^#?([0-9a-f]{6})$/i);
    if (match) {
      const hex = match[1];
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        return { r, g, b };
      }
    }
  }
  return { ...fallback };
};

const resolveModeChannel = (mode, config) => {
  const modeConfig = config?.modes?.[mode] || {};
  if (Number.isFinite(modeConfig.signalChannel)) {
    return clamp(Math.floor(modeConfig.signalChannel), 0, Number.MAX_SAFE_INTEGER);
  }
  if (typeof modeConfig.signalChannel === 'string') {
    const parsed = parseInt(modeConfig.signalChannel, 10);
    if (Number.isFinite(parsed)) {
      return clamp(Math.floor(parsed), 0, Number.MAX_SAFE_INTEGER);
    }
  }
  return MODE_CHANNELS[mode] ?? 0;
};

const resolveModeColor = (mode, config) => {
  const modeConfig = config?.modes?.[mode] || {};
  if (modeConfig.waveColor !== undefined) {
    return toColor(modeConfig.waveColor, MODE_COLORS[mode] || MODE_COLORS.resource);
  }
  return MODE_COLORS[mode] || MODE_COLORS.resource;
};

const ensurePointerHandlers = () => {
  if (pointerHooks.onPointerDown === noop) {
    pointerHooks.onPointerDown = defaultPointerDown;
  }
  if (pointerHooks.onPointerMove === noop) {
    pointerHooks.onPointerMove = defaultPointerMove;
  }
  if (pointerHooks.onPointerUp === noop) {
    pointerHooks.onPointerUp = defaultPointerUp;
  }
  if (pointerHooks.onPointerCancel === noop) {
    pointerHooks.onPointerCancel = defaultPointerUp;
  }
};

function defaultPointerDown(localState, config, payload) {
  if (!config?.enabled || !payload) {
    return;
  }
  const pointerId = payload.pointerId ?? 'default';
  const mode = resolvePointerMode(payload);
  setMode(mode);
  setActive(true);
  setCursor({ x: payload.x, y: payload.y, visible: true });
  const modeConfig = config?.modes?.[mode] || {};
  const radius = Math.max(0, toFiniteNumber(modeConfig.radius, 0));
  const strength = Math.max(0, toFiniteNumber(modeConfig.strength, 0));
  const decay = Math.max(0, toFiniteNumber(modeConfig.decay, 0));
  setActiveFieldEntry(pointerId, {
    mode,
    x: payload.x,
    y: payload.y,
    radius,
    strength,
    decay
  });
  spawnSignalWave({
    x: payload.x,
    y: payload.y,
    mode,
    strength,
    radius,
    decay,
    config
  });
  localState.pointerEmitters.set(pointerId, {
    id: pointerId,
    mode,
    x: payload.x,
    y: payload.y,
    lastSpawnTime: localState.timers.elapsed
  });
  if (payload.nativeEvent && typeof payload.nativeEvent.preventDefault === 'function') {
    payload.nativeEvent.preventDefault();
  }
}

function defaultPointerMove(localState, config, payload) {
  if (!payload) {
    return;
  }
  setCursor({ x: payload.x, y: payload.y, visible: true });
  if (!config?.enabled) {
    return;
  }
  const pointerId = payload.pointerId ?? 'default';
  const emitter = localState.pointerEmitters.get(pointerId);
  if (!emitter) {
    return;
  }
  const mode = emitter.mode;
  const modeConfig = config?.modes?.[mode] || {};
  const radius = Math.max(0, toFiniteNumber(modeConfig.radius, 0));
  const strength = Math.max(0, toFiniteNumber(modeConfig.strength, 0));
  const decay = Math.max(0, toFiniteNumber(modeConfig.decay, 0));
  setActiveFieldEntry(pointerId, {
    mode,
    x: payload.x,
    y: payload.y,
    radius,
    strength,
    decay
  });
  const now = localState.timers.elapsed;
  const dx = payload.x - emitter.x;
  const dy = payload.y - emitter.y;
  const dist = Math.hypot(dx, dy);
  const movedEnough = dist >= DEFAULT_WAVE_DISTANCE;
  const waitedEnough = now - emitter.lastSpawnTime >= DEFAULT_WAVE_INTERVAL;
  if (movedEnough || waitedEnough) {
    spawnSignalWave({
      x: payload.x,
      y: payload.y,
      mode,
      strength,
      radius,
      decay,
      config
    });
    emitter.x = payload.x;
    emitter.y = payload.y;
    emitter.lastSpawnTime = now;
  }
}

function defaultPointerUp(localState, _config, payload) {
  const pointerId = payload?.pointerId ?? 'default';
  setActiveFieldEntry(pointerId, null);
  localState.pointerEmitters.delete(pointerId);
  if (localState.pointerEmitters.size === 0) {
    setActive(false);
    setCursor({ visible: false });
  }
}

const resolvePointerMode = (payload) => {
  const modifiers = payload?.modifiers || {};
  if (modifiers.alt || modifiers.ctrl || payload?.button === 1) {
    return 'bond';
  }
  if (modifiers.shift || modifiers.meta || payload?.button === 2) {
    return 'distress';
  }
  return 'resource';
};

function getConfig() {
  try {
    return hooks.configResolver(state) || {};
  } catch (error) {
    return {};
  }
}

function setMode(mode) {
  if (typeof mode === 'string' && mode !== state.mode) {
    state.mode = mode;
    state.timers.modeStart = state.timers.elapsed;
  }
}

function setActive(isActive) {
  const nextActive = Boolean(isActive);
  if (nextActive !== state.isActive) {
    state.isActive = nextActive;
    state.timers.inactiveTime = nextActive ? 0 : state.timers.inactiveTime;
    if (!nextActive) {
      clearActiveFieldEntries();
      resetForce(state);
    }
  }
}

function setCursor({ x, y, visible }) {
  if (typeof x === 'number') {
    state.cursor.x = x;
  }
  if (typeof y === 'number') {
    state.cursor.y = y;
  }
  if (typeof visible === 'boolean') {
    state.cursor.visible = visible;
  }
}

function setActiveFieldEntry(key, value) {
  if (key === undefined || key === null) {
    return;
  }
  if (value === undefined || value === null) {
    state.activeFields.delete(key);
    state.pointerEmitters.delete(key);
    return;
  }
  const existing = state.activeFields.get(key);
  const createdAt = existing?.createdAt ?? state.timers.elapsed;
  state.activeFields.set(key, {
    ...existing,
    ...value,
    createdAt,
    updatedAt: state.timers.elapsed
  });
}

function clearActiveFieldEntries() {
  state.activeFields.clear();
  state.pointerEmitters.clear();
  resetForce(state);
}

function spawnSignalWave({
  x,
  y,
  mode = state.mode,
  strength,
  radius,
  decay,
  color,
  channel,
  growthRate,
  config
} = {}) {
  const px = toFiniteNumber(x, NaN);
  const py = toFiniteNumber(y, NaN);
  if (!Number.isFinite(px) || !Number.isFinite(py)) {
    return null;
  }

  const resolvedConfig = config || getConfig();
  const modeConfig = resolvedConfig?.modes?.[mode] || {};
  if (typeof mode === 'string') {
    setMode(mode);
  }
  const defaultStrength = toFiniteNumber(modeConfig.strength, 0);
  const defaultRadius = toFiniteNumber(modeConfig.radius, 0);
  const defaultDecay = toFiniteNumber(modeConfig.decay, 0);
  const resolvedStrength = Math.max(0, toFiniteNumber(strength, defaultStrength));
  const resolvedRadius = Math.max(0, toFiniteNumber(radius, defaultRadius));
  const resolvedDecay = Math.max(0, toFiniteNumber(decay, defaultDecay));
  const resolvedChannel = Number.isFinite(channel)
    ? clamp(Math.floor(channel), 0, Number.MAX_SAFE_INTEGER)
    : resolveModeChannel(mode, resolvedConfig);
  const resolvedColor = color
    ? toColor(color, resolveModeColor(mode, resolvedConfig))
    : resolveModeColor(mode, resolvedConfig);
  const defaultGrowth = toFiniteNumber(modeConfig.waveGrowthRate, DEFAULT_WAVE_GROWTH_RATE);
  const resolvedGrowth = Math.max(0, toFiniteNumber(growthRate, defaultGrowth));
  const depositGain = Math.max(0, toFiniteNumber(modeConfig.waveDepositGain, 1));

  const intensity = clamp01(resolvedStrength);
  if (intensity <= 0) {
    return null;
  }

  const wave = {
    id: `wave-${state.waveSequence += 1}`,
    mode,
    x: px,
    y: py,
    radius: Math.max(1, resolvedRadius * 0.1),
    maxRadius: Math.max(resolvedRadius || 1, 1),
    growthRate: resolvedGrowth,
    decay: resolvedDecay,
    intensity,
    depositGain,
    color: resolvedColor,
    channel: resolvedChannel,
    createdAt: state.timers.elapsed,
    updatedAt: state.timers.elapsed
  };

  state.signalWaves.push(wave);

  // Initial pulse so that newly spawned waves are immediately perceivable.
  propagateWaveToSignalField(wave, state.timers.delta || 0.016);

  return wave;
}

function propagateWaveToSignalField(wave, dt) {
  if (!wave || !SignalField || typeof SignalField.deposit !== 'function') {
    return;
  }
  const amount = clamp01(wave.intensity * wave.depositGain * Math.max(dt, 0));
  if (amount <= 0) {
    return;
  }
  SignalField.deposit(wave.x, wave.y, amount, wave.channel);
}

function updateSignalWaves(dt) {
  if (!state.signalWaves.length || !(dt > 0)) {
    return;
  }

  const next = [];
  for (let i = 0; i < state.signalWaves.length; i += 1) {
    const wave = state.signalWaves[i];
    if (!wave) continue;

    wave.updatedAt = state.timers.elapsed;
    if (wave.growthRate > 0 && wave.radius < wave.maxRadius) {
      wave.radius = Math.min(wave.maxRadius, wave.radius + wave.growthRate * dt);
    }

    if (wave.decay > 0) {
      wave.intensity *= Math.exp(-wave.decay * dt);
    }

    if (wave.intensity <= MIN_WAVE_INTENSITY) {
      continue;
    }

    propagateWaveToSignalField(wave, dt);

    next.push(wave);
  }

  state.signalWaves = next;
}

function drawSignalWaves(ctx, config) {
  if (!ctx || !state.signalWaves.length) {
    return;
  }
  if (!config?.enabled) {
    return;
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const wave of state.signalWaves) {
    if (!wave || wave.intensity <= MIN_WAVE_INTENSITY) {
      continue;
    }
    const alpha = clamp01(wave.intensity);
    if (alpha <= 0) {
      continue;
    }
    const { r, g, b } = wave.color || MODE_COLORS.resource;
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(0.85, alpha * 0.9)})`;
    ctx.lineWidth = 2 + alpha * 3;
    ctx.beginPath();
    ctx.arc(wave.x, wave.y, Math.max(4, wave.radius), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function sampleWaveStrength({
  x,
  y,
  mode,
  channel,
  radius
} = {}) {
  const px = toFiniteNumber(x, NaN);
  const py = toFiniteNumber(y, NaN);
  if (!Number.isFinite(px) || !Number.isFinite(py)) {
    return 0;
  }
  if (!state.signalWaves.length) {
    return 0;
  }

  const config = getConfig();
  const targetChannel = Number.isFinite(channel)
    ? clamp(Math.floor(channel), 0, Number.MAX_SAFE_INTEGER)
    : resolveModeChannel(mode, config);

  let total = 0;
  let weight = 0;
  for (const wave of state.signalWaves) {
    if (!wave || wave.intensity <= MIN_WAVE_INTENSITY) continue;
    if (Number.isFinite(targetChannel) && wave.channel !== targetChannel) continue;
    const maxRadius = Number.isFinite(radius) ? Math.max(radius, 1) : Math.max(wave.radius, 1);
    const dx = wave.x - px;
    const dy = wave.y - py;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) continue;
    const falloff = clamp01(1 - dist / maxRadius);
    if (falloff <= 0) continue;
    total += wave.intensity * falloff;
    weight += falloff;
  }

  if (weight <= 0) {
    return 0;
  }

  return clamp01(total / weight);
}

function sampleWaveStrengths({
  x,
  y,
  radius,
  modes
} = {}) {
  const result = {};
  const targetModes = Array.isArray(modes) && modes.length > 0
    ? modes
    : Object.keys(MODE_CHANNELS);
  for (const mode of targetModes) {
    result[mode] = sampleWaveStrength({ x, y, mode, radius });
  }
  return result;
}

function clearSignalWaves() {
  state.signalWaves = [];
  state.waveSequence = 0;
}

function getSignalWaves() {
  return state.signalWaves.slice();
}

function update(dt) {
  const delta = typeof dt === 'number' && Number.isFinite(dt) ? dt : 0;
  state.timers.elapsed += delta;
  state.timers.delta = delta;
  if (!state.isActive) {
    state.timers.inactiveTime += delta;
  }
  const config = getConfig();
  if (!config?.enabled && state.isActive) {
    setActive(false);
  }
  updateSignalWaves(delta);
  hooks.onUpdate(state, config, delta);
}

const computeParticipationForce = (context, config) => {
  const { bundle } = context || {};
  if (!bundle || state.activeFields.size === 0) {
    return { ax: 0, ay: 0 };
  }

  const agentX = toFiniteNumber(bundle.x, 0);
  const agentY = toFiniteNumber(bundle.y, 0);
  const baseSpeed = Math.max(0, toFiniteNumber(context?.baseSpeed, 0));
  const maxFraction = clamp(
    toFiniteNumber(context?.maxFraction ?? config?.maxForceFraction ?? DEFAULT_FORCE_FRACTION, DEFAULT_FORCE_FRACTION),
    0,
    1
  );
  const now = state.timers.elapsed;

  let sumX = 0;
  let sumY = 0;
  const staleKeys = [];

  for (const [key, entryRaw] of state.activeFields.entries()) {
    const entry = entryRaw || {};
    const targetX = toFiniteNumber(entry.x ?? entry.position?.x, NaN);
    const targetY = toFiniteNumber(entry.y ?? entry.position?.y, NaN);
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
      continue;
    }

    const dx = targetX - agentX;
    const dy = targetY - agentY;
    const distSq = dx * dx + dy * dy;
    const dist = Math.sqrt(distSq);
    if (dist <= EPSILON) {
      continue;
    }

    const mode = entry.mode || state.mode;
    const modeConfig = config?.modes?.[mode] || {};
    const strength = Math.max(0, toFiniteNumber(entry.strength ?? modeConfig.strength, 0));
    const radius = Math.max(0, toFiniteNumber(entry.radius ?? modeConfig.radius, 0));
    if (strength <= 0 || radius <= 0) {
      continue;
    }

    const falloff = clamp(1 - dist / radius, 0, 1);
    if (falloff <= 0) {
      continue;
    }

    const decay = Math.max(0, toFiniteNumber(entry.decay ?? modeConfig.decay, 0));
    const age = Math.max(0, now - toFiniteNumber(entry.updatedAt, now));
    let fade = 1;
    if (decay > 0 && age > 0) {
      fade = Math.exp(-decay * age);
      if (fade < MIN_FADE) {
        staleKeys.push(key);
        continue;
      }
    }

    const influence = strength * falloff * fade;
    if (influence <= 0) {
      continue;
    }

    const dirX = dx / dist;
    const dirY = dy / dist;
    sumX += dirX * influence;
    sumY += dirY * influence;
  }

  if (staleKeys.length > 0) {
    for (const key of staleKeys) {
      state.activeFields.delete(key);
    }
  }

  const mag = Math.hypot(sumX, sumY);
  if (mag <= EPSILON) {
    return { ax: 0, ay: 0 };
  }

  const maxMagnitude = baseSpeed > 0 ? baseSpeed * maxFraction : maxFraction;
  if (maxMagnitude > 0 && mag > maxMagnitude) {
    const scale = maxMagnitude / mag;
    sumX *= scale;
    sumY *= scale;
  }

  return { ax: sumX, ay: sumY };
};

function applyForce(context) {
  if (!state.isActive) {
    resetForce(state);
    return { ax: 0, ay: 0 };
  }

  const config = getConfig();
  if (!config?.enabled) {
    clearActiveFieldEntries();
    return { ax: 0, ay: 0 };
  }

  const computed = computeParticipationForce(context, config);
  const hookResult = hooks.onApplyForce(state, config, {
    ...context,
    computed
  });
  const force = sanitizeForce(hookResult && typeof hookResult === 'object' ? hookResult : computed);
  state.lastForce = force;
  return force;
}

function sampleEnergy(agentBundle) {
  const sample = hooks.onSampleEnergy(state, getConfig(), agentBundle);
  return typeof sample === 'number' && Number.isFinite(sample) ? sample : 0;
}

function sampleSignal(agentBundle) {
  const sample = hooks.onSampleSignal(state, getConfig(), agentBundle);
  return typeof sample === 'number' && Number.isFinite(sample) ? sample : 0;
}

function draw(ctx) {
  const config = getConfig();
  drawSignalWaves(ctx, config);
  hooks.onDraw(state, config, ctx);
}

function getLastForce() {
  return { ...state.lastForce };
}

function setConfig(resolver) {
  hooks.configResolver = typeof resolver === 'function' ? resolver : hooks.configResolver;
  return manager;
}

function setEmitters({
  onUpdate,
  onApplyForce,
  onSampleEnergy,
  onSampleSignal,
  onDraw
} = {}) {
  if (typeof onUpdate === 'function') {
    hooks.onUpdate = onUpdate;
  }
  if (typeof onApplyForce === 'function') {
    hooks.onApplyForce = onApplyForce;
  }
  if (typeof onSampleEnergy === 'function') {
    hooks.onSampleEnergy = onSampleEnergy;
  }
  if (typeof onSampleSignal === 'function') {
    hooks.onSampleSignal = onSampleSignal;
  }
  if (typeof onDraw === 'function') {
    hooks.onDraw = onDraw;
  }
  return manager;
}

function setPointerHandlers({
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel
} = {}) {
  if (typeof onPointerDown === 'function') {
    pointerHooks.onPointerDown = onPointerDown;
  }
  if (typeof onPointerMove === 'function') {
    pointerHooks.onPointerMove = onPointerMove;
  }
  if (typeof onPointerUp === 'function') {
    pointerHooks.onPointerUp = onPointerUp;
  }
  if (typeof onPointerCancel === 'function') {
    pointerHooks.onPointerCancel = onPointerCancel;
  }
  return manager;
}

function handlePointerEvent(type, payload = {}) {
  ensurePointerHandlers();
  const handlerMap = {
    pointerdown: pointerHooks.onPointerDown,
    pointermove: pointerHooks.onPointerMove,
    pointerup: pointerHooks.onPointerUp,
    pointercancel: pointerHooks.onPointerCancel
  };

  const handler = handlerMap[type];
  if (typeof handler !== 'function') {
    return;
  }

  const config = getConfig();

  try {
    handler(state, config, payload);
  } catch (error) {
    if (config?.debugLog && typeof console !== 'undefined' && console.debug) {
      console.debug('[Participation] Pointer handler threw:', error);
    }
  }
}

function resetTimers() {
  state.timers.elapsed = 0;
  state.timers.delta = 0;
  state.timers.modeStart = 0;
  state.timers.inactiveTime = 0;
  state.signalWaves = [];
  state.pointerEmitters.clear();
  state.waveSequence = 0;
}

const manager = {
  state,
  setMode,
  setActive,
  setCursor,
  setActiveFieldEntry,
  clearActiveFieldEntries,
  clearSignalWaves,
  resetTimers,
  getConfig,
  setConfig,
  setEmitters,
  setPointerHandlers,
  handlePointerEvent,
  spawnSignalWave,
  getSignalWaves,
  update,
  applyForce,
  sampleEnergy,
  sampleSignal,
  sampleWaveStrength,
  sampleWaveStrengths,
  draw,
  getLastForce
};

export default manager;
