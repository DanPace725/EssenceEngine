import { CONFIG } from '../../config.js';
import { SignalField } from '../../signalField.js';
import { SignalResponseAnalytics } from '../../analysis/signalResponseAnalytics.js';
import { TcScheduler, TcStorage, TcRandom } from '../../tcStorage.js';
import ParticipationManager from '../systems/participation.js';

const clampValue = (value, min, max) => Math.max(min, Math.min(max, value));

const defaultPerformanceNow = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

export function createWorld(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('context is required to create World');
  }

  const {
    Trail,
    getCanvasWidth,
    getCanvasHeight,
    getGlobalTick,
    setGlobalTick,
    Ledger,
    Links,
    Bundle,
    Resource,
    getPerformanceNow = defaultPerformanceNow
  } = context;

  if (!Trail) throw new Error('Trail dependency is required');
  if (typeof getCanvasWidth !== 'function') throw new Error('getCanvasWidth dependency is required');
  if (typeof getCanvasHeight !== 'function') throw new Error('getCanvasHeight dependency is required');
  if (typeof getGlobalTick !== 'function') throw new Error('getGlobalTick dependency is required');
  if (typeof setGlobalTick !== 'function') throw new Error('setGlobalTick dependency is required');
  if (!Ledger) throw new Error('Ledger dependency is required');
  if (!Links) throw new Error('Links dependency is required');
  if (typeof Links.length === 'undefined') throw new Error('Links must be an array-like object');
  if (!Bundle) throw new Error('Bundle dependency is required');
  if (!Resource) throw new Error('Resource dependency is required');

  const canvasWidth = () => getCanvasWidth();
  const canvasHeight = () => getCanvasHeight();
  const nowSeconds = () => getPerformanceNow() / 1000;

  const world = {
    paused: false,
    bundles: [],
    resources: [],  // Changed from single resource to array
    collected: 0,

    // Mitosis tracking
    nextAgentId: 5,  // Start at 5 (after initial 4 agents: 1-4)
    totalBirths: 0,  // Count of all mitosis events
    lineageLinks: [], // Array of {parentId, childId, birthTick} for visual lineage tracking

    // === Resource Ecology (carrying capacity model) ===
    carryingCapacity: 0,           // Current max resources (starts high, declines to stable)
    resourcePressure: 0,           // Accumulated depletion pressure (0..1)

    // === Adaptive Reward Tracking ===
    avgFindTime: 4.0,              // EMA of time between resource finds (seconds)
    avgAlpha: 0.1,                 // EMA smoothing factor (fallback if not in config)
    lastFindTimestamp: null,       // Timestamp of last resource collection
    rewardStats: {                 // Statistics for monitoring
      totalRewards: 0,
      avgRewardGiven: 0,
      minFindTime: Infinity,
      maxFindTime: 0
    },

    reset() {
      console.warn(`🔄 [World.reset()] CALLED | Canvas dimensions: ${canvasWidth()}x${canvasHeight()}`);
      Trail.clear();
      SignalField.clear();
      SignalResponseAnalytics.reset();
      if (ParticipationManager && typeof ParticipationManager.resetState === 'function') {
        ParticipationManager.resetState({ reason: 'world-reset' });
      }
      TcStorage.clear();
      TcScheduler.reset();
      setGlobalTick(0);
      Ledger.credits = {};
      // Clear all links on reset
      Links.length = 0;

      // Reset mitosis tracking (will be set after bundles are created)
      this.totalBirths = 0;
      this.lineageLinks = [];

      // Destroy all existing bundles (clear PixiJS graphics)
      if (this.bundles) {
        this.bundles.forEach(bundle => {
          if (bundle && typeof bundle.destroy === 'function') {
            bundle.destroy();
          }
        });
      }

      // Destroy all existing resources (clear PixiJS graphics)
      if (this.resources) {
        this.resources.forEach(resource => {
          if (resource && typeof resource.destroy === 'function') {
            resource.destroy();
          }
        });
      }

      const cx = canvasWidth() / 2;
      const cy = canvasHeight() / 2;
      
      // Create starting agents based on config
      const numAgents = Math.max(1, Math.floor(CONFIG.startingAgents || 4));
      this.bundles = [];
      
      // Position agents in a circle around the center
      const radius = Math.min(canvasWidth(), canvasHeight()) * 0.15; // 15% of smaller dimension
      for (let i = 0; i < numAgents; i++) {
        const angle = (i / numAgents) * Math.PI * 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        const agentId = i + 1; // IDs start at 1
        this.bundles.push(new Bundle(x, y, CONFIG.bundleSize, CONFIG.startChi, agentId));
      }
      
      // Set next agent ID to continue after starting agents
      this.nextAgentId = numAgents + 1;

      // Initialize resource ecology
      this.resources = [];
      if (CONFIG.resourceDynamicCount) {
        // Calculate initial resource count
        let initialCount;

        // If using plant ecology with agent-scaled resources, respect competition
        if (CONFIG.plantEcology.enabled && CONFIG.resourceScaleWithAgents) {
          const startingAgents = this.bundles.length;
          initialCount = Math.floor(
            clampValue(
              CONFIG.resourceBaseAbundance - (startingAgents * CONFIG.resourceCompetition),
              CONFIG.resourceScaleMinimum,
              CONFIG.resourceScaleMaximum
            )
          );
          console.log(`🌱 Initial resources: ${initialCount} (${startingAgents} starting agents)`);
        } else {
          // Legacy: start with abundant resources, will decline to stable level
          initialCount = Math.floor(
            CONFIG.resourceInitialMin +
            TcRandom.random() * (CONFIG.resourceInitialMax - CONFIG.resourceInitialMin + 1)
          );
        }

        this.carryingCapacity = initialCount;
        this.resourcePressure = 0; // No depletion pressure at start

        for (let i = 0; i < initialCount; i++) {
          const res = new Resource(cx + 120, cy, CONFIG.resourceRadius);
          res.respawn();
          this.resources.push(res);
        }
      } else {
        // Legacy fixed count mode
        const numResources = CONFIG.resourceCount || 1;
        for (let i = 0; i < numResources; i++) {
          const res = new Resource(cx + 120, cy, CONFIG.resourceRadius);
          res.respawn();
          this.resources.push(res);
        }
      }

      this.collected = 0;

      // Don't reset EMA across episodes during training (tracks long-term difficulty)
      // Only reset timestamp so first find in episode starts fresh
      this.lastFindTimestamp = nowSeconds();
    },

    // Add lineage link when mitosis occurs
    addLineageLink(parentId, childId, birthTick) {
      this.lineageLinks.push({
        parentId: parentId,
        childId: childId,
        birthTick: birthTick
      });
    },

    // Clean up lineage links (remove expired or invalid links)
    cleanupLineageLinks() {
      if (!CONFIG.mitosis.showLineage) return;

      const maxAge = CONFIG.mitosis.lineageFadeDuration || 600;
      const now = getGlobalTick();

      // Filter out expired links and links where parent or child no longer exists
      this.lineageLinks = this.lineageLinks.filter(link => {
        const age = now - link.birthTick;
        if (age > maxAge) return false; // Link expired

        // Check if parent and child still exist
        const parent = this.bundles.find(b => b.id === link.parentId);
        const child = this.bundles.find(b => b.id === link.childId);

        return parent && child; // Keep link if both exist
      });
    },

    // Helper function to get nearest resource to a bundle (only visible resources)
    getNearestResource(bundle) {
      const visibleResources = this.resources.filter(res => res.visible);
      if (visibleResources.length === 0) return null;

      let nearest = visibleResources[0];
      let minDist = Math.hypot(bundle.x - nearest.x, bundle.y - nearest.y);

      for (let i = 1; i < visibleResources.length; i++) {
        const dist = Math.hypot(bundle.x - visibleResources[i].x, bundle.y - visibleResources[i].y);
        if (dist < minDist) {
          minDist = dist;
          nearest = visibleResources[i];
        }
      }

      return nearest;
    },

    // Update resource ecology (carrying capacity model)
    updateEcology(dt) {
      // If plant ecology is enabled, it handles all resource management!
      if (CONFIG.plantEcology.enabled) {
        // Plant ecology manages resources via fertility, seed dispersal, etc.
        // Just update carrying capacity for mitosis population limits
        const aliveCount = this.bundles.filter(b => b.alive).length;
        this.carryingCapacity = Math.max(
          CONFIG.resourceStableMin,
          Math.floor(this.resources.length * 1.2)  // Loose cap based on current resources
        );
        return;
      }

      // Legacy system (only used when plant ecology disabled)
      if (!CONFIG.resourceDynamicCount) return; // Skip if using fixed count

      // Resource pressure decays slowly over time (ecosystem recovery)
      this.resourcePressure = Math.max(0, this.resourcePressure - 0.001 * dt);

      // Calculate current target carrying capacity based on pressure
      // Linearly interpolate from initial abundance to stable minimum
      const targetCapacity = Math.floor(
        CONFIG.resourceStableMin +
        (CONFIG.resourceInitialMax - CONFIG.resourceStableMin) * (1 - this.resourcePressure)
      );

      // Gradually adjust carrying capacity toward target
      this.carryingCapacity = Math.max(CONFIG.resourceStableMin, targetCapacity);

      // Random resource spawning (if below stable max and below carrying capacity)
      if (this.resources.length < CONFIG.resourceStableMax &&
          this.resources.length < this.carryingCapacity) {
        const spawnChance = CONFIG.resourceRecoveryChance * dt;
        if (TcRandom.random() < spawnChance) {
          const cx = canvasWidth() / 2;
          const cy = canvasHeight() / 2;
          const res = new Resource(cx, cy, CONFIG.resourceRadius);
          res.respawn();
          this.resources.push(res);
        }
      }

      // Remove excess resources if carrying capacity dropped
      while (this.resources.length > this.carryingCapacity) {
        this.resources.pop();
      }
    },

    // Handle resource collection with ecology effects
    onResourceCollected() {
      // Plant ecology handles depletion via fertility system
      if (CONFIG.plantEcology.enabled) return;

      // Legacy system only
      if (!CONFIG.resourceDynamicCount) return;

      // Increase depletion pressure (simulates ecosystem stress from harvesting)
      this.resourcePressure = Math.min(1, this.resourcePressure + CONFIG.resourceDepletionRate);
    }
  };

  return world;
}
