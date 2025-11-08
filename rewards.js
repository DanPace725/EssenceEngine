// Reward Tracking System for Essence Engine Learning
// Tracks agent performance and calculates rewards

import { CONFIG } from './config.js';

/**
 * Calculate adaptive resource collection reward
 * Based on search difficulty and metabolic cost
 * 
 * @param {number} avgFindTime - EMA of time between finds (seconds)
 * @param {object} config - CONFIG.adaptiveReward settings
 * @returns {number} - χ reward to give
 */
export function calculateAdaptiveReward(avgFindTime, config = CONFIG.adaptiveReward) {
  // Option 1: Behavioral/Relative Reward (default)
  if (!config.useAbsoluteAnchor) {
    // Calculate expected metabolic cost per search
    const f_move = config.avgMoveFraction;
    const C_base = CONFIG.baseDecayPerSecond + f_move * CONFIG.moveCostPerSecond;
    
    // Reward = gainFactor × cost per second × average time to find
    // This ensures reward scales with actual search difficulty
    const reward = config.gainFactor * C_base * avgFindTime;
    
    // Apply safety bounds
    return Math.max(config.minReward, Math.min(config.maxReward, reward));
  }
  
  // Option 2: Absolute Biological Anchor (ATP-based)
  else {
    const molecules = config.moleculesPerPatch;
    const atp = molecules * config.atpPerGlucose;
    const absoluteChi = atp * config.chiPerATP;
    
    // Still apply safety bounds
    return Math.max(config.minReward, Math.min(config.maxReward, absoluteChi));
  }
}

/**
 * Update EMA of find time and return new average
 * Called when resource is collected
 * 
 * @param {object} world - World object with EMA state
 * @returns {number} - Time since last find (for stats)
 */
export function updateFindTimeEMA(world) {
  const nowSec = performance.now() / 1000;
  
  // Calculate time since last find
  const dtFind = world.lastFindTimestamp 
    ? Math.max(0.05, nowSec - world.lastFindTimestamp)
    : world.avgFindTime; // Use current average if first find
  
  // Update timestamp
  world.lastFindTimestamp = nowSec;
  
  // Update EMA
  const alpha = CONFIG.adaptiveReward?.emaAlpha || world.avgAlpha || 0.1;
  world.avgFindTime = (1 - alpha) * world.avgFindTime + alpha * dtFind;
  
  // Update stats
  world.rewardStats.minFindTime = Math.min(world.rewardStats.minFindTime, dtFind);
  world.rewardStats.maxFindTime = Math.max(world.rewardStats.maxFindTime, dtFind);
  
  return dtFind;
}

/**
 * RewardTracker - monitors bundle performance and calculates rewards
 */
export class RewardTracker {
  constructor(bundle) {
    this.bundle = bundle;
    this.reset();
  }
  
  reset() {
    // Episode stats
    this.totalReward = 0;
    this.stepReward = 0;
    this.episodeLength = 0;
    
    // Component rewards (for analysis)
    this.rewards = {
      collect: 0,
      chiGain: 0,
      chiSpend: 0,
      stuck: 0,
      idle: 0,
      explore: 0,
      provenance: 0,
      death: 0,
      gradientClimb: 0,  // Reward for getting closer to food (scent gradient)
      signalResponse: 0,  // Reward for moving toward signal field gradients
    };
    
    // State tracking
    this.lastChi = this.bundle.chi;
    this.lastPos = { x: this.bundle.x, y: this.bundle.y };
    this.stuckTicks = 0;
    this.idleTicks = 0;
    this.visitedCells = new Set(); // for exploration tracking
    
    // Distance tracking for gradient climbing reward
    this.lastNearestFoodDist = Infinity;
    this.distanceCheckCounter = 0; // Only check every N ticks to reduce noise
  }
  
