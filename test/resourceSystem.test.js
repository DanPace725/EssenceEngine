import assert from 'node:assert/strict';
import { collectResource } from '../src/systems/resourceSystem.js';

const createBundle = () => ({
  chi: 0,
  alive: true,
  frustration: 5,
  hunger: 10,
  deathTick: 12,
  decayProgress: 3,
  x: 5,
  y: 7,
  emittedSignals: [],
  emitSignal(channel, value, payload) {
    this.emittedSignals.push({ channel, value, payload });
  },
});

const createResource = () => ({
  cooldowns: 0,
  startCooldown() {
    this.cooldowns += 1;
  },
});

const createWorld = () => ({
  collected: 0,
  avgFindTime: 4,
  rewardStats: {
    totalRewards: 0,
    avgRewardGiven: 0,
    minFindTime: Infinity,
    maxFindTime: 0,
  },
  onResourceCollectedCalls: 0,
  onResourceCollected() {
    this.onResourceCollectedCalls += 1;
  },
});

const baseConfig = {
  rewardChi: 10,
  hungerDecayOnCollect: 3,
  adaptiveReward: {
    enabled: false,
  },
};

const normalizeRewardSignal = (chi) => chi / 10;

const test = async (name, fn) => {
  try {
    await fn();
    console.log(`✔ ${name}`);
  } catch (error) {
    console.error(`✖ ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
};

await test('collectResource awards fixed reward when adaptive disabled', () => {
  const bundle = createBundle();
  const resource = createResource();
  const world = createWorld();
  const collectedEvents = [];

  const result = collectResource({
    bundle,
    resource,
    world,
    config: baseConfig,
    normalizeRewardSignal,
    updateFindTimeEMA: () => {
      throw new Error('Should not be called when adaptive disabled');
    },
    calculateAdaptiveReward: () => 999,
    getGlobalTick: () => 42,
    onCollected: (payload) => collectedEvents.push(payload),
  });

  assert.equal(result.collected, true);
  assert.equal(result.rewardChi, baseConfig.rewardChi);
  assert.equal(result.dtFind, null);
  assert.equal(result.rewardSignal, 1);

  assert.equal(bundle.chi, baseConfig.rewardChi);
  assert.equal(bundle.lastCollectTick, 42);
  assert.equal(bundle.frustration, 0);
  assert.equal(bundle.hunger, 7);
  assert.equal(bundle.deathTick, -1);
  assert.equal(bundle.decayProgress, 0);
  assert.equal(bundle.emittedSignals.length, 1);
  assert.deepEqual(bundle.emittedSignals[0], {
    channel: 'resource',
    value: 1,
    payload: { absolute: true, x: bundle.x, y: bundle.y },
  });

  assert.equal(world.collected, 1);
  assert.equal(world.onResourceCollectedCalls, 1);
  assert.equal(resource.cooldowns, 1);
  assert.equal(collectedEvents.length, 1);
  assert.equal(collectedEvents[0].rewardChi, baseConfig.rewardChi);
});

await test('collectResource applies adaptive reward bookkeeping when enabled', () => {
  const bundle = createBundle();
  const resource = createResource();
  const world = createWorld();
  world.collected = 10;
  world.rewardStats.totalRewards = 100;
  const logMessages = [];
  const adaptiveConfig = {
    ...baseConfig,
    adaptiveReward: {
      enabled: true,
      logInterval: 5,
      gainFactor: 1,
      minReward: 0,
      maxReward: 1000,
    },
  };

  const result = collectResource({
    bundle,
    resource,
    world,
    config: adaptiveConfig,
    normalizeRewardSignal,
    updateFindTimeEMA: (w) => {
      assert.strictEqual(w, world);
      return 5;
    },
    calculateAdaptiveReward: (avgFindTime, cfg) => {
      assert.equal(avgFindTime, world.avgFindTime);
      assert.equal(cfg, adaptiveConfig.adaptiveReward);
      return 42;
    },
    getGlobalTick: () => 99,
    logger: { log: (msg) => logMessages.push(msg) },
  });

  assert.equal(result.collected, true);
  assert.equal(result.rewardChi, 42);
  assert.equal(result.dtFind, 5);
  assert.equal(result.rewardSignal, 4.2);

  assert.equal(bundle.chi, 42);
  assert.equal(bundle.lastCollectTick, 99);
  assert.equal(bundle.hunger, 7);

  assert.equal(world.collected, 11);
  assert.equal(world.onResourceCollectedCalls, 1);
  assert.equal(world.rewardStats.totalRewards, 142);
  assert.equal(world.rewardStats.avgRewardGiven, 142 / 11);
  assert.equal(resource.cooldowns, 1);
  assert.equal(logMessages.length, 1);
  assert.ok(logMessages[0].includes('Find #10'));
});

if (process.exitCode && process.exitCode !== 0) {
  throw new Error('Resource system tests failed');
}
