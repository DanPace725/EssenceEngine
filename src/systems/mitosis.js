import { TcRandom } from '../../tcStorage.js';
import { clamp } from '../utils/math.js';

const DEFAULT_HEADING_NOISE = Math.PI * 2;

const ensureRandom = (random) => ({
  random: typeof random?.random === 'function' ? random.random.bind(random) : Math.random
});

export function evaluateMitosisReadiness({ canBud, canMitosis }) {
  const mitosisReady = typeof canMitosis === 'function' ? Boolean(canMitosis()) : false;
  const buddingReady = typeof canBud === 'function' ? Boolean(canBud()) : false;

  return { buddingReady, mitosisReady };
}

export function createMitosisSystem({
  getGlobalTick,
  getCanvasWidth,
  getCanvasHeight,
  getWorld,
  createChildBundle,
  random = TcRandom,
  config
}) {
  if (typeof getGlobalTick !== 'function') throw new Error('getGlobalTick is required');
  if (typeof getCanvasWidth !== 'function') throw new Error('getCanvasWidth is required');
  if (typeof getCanvasHeight !== 'function') throw new Error('getCanvasHeight is required');
  if (typeof getWorld !== 'function') throw new Error('getWorld is required');
  if (typeof createChildBundle !== 'function') throw new Error('createChildBundle is required');
  if (!config?.mitosis) throw new Error('config.mitosis is required');

  const { random: rng } = ensureRandom(random);
  const currentTick = () => getGlobalTick();
  const canvasWidth = () => getCanvasWidth();
  const canvasHeight = () => getCanvasHeight();
  const mitosisConfig = config.mitosis;

  function meetsPopulationLimits(_parent) {
    const world = getWorld();
    const population = world?.bundles ?? [];
    const aliveCount = population.filter((b) => b.alive).length;
    const aliveLimit = Math.min(
      mitosisConfig.maxAgents,
      mitosisConfig.maxAliveAgents || mitosisConfig.maxAgents
    );
    if (aliveCount >= aliveLimit) return false;

    if (mitosisConfig.respectCarryingCapacity && world) {
      const maxPopulation = Math.max(
        aliveLimit,
        Math.floor(world.resources.length * mitosisConfig.carryingCapacityMultiplier)
      );
      if (aliveCount >= maxPopulation) return false;
    }

    return true;
  }

  function canMitosis(parent) {
    if (!mitosisConfig.enabled) return false;
    if (!parent.alive) return false;
    if (parent.chi < mitosisConfig.threshold) return false;

    const tick = currentTick();
    const ticksSinceLast = tick - parent.lastMitosisTick;
    if (ticksSinceLast < mitosisConfig.cooldown) return false;

    return meetsPopulationLimits(parent);
  }

  function canBud(parent) {
    if (!mitosisConfig.enabled) return false;
    if (!parent.alive) return false;

    const buddingThreshold = mitosisConfig.buddingThreshold || Infinity;
    if (parent.chi < buddingThreshold) return false;

    if (mitosisConfig.buddingRespectCooldown !== false) {
      const tick = currentTick();
      const ticksSinceLast = tick - parent.lastMitosisTick;
      if (ticksSinceLast < mitosisConfig.cooldown) return false;
    }

    return meetsPopulationLimits(parent);
  }

  function spawnChild(parent, { x, y, chi, heading, label }) {
    return createChildBundle({
      parent,
      x,
      y,
      chi,
      heading,
      eventLabel: label,
      tick: currentTick()
    });
  }

  function performMitosis(parent) {
    if (!canMitosis(parent)) return null;

    parent.chi -= mitosisConfig.cost;

    const headingNoise = mitosisConfig.inheritHeading
      ? (rng() - 0.5) * (mitosisConfig.headingNoise ?? DEFAULT_HEADING_NOISE)
      : rng() * DEFAULT_HEADING_NOISE;
    const heading = mitosisConfig.inheritHeading ? parent.heading + headingNoise : headingNoise;

    const offset = mitosisConfig.spawnOffset ?? 0;
    const half = parent.size / 2;
    const childX = clamp(parent.x + Math.cos(heading) * offset, half, canvasWidth() - half);
    const childY = clamp(parent.y + Math.sin(heading) * offset, half, canvasHeight() - half);

    const child = spawnChild(parent, {
      x: childX,
      y: childY,
      chi: mitosisConfig.childStartChi,
      heading,
      label: 'Mitosis'
    });

    if (child) {
      parent.lastMitosisTick = currentTick();
    }

    return child;
  }

  function performBudding(parent) {
    if (!canBud(parent)) return null;

    const share = clamp(mitosisConfig.buddingShare ?? 0.5, 0.05, 0.95);
    const childChi = parent.chi * share;
    parent.chi *= (1 - share);

    const jitter = mitosisConfig.buddingOffset ?? 20;
    const half = parent.size / 2;
    const offsetX = (rng() * 2 - 1) * jitter;
    const offsetY = (rng() * 2 - 1) * jitter;
    const heading = mitosisConfig.inheritHeading ? parent.heading : rng() * DEFAULT_HEADING_NOISE;

    const child = spawnChild(parent, {
      x: clamp(parent.x + offsetX, half, canvasWidth() - half),
      y: clamp(parent.y + offsetY, half, canvasHeight() - half),
      chi: childChi,
      heading,
      label: 'Budding'
    });

    if (child) {
      parent.lastMitosisTick = currentTick();
    }

    return child;
  }

  function attemptReproduction(parent) {
    if (!mitosisConfig.enabled) return null;
    if (canBud(parent)) return performBudding(parent);
    if (canMitosis(parent)) return performMitosis(parent);
    return null;
  }

  function evaluateReadiness(parent) {
    return evaluateMitosisReadiness({
      canBud: () => canBud(parent),
      canMitosis: () => canMitosis(parent)
    });
  }

  return {
    attemptReproduction,
    canBud,
    canMitosis,
    evaluateReadiness
  };
}
