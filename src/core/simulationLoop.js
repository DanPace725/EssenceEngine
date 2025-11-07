const DEFAULT_MAX_DELTA = 0.1;

function defaultNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function defaultRequestFrame(callback) {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback);
  }
  return setTimeout(() => callback(defaultNow()), 16);
}

function defaultCancelFrame(handle) {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle);
}

/**
 * Executes the provided simulation phases for a single tick.
 *
 * @param {Object} options
 * @param {number} options.dt - Delta time in seconds for this step.
 * @param {string} options.mode - Current execution mode (e.g., 'play' or 'train').
 * @param {Function} [options.beginTick] - Optional hook invoked before phases run.
 *   Receives { dt, mode } and should return an opaque context (e.g., scheduler handle).
 * @param {Function[]} options.phases - Ordered callbacks invoked to advance the simulation.
 *   Each phase receives { dt, mode, tickContext }.
 * @param {Function} [options.endTick] - Optional hook invoked after phases run.
 * @param {Function} [options.onError] - Called when a phase throws.
 */
export function performSimulationStep({
  dt,
  mode,
  beginTick,
  phases,
  endTick,
  onError
}) {
  if (!Array.isArray(phases)) {
    throw new Error('performSimulationStep requires an array of phases');
  }

  const tickContext = typeof beginTick === 'function'
    ? beginTick({ dt, mode })
    : undefined;

  const phaseState = { dt, mode, tickContext };

  try {
    for (const phase of phases) {
      if (typeof phase !== 'function') continue;
      phase(phaseState);
    }
  } catch (error) {
    if (typeof onError === 'function') {
      onError(error, phaseState);
    } else {
      throw error;
    }
  } finally {
    if (typeof endTick === 'function' && tickContext !== undefined) {
      endTick(tickContext);
    }
  }
}

/**
 * Starts a render-driven simulation loop using requestAnimationFrame (or a fallback).
 *
 * @param {Object} options
 * @param {Function} options.shouldStep - Returns true when the simulation should advance.
 * @param {Function} options.getMode - Returns the current execution mode string.
 * @param {Function} options.getPhases - Returns the ordered phase callbacks for the provided mode.
 *   Signature: (mode) => Function[]
 * @param {Function} [options.beginTick]
 * @param {Function} [options.endTick]
 * @param {Function} [options.draw] - Called every frame after updates with { dt, mode, now }.
 * @param {Function} [options.onError]
 * @param {Function} [options.requestFrame]
 * @param {Function} [options.cancelFrame]
 * @param {Function} [options.now]
 * @param {number} [options.maxDelta]
 * @returns {Function} stop function to cancel the loop.
 */
export function startSimulation({
  shouldStep,
  getMode,
  getPhases,
  beginTick,
  endTick,
  draw,
  onError,
  requestFrame = defaultRequestFrame,
  cancelFrame = defaultCancelFrame,
  now = defaultNow,
  maxDelta = DEFAULT_MAX_DELTA
}) {
  if (typeof shouldStep !== 'function') {
    throw new Error('startSimulation requires a shouldStep function');
  }
  if (typeof getMode !== 'function') {
    throw new Error('startSimulation requires a getMode function');
  }
  if (typeof getPhases !== 'function') {
    throw new Error('startSimulation requires a getPhases function');
  }

  let last = now();
  let frameHandle = null;
  let stopped = false;

  const frame = (timestamp) => {
    if (stopped) {
      return;
    }

    frameHandle = requestFrame(frame);
    const dtMs = timestamp - last;
    last = timestamp;
    const dt = Math.min(maxDelta, Math.max(0, dtMs) / 1000);
    const mode = getMode();

    try {
      if (shouldStep()) {
        const phases = getPhases(mode) || [];
        performSimulationStep({
          dt,
          mode,
          beginTick,
          phases,
          endTick,
          onError
        });
      }
    } catch (error) {
      if (typeof onError === 'function') {
        onError(error, { dt, mode });
      } else {
        console.error('Simulation loop error:', error);
      }
    }

    if (typeof draw === 'function') {
      try {
        draw({ dt, mode, now: timestamp });
      } catch (error) {
        if (typeof onError === 'function') {
          onError(error, { dt, mode, phase: 'draw' });
        } else {
          console.error('Simulation draw error:', error);
        }
      }
    }
  };

  frameHandle = requestFrame(frame);

  return () => {
    if (!stopped && frameHandle !== null) {
      stopped = true;
      cancelFrame(frameHandle);
    }
  };
}
