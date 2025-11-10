/**
 * Adaptive Heuristics - learns to modulate existing heuristic parameters
 * Builds on the sophisticated behavioral system rather than replacing it
 */

export class AdaptiveHeuristics {
  constructor(config) {
    this.config = config;

    // Base parameters (from CONFIG) that we can modulate
    this.baseParams = {
      // Movement & Navigation
      wallAvoidStrength: config.aiWallAvoidStrength || 1.5,
      resourceAttractionStrength: config.aiResourceAttractionStrength || 1.0,
      moveSpeedPxPerSec: config.moveSpeedPxPerSec || 150,
      moveCostPerSecond: config.moveCostPerSecond || 0.35,

      // Trail System
      trailFollowingFar: config.aiTrailFollowingFar || 0.6,
      trailFollowingNear: config.aiTrailFollowingNear || 0.3,
      depositPerSec: config.depositPerSec || 2.5,
      aiSampleDistance: config.aiSampleDistance || 46,

      // Exploration
      exploreNoiseBase: config.aiExploreNoiseBase || 0.15,
      exploreNoiseGain: config.aiExploreNoiseGain || 0.55,

      // Sensing
      sensoryRangeBase: config.aiSensoryRangeBase || 175,

      // Frustration
      frustrationBuildRate: config.aiFrustrationBuildRate || 0.5,
      frustrationDecayRate: config.aiFrustrationDecayRate || 0.6,

      // Hunger Amplifiers
      hungerExplorationAmp: config.hungerExplorationAmp || 5.0,
      hungerFrustrationAmp: config.hungerFrustrationAmp || 3.0,
      hungerSenseAmp: config.hungerSenseAmp || 2.0,
      hungerSurgeAmp: config.hungerSurgeAmp || 1.5,

      // Signals
      signalResourceGain: config.signal?.resourcePullGain || 0.8,
      signalDistressGain: config.signal?.distressNoiseGain || 0.3,

      // Turn Rate
      turnRateGain: config.aiTurnRateGain || 0.3
    };

    // Adaptive multipliers (learned parameters)
    this.adaptiveMultipliers = {
      wallAvoidStrength: 1.0,
      resourceAttractionStrength: 1.0,
      moveSpeedPxPerSec: 1.0,
      moveCostPerSecond: 1.0,
      trailFollowingFar: 1.0,
      trailFollowingNear: 1.0,
      depositPerSec: 1.0,
      aiSampleDistance: 1.0,
      exploreNoiseBase: 1.0,
      exploreNoiseGain: 1.0,
      sensoryRangeBase: 1.0,
      frustrationBuildRate: 1.0,
      frustrationDecayRate: 1.0,
      hungerExplorationAmp: 1.0,
      hungerFrustrationAmp: 1.0,
      hungerSenseAmp: 1.0,
      hungerSurgeAmp: 1.0,
      signalResourceGain: 1.0,
      signalDistressGain: 1.0,
      turnRateGain: 1.0
    };

    // Learning state
    this.isActive = false;
    this.learningRate = 0.05; // More aggressive for visible changes
    this.performanceHistory = [];
    this.historySize = 100;
    this.baselineReward = 0;
    this.rewardSmoothing = 0.95;

    // Performance tracking
    this.lastReward = 0;
    this.rewardHistory = [];
    this.parameterHistory = [];

    // console.log('🧠 Adaptive Heuristics initialized with', Object.keys(this.baseParams).length, 'parameters');
  }

  /**
   * Get current modulated parameter values
   */
  getCurrentParams() {
    const modulated = {};
    for (const [key, baseValue] of Object.entries(this.baseParams)) {
      modulated[key] = baseValue * this.adaptiveMultipliers[key];
    }
    return modulated;
  }

  /**
   * Get parameter for use in heuristic calculations
   */
  getParam(key) {
    if (!this.baseParams.hasOwnProperty(key)) {
      console.warn('Unknown parameter:', key);
      return 1.0;
    }
    return this.baseParams[key] * this.adaptiveMultipliers[key];
  }