  /**
   * Compute reward for current step
   * Called after bundle.update()
   * 
   * @param {boolean} collectedResource - Did agent collect a resource this step?
   * @param {number} chiSpent - Chi spent this step
   * @param {number} provenanceCredit - Credits from others using your trails
   * @param {Array} resources - Array of Resource objects (for distance tracking)
   */
  computeStepReward(collectedResource, chiSpent, provenanceCredit, resources = []) {
    this.stepReward = 0;
    this.episodeLength++;
    
    // === 1. Resource Collection ===
    if (collectedResource) {
      const r = CONFIG.learning.rewards.collectResource;
      this.stepReward += r;
      this.rewards.collect += r;
    }
    
    // === 2. χ Gain (residual reuse) ===
    const chiDelta = this.bundle.chi - this.lastChi;
    if (chiDelta > 0) {
      const r = CONFIG.learning.rewards.chiGain * chiDelta;
      this.stepReward += r;
      this.rewards.chiGain += r;
    }
    
    // === 3. χ Spend (metabolic + movement + sensing costs) ===
    if (chiSpent > 0) {
      const r = CONFIG.learning.rewards.chiSpend * chiSpent;
      this.stepReward += r;
      this.rewards.chiSpend += r;
    }
    
    // === 4. Stuck Penalty ===
    const dist = Math.hypot(
      this.bundle.x - this.lastPos.x,
      this.bundle.y - this.lastPos.y
    );
    
    // Check if near wall and not moving much
    const nearWall = this.isNearWall();
    if (nearWall && dist < 2) {
      this.stuckTicks++;
      if (this.stuckTicks > 30) { // stuck for 30 ticks
        const r = CONFIG.learning.rewards.stuck;
        this.stepReward += r;
        this.rewards.stuck += r;
      }
    } else {
      this.stuckTicks = 0;
    }
    
    // === 5. Idle Penalty ===
    if (dist < 1 && this.bundle.chi > 1) { // not moving and has energy
      this.idleTicks++;
      if (this.idleTicks > 20) {
        const r = CONFIG.learning.rewards.idle;
        this.stepReward += r;
        this.rewards.idle += r;
      }
    } else {
      this.idleTicks = 0;
    }
    
    // === 6. Exploration Bonus ===
    const cellX = Math.floor(this.bundle.x / 50);
    const cellY = Math.floor(this.bundle.y / 50);
    const cellKey = `${cellX},${cellY}`;
    
    if (!this.visitedCells.has(cellKey)) {
      this.visitedCells.add(cellKey);
      const r = CONFIG.learning.rewards.explore;
      this.stepReward += r;
      this.rewards.explore += r;
    }
    
    // === 7. Provenance Credit (when others reuse your trails) ===
    if (provenanceCredit > 0) {
      const r = CONFIG.learning.rewards.provenanceCredit * provenanceCredit;
      this.stepReward += r;
      this.rewards.provenance += r;
    }
    
    // === 8. Gradient Climbing Reward ===
    // Reward for getting closer to nearest food (only check periodically to reduce noise)
    if (CONFIG.scentGradient?.rewardEnabled && resources && resources.length > 0) {
      this.distanceCheckCounter++;
      const checkInterval = CONFIG.scentGradient.rewardUpdateInterval || 10;
      
      if (this.distanceCheckCounter >= checkInterval) {
        this.distanceCheckCounter = 0;
        
        // Find distance to nearest food
        let nearestDist = Infinity;
        for (const res of resources) {
          const dx = res.x - this.bundle.x;
          const dy = res.y - this.bundle.y;
          const dist = Math.hypot(dx, dy);
          if (dist < nearestDist) {
            nearestDist = dist;
          }
        }
        
        // Calculate distance change (negative = got closer = good!)
        if (this.lastNearestFoodDist !== Infinity) {
          const distanceChange = nearestDist - this.lastNearestFoodDist;
          
          // Reward for getting closer (distanceChange is negative when approaching)
          if (distanceChange < 0) {
            const pixelsCloser = Math.abs(distanceChange);
            const r = CONFIG.learning.rewards.gradientClimb * pixelsCloser;
            this.stepReward += r;
            this.rewards.gradientClimb += r;
          }
        }
        
        this.lastNearestFoodDist = nearestDist;
      }
    }
    
    // === 9. Signal Field Response Reward ===
    // Reward for moving toward resource signal gradients when hungry
    if (CONFIG.signal?.enabled && CONFIG.learning.rewards.signalResponse && 
        this.bundle.hunger > CONFIG.hungerThresholdLow) {
      const signalContext = this.bundle.signalContext;
      const resourceSignal = signalContext?.resource;
      
      if (resourceSignal && resourceSignal.gradient) {
        const grad = resourceSignal.gradient;
        const gradMag = Math.hypot(grad.dx || 0, grad.dy || 0);
        
        if (gradMag > 0.1) {  // Only if gradient is significant
          // Calculate movement direction
          const moveDx = this.bundle.x - this.lastPos.x;
          const moveDy = this.bundle.y - this.lastPos.y;
          const moveMag = Math.hypot(moveDx, moveDy);
          
          if (moveMag > 1) {  // Agent moved meaningfully
            // Dot product: how aligned is movement with signal gradient?
            const alignment = ((moveDx * grad.dx) + (moveDy * grad.dy)) / moveMag;
            
            // Reward for moving toward signal (alignment > 0)
            if (alignment > 0) {
              const r = CONFIG.learning.rewards.signalResponse * alignment * moveMag;
              this.stepReward += r;
              this.rewards.signalResponse += r;
            }
          }
        }
      }
    }
    
    // === 10. Death Penalty ===
    if (!this.bundle.alive && this.lastChi > 0) {
      const r = CONFIG.learning.rewards.death;
      this.stepReward += r;
      this.rewards.death += r;
    }
    
    // Update tracking
    this.lastChi = this.bundle.chi;
    this.lastPos = { x: this.bundle.x, y: this.bundle.y };
    this.totalReward += this.stepReward;
    
    return this.stepReward;
  }
  
