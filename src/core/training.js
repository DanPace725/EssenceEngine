import { performSimulationStep } from './simulationLoop.js';
import { collectResource } from '../systems/resourceSystem.js';

export function createTrainingModule({
  world,
  config,
  trail,
  signalField,
  tcScheduler,
  ledger,
  episodeManager,
  learner,
  TrainingManagerClass,
  TrainingUIClass,
  normalizeRewardSignal,
  updateFindTimeEMA,
  calculateAdaptiveReward,
  getGlobalTick,
  incrementGlobalTick,
  setWorldPaused,
  onLearningModeChange,
  windowHandle = typeof window !== 'undefined' ? window : null,
  documentHandle = typeof document !== 'undefined' ? document : null
}) {
  if (!world || !config || !trail || !signalField || !tcScheduler || !episodeManager) {
    throw new Error('createTrainingModule requires core simulation dependencies');
  }

  let learningMode = 'play';
  let trainingManager = null;
  let stopTrainingFlag = false;
  let loadedPolicyInfo = null;

  function getLearningMode() {
    return learningMode;
  }

  function setLearningMode(mode) {
    learningMode = mode;
    if (typeof onLearningModeChange === 'function') {
      onLearningModeChange(mode);
    }
  }

  function ensureTrainingManager() {
    if (!TrainingManagerClass || !learner) {
      return null;
    }
    if (!trainingManager) {
      trainingManager = new TrainingManagerClass(
        learner,
        () => world.reset(),
        (policy) => runEpisode(policy)
      );
    }
    return trainingManager;
  }

  function getTcContextFactory(mode) {
    return ({ dt }) => {
      const config = tcScheduler.getConfig();
      if (!config || !config.enabled) {
        return null;
      }
      return tcScheduler.beginTick({
        tick: typeof getGlobalTick === 'function' ? getGlobalTick() : 0,
        dt,
        mode,
        scheduler: mode === 'train' ? 'episode' : 'play',
        world
      });
    };
  }

  async function runEpisode(policy) {
    if (!policy) {
      throw new Error('runEpisode requires a policy');
    }

    world.reset();
    episodeManager.startEpisode();

    world.bundles.forEach((bundle) => {
      bundle.controller = policy;
      bundle.useController = true;
      bundle.rewardTracker.reset();
    });

    ledger.credits = {};

    let totalReward = 0;
    let episodeTicks = 0;
    const maxTicks = config.learning.episodeLength;

    const capturePhase = ({ tickContext }) => {
      trail.captureSnapshot();
      if (config.signal.enabled) {
        signalField.captureSnapshot();
      }
      if (tickContext) {
        tcScheduler.runPhase('capture', tickContext);
      }
    };

    const updateAgentsPhase = ({ dt, tickContext }) => {
      let totalChiSpent = 0;
      for (let i = 0; i < world.bundles.length; i++) {
        const bundle = world.bundles[i];
        if (!bundle.alive) continue;

        const chiBeforeUpdate = bundle.chi;
        const nearestResource = world.getNearestResource(bundle);
        bundle.update(dt, nearestResource);

        const chiSpent = Math.max(0, chiBeforeUpdate - bundle.chi);
        totalChiSpent += chiSpent;

        let collectedResource = false;
        for (const res of world.resources) {
          if (!(bundle.alive && res.visible && bundle.overlapsResource(res))) continue;

          const result = collectResource({
            bundle,
            resource: res,
            world,
            config,
            normalizeRewardSignal,
            updateFindTimeEMA,
            calculateAdaptiveReward,
            getGlobalTick,
            logger: console,
          });

          collectedResource = result.collected;
          if (collectedResource) {
            break;
          }
        }

        const provenanceCredit = ledger.getCredits(bundle.id);
        const stepReward = bundle.rewardTracker.computeStepReward(
          collectedResource,
          totalChiSpent,
          provenanceCredit,
          world.resources
        );
        totalReward += stepReward;
      }

      if (tickContext) {
        tcScheduler.runPhase('compute', tickContext);
      }
    };

    const environmentPhase = ({ dt, tickContext }) => {
      trail.step(dt);
      if (config.signal.enabled) {
        signalField.step(dt);
      }
      if (tickContext) {
        tcScheduler.runPhase('commit', tickContext);
      }
    };

    const endPhase = () => {
      if (typeof incrementGlobalTick === 'function') {
        incrementGlobalTick();
      }
      episodeTicks += 1;
    };

    while (episodeTicks < maxTicks && world.bundles.some((b) => b.alive)) {
      const dt = 1 / 60;
      const beginTick = getTcContextFactory('train');
      performSimulationStep({
        dt,
        mode: 'train',
        beginTick,
        phases: [capturePhase, updateAgentsPhase, environmentPhase, endPhase],
        endTick: (ctx) => {
          if (ctx) {
            tcScheduler.endTick(ctx);
          }
        },
        onError: (err) => {
          console.error('Error in training step:', err);
          throw err;
        }
      });

      if (episodeTicks % 100 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    for (const bundle of world.bundles) {
      if (!bundle.alive && episodeTicks < maxTicks) {
        totalReward += config.learning.rewards.death;
      }
    }

    episodeManager.endEpisode(world.bundles[0]?.rewardTracker);
    return totalReward;
  }

  function initializeTrainingUI() {
    if (!TrainingUIClass || !learner || !documentHandle) {
      return;
    }

    const ui = new TrainingUIClass(documentHandle.body);
    if (windowHandle) {
      windowHandle.trainingUI = ui;
    }

    ui.on('onModeChange', (mode) => {
      setLearningMode(mode);
      if (mode === 'train') {
        console.log('Switched to Training Mode');
        world.bundles.forEach((b) => (b.useController = true));
      } else {
        console.log('Switched to Play Mode');
        world.bundles.forEach((b) => (b.useController = false));
      }
    });

    ui.on('onStartTraining', async (numGenerations) => {
      const manager = ensureTrainingManager();
      if (!manager) return;

      stopTrainingFlag = false;

      console.log(`🤝 Multi-Agent Training Starting: ALL ${world.bundles.length} agents use shared policy`);
      console.log('   Episode reward = Sum of all agent rewards');
      console.log('   Agents can learn cooperation via trails and provenance credits!');

      ui.updateStats({
        status: 'Multi-Agent Training...',
        generation: learner.generation,
        populationSize: config.learning.populationSize
      });

      if (typeof setWorldPaused === 'function') {
        setWorldPaused(true);
      }

      for (let gen = 0; gen < numGenerations; gen++) {
        if (stopTrainingFlag) {
          console.log('Training stopped by user');
          break;
        }

        const result = await manager.runGeneration();

        ui.updateStats({
          status: `Gen ${result.generation}/${numGenerations}`,
          generation: result.generation,
          bestReward: result.bestReward,
          meanReward: result.meanReward,
          currentPolicy: manager.currentPolicy,
          populationSize: config.learning.populationSize
        });

        const stats = learner.getStats();
        if (stats) {
          ui.drawLearningCurve(stats.history);
        }

        console.log(`Gen ${result.generation}: best=${result.bestReward.toFixed(2)}, mean=${result.meanReward.toFixed(2)}`);
      }

      ui.updateStats({
        status: stopTrainingFlag ? 'Training Stopped' : 'Training Complete!',
        generation: learner.generation,
        bestReward: learner.bestReward,
        populationSize: config.learning.populationSize
      });

      if (typeof setWorldPaused === 'function') {
        setWorldPaused(false);
      }

      if (documentHandle) {
        const startBtn = documentHandle.getElementById('start-training');
        const stopBtn = documentHandle.getElementById('stop-training');
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
      }
    });

    ui.on('onStopTraining', () => {
      stopTrainingFlag = true;
      if (trainingManager) {
        trainingManager.stop();
      }
      if (typeof setWorldPaused === 'function') {
        setWorldPaused(false);
      }
      console.log('Stop training requested');
    });

    ui.on('onResetLearner', () => {
      learner.generation = 0;
      learner.bestReward = -Infinity;
      learner.bestWeights = null;
      learner.history = [];
      learner.mu = new Array(learner.weightDims).fill(0);
      learner.sigma = new Array(learner.weightDims).fill(config.learning.mutationStdDev);

      ui.updateStats({
        status: 'Learner Reset',
        generation: 0,
        bestReward: 0,
        meanReward: 0
      });

      ui.drawLearningCurve([]);

      console.log('Learner reset to initial state');
    });

    ui.on('onSavePolicy', () => {
      const state = learner.save();
      const json = JSON.stringify(state, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = documentHandle.createElement('a');
      a.href = url;
      a.download = `slime-policy-gen${learner.generation}.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log('Policy saved!');
    });

    ui.on('onLoadPolicy', () => {
      const input = documentHandle.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const state = JSON.parse(event.target.result);
            learner.load(state);
            loadedPolicyInfo = {
              filename: file.name,
              generation: learner.generation,
              bestReward: learner.bestReward,
              timestamp: new Date().toLocaleString()
            };

            ui.updateStats({
              status: 'Policy Loaded!',
              generation: learner.generation,
              bestReward: learner.bestReward
            });
            ui.drawLearningCurve(learner.history);
            ui.showLoadedPolicyInfo(file.name, learner.generation, learner.bestReward);

            console.log(`Policy loaded: ${file.name} (Gen ${learner.generation}, Reward: ${learner.bestReward.toFixed(2)})`);
          } catch (err) {
            console.error('Failed to load policy:', err);
            alert('Failed to load policy file');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });

    ui.on('onTestPolicy', () => {
      const bestPolicy = learner.getBestPolicy();
      if (!bestPolicy) {
        alert('No trained policy available yet!');
        return;
      }
      world.reset();
      world.bundles.forEach((bundle) => {
        bundle.controller = bestPolicy;
        bundle.useController = true;
      });
      setLearningMode('play');
      const infoStr = loadedPolicyInfo
        ? `${loadedPolicyInfo.filename} (Gen ${loadedPolicyInfo.generation})`
        : `current best (Gen ${learner.generation})`;
      console.log(`Testing policy (ALL ${world.bundles.length} AGENTS): ${infoStr}`);
    });

    ui.on('onUsePolicy', () => {
      const bestPolicy = learner.getBestPolicy();
      if (!bestPolicy) {
        alert('No policy loaded yet!');
        return;
      }
      world.reset();
      world.bundles.forEach((bundle) => {
        bundle.controller = bestPolicy;
        bundle.useController = true;
      });
      setLearningMode('play');
      config.hud.showActions = true;
      if (loadedPolicyInfo) {
        console.log(`Using loaded policy (ALL ${world.bundles.length} AGENTS): ${loadedPolicyInfo.filename} (Gen ${loadedPolicyInfo.generation}, Reward: ${loadedPolicyInfo.bestReward.toFixed(2)})`);
        console.log('💡 Tip: Watch all agents\' actions (T=turn, P=thrust, S=sense) with yellow borders.');
        console.log('🤝 Multi-agent: All agents use the same policy and can learn from each other\'s trails!');
      } else {
        console.log(`Using current best policy (ALL ${world.bundles.length} AGENTS, Gen ${learner.generation})`);
      }
    });

    console.log('Training UI initialized. Press [L] to toggle.');
  }

  function stopTraining() {
    stopTrainingFlag = true;
    if (trainingManager) {
      trainingManager.stop();
    }
  }

  return {
    getLearningMode,
    setLearningMode,
    runEpisode,
    ensureTrainingManager,
    initializeTrainingUI,
    stopTraining,
    isTrainingStopped: () => stopTrainingFlag,
    setStopTrainingFlag: (value) => {
      stopTrainingFlag = Boolean(value);
    }
  };
}