  /**
   * Toggle learning on/off
   */
  toggle() {
    this.isActive = !this.isActive;
    console.log(`🧠 Adaptive Heuristics ${this.isActive ? '✅ ENABLED' : '⏸️  DISABLED'}`);

    if (this.isActive) {
      // Reset performance baseline when starting
      this.baselineReward = this.lastReward || 0;
      this.performanceHistory = [];
      console.log(`   📊 Learning rate: ${this.learningRate}`);
      console.log(`   🎯 Parameters being adapted: ${Object.keys(this.baseParams).length}`);
      console.log(`   ⏱️  Will start learning after ${5} reward samples`);
    }
  }

  /**
   * Update learning based on reward signal
   */
  learn(reward, observation = {}) {
    if (!this.isActive) return;

    this.lastReward = reward;
    this.rewardHistory.push(reward);
    if (this.rewardHistory.length > this.historySize) {
      this.rewardHistory.shift();
    }

    // Update baseline with exponential moving average
    this.baselineReward = this.rewardSmoothing * this.baselineReward +
                         (1 - this.rewardSmoothing) * reward;

    // Compute reward relative to baseline
    const rewardDelta = reward - this.baselineReward;

    // Only learn if we have enough data (reduced to 5 for faster response)
    if (this.rewardHistory.length < 5) return;

    // Compute parameter gradients based on reward and current observation
    const gradients = this.computeGradients(rewardDelta, observation);

    // Update adaptive multipliers
    this.updateMultipliers(gradients);

    // Store parameter history for UI
    this.parameterHistory.push({
      timestamp: Date.now(),
      multipliers: { ...this.adaptiveMultipliers },
      reward: reward,
      gradients: { ...gradients }
    });

    if (this.parameterHistory.length > this.historySize) {
      this.parameterHistory.shift();
    }
  }

  /**
   * Compute gradients for parameter updates based on reward and observation
   */
  computeGradients(rewardDelta, observation) {
    const gradients = {};

    // Positive reward delta = reinforce current parameter settings
    // Negative reward delta = try different parameter settings

    const learningSignal = Math.tanh(rewardDelta * 0.1); // Scale to reasonable range

    // === Movement & Navigation ===
    
    // Wall avoidance: increase when near walls and getting negative rewards
    const nearWall = observation.wallMag || 0;
    gradients.wallAvoidStrength = learningSignal * nearWall * 0.1;

    // Resource attraction: increase when resources are visible and getting positive rewards
    const resourceVisible = observation.resVisible || 0;
    gradients.resourceAttractionStrength = learningSignal * resourceVisible * 0.1;

    // Movement speed: increase with positive rewards, decrease with negative
    // Higher speed when doing well, slower when struggling
    gradients.moveSpeedPxPerSec = learningSignal * 0.08;

    // Movement cost: lower cost when doing well, higher cost when struggling
    // This creates an energy management trade-off
    gradients.moveCostPerSecond = -learningSignal * 0.06;

    // === Trail System ===
    
    // Trail following: increase when trails are strong and getting positive rewards
    const trailStrength = observation.trailMean || 0;
    gradients.trailFollowingFar = learningSignal * trailStrength * 0.05;
    gradients.trailFollowingNear = learningSignal * trailStrength * 0.03;
    
    // Trail deposition: more marking when successful
    gradients.depositPerSec = learningSignal * 0.04;

    // Trail sampling distance: longer look-ahead when doing well
    gradients.aiSampleDistance = learningSignal * 0.05;

    // === Exploration ===
    
    // Exploration noise: increase when stuck (high frustration, low reward)
    const frustration = observation.frustration || 0;
    const explorationSignal = -learningSignal + frustration * 0.5; // Explore more when frustrated
    gradients.exploreNoiseBase = explorationSignal * 0.06;
    gradients.exploreNoiseGain = explorationSignal * 0.05;

    // === Sensing ===
    
    // Sensory range: increase when resources are far or hidden
    const sensorySignal = learningSignal * (1 - resourceVisible); // More sensing when not seeing resources
    gradients.sensoryRangeBase = sensorySignal * 0.07;

    // === Frustration Rates ===
    
    // Build rate: slower build when doing well
    gradients.frustrationBuildRate = -learningSignal * 0.05;
    
    // Decay rate: faster decay when doing well
    gradients.frustrationDecayRate = learningSignal * 0.05;

    // === Hunger Amplifiers ===

    // Hunger amplifiers should learn based on reward signal like other parameters
    // They control hunger's behavioral impact, so learn when doing well/poorly regardless of current hunger
    gradients.hungerExplorationAmp = learningSignal * 0.04;
    gradients.hungerFrustrationAmp = learningSignal * 0.04;
    gradients.hungerSenseAmp = learningSignal * 0.04;
    gradients.hungerSurgeAmp = learningSignal * 0.03;

    // === Signals ===
    
    const signalResource = observation.signalResource || 0;
    gradients.signalResourceGain = learningSignal * signalResource * 0.05;

    const signalDistress = observation.signalDistress || 0;
    gradients.signalDistressGain = learningSignal * signalDistress * 0.05;

    // === Turn Rate ===
    
    gradients.turnRateGain = learningSignal * frustration * 0.05;

    return gradients;
  }