  isNearWall() {
    const margin = 30;
    const w = typeof innerWidth !== 'undefined' ? innerWidth : 800;
    const h = typeof innerHeight !== 'undefined' ? innerHeight : 600;
    
    return (this.bundle.x < margin || 
            this.bundle.x > w - margin ||
            this.bundle.y < margin ||
            this.bundle.y > h - margin);
  }
  
  /**
   * Get summary of episode performance
   */
  getSummary() {
    return {
      totalReward: this.totalReward,
      episodeLength: this.episodeLength,
      avgReward: this.episodeLength > 0 ? this.totalReward / this.episodeLength : 0,
      rewards: { ...this.rewards },
      explorationCoverage: this.visitedCells.size
    };
  }
}

/**
 * Episode Manager - handles episode lifecycle
 */
export class EpisodeManager {
  constructor() {
    this.currentEpisode = 0;
    this.episodeHistory = [];
  }
  
  startEpisode() {
    this.currentEpisode++;
    this.episodeStartTime = performance.now();
  }
  
  endEpisode(rewardTracker) {
    const summary = rewardTracker.getSummary();
    summary.episodeNum = this.currentEpisode;
    summary.duration = performance.now() - this.episodeStartTime;
    
    this.episodeHistory.push(summary);
    
    // Keep only last 100 episodes
    if (this.episodeHistory.length > 100) {
      this.episodeHistory.shift();
    }
    
    return summary;
  }
  
  getStats() {
    if (this.episodeHistory.length === 0) {
      return null;
    }
    
    const recent = this.episodeHistory.slice(-10);
    const avgReward = recent.reduce((sum, ep) => sum + ep.totalReward, 0) / recent.length;
    const avgLength = recent.reduce((sum, ep) => sum + ep.episodeLength, 0) / recent.length;
    
    return {
      episodesCompleted: this.episodeHistory.length,
      avgRewardLast10: avgReward,
      avgLengthLast10: avgLength,
      bestEpisode: this.episodeHistory.reduce((best, ep) => 
        ep.totalReward > best.totalReward ? ep : best
      )
    };
  }
}

