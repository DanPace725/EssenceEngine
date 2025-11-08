// Cross-Entropy Method (CEM) Learner for Essence Engine
// Simple evolutionary algorithm for training policies

import { CONFIG } from './config.js';
import { LinearPolicyController } from './controllers.js';

/**
 * CEM Learner - trains policies using Cross-Entropy Method
 * 
 * Algorithm:
 * 1. Sample N policies from Gaussian distribution (μ, σ)
 * 2. Evaluate each policy by running an episode
 * 3. Keep top K "elite" policies
 * 4. Update μ, σ based on elites
 * 5. Repeat
 */
export class CEMLearner {
  constructor(observationDims = 15, actionDims = 3) {
    this.obsDims = observationDims;
    this.actionDims = actionDims;
    this.weightDims = (observationDims * actionDims) + actionDims; // W + b
    
    // Population settings
    this.populationSize = CONFIG.learning.populationSize;
    this.eliteCount = CONFIG.learning.eliteCount;
    
    // Distribution parameters
    this.mu = new Array(this.weightDims).fill(0); // mean
    this.sigma = new Array(this.weightDims).fill(CONFIG.learning.mutationStdDev); // std dev
    
    // Training state
    this.generation = 0;
    this.bestReward = -Infinity;
    this.bestWeights = null;
    this.history = [];
  }
  
  /**
   * Sample N policies from current distribution
   */
  samplePolicies() {
    const policies = [];
    for (let i = 0; i < this.populationSize; i++) {
      const weights = this.sampleWeights();
      const policy = new LinearPolicyController(null, this.obsDims);
      policy.setWeightsFlat(weights);
      policies.push({ policy, weights });
    }
    return policies;
  }
  
  /**
   * Sample weights from Gaussian distribution
   */
  sampleWeights() {
    const weights = [];
    for (let i = 0; i < this.weightDims; i++) {
      // Box-Muller transform for Gaussian sampling
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      weights.push(this.mu[i] + this.sigma[i] * z);
    }
    return weights;
  }
  
  /**
   * Update distribution based on elite policies
   * @param {Array} elites - array of {weights, reward} objects
   */
  updateDistribution(elites) {
    // Update mean
    for (let i = 0; i < this.weightDims; i++) {
      let sum = 0;
      for (const elite of elites) {
        sum += elite.weights[i];
      }
      this.mu[i] = sum / elites.length;
    }
    
    // Update standard deviation
    for (let i = 0; i < this.weightDims; i++) {
      let sum = 0;
      for (const elite of elites) {
        const diff = elite.weights[i] - this.mu[i];
        sum += diff * diff;
      }
      this.sigma[i] = Math.sqrt(sum / elites.length);
      
      // Prevent sigma from collapsing to zero
      this.sigma[i] = Math.max(this.sigma[i], 0.01);
    }
    
    this.generation++;
  }
  
  /**
   * Select elite policies based on rewards
   * @param {Array} results - array of {weights, reward} objects
   */
  selectElites(results) {
    // Sort by reward (descending)
    results.sort((a, b) => b.reward - a.reward);
    
    // Keep top K
    const elites = results.slice(0, this.eliteCount);
    
    // Track best
    if (elites[0].reward > this.bestReward) {
      this.bestReward = elites[0].reward;
      this.bestWeights = [...elites[0].weights];
    }
    
    // Record history
    this.history.push({
      generation: this.generation,
      bestReward: elites[0].reward,
      meanReward: results.reduce((sum, r) => sum + r.reward, 0) / results.length,
      eliteMeanReward: elites.reduce((sum, e) => sum + e.reward, 0) / elites.length
    });
    
    return elites;
  }
  
  /**
   * Get the current best policy
   */
  getBestPolicy() {
    if (!this.bestWeights) {
      // Return random policy if no training yet
      const policy = new LinearPolicyController(null, this.obsDims);
      return policy;
    }
    
    const policy = new LinearPolicyController(null, this.obsDims);
    policy.setWeightsFlat(this.bestWeights);
    return policy;
  }
  
  /**
   * Get learning statistics
   */
  getStats() {
    if (this.history.length === 0) {
      return null;
    }
    
    const recent = this.history.slice(-10);
    return {
      generation: this.generation,
      bestReward: this.bestReward,
      recentMeanReward: recent.reduce((sum, h) => sum + h.meanReward, 0) / recent.length,
      recentBestReward: recent.reduce((sum, h) => sum + h.bestReward, 0) / recent.length,
      history: this.history
    };
  }
  
  /**
   * Save learner state to JSON
   */
  save() {
    return {
      generation: this.generation,
      mu: this.mu,
      sigma: this.sigma,
      bestReward: this.bestReward,
      bestWeights: this.bestWeights,
      history: this.history
    };
  }
  
  /**
   * Load learner state from JSON
   */
  load(state) {
    this.generation = state.generation;
    this.mu = state.mu;
    this.sigma = state.sigma;
    this.bestReward = state.bestReward;
    this.bestWeights = state.bestWeights;
    this.history = state.history;
  }
}

/**
 * Training Manager - coordinates training loop
 */
export class TrainingManager {
  constructor(learner, worldResetFn, runEpisodeFn) {
    this.learner = learner;
    this.worldResetFn = worldResetFn;
    this.runEpisodeFn = runEpisodeFn;
    
    this.isTraining = false;
    this.currentGeneration = 0;
    this.currentPolicy = 0;
  }
  
  /**
   * Run one training generation
   * Returns promise that resolves when generation is complete
   */
  async runGeneration() {
    this.isTraining = true;
    
    // Sample policies
    const policies = this.learner.samplePolicies();
    const results = [];
    
    // Evaluate each policy
    for (let i = 0; i < policies.length; i++) {
      this.currentPolicy = i;
      
      // Reset world
      this.worldResetFn();
      
      // Run episode with this policy
      const reward = await this.runEpisodeFn(policies[i].policy);
      
      results.push({
        weights: policies[i].weights,
        reward: reward
      });
      
      // Yield to browser
      await this.sleep(0);
    }
    
    // Select elites and update distribution
    const elites = this.learner.selectElites(results);
    this.learner.updateDistribution(elites);
    
    this.currentGeneration++;
    this.isTraining = false;
    
    return {
      generation: this.currentGeneration,
      bestReward: elites[0].reward,
      meanReward: results.reduce((sum, r) => sum + r.reward, 0) / results.length
    };
  }
  
  /**
   * Run multiple generations
   */
  async runTraining(numGenerations) {
    for (let i = 0; i < numGenerations; i++) {
      const result = await this.runGeneration();
      console.log(`Generation ${result.generation}: best=${result.bestReward.toFixed(2)}, mean=${result.meanReward.toFixed(2)}`);
    }
  }
  
  stop() {
    this.isTraining = false;
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