  /**
   * Update adaptive multipliers based on gradients
   */
  updateMultipliers(gradients) {
    for (const [param, gradient] of Object.entries(gradients)) {
      if (this.adaptiveMultipliers.hasOwnProperty(param)) {
        // Apply learning rate and clamp to reasonable bounds
        this.adaptiveMultipliers[param] += this.learningRate * gradient;
        this.adaptiveMultipliers[param] = Math.max(0.1, Math.min(3.0, this.adaptiveMultipliers[param]));
      }
    }
  }

  /**
   * Get statistics for UI display
   */
  getStats() {
    const recentRewards = this.rewardHistory.slice(-20);
    const avgReward = recentRewards.length > 0 ?
      recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length : 0;

    return {
      isActive: this.isActive,
      currentMultipliers: { ...this.adaptiveMultipliers },
      baseParams: { ...this.baseParams },
      currentParams: this.getCurrentParams(),
      avgReward: avgReward,
      baselineReward: this.baselineReward,
      rewardHistory: [...this.rewardHistory],
      parameterHistory: [...this.parameterHistory]
    };
  }

  /**
   * Reset learning state
   */
  reset() {
    // Reset multipliers to neutral values
    Object.keys(this.adaptiveMultipliers).forEach(key => {
      this.adaptiveMultipliers[key] = 1.0;
    });

    this.performanceHistory = [];
    this.rewardHistory = [];
    this.parameterHistory = [];
    this.baselineReward = 0;

    // console.log('🧠 Adaptive Heuristics reset to baseline');
  }

  /**
   * Save current learning state
   */
  save() {
    return {
      adaptiveMultipliers: { ...this.adaptiveMultipliers },
      baselineReward: this.baselineReward,
      rewardHistory: [...this.rewardHistory],
      parameterHistory: [...this.parameterHistory]
    };
  }

  /**
   * Load learning state
   */
  load(state) {
    if (state.adaptiveMultipliers) {
      this.adaptiveMultipliers = { ...state.adaptiveMultipliers };
    }
    if (state.baselineReward !== undefined) {
      this.baselineReward = state.baselineReward;
    }
    if (state.rewardHistory) {
      this.rewardHistory = [...state.rewardHistory];
    }
    if (state.parameterHistory) {
      this.parameterHistory = [...state.parameterHistory];
    }
    // console.log('🧠 Adaptive Heuristics state loaded');
  }
}
