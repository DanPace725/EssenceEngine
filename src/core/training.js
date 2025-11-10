import { performSimulationStep } from './simulationLoop.js';
import { collectResource } from '../systems/resourceSystem.js';
import { MetricsTracker } from './metricsTracker.js';
import { ConfigOptimizer, ConfigTrainingManager, TUNABLE_PARAMS } from './configOptimizer.js';
import { AdaptiveHeuristics } from './adaptiveHeuristics.js';
import { buildObservation } from '../../observations.js';
import { buildStateSnapshot, applyStateSnapshot } from './stateIO.js';

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
  startBaselineCollection = null,
  stopBaselineCollection = null,
  getBaselineMetrics = null,
  isBaselineCollecting = null,
  windowHandle = typeof window !== 'undefined' ? window : null,
  documentHandle = typeof document !== 'undefined' ? document : null
}) {
  if (!world || !config || !trail || !signalField || !tcScheduler || !episodeManager) {
    throw new Error('createTrainingModule requires core simulation dependencies');
  }

  let learningMode = 'play';
  let trainingManager = null;
  let configTrainingManager = null;
  let configOptimizer = null;
  let adaptiveHeuristics = null;
  let stopTrainingFlag = false;
  let loadedPolicyInfo = null;
  let lastMetricsHistory = null;

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
        async (policy) => {
          const { totalReward } = await runEpisode(policy);
          return totalReward;
        }
      );
    }
    return trainingManager;
  }
  
  function ensureConfigTrainingManager(objective = 'balanced') {
    if (!configOptimizer) {
      configOptimizer = new ConfigOptimizer(TUNABLE_PARAMS, objective);
    }
    if (!configTrainingManager) {
      configTrainingManager = new ConfigTrainingManager(
        configOptimizer,
        () => world.reset(),
        async () => {
          // For config optimization, run episode without policy (use heuristic)
          world.bundles.forEach((bundle) => {
            bundle.useController = false;
          });
          
          // Run the episode and track metrics
          const { totalReward, metricsHistory } = await runHeuristicEpisode();
          return { totalReward, metricsHistory };
        }
      );
    }
    return configTrainingManager;
  }

  function ensureAdaptiveHeuristics() {
    if (!adaptiveHeuristics) {
      adaptiveHeuristics = new AdaptiveHeuristics(config);
    }
    return adaptiveHeuristics;
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

  // Adaptive Heuristics functions
  function toggleAdaptiveHeuristics() {
    const ah = ensureAdaptiveHeuristics();
    ah.toggle();
    return ah.isActive;
  }

  function getAdaptiveHeuristicsStats() {
    const ah = ensureAdaptiveHeuristics();
    return ah.getStats();
  }

  function learnAdaptiveHeuristics(reward, observation) {
    const ah = ensureAdaptiveHeuristics();
    ah.learn(reward, observation);
  }

  function resetAdaptiveHeuristics() {
    const ah = ensureAdaptiveHeuristics();
    ah.reset();
  }

  function getAdaptiveHeuristics() {
    return ensureAdaptiveHeuristics();
  }

  async function runHeuristicEpisode() {
    world.reset();
    episodeManager.startEpisode();

    world.bundles.forEach((bundle) => {
      bundle.useController = false; // Use heuristic AI
      bundle.rewardTracker.reset();
    });

    ledger.credits = {};

    let totalReward = 0;
    let episodeTicks = 0;
    const maxTicks = config.learning.episodeLength;
    
    // Initialize metrics tracker for this episode
    const metricsTracker = new MetricsTracker();
    const startTick = typeof getGlobalTick === 'function' ? getGlobalTick() : 0;
    metricsTracker.init(world, trail, startTick);
    
    // Track chi spent across phases
    let episodeTotalChiSpent = 0;

    const capturePhase = (phaseState) => {
      if (typeof trail.captureSnapshot === 'function') {
        trail.captureSnapshot();
      }
      if (config.signal.enabled && typeof signalField.captureSnapshot === 'function') {
        signalField.captureSnapshot();
      }
      if (phaseState.tickContext) {
        tcScheduler.runPhase('capture', phaseState.tickContext);
      }
    };

    const updateAgentsPhase = (phaseState) => {
      episodeTotalChiSpent = 0;
      for (let i = 0; i < world.bundles.length; i++) {
        const bundle = world.bundles[i];
        if (!bundle.alive) continue;

        const chiStart = bundle.chi;
        
        // Track movement for metrics
        const oldX = bundle.x;
        const oldY = bundle.y;
        
        // Heuristic update (bundle.update handles everything when useController=false)
        const nearestResource = world.getNearestResource(bundle);
        bundle.update(phaseState.dt, nearestResource);

        const chiEnd = bundle.chi;
        const chiSpent = Math.max(0, chiStart - chiEnd);
        episodeTotalChiSpent += chiSpent;
        
        // Track chi spent
        metricsTracker.onChiSpend(chiSpent, 'heuristic');
        
        // Track movement
        const dx = bundle.x - oldX;
        const dy = bundle.y - oldY;
        const moved = Math.abs(dx) + Math.abs(dy) > 0.1;
        metricsTracker.onMove(dx, dy, moved);
      }

      if (phaseState.tickContext) {
        tcScheduler.runPhase('control', phaseState.tickContext);
      }
    };

    const resourcePhase = (phaseState) => {
      for (const bundle of world.bundles) {
        if (!bundle.alive) continue;

        let collectedResourceObj = null;
        let didCollect = false;

        for (const resource of world.resources) {
          if (!resource.active) continue;

          const result = collectResource(resource, bundle, {
            config,
            world,
            ledger,
            normalizeRewardSignal,
            updateFindTimeEMA,
            calculateAdaptiveReward,
            getGlobalTick,
            logger: console,
          });

          if (result.collected) {
            didCollect = true;
            collectedResourceObj = resource;
            
            // Track chi reward from resource collection
            const rewardAmount = config.rewardChi || 0;
            const currentTick = typeof getGlobalTick === 'function' ? getGlobalTick() : 0;
            metricsTracker.onChiReward(rewardAmount, 'resource', currentTick);
            
            // Track guidance efficacy (was agent near strong trail?)
            const sample = trail.sample(resource.x, resource.y);
            const nearTrail = sample.value > 0.15;
            metricsTracker.onResourceFound(nearTrail);
            
            break;
          }
        }

        const provenanceCredit = collectedResourceObj ? ledger.getCredits(collectedResourceObj.id) : 0;
        
        // Track chi from reuse (collective intelligence metric)
        if (provenanceCredit > 0) {
          metricsTracker.onChiFromReuse(provenanceCredit);
        }
        
        const stepReward = bundle.rewardTracker.computeStepReward(
          didCollect,
          episodeTotalChiSpent,
          provenanceCredit,
          world.resources
        );
        totalReward += stepReward;

        // Adaptive heuristics learning
        if (adaptiveHeuristics?.isActive) {
          const currentTick = typeof getGlobalTick === 'function' ? getGlobalTick() : 0;
          const observation = buildObservation(bundle, nearestResource, trail, currentTick, world.resources);
          learnAdaptiveHeuristics(stepReward, observation);
        }
      }

      if (phaseState.tickContext) {
        tcScheduler.runPhase('compute', phaseState.tickContext);
      }
    };

    const environmentPhase = (phaseState) => {
      trail.step(phaseState.dt);
      if (config.signal.enabled) {
        signalField.step(phaseState.dt);
      }
      if (phaseState.tickContext) {
        tcScheduler.runPhase('diffuse', phaseState.tickContext);
      }
    };

    const finalizePhase = (phaseState) => {
      if (typeof trail.applySnapshot === 'function') {
        trail.applySnapshot();
      }
      if (config.signal.enabled && typeof signalField.applySnapshot === 'function') {
        signalField.applySnapshot();
      }
      if (phaseState.tickContext) {
        tcScheduler.runPhase('commit', phaseState.tickContext);
      }
      
      // Update metrics tracker each tick
      const currentTick = typeof getGlobalTick === 'function' ? getGlobalTick() : 0;
      metricsTracker.step(world, trail, currentTick);
    };

    while (episodeTicks < maxTicks && world.bundles.some((b) => b.alive)) {
      const dt = 1 / 60;
      const beginTick = getTcContextFactory('train');
      
      performSimulationStep({
        dt,
        mode: 'train',
        beginTick,
        phases: [capturePhase, updateAgentsPhase, resourcePhase, environmentPhase, finalizePhase],
        endTick: (ctx) => {
          if (ctx) {
            tcScheduler.endTick(ctx);
          }
        },
        onError: (err) => {
          console.error('Error in heuristic training episode:', err);
          throw err;
        }
      });

      episodeTicks++;
      if (typeof incrementGlobalTick === 'function') {
        incrementGlobalTick();
      }
      
      // Yield to browser every 50 ticks for rendering
      if (episodeTicks % 50 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    for (const bundle of world.bundles) {
      if (!bundle.alive && episodeTicks < maxTicks) {
        totalReward += config.learning.rewards.death;
      }
    }

    episodeManager.endEpisode(world.bundles[0]?.rewardTracker);
    
    // Store metrics history from this episode
    lastMetricsHistory = metricsTracker.getHistory();
    
    return {
      totalReward,
      metricsHistory: lastMetricsHistory
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
    
    // Initialize metrics tracker for this episode
    const metricsTracker = new MetricsTracker();
    const startTick = typeof getGlobalTick === 'function' ? getGlobalTick() : 0;
    metricsTracker.init(world, trail, startTick);

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
        const posBeforeUpdate = { x: bundle.x, y: bundle.y };
        const nearestResource = world.getNearestResource(bundle);
        bundle.update(dt, nearestResource);

        const chiSpent = Math.max(0, chiBeforeUpdate - bundle.chi);
        totalChiSpent += chiSpent;
        
        // Track movement for metrics
        const dx = bundle.x - posBeforeUpdate.x;
        const dy = bundle.y - posBeforeUpdate.y;
        const speed = Math.hypot(dx, dy) / dt;
        metricsTracker.onMove(dx, dy, speed);
        
        // Track chi spending
        if (chiSpent > 0) {
          metricsTracker.onChiSpend(chiSpent, 'agent-update');
        }

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
            // Track chi reward from resource collection
            const rewardAmount = config.rewardChi || 0;
            const currentTick = typeof getGlobalTick === 'function' ? getGlobalTick() : 0;
            metricsTracker.onChiReward(rewardAmount, 'resource', currentTick);
            
            // Track guidance efficacy (was agent near strong trail?)
            const sample = trail.sample(bundle.x, bundle.y);
            const nearTrail = sample.value > 0.15;
            metricsTracker.onResourceFound(nearTrail);
            
            break;
          }
        }

        const provenanceCredit = ledger.getCredits(bundle.id);
        
        // Track chi from reuse (collective intelligence metric)
        if (provenanceCredit > 0) {
          metricsTracker.onChiFromReuse(provenanceCredit);
        }
        
        const stepReward = bundle.rewardTracker.computeStepReward(
          collectedResource,
          totalChiSpent,
          provenanceCredit,
          world.resources
        );
        totalReward += stepReward;

        // Adaptive heuristics learning
        if (adaptiveHeuristics?.isActive) {
          const currentTick = typeof getGlobalTick === 'function' ? getGlobalTick() : 0;
          const observation = buildObservation(bundle, nearestResource, trail, currentTick, world.resources);
          learnAdaptiveHeuristics(stepReward, observation);
        }
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
      
      // Update metrics tracker each tick
      const currentTick = typeof getGlobalTick === 'function' ? getGlobalTick() : 0;
      metricsTracker.step(world, trail, currentTick);
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
    
    // Store metrics history from this episode
    lastMetricsHistory = metricsTracker.getHistory();
    
    return {
      totalReward,
      metricsHistory: lastMetricsHistory
    };
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
      
      // Update UI immediately
      if (documentHandle) {
        const startBtn = documentHandle.getElementById('start-training');
        const stopBtn = documentHandle.getElementById('stop-training');
        if (startBtn) startBtn.disabled = false;
        if (stopBtn) stopBtn.disabled = true;
      }
      
      ui.updateStats({
        status: 'Training Stopped',
        generation: learner.generation,
        bestReward: learner.bestReward,
        meanReward: learner.meanReward || 0,
        populationSize: config.learning.populationSize
      });
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

    ui.on('onExportMetrics', () => {
      const metricsData = getMetricsExport();
      
      if (!metricsData) {
        alert('No metrics data available. Run a training session first!');
        console.warn('Export metrics: No data available');
        return;
      }
      
      try {
        const json = JSON.stringify(metricsData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = documentHandle.createElement('a');
        a.href = url;
        
        // Create filename with generation and timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const generation = learner.generation;
        a.download = `metrics-gen${generation}-${timestamp}.json`;
        
        a.click();
        URL.revokeObjectURL(url);
        
        console.log(`📊 Metrics exported: ${metricsData.snapshots.length} snapshots from generation ${generation}`);
        console.log(`   File: metrics-gen${generation}-${timestamp}.json`);
      } catch (err) {
        console.error('Failed to export metrics:', err);
        alert('Failed to export metrics. Check console for details.');
      }
    });

    ui.on('onExportState', () => {
      try {
        const snap = buildStateSnapshot({ world, trail, signalField, config });
        const json = JSON.stringify(snap, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const link = documentHandle.createElement('a');
        link.href = URL.createObjectURL(blob);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        link.download = `essence-state-${timestamp}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
        console.log(`✅ Simulation state exported: ${link.download}`);
      } catch (err) {
        console.error('Failed to export simulation state:', err);
        alert('Failed to export simulation state. See console for details.');
      }
    });

    ui.on('onLoadState', () => {
      const input = documentHandle.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            const ok = applyStateSnapshot(data, { world, trail, signalField, config });
            if (ok) {
              console.log('✅ Simulation state loaded from', file.name);
              alert(`Simulation state loaded: ${file.name}`);
            } else {
              alert('Failed to apply simulation state');
            }
          } catch (err) {
            console.error('Failed to load simulation state:', err);
            alert('Failed to load simulation state. See console for details.');
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });
    
    // Baseline collection handlers
    ui.on('onStartBaseline', () => {
      if (!startBaselineCollection) {
        alert('Baseline collection not available');
        return;
      }
      
      const success = startBaselineCollection();
      if (success && ui.updateBaselineStatus) {
        ui.updateBaselineStatus(true, 0);
        
        // Update status periodically while collecting
        const updateInterval = setInterval(() => {
          if (!isBaselineCollecting || !isBaselineCollecting()) {
            clearInterval(updateInterval);
            return;
          }
          
          const metrics = getBaselineMetrics ? getBaselineMetrics() : null;
          const count = metrics ? metrics.length : 0;
          ui.updateBaselineStatus(true, count);
        }, 1000);
      }
    });
    
    ui.on('onStopBaseline', () => {
      if (!stopBaselineCollection) {
        alert('Baseline collection not available');
        return;
      }
      
      const success = stopBaselineCollection();
      if (success && ui.updateBaselineStatus) {
        const metrics = getBaselineMetrics ? getBaselineMetrics() : null;
        const count = metrics ? metrics.length : 0;
        ui.updateBaselineStatus(false, count);
      }
    });
    
    ui.on('onExportBaseline', () => {
      if (!getBaselineMetrics) {
        alert('Baseline collection not available');
        return;
      }
      
      const baselineData = getBaselineMetrics();
      
      if (!baselineData || baselineData.length === 0) {
        alert('No baseline data available. Start baseline collection first!');
        console.warn('Export baseline: No data available');
        return;
      }
      
      try {
        const exportData = {
          metadata: {
            exportedAt: new Date().toISOString(),
            type: 'baseline',
            snapshotCount: baselineData.length,
            config: {
              agentCount: world?.bundles?.length || 0,
              rewardChi: config?.rewardChi || 0,
              autoMove: config?.autoMove || false,
              moveSpeedPxPerSec: config?.moveSpeedPxPerSec || 0
            }
          },
          snapshots: baselineData
        };
        
        const json = JSON.stringify(exportData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = documentHandle.createElement('a');
        a.href = url;
        
        // Create filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        a.download = `baseline-metrics-${timestamp}.json`;
        
        a.click();
        URL.revokeObjectURL(url);
        
        console.log(`📊 Baseline metrics exported: ${baselineData.length} snapshots`);
        console.log(`   File: baseline-metrics-${timestamp}.json`);
      } catch (err) {
        console.error('Failed to export baseline metrics:', err);
        alert('Failed to export baseline metrics. Check console for details.');
      }
    });
    
    // Config optimization handlers
    ui.on('onStartConfigOpt', async (objective, generations) => {
      const manager = ensureConfigTrainingManager(objective);
      if (!manager) {
        alert('Config optimizer not available');
        return;
      }
      
      // Pause the world during training to avoid confusion
      const wasRunning = !world.paused;
      if (typeof setWorldPaused === 'function') {
        setWorldPaused(true);
      }
      
      console.log(`🚀 Starting config optimization: ${generations} generations, objective: ${objective}`);
      ui.updateConfigOptStats({
        status: 'Running...',
        generation: configOptimizer.generation,
        bestFitness: configOptimizer.bestFitness,
        convergence: configOptimizer._computeConvergence(),
        hasBestConfig: configOptimizer.bestConfig !== null
      });
      
      try {
        await manager.runTraining(generations, (current, total, status) => {
          // Update UI with progress
          ui.updateConfigOptStats({
            status,
            generation: configOptimizer.generation,
            bestFitness: configOptimizer.bestFitness,
            convergence: configOptimizer._computeConvergence(),
            hasBestConfig: configOptimizer.bestConfig !== null
          });
          
          // Log progress
          console.log(`📊 ${status} | Gen: ${configOptimizer.generation} | Fitness: ${configOptimizer.bestFitness.toFixed(3)}`);
        });
        
        console.log('✅ Config optimization complete!');
        console.log('📈 Best fitness:', configOptimizer.bestFitness);
        console.log('⚙️ Best config:', configOptimizer.bestConfig);
        
        ui.updateConfigOptStats({
          status: 'Complete',
          generation: configOptimizer.generation,
          bestFitness: configOptimizer.bestFitness,
          convergence: configOptimizer._computeConvergence(),
          hasBestConfig: true
        });
        
        // Restore world state
        if (wasRunning && typeof setWorldPaused === 'function') {
          setWorldPaused(false);
        }
        
        alert(`✅ Optimization Complete!\n\nGeneration: ${configOptimizer.generation}\nBest Fitness: ${configOptimizer.bestFitness.toFixed(3)}\n\nClick "🎮 Test" to see the optimized config in action!`);
        
      } catch (error) {
        console.error('❌ Config optimization error:', error);
        alert(`Config optimization failed: ${error.message}`);
        ui.resetConfigOptUI();
        
        // Restore world state on error
        if (wasRunning && typeof setWorldPaused === 'function') {
          setWorldPaused(false);
        }
      }
    });
    
    ui.on('onStopConfigOpt', () => {
      if (configTrainingManager) {
        configTrainingManager.stop();
        console.log('Config optimization stopped');
        ui.resetConfigOptUI();
      }
    });
    
    ui.on('onSaveConfig', () => {
      if (!configOptimizer || !configOptimizer.bestConfig) {
        alert('No optimized config to save');
        return;
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const genLabel = `gen${configOptimizer.generation}`;
      
      // Export 1: Full optimizer state (for resuming training)
      const fullExportData = {
        metadata: {
          exportedAt: new Date().toISOString(),
          generation: configOptimizer.generation,
          bestFitness: configOptimizer.bestFitness,
          objective: configOptimizer.objective,
          convergence: configOptimizer._computeConvergence()
        },
        optimizerState: configOptimizer.save(),
        bestConfig: configOptimizer.getBestConfig()
      };
      
      const fullJson = JSON.stringify(fullExportData, null, 2);
      const fullBlob = new Blob([fullJson], { type: 'application/json' });
      const fullUrl = URL.createObjectURL(fullBlob);
      const fullLink = documentHandle.createElement('a');
      fullLink.href = fullUrl;
      fullLink.download = `optimized-config-${genLabel}-${timestamp}.json`;
      fullLink.click();
      URL.revokeObjectURL(fullUrl);
      
      // Export 2: Config panel compatible format (for easy loading)
      const configIOSnapshot = configOptimizer.exportConfigIOSnapshot();
      const configPanelExport = {
        name: `Optimized ${configOptimizer.objective} (${genLabel})`,
        description: `Auto-optimized config targeting ${configOptimizer.objective} objective. Fitness: ${configOptimizer.bestFitness.toFixed(3)}, Convergence: ${(configOptimizer._computeConvergence() * 100).toFixed(1)}%`,
        snapshot: configIOSnapshot
      };
      
      const panelJson = JSON.stringify(configPanelExport, null, 2);
      const panelBlob = new Blob([panelJson], { type: 'application/json' });
      const panelUrl = URL.createObjectURL(panelBlob);
      const panelLink = documentHandle.createElement('a');
      panelLink.href = panelUrl;
      panelLink.download = `config-profile-${genLabel}-${timestamp}.json`;
      panelLink.click();
      URL.revokeObjectURL(panelUrl);
      
      console.log('✅ Exported 2 files:');
      console.log(`  1. optimized-config-${genLabel}-${timestamp}.json (full optimizer state)`);
      console.log(`  2. config-profile-${genLabel}-${timestamp}.json (for config panel)`);
      console.log('Metadata:', fullExportData.metadata);
      
      alert(`Exported 2 files:\n\n1. Full optimizer state (for resuming)\n2. Config profile (import in main config panel [O])`);
    });
    
    ui.on('onLoadConfig', () => {
      const input = documentHandle.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            
            if (!data.optimizerState || !data.bestConfig) {
              alert('Invalid config file format');
              return;
            }
            
            // Load optimizer state
            ensureConfigTrainingManager(data.metadata?.objective || 'balanced');
            configOptimizer.load(data.optimizerState);
            
            console.log('Config loaded:', data.metadata);
            alert(`Loaded config from generation ${data.metadata.generation}`);
            
            ui.updateConfigOptStats({
              status: 'Loaded',
              generation: configOptimizer.generation,
              bestFitness: configOptimizer.bestFitness,
              convergence: configOptimizer._computeConvergence(),
              hasBestConfig: true
            });
            
          } catch (error) {
            console.error('Failed to load config:', error);
            alert(`Failed to load config: ${error.message}`);
          }
        };
        
        reader.readAsText(file);
      };
      
      input.click();
    });
    
    ui.on('onApplyConfig', () => {
      if (!configOptimizer || !configOptimizer.bestConfig) {
        alert('No optimized config to apply');
        return;
      }
      
      if (!confirm('Apply optimized config to simulation? This will update CONFIG values.')) {
        return;
      }
      
      configOptimizer.applyConfig(configOptimizer.bestConfig);
      console.log('✅ Applied optimized config:', configOptimizer.bestConfig);
      alert('✅ Config applied!\n\nThe simulation is now using the optimized parameters.\n\nPress [Space] to unpause and see the results!');
    });
    
    ui.on('onTestConfig', () => {
      if (!configOptimizer || !configOptimizer.bestConfig) {
        alert('No optimized config to test');
        return;
      }
      
      // Apply config
      configOptimizer.applyConfig(configOptimizer.bestConfig);
      console.log('✅ Applied optimized config for testing');
      
      // Reset world to see fresh results
      world.reset();
      console.log('🔄 World reset for testing');
      
      // Unpause if paused
      if (typeof setWorldPaused === 'function') {
        setWorldPaused(false);
      }
      
      alert('✅ Config applied and world reset!\n\nWatch the agents perform with the optimized parameters!');
    });


    console.log('Training UI initialized. Press [L] to toggle.');
  }
  
  function getMetricsExport() {
    if (!lastMetricsHistory || lastMetricsHistory.length === 0) {
      return null;
    }
    return {
      metadata: {
        exportedAt: new Date().toISOString(),
        generation: learner?.generation || 0,
        snapshotCount: lastMetricsHistory.length,
        config: {
          agentCount: world?.bundles?.length || 0,
          episodeLength: config?.learning?.episodeLength || 0,
          rewardChi: config?.rewardChi || 0,
          populationSize: config?.learning?.populationSize || 0
        }
      },
      snapshots: lastMetricsHistory
    };
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
    ensureConfigTrainingManager,
    initializeTrainingUI,
    stopTraining,
    isTrainingStopped: () => stopTrainingFlag,
    setStopTrainingFlag: (value) => {
      stopTrainingFlag = Boolean(value);
    },
    getLastMetrics: () => lastMetricsHistory,
    getConfigOptimizer: () => configOptimizer,
    getConfigTrainingManager: () => configTrainingManager,
    // Adaptive Heuristics
    getAdaptiveHeuristics,
    learnAdaptiveHeuristics,
    resetAdaptiveHeuristics,
  };
}
