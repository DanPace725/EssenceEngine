const defaultLogger = typeof console !== 'undefined' ? console : null;

/**
 * Handle resource collection for a bundle and update associated systems.
 * This consolidates shared logic used by both the simulation loop and
 * the training module, including adaptive reward bookkeeping.
 *
 * @param {object} params
 * @param {object} params.bundle - The agent collecting the resource.
 * @param {object} params.resource - The resource being collected.
 * @param {object} params.world - Simulation world state.
 * @param {object} params.config - Simulation configuration (e.g. CONFIG).
 * @param {Function} [params.normalizeRewardSignal] - Maps χ reward to signal strength.
 * @param {Function} [params.updateFindTimeEMA] - Updates EMA for adaptive rewards.
 * @param {Function} [params.calculateAdaptiveReward] - Computes adaptive reward.
 * @param {Function} [params.getGlobalTick] - Accessor for global tick counter.
 * @param {object} [params.logger] - Logging target (console-like).
 * @param {Function} [params.onCollected] - Optional callback after collection completes.
 *
 * @returns {{
 *   collected: boolean,
 *   rewardChi: number,
 *   dtFind: (number|null),
 *   rewardSignal: number
 * }}
 */
export function collectResource({
  bundle,
  resource,
  world,
  config,
  normalizeRewardSignal = null,
  updateFindTimeEMA = null,
  calculateAdaptiveReward = null,
  getGlobalTick = null,
  logger = defaultLogger,
  onCollected = null,
}) {
  if (!bundle) throw new Error('collectResource requires a bundle');
  if (!resource) throw new Error('collectResource requires a resource');
  if (!world) throw new Error('collectResource requires world state');
  if (!config) throw new Error('collectResource requires config');

  let rewardChi = Number.isFinite(config.rewardChi) ? config.rewardChi : 0;
  let dtFind = null;

  const adaptiveCfg = config?.adaptiveReward;
  const adaptiveEnabled = Boolean(adaptiveCfg?.enabled);

  if (adaptiveEnabled && typeof updateFindTimeEMA === 'function' && typeof calculateAdaptiveReward === 'function') {
    dtFind = updateFindTimeEMA(world);
    rewardChi = calculateAdaptiveReward(world.avgFindTime, adaptiveCfg);

    if (world.rewardStats) {
      world.rewardStats.totalRewards = (world.rewardStats.totalRewards || 0) + rewardChi;
      const collectedCount = (world.collected || 0) + 1; // +1 to avoid divide-by-zero
      world.rewardStats.avgRewardGiven = world.rewardStats.totalRewards / collectedCount;
    }

    const logInterval = Number.isFinite(adaptiveCfg.logInterval) && adaptiveCfg.logInterval > 0
      ? adaptiveCfg.logInterval
      : 10;

    if (logger && typeof logger.log === 'function' && (world.collected || 0) > 0 && (world.collected % logInterval === 0)) {
      try {
        logger.log(
          `[Adaptive Reward] Find #${world.collected}: dt=${dtFind.toFixed(2)}s, avgT=${world.avgFindTime.toFixed(2)}s, reward=${rewardChi.toFixed(2)}χ`
        );
      } catch {
        // Logging should never break simulation
      }
    }
  }

  bundle.chi = (bundle.chi || 0) + rewardChi;
  bundle.alive = true;

  if (typeof getGlobalTick === 'function') {
    bundle.lastCollectTick = getGlobalTick();
  } else if (typeof bundle.lastCollectTick !== 'number') {
    bundle.lastCollectTick = 0;
  }

  if ('frustration' in bundle) bundle.frustration = 0;
  if ('hunger' in bundle) {
    const decay = Number.isFinite(config.hungerDecayOnCollect) ? config.hungerDecayOnCollect : 0;
    bundle.hunger = Math.max(0, (bundle.hunger || 0) - decay);
  }
  if ('deathTick' in bundle) bundle.deathTick = -1;
  if ('decayProgress' in bundle) bundle.decayProgress = 0;

  let rewardSignal = 0;
  if (typeof normalizeRewardSignal === 'function') {
    rewardSignal = normalizeRewardSignal(rewardChi);
    if (rewardSignal > 0 && typeof bundle.emitSignal === 'function') {
      // Emit stronger consumption signal with persistence
      const consumptionStrength = config?.signal?.resourceConsumptionStrength || 1.0;
      const persistence = config?.signal?.resourceConsumptionPersistence || 3;
      
      // Use the configured consumption strength instead of normalized reward
      const signalStrength = Math.max(rewardSignal, consumptionStrength);
      bundle.emitSignal('resource', signalStrength, { absolute: true, x: bundle.x, y: bundle.y });
      
      // Set up persistent signal deposits
      if (persistence > 1) {
        bundle._consumptionSignalFrames = persistence - 1; // -1 because we already emitted once
      }
    }
  }

  world.collected = (world.collected || 0) + 1;
  if (typeof world.onResourceCollected === 'function') {
    world.onResourceCollected();
  }

  if (typeof resource.startCooldown === 'function') {
    resource.startCooldown();
  }

  if (typeof onCollected === 'function') {
    onCollected({ bundle, resource, world, rewardChi, dtFind, rewardSignal });
  }

  return { collected: true, rewardChi, dtFind, rewardSignal };
}

export default {
  collectResource,
};
