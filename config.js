// Slime-Bundle Configuration
// Organized config for physics, trails, AI, and learning

export const CONFIG = {
  // === Physics & Core Mechanics ===
  startChi: 15,
  baseDecayPerSecond: 0.10,
  moveSpeedPxPerSec: 160,
  moveCostPerSecond: 0.25,
  rewardChi: 10,                    // DEPRECATED: kept for backward compatibility
  resourceRadius: 8,
  bundleSize: 40,

  // === Resource Ecology (dynamic resource availability) ===
  resourceDynamicCount: true,       // Use dynamic resource ecology vs fixed count
  resourceInitialMin: 5,            // Starting resources (min) - initial abundance
  resourceInitialMax: 7,            // Starting resources (max) - initial abundance
  resourceStableMin: 2,             // Stable minimum after depletion
  resourceStableMax: 4,             // Stable maximum after depletion
  resourceDepletionRate: 0.015,     // Rate of decline per collection (carrying capacity pressure)
  resourceRecoveryChance: 0.10,     // Chance per second to add a resource (if below stable max)
  resourceRespawnCooldown: 400,     // Ticks (3 seconds at 60fps) before resource can respawn after collection
  // Legacy fixed count (used when resourceDynamicCount = false)
  resourceCount: 3,                 // Fixed number of resources (legacy mode)
  
  // Resource scaling relative to living agents (INVERSE: more agents = less food)
  resourceScaleWithAgents: true,    // Scale max resources based on living agent count
  resourceBaseAbundance: 15,        // Base resource abundance (when few agents)
  resourceCompetition: 1.0,         // Resource reduction per agent (competition pressure)
  resourceScaleMinimum: 3,          // Minimum resources even with many agents
  resourceScaleMaximum: 20,         // Maximum resources (with very few agents)
  
  // === Plant Ecology System (soil fertility & clustering) ===
  plantEcology: {
    enabled: true,                  // Use plant-based resource system
    
    // Fertility Grid (like trail grid, but for soil quality)
    fertilityCell: 40,              // Size of fertility cells (pixels)
    
    // Initial conditions
    initialFertility: 0.8,          // Starting soil quality (0-1)
    fertilityVariation: 0.3,        // Random variation in initial fertility
    
    // Growth mechanics
    seedChance: 0.01,               // Chance per second for resource to spawn seed
    seedDistance: 120,              // Max distance for seed dispersal (pixels)
    growthFertilityThreshold: 0.3,  // Min fertility needed for growth
    growthChance: 0.1,             // Chance per second to grow in fertile soil
    
    // Resource clustering
    patchCount: 3,                  // Number of initial fertile patches
    patchRadius: 150,               // Radius of fertile patches (pixels)
    patchFertility: 0.9,            // Fertility in patch centers
    
    // Depletion & recovery
    harvestDepletion: 0.15,         // Fertility lost per harvest (local)
    harvestRadius: 60,              // Radius of depletion effect (pixels)
    fertilityRecovery: 0.05,        // Fertility gain per second (when not harvested)
    maxFertility: 1.0,              // Max fertility cap
    
    // Population pressure
    populationPressure: true,       // Enable population-based degradation
    pressurePerAgent: 0.01,         // Global fertility drain per agent per second
    pressureThreshold: 6,           // Agents above this cause pressure

    // Spawn pressure (reduce growth when population high)
    spawnPressure: {
      startAgents: 8,               // Agents before pressure kicks in
      maxAgents: 24,                // Population where pressure is maxed
      minSeedMultiplier: 0.35,      // Minimum fraction of seed chance
      minGrowthMultiplier: 0.2,     // Minimum fraction of spontaneous growth chance
      minResourceMultiplier: 0.3    // Minimum fraction of resource abundance cap
    }
  },

  // === Adaptive Reward System ===
  // Biologically-grounded rewards that scale with search difficulty
  // Based on ATP/glucose metabolism and optimal foraging theory
  adaptiveReward: {
    enabled: true,                 // Toggle adaptive vs fixed reward
    gainFactor: 5.0,               // "Ecosystem generosity" (4-10 range recommended)
    avgMoveFraction: 0.7,          // Assume 70% of time spent moving
    emaAlpha: 0.15,                 // EMA smoothing (0.05-0.2, lower = more stable)
    minReward: 3.0,                // Safety floor (prevent tiny rewards)
    maxReward: 100.0,              // Safety ceiling (prevent explosion)
    
    // Optional: Absolute biological anchor (disabled by default)
    // When enabled, rewards based on ~1 femtomole glucose = 6×10⁸ molecules
    useAbsoluteAnchor: false,
    chiPerATP: 1 / 1e8,            // 1 χ per 10^8 ATP molecules
    moleculesPerPatch: 6e8,        // 1 femtomole = 6×10^8 molecules
    atpPerGlucose: 30,             // ~30 ATP per glucose molecule
  },

  // === Trail System ===
  trailCell: 6,
  depositPerSec: 2.5,
  evapPerSec: 0.015,
  diffusePerSec: 0.08,
  enableDiffusion: false,             // Diffusion off by default for cleaner trails
  renderTrail: true,

  // === Residuals (public-good reuse) ===
  residualGainPerSec: 0.8,
  residualCapPerTick: 0.3,
  trailCooldownTicks: 8,
  
  // === Own Trail Penalty (discourages circuit running) ===
  ownTrailPenalty: 0.05,           // Chi cost per second for being on own fresh trail
  ownTrailGraceAge: 60,            // Ticks before own trail is "safe" to cross (0 = always penalize)

  // === Autonomy ===
  autoMove: true,                     // Start in auto mode (no manual control)

  // === Sensing (smooth + delta-paid) ===
  aiSensoryRangeBase: 160,            // Reduced from 220 (tighter base vision)
  aiSensoryRangeMax: 360,             // Reduced from 560 (less popping)
  aiSenseCostPerSecond: 1.0,
  aiSenseRangePerChi: 30,             // Reduced from 55 (83% more expensive!)
  aiSenseBiasFromFrustr: 0.65,
  aiSenseSlewPerSec: 380,

  // === Wall Avoidance ===
  aiWallAvoidMargin: 100,         // Distance from wall to start avoiding (pixels)
  aiWallAvoidStrength: 3.5,       // Strength of wall repulsion force

  // === Agent Collision ===
  enableAgentCollision: true,     // Enable collision between agents
  agentCollisionPushback: 0.3,    // Strength of separation force (0-1) - reduced to avoid wall pushing

  // === Exploration & Trail Following ===
  aiExploreNoiseBase: 0.15,
  aiExploreNoiseGain: 0.55,
  aiTrailFollowingNear: 0.25,
  aiTrailFollowingFar: 2.6,
  aiSampleDistance: 46,

  // === Frustration (now smooth 0..1) ===
  aiFrustrationBuildRate: 0.15,       // Reduced from 0.25 (slower frustration build)
  aiFrustrationDecayRate: 0.6,
  aiFrustrationSightGrace: 90,
  aiFrustrationLowTrail: 0.15,        // Reduced from 0.20 (stricter threshold)

  // === Frustration Effects ===
  aiSurgeMax: 0.35,
  aiTurnRateBase: 4.0,
  aiTurnRateGain: 3.5,

  // === Hunger System (biological drive) ===
  hungerBuildRate: 0.08,              // Rate hunger increases per second
  hungerDecayOnCollect: 0.7,          // How much hunger decreases when collecting resource (0.7 = 70% relief)
  hungerThresholdLow: 0.3,            // Below this, agent is "satisfied"
  hungerThresholdHigh: 0.7,           // Above this, agent is "starving"
  hungerExplorationAmp: 1.8,          // Multiplier on exploration noise when hungry (max)
  hungerFrustrationAmp: 2.5,          // Multiplier on frustration build rate when hungry (max)
  hungerSenseAmp: 1.5,                // Multiplier on sensory range bias when hungry (max)
  hungerSurgeAmp: 1.3,                // Multiplier on speed surge when hungry (max)

  // === Resource Scent Gradient System ===
  // Resources emit "scent" that decreases with distance, giving agents a gradient to climb
  scentGradient: {
    enabled: true,                    // Enable scent gradient system
    maxRange: 400,                    // Maximum distance scent can be detected (pixels)
    falloffType: 'inverse-square',    // 'linear', 'inverse', 'inverse-square', 'exponential'
    strength: 1.0,                    // Base strength of scent at resource location
    showSubtleIndicator: true,        // Show pulsating rings around resources
    
    // Distance-based reward settings
    rewardEnabled: true,              // Give rewards for getting closer to food
    rewardScale: 0.5,                 // Scaling factor for distance rewards (χ per pixel closer)
    rewardUpdateInterval: 10,         // Check distance every N ticks (avoid per-frame noise)
    
    // Multi-scale density sensing
    densitySensingEnabled: true,      // Enable food density sensing in observations
    densityRadiusNear: 200,           // Near field radius (pixels)
    densityRadiusMid: 400,            // Mid field radius (pixels)
    densityRadiusFar: 600,            // Far field radius (pixels)
  },

  // === Mitosis System (Reproduction Mechanics) ===
  // Agents can reproduce when they have sufficient energy
  mitosis: {
    enabled: true,                    // Enable mitosis system
    enabledDuringTraining: false,     // Disable during training (keep population fixed)
    threshold: 400,                   // Minimum χ required to reproduce
    cost: 15,                         // χ spent by parent on reproduction
    childStartChi: 12,                // Child's starting χ
    cooldown: 300,                    // Ticks between mitosis attempts (5 seconds at 60fps)
    maxAgents: 32,                    // Hard population cap
    maxAliveAgents: 24,               // Target cap for living agents
    spawnOffset: 60,                  // Distance from parent to spawn child (pixels)
    inheritHeading: true,             // Child inherits parent's heading (with noise)
    headingNoise: 0.8,                // Radians of noise added to inherited heading

    // Discrete budding reproduction when χ is very high
    buddingThreshold: 400,            // χ required to trigger budding split
    buddingShare: 0.5,                // Fraction of parent's χ transferred to budded child
    buddingOffset: 20,                // Random jitter radius for budding spawn (pixels)
    buddingRespectCooldown: true,     // Reuse cooldown before another budding/mitosis event

    // Population dynamics
    respectCarryingCapacity: true,    // Integrate with resource ecology
    carryingCapacityMultiplier: 1.5,  // Allow population = resources × multiplier
  },

  // === Decay System (Chi Recycling) ===
  // Dead agents decay and release their chi back into the environment
  decay: {
    enabled: true,                    // Enable decay system
    duration: 360,                    // Ticks for full decay (6 seconds at 60fps)
    fertilityBoost: 0.4,              // Chi → fertility conversion rate (0.4 fertility per chi)
    releaseRadius: 80,                // Area of effect for chi release (pixels)
    visualFade: true,                 // Gradually fade and shrink visually
    removeAfterDecay: true,           // Remove fully decayed agents from array
  },

  // === HUD ===
  hud: { 
    show: true,
    showActions: false  // Show action values (turn/thrust/senseFrac) for debugging
  },

  // === Learning System ===
  learning: {
    // Observation vector settings
    observationDims: 23,          // total observation vector size (was 15, now includes scent+density)
    normalizeObs: true,           // normalize observations to [-1, 1]
    
    // Action space
    turnRate: 0.1,                // max turn per step (radians)
    thrustScale: 1.0,             // thrust multiplier
    
    // Reward function weights
    rewards: {
      collectResource: 500.0,      // +R when collecting resource
      chiGain: 0.5,               // +R per χ gained (residual reuse)
      chiSpend: -0.1,             // -R per χ spent
      stuck: -0.8,                // -R when stuck near walls
      idle: -0.5,                 // -R per tick when idle
      explore: 10.0,              // +R for unique trail coverage
      provenanceCredit: .5,        // +R when others reuse your trails
      death: -50.0,               // -R when χ reaches 0
      gradientClimb: 2.0,         // +R per pixel moved closer to food (gradient climbing)
    },
    
    // Episode settings
    episodeLength: 3000,          // max ticks per episode
    terminateOnDeath: true,       // end episode when χ = 0
    
    // CEM/CMA-ES settings
    populationSize: 20,           // number of policies per generation
    eliteCount: 5,                // top K policies to keep
    mutationStdDev: 0.5,          // initial exploration noise
    generations: 100,             // training generations
  },

  // === Rendering & UI ===
  rendering: {
    renderTrail: true,
    hud: { show: true },
  },

  // === Controls ===
  controls: {
    autoMove: false,              // toggle with [A]
  },
};

