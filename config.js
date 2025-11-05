// Slime-Bundle Configuration
// Organized config for physics, trails, AI, and learning

export const CONFIG = {
  // === Physics & Core Mechanics ===
  startChi: 15,
  baseDecayPerSecond: 0.10,
  moveSpeedPxPerSec: 150,
  moveCostPerSecond: 0.35,
  rewardChi: 10,                    // DEPRECATED: kept for backward compatibility
  resourceRadius: 10,
  bundleSize: 40,

  // === Resource Ecology (dynamic resource availability) ===
  resourceDynamicCount: true,       // Use dynamic resource ecology vs fixed count
  resourceInitialMin: 5,            // Starting resources (min) - initial abundance
  resourceInitialMax: 7,            // Starting resources (max) - initial abundance
  resourceStableMin: 2,             // Stable minimum after depletion
  resourceStableMax: 4,             // Stable maximum after depletion
  resourceDepletionRate: 0.025,     // Rate of decline per collection (carrying capacity pressure)
  resourceRecoveryChance: 0.10,     // Chance per second to add a resource (if below stable max)
  resourceRespawnCooldown: 100,     // Ticks (3 seconds at 60fps) before resource can respawn after collection
  // Legacy fixed count (used when resourceDynamicCount = false)
  resourceCount: 3,                 // Fixed number of resources (legacy mode)
  
  // Resource scaling relative to living agents (INVERSE: more agents = less food)
  resourceScaleWithAgents: true,    // Scale max resources based on living agent count
  resourceBaseAbundance: 50,        // Base resource abundance (when few agents)
  resourceCompetition: 1.0,         // Resource reduction per agent (competition pressure)
  resourceScaleMinimum: 5,          // Minimum resources even with many agents
  resourceScaleMaximum: 80,         // Maximum resources (with very few agents)
  
  // === Plant Ecology System (soil fertility & clustering) ===
  plantEcology: {
    enabled: true,                  // Use plant-based resource system
    
    // Fertility Grid (like trail grid, but for soil quality)
    fertilityCell: 75,              // Size of fertility cells (pixels)
    
    // Initial conditions
    initialFertility: 0.7,          // Starting soil quality (0-1)
    fertilityVariation: 0.6,        // Random variation in initial fertility
    
    // Growth mechanics
    seedChance: 0.01,               // Chance per second for resource to spawn seed
    seedDistance: 100,              // Max distance for seed dispersal (pixels)
    growthFertilityThreshold: 0.3,  // Min fertility needed for growth
    growthChance: 0.1,             // Chance per second to grow in fertile soil
    
    // Resource clustering
    patchCount: 5,                  // Number of initial fertile patches
    patchRadius: 200,               // Radius of fertile patches (pixels)
    patchFertility: 0.3,            // Fertility in patch centers
    
    // Depletion & recovery
    harvestDepletion: 0.20,         // Fertility lost per harvest (local)
    harvestRadius: 40,              // Radius of depletion effect (pixels)
    fertilityRecovery: 0.10,        // Fertility gain per second (when not harvested)
    maxFertility: 1.0,              // Max fertility cap
    
    // Population pressure
    populationPressure: true,       // Enable population-based degradation
    pressurePerAgent: 0.01,         // Global fertility drain per agent per second
    pressureThreshold: 10,           // Agents above this cause pressure

    // Spawn pressure (reduce growth when population high)
    spawnPressure: {
      startAgents: 8,               // Agents before pressure kicks in
      maxAgents: 50,                // Population where pressure is maxed
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
    emaAlpha: 0.1,                 // EMA smoothing (0.05-0.2, lower = more stable)
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
  trailCell: 7,
  depositPerSec: 2.5,
  evapPerSec: .05,
  diffusePerSec: .08,
  enableDiffusion: true,             // Diffusion off by default for cleaner trails
  renderTrail: true,

  // === Residuals (public-good reuse) ===
  residualGainPerSec: 1,
  residualCapPerTick: 0.3,
  trailCooldownTicks: 8,
  
  // === Own Trail Penalty (discourages circuit running) ===
  ownTrailPenalty: 0.5,           // Chi cost per second for being on own fresh trail
  ownTrailGraceAge: 10,            // Ticks before own trail is "safe" to cross (0 = always penalize)

  // === Autonomy ===
  autoMove: true,                     // Start in auto mode (no manual control)

  // === Sensing (smooth + delta-paid) ===
  aiSensoryRangeBase: 175,            // Reduced from 220 (tighter base vision)
  aiSensoryRangeMax: 360,             // Reduced from 560 (less popping)
  aiSenseCostPerSecond: 1.0,
  aiSenseRangePerChi: 35,             // Reduced from 55 (83% more expensive!)
  aiSenseBiasFromFrustr: 0.8,
  aiSenseSlewPerSec: 380,

  // === Wall Avoidance ===
  aiWallAvoidMargin: 100,         // Distance from wall to start avoiding (pixels)
  aiWallAvoidStrength: 3.5,       // Strength of wall repulsion force

  // === Agent Collision ===
  enableAgentCollision: true,     // Enable collision between agents
  agentCollisionPushback: 0.5,    // Strength of separation force (0-1) - reduced to avoid wall pushing

  // === Exploration & Trail Following ===
  aiExploreNoiseBase: 0.15,
  aiExploreNoiseGain: 0.55,
  aiTrailFollowingNear: 0.25,
  aiTrailFollowingFar: 2.6,
  aiSampleDistance: 46,

  // === Frustration (now smooth 0..1) ===
  aiFrustrationBuildRate: 0.5,       // Reduced from 0.25 (slower frustration build)
  aiFrustrationDecayRate: 0.6,
  aiFrustrationSightGrace: 30,
  aiFrustrationLowTrail: 0.10,        // Reduced from 0.20 (stricter threshold)

  // === Frustration Effects ===
  aiSurgeMax: 0.5,
  aiTurnRateBase: 4.0,
  aiTurnRateGain: 3.5,

  // === Hunger System (biological drive) ===
  hungerBuildRate: 0.10,              // Rate hunger increases per second
  hungerDecayOnCollect: 0.7,          // How much hunger decreases when collecting resource (0.7 = 70% relief)
  hungerThresholdLow: 0.3,            // Below this, agent is "satisfied"
  hungerThresholdHigh: 0.6,           // Above this, agent is "starving"
  hungerExplorationAmp: 5,          // Multiplier on exploration noise when hungry (max)
  hungerFrustrationAmp: 3,          // Multiplier on frustration build rate when hungry (max)
  hungerSenseAmp: 2,                // Multiplier on sensory range bias when hungry (max)
  hungerSurgeAmp: 1.5,                // Multiplier on speed surge when hungry (max)

  // === Resource Scent Gradient System ===
  // Resources emit "scent" that decreases with distance, giving agents a gradient to climb
  scentGradient: {
    enabled: true,                    // Enable scent gradient system
    maxRange: 400,                    // Maximum distance scent can be detected (pixels)
    falloffType: 'inverse-square',    // 'linear', 'inverse', 'inverse-square', 'exponential'
    strength: 1,                      // Base strength of scent at resource location
    showSubtleIndicator: true,        // Show pulsating rings around resources
    
    // Distance-based reward settings
    rewardEnabled: true,              // Give rewards for getting closer to food
    rewardScale: 0.75,                 // Scaling factor for distance rewards (χ per pixel closer)
    rewardUpdateInterval: 3.5,         // Check distance every N ticks (avoid per-frame noise)
    
    // Multi-scale density sensing
    densitySensingEnabled: true,      // Enable food density sensing in observations
    densityRadiusNear: 400,           // Near field radius (pixels)
    densityRadiusMid: 400,            // Mid field radius (pixels)
    densityRadiusFar: 600,            // Far field radius (pixels)
    
    // Consumable gradient by orbiting agents
    consumable: true,
    consumePerSec: 0.15,             // Strength/sec removed when orbiting closely
    recoverPerSec: 0.03,             // Strength/sec recovery when no agents orbit
    minStrength: 0.2,                // Floor for strength
    minRange: 150,                   // Floor for range (px)
    orbitBandPx: 140                 // Band outside resource.r considered "orbit"
  },

  // === Mitosis System (Reproduction Mechanics) ===
  // Agents can reproduce when they have sufficient energy
  mitosis: {
    enabled: true,                    // Enable mitosis system
    enabledDuringTraining: false,     // Disable during training (keep population fixed)
    threshold: 100,                   // Minimum χ required to reproduce
    cost: 50,                         // χ spent by parent on reproduction
    childStartChi: 12,                // Child's starting χ
    cooldown: 150,                    // Ticks between mitosis attempts (5 seconds at 60fps)
    maxAgents: 50,                    // Hard population cap
    maxAliveAgents: 50,               // Target cap for living agents
    spawnOffset: 60,                  // Distance from parent to spawn child (pixels)
    inheritHeading: true,             // Child inherits parent's heading (with noise)
    headingNoise: 0.8,                // Radians of noise added to inherited heading

    // Discrete budding reproduction when χ is very high
    buddingThreshold: 100,            // χ required to trigger budding split
    buddingShare: 0.5,                // Fraction of parent's χ transferred to budded child
    buddingOffset: 20,                // Random jitter radius for budding spawn (pixels)
    buddingRespectCooldown: true,     // Reuse cooldown before another budding/mitosis event

    // Population dynamics
    respectCarryingCapacity: true,    // Integrate with resource ecology
    carryingCapacityMultiplier: 1.5,  // Allow population = resources × multiplier
    
    // Lineage visualization
    showLineage: false,                // Draw lines connecting parent to child
    lineageMaxDistance: 5000,          // Max distance to draw lineage link (pixels)
    lineageFadeDuration: 10000,         // Ticks until lineage link fades (10 seconds at 60fps)
    lineageOpacity: 1,              // Base opacity of lineage lines (0-1)
    lineageColor: "#CFFF04",          // Color of lineage lines
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
    showActions: true // Show action values (turn/thrust/senseFrac) for debugging
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
      gradientClimb: 5.0,         // +R per pixel moved closer to food (gradient climbing)
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

  // === Link System (agent-to-agent tubes) ===
  link: {
    radius: 120,              // px
    formCost: 1.2,            // χ to create (per agent)
    maintPerSec: 0.02,        // χ/sec * strength (per agent)
    decayPerSec: 0.015,       // strength/sec loss
    strengthenPerUse: 0.04,   // strength/sec when used
    initStrength: 0.8,        // initial strength at formation
    minStrength: 0.1,
    guidanceGain: 0.6,        // steering bias multiplier
    springK: 0.004,           // gentle
    transfer: { capPerSec: 0.4, loss: 0.2 },
    trailMin: 0.25,           // need “hot” shared cell to form
    // Hunger escape: hungry agents reduce link influence and increase decay
    hungerEscape: 0.7,        // 0..1 fraction to damp link forces at max hunger
    hungerDecayPerSec: 0.02   // extra strength/sec decay at max hunger (averaged)
  },
  
  // === Bond Loss Signals ===
  bondLoss: {
    onDeathExploreBoost: 1.0,     // Extra exploration noise multiplier when a bonded partner dies
    onDeathBoostDuration: 600     // Duration in ticks for bereavement exploration boost
  },
};

