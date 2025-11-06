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
    buddingThreshold: 150,            // χ required to trigger budding split
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

// --- Snapshots for panel resets ---
let CURRENT_BASE_SNAPSHOT = null;        // last loaded/applied profile
let BOOT_SNAPSHOT = null;                // factory defaults (boot-time read)

function initSnapshotsOnce() {
  if (!BOOT_SNAPSHOT) BOOT_SNAPSHOT = ConfigIO.snapshot();
  if (!CURRENT_BASE_SNAPSHOT) CURRENT_BASE_SNAPSHOT = BOOT_SNAPSHOT;
}


export const CONFIG_SCHEMA = {
  Metabolism: {
    startChi: { label: "Start χ", min: 0, max: 200, step: 1 },
    baseDecayPerSecond: { label: "Leak χ/sec", min: 0, max: 2, step: 0.01 },
    moveSpeedPxPerSec: { label: "Move speed (px/sec)", min: 10, max: 400, step: 5 },
    moveCostPerSecond: { label: "Move χ/sec", min: 0, max: 5, step: 0.01 },
    rewardChi: { label: "Pickup reward χ", min: 0, max: 200, step: 1 },
  },
  Resources: {
    resourceRadius: { label: "Resource radius (px)", min: 1, max: 80, step: 1 },
    bundleSize: { label: "Bundle size", min: 1, max: 200, step: 1 },
    resourceDynamicCount: { label: "Dynamic resource count", type: "boolean" },
    resourceInitialMin: { label: "Initial min resources", min: 0, max: 100, step: 1 },
    resourceInitialMax: { label: "Initial max resources", min: 0, max: 150, step: 1 },
    resourceStableMin: { label: "Stable min resources", min: 0, max: 100, step: 1 },
    resourceStableMax: { label: "Stable max resources", min: 0, max: 150, step: 1 },
    resourceDepletionRate: { label: "Depletion rate", min: 0, max: 1, step: 0.005 },
    resourceRecoveryChance: { label: "Recovery chance", min: 0, max: 1, step: 0.01 },
    resourceRespawnCooldown: { label: "Respawn cooldown (ticks)", min: 0, max: 2000, step: 10 },
    resourceCount: { label: "Legacy resource count", min: 0, max: 200, step: 1 },
    resourceScaleWithAgents: { label: "Scale with agents", type: "boolean" },
    resourceBaseAbundance: { label: "Base abundance", min: 0, max: 500, step: 5 },
    resourceCompetition: { label: "Competition factor", min: 0, max: 5, step: 0.01 },
    resourceScaleMinimum: { label: "Scale minimum", min: 0, max: 200, step: 1 },
    resourceScaleMaximum: { label: "Scale maximum", min: 0, max: 500, step: 5 },
  },
  "Plant Ecology": {
    "plantEcology.enabled": { label: "Enable plant ecology", type: "boolean" },
    "plantEcology.fertilityCell": { label: "Fertility cell (px)", min: 10, max: 200, step: 5 },
    "plantEcology.initialFertility": { label: "Initial fertility", min: 0, max: 1, step: 0.01 },
    "plantEcology.fertilityVariation": { label: "Fertility variation", min: 0, max: 1, step: 0.01 },
    "plantEcology.seedChance": { label: "Seed chance/sec", min: 0, max: 1, step: 0.001 },
    "plantEcology.seedDistance": { label: "Seed distance (px)", min: 0, max: 600, step: 5 },
    "plantEcology.growthFertilityThreshold": { label: "Growth fertility threshold", min: 0, max: 1, step: 0.01 },
    "plantEcology.growthChance": { label: "Growth chance/sec", min: 0, max: 1, step: 0.005 },
    "plantEcology.patchCount": { label: "Patch count", min: 0, max: 40, step: 1 },
    "plantEcology.patchRadius": { label: "Patch radius (px)", min: 0, max: 800, step: 10 },
    "plantEcology.patchFertility": { label: "Patch fertility", min: 0, max: 1, step: 0.01 },
    "plantEcology.harvestDepletion": { label: "Harvest depletion", min: 0, max: 1, step: 0.01 },
    "plantEcology.harvestRadius": { label: "Harvest radius (px)", min: 0, max: 400, step: 5 },
    "plantEcology.fertilityRecovery": { label: "Fertility recovery/sec", min: 0, max: 1, step: 0.01 },
    "plantEcology.maxFertility": { label: "Max fertility", min: 0, max: 1, step: 0.01 },
    "plantEcology.populationPressure": { label: "Enable population pressure", type: "boolean" },
    "plantEcology.pressurePerAgent": { label: "Pressure per agent", min: 0, max: 0.5, step: 0.005 },
    "plantEcology.pressureThreshold": { label: "Pressure threshold", min: 0, max: 200, step: 1 },
    "plantEcology.spawnPressure.startAgents": { label: "Spawn pressure start agents", min: 0, max: 200, step: 1 },
    "plantEcology.spawnPressure.maxAgents": { label: "Spawn pressure max agents", min: 0, max: 500, step: 1 },
    "plantEcology.spawnPressure.minSeedMultiplier": { label: "Min seed multiplier", min: 0, max: 1, step: 0.01 },
    "plantEcology.spawnPressure.minGrowthMultiplier": { label: "Min growth multiplier", min: 0, max: 1, step: 0.01 },
    "plantEcology.spawnPressure.minResourceMultiplier": { label: "Min resource multiplier", min: 0, max: 1, step: 0.01 },
  },
  "Adaptive Reward": {
    "adaptiveReward.enabled": { label: "Enable adaptive reward", type: "boolean" },
    "adaptiveReward.gainFactor": { label: "Gain factor", min: 0, max: 20, step: 0.1 },
    "adaptiveReward.avgMoveFraction": { label: "Avg move fraction", min: 0, max: 1, step: 0.01 },
    "adaptiveReward.emaAlpha": { label: "EMA alpha", min: 0, max: 1, step: 0.01 },
    "adaptiveReward.minReward": { label: "Min reward", min: 0, max: 200, step: 1 },
    "adaptiveReward.maxReward": { label: "Max reward", min: 0, max: 500, step: 5 },
    "adaptiveReward.useAbsoluteAnchor": { label: "Use absolute anchor", type: "boolean" },
    "adaptiveReward.chiPerATP": { label: "χ per ATP", min: 0, max: 0.1, step: 0.000001 },
    "adaptiveReward.moleculesPerPatch": { label: "Molecules per patch", min: 0, max: 1e10, step: 1e7 },
    "adaptiveReward.atpPerGlucose": { label: "ATP per glucose", min: 0, max: 100, step: 1 },
  },
  Trails: {
    trailCell: { label: "Trail cell (px)", min: 1, max: 40, step: 1 },
    depositPerSec: { label: "Deposit/sec", min: 0, max: 10, step: 0.05 },
    evapPerSec: { label: "Evap/sec", min: 0, max: 1, step: 0.01 },
    diffusePerSec: { label: "Diffuse/sec", min: 0, max: 1, step: 0.01 },
    enableDiffusion: { label: "Enable diffusion", type: "boolean" },
    renderTrail: { label: "Render trails", type: "boolean" },
    residualGainPerSec: { label: "Residual gain/sec", min: 0, max: 10, step: 0.1 },
    residualCapPerTick: { label: "Residual cap/tick", min: 0, max: 5, step: 0.01 },
    trailCooldownTicks: { label: "Trail cooldown (ticks)", min: 0, max: 200, step: 1 },
    ownTrailPenalty: { label: "Own trail penalty", min: 0, max: 5, step: 0.05 },
    ownTrailGraceAge: { label: "Own trail grace age", min: 0, max: 200, step: 1 },
  },
  Autonomy: {
    autoMove: { label: "Auto move", type: "boolean" },
    "controls.autoMove": { label: "Controls auto move", type: "boolean" },
  },
  Sensing: {
    aiSensoryRangeBase: { label: "Base range (px)", min: 20, max: 800, step: 5 },
    aiSensoryRangeMax: { label: "Max range (px)", min: 50, max: 1200, step: 10 },
    aiSenseRangePerChi: { label: "Range per χ", min: 0, max: 200, step: 1 },
    aiSenseBiasFromFrustr: { label: "Frustration bias", min: 0, max: 5, step: 0.01 },
    aiSenseSlewPerSec: { label: "Sense slew/sec", min: 0, max: 1000, step: 10 },
  },
  "Wall & Collision": {
    aiWallAvoidMargin: { label: "Wall avoid margin", min: 0, max: 400, step: 5 },
    aiWallAvoidStrength: { label: "Wall avoid strength", min: 0, max: 10, step: 0.1 },
    enableAgentCollision: { label: "Enable collision", type: "boolean" },
    agentCollisionPushback: { label: "Collision pushback", min: 0, max: 2, step: 0.01 },
  },
  Behavior: {
    aiExploreNoiseBase: { label: "Explore noise base", min: 0, max: 2, step: 0.01 },
    aiExploreNoiseGain: { label: "Explore noise gain", min: 0, max: 4, step: 0.01 },
    aiTrailFollowingNear: { label: "Trail follow (near)", min: 0, max: 10, step: 0.05 },
    aiTrailFollowingFar: { label: "Trail follow (far)", min: 0, max: 10, step: 0.05 },
    aiSampleDistance: { label: "Sample distance (px)", min: 0, max: 400, step: 1 },
  },
  Frustration: {
    aiFrustrationBuildRate: { label: "Frustration build", min: 0, max: 5, step: 0.01 },
    aiFrustrationDecayRate: { label: "Frustration decay", min: 0, max: 5, step: 0.01 },
    aiFrustrationSightGrace: { label: "Sight grace", min: 0, max: 500, step: 1 },
    aiFrustrationLowTrail: { label: "Low trail threshold", min: 0, max: 1, step: 0.01 },
  },
  "Frustration Effects": {
    aiSurgeMax: { label: "Surge max", min: 0, max: 5, step: 0.01 },
    aiTurnRateBase: { label: "Turn rate base", min: 0, max: 20, step: 0.1 },
    aiTurnRateGain: { label: "Turn rate gain", min: 0, max: 20, step: 0.1 },
  },
  Hunger: {
    hungerBuildRate: { label: "Hunger build/sec", min: 0, max: 5, step: 0.01 },
    hungerDecayOnCollect: { label: "Hunger decay on collect", min: 0, max: 1, step: 0.01 },
    hungerThresholdLow: { label: "Hunger low threshold", min: 0, max: 1, step: 0.01 },
    hungerThresholdHigh: { label: "Hunger high threshold", min: 0, max: 1, step: 0.01 },
    hungerExplorationAmp: { label: "Hunger explore amp", min: 0, max: 20, step: 0.1 },
    hungerFrustrationAmp: { label: "Hunger frustration amp", min: 0, max: 20, step: 0.1 },
    hungerSenseAmp: { label: "Hunger sense amp", min: 0, max: 20, step: 0.1 },
    hungerSurgeAmp: { label: "Hunger surge amp", min: 0, max: 10, step: 0.1 },
  },
  "Scent Gradient": {
    "scentGradient.enabled": { label: "Enable scent gradient", type: "boolean" },
    "scentGradient.maxRange": { label: "Max range (px)", min: 0, max: 1000, step: 10 },
    "scentGradient.falloffType": {
      label: "Falloff type",
      type: "options",
      options: ["linear", "inverse", "inverse-square", "exponential"],
    },
    "scentGradient.strength": { label: "Scent strength", min: 0, max: 10, step: 0.1 },
    "scentGradient.showSubtleIndicator": { label: "Show indicator", type: "boolean" },
    "scentGradient.rewardEnabled": { label: "Enable distance reward", type: "boolean" },
    "scentGradient.rewardScale": { label: "Reward scale", min: 0, max: 5, step: 0.01 },
    "scentGradient.rewardUpdateInterval": { label: "Reward update interval", min: 0, max: 200, step: 0.1 },
    "scentGradient.densitySensingEnabled": { label: "Density sensing", type: "boolean" },
    "scentGradient.densityRadiusNear": { label: "Density radius near", min: 0, max: 1000, step: 10 },
    "scentGradient.densityRadiusMid": { label: "Density radius mid", min: 0, max: 1000, step: 10 },
    "scentGradient.densityRadiusFar": { label: "Density radius far", min: 0, max: 1000, step: 10 },
    "scentGradient.consumable": { label: "Consumable gradient", type: "boolean" },
    "scentGradient.consumePerSec": { label: "Consume/sec", min: 0, max: 1, step: 0.01 },
    "scentGradient.recoverPerSec": { label: "Recover/sec", min: 0, max: 1, step: 0.01 },
    "scentGradient.minStrength": { label: "Min strength", min: 0, max: 5, step: 0.01 },
    "scentGradient.minRange": { label: "Min range (px)", min: 0, max: 400, step: 5 },
    "scentGradient.orbitBandPx": { label: "Orbit band (px)", min: 0, max: 400, step: 5 },
  },
  Mitosis: {
    "mitosis.enabled": { label: "Enable mitosis", type: "boolean" },
    "mitosis.enabledDuringTraining": { label: "Enable during training", type: "boolean" },
    "mitosis.threshold": { label: "Mitosis threshold", min: 0, max: 500, step: 1 },
    "mitosis.cost": { label: "Mitosis cost", min: 0, max: 500, step: 1 },
    "mitosis.childStartChi": { label: "Child start χ", min: 0, max: 200, step: 1 },
    "mitosis.cooldown": { label: "Mitosis cooldown", min: 0, max: 5000, step: 10 },
    "mitosis.maxAgents": { label: "Max agents", min: 0, max: 500, step: 1 },
    "mitosis.maxAliveAgents": { label: "Max alive agents", min: 0, max: 500, step: 1 },
    "mitosis.spawnOffset": { label: "Spawn offset (px)", min: 0, max: 400, step: 5 },
    "mitosis.inheritHeading": { label: "Inherit heading", type: "boolean" },
    "mitosis.headingNoise": { label: "Heading noise", min: 0, max: 3.14, step: 0.01 },
    "mitosis.buddingThreshold": { label: "Budding threshold", min: 0, max: 500, step: 1 },
    "mitosis.buddingShare": { label: "Budding share", min: 0, max: 1, step: 0.01 },
    "mitosis.buddingOffset": { label: "Budding offset (px)", min: 0, max: 200, step: 1 },
    "mitosis.buddingRespectCooldown": { label: "Budding respects cooldown", type: "boolean" },
    "mitosis.respectCarryingCapacity": { label: "Respect carrying capacity", type: "boolean" },
    "mitosis.carryingCapacityMultiplier": { label: "Carrying capacity multiplier", min: 0, max: 10, step: 0.1 },
    "mitosis.showLineage": { label: "Show lineage", type: "boolean" },
    "mitosis.lineageMaxDistance": { label: "Lineage max distance", min: 0, max: 20000, step: 10 },
    "mitosis.lineageFadeDuration": { label: "Lineage fade duration", min: 0, max: 60000, step: 10 },
    "mitosis.lineageOpacity": { label: "Lineage opacity", min: 0, max: 1, step: 0.01 },
    "mitosis.lineageColor": { label: "Lineage color", type: "color" },
  },
  Decay: {
    "decay.enabled": { label: "Enable decay", type: "boolean" },
    "decay.duration": { label: "Decay duration", min: 0, max: 5000, step: 10 },
    "decay.fertilityBoost": { label: "Fertility boost", min: 0, max: 5, step: 0.01 },
    "decay.releaseRadius": { label: "Release radius (px)", min: 0, max: 400, step: 5 },
    "decay.visualFade": { label: "Visual fade", type: "boolean" },
    "decay.removeAfterDecay": { label: "Remove after decay", type: "boolean" },
  },
  HUD: {
    "hud.show": { label: "Show HUD", type: "boolean" },
    "hud.showActions": { label: "Show actions", type: "boolean" },
  },
  Learning: {
    "learning.observationDims": { label: "Observation dimensions", min: 1, max: 200, step: 1 },
    "learning.normalizeObs": { label: "Normalize observations", type: "boolean" },
    "learning.turnRate": { label: "Turn rate", min: 0, max: 1, step: 0.001 },
    "learning.thrustScale": { label: "Thrust scale", min: 0, max: 5, step: 0.01 },
    "learning.rewards.collectResource": { label: "Reward: collect", min: -1000, max: 2000, step: 1 },
    "learning.rewards.chiGain": { label: "Reward: χ gain", min: -10, max: 10, step: 0.01 },
    "learning.rewards.chiSpend": { label: "Reward: χ spend", min: -10, max: 10, step: 0.01 },
    "learning.rewards.stuck": { label: "Reward: stuck", min: -10, max: 10, step: 0.01 },
    "learning.rewards.idle": { label: "Reward: idle", min: -10, max: 10, step: 0.01 },
    "learning.rewards.explore": { label: "Reward: explore", min: -100, max: 500, step: 0.5 },
    "learning.rewards.provenanceCredit": { label: "Reward: provenance", min: -10, max: 10, step: 0.01 },
    "learning.rewards.death": { label: "Reward: death", min: -500, max: 0, step: 1 },
    "learning.rewards.gradientClimb": { label: "Reward: gradient climb", min: -50, max: 50, step: 0.1 },
    "learning.episodeLength": { label: "Episode length", min: 100, max: 20000, step: 10 },
    "learning.terminateOnDeath": { label: "Terminate on death", type: "boolean" },
    "learning.populationSize": { label: "Population size", min: 1, max: 200, step: 1 },
    "learning.eliteCount": { label: "Elite count", min: 1, max: 200, step: 1 },
    "learning.mutationStdDev": { label: "Mutation std dev", min: 0, max: 5, step: 0.01 },
    "learning.generations": { label: "Generations", min: 1, max: 1000, step: 1 },
  },
  Rendering: {
    "rendering.renderTrail": { label: "Render trail (UI)", type: "boolean" },
    "rendering.hud.show": { label: "Render HUD", type: "boolean" },
  },
  Links: {
    "link.radius": { label: "Link radius", min: 0, max: 500, step: 5 },
    "link.formCost": { label: "Form cost χ", min: 0, max: 10, step: 0.01 },
    "link.maintPerSec": { label: "Maintain χ/sec", min: 0, max: 1, step: 0.001 },
    "link.decayPerSec": { label: "Decay/sec", min: 0, max: 1, step: 0.001 },
    "link.strengthenPerUse": { label: "Strengthen per use", min: 0, max: 1, step: 0.001 },
    "link.initStrength": { label: "Initial strength", min: 0, max: 1, step: 0.01 },
    "link.minStrength": { label: "Min strength", min: 0, max: 1, step: 0.01 },
    "link.guidanceGain": { label: "Guidance gain", min: 0, max: 5, step: 0.01 },
    "link.springK": { label: "Spring K", min: 0, max: 0.1, step: 0.0005 },
    "link.transfer.capPerSec": { label: "Transfer cap/sec", min: 0, max: 10, step: 0.01 },
    "link.transfer.loss": { label: "Transfer loss", min: 0, max: 1, step: 0.01 },
    "link.trailMin": { label: "Trail minimum", min: 0, max: 1, step: 0.01 },
    "link.hungerEscape": { label: "Hunger escape", min: 0, max: 1, step: 0.01 },
    "link.hungerDecayPerSec": { label: "Hunger decay/sec", min: 0, max: 1, step: 0.001 },
  },
  "Bond Loss": {
    "bondLoss.onDeathExploreBoost": { label: "On-death explore boost", min: 0, max: 10, step: 0.01 },
    "bondLoss.onDeathBoostDuration": { label: "On-death boost duration", min: 0, max: 10000, step: 10 },
  },
};

const CONFIG_HINTS = {
  // Metabolism
  startChi: "Starting chi for freshly spawned agents.",
  baseDecayPerSecond: "Passive chi leak each second.",
  moveSpeedPxPerSec: "Maximum movement speed in pixels per second.",
  moveCostPerSecond: "Chi spent each second while moving.",
  rewardChi: "Chi awarded when a resource is collected.",

  // Resources
  resourceRadius: "Visual radius of each resource patch.",
  bundleSize: "How many chi units each pickup contains.",
  resourceDynamicCount: "Toggle adaptive resource spawning vs fixed count.",
  resourceInitialMin: "Minimum resources spawned at boot.",
  resourceInitialMax: "Maximum resources spawned at boot.",
  resourceStableMin: "Lower bound once ecology stabilizes.",
  resourceStableMax: "Upper bound once ecology stabilizes.",
  resourceDepletionRate: "Fraction removed from patch per harvest.",
  resourceRecoveryChance: "Chance per second a depleted patch respawns.",
  resourceRespawnCooldown: "Ticks before a harvested spot can respawn.",
  resourceCount: "Fixed resource count when dynamics are disabled.",
  resourceScaleWithAgents: "Scale ecology supply based on living agents.",
  resourceBaseAbundance: "Target resources available with few agents.",
  resourceCompetition: "How strongly extra agents reduce resources.",
  resourceScaleMinimum: "Floor for scaled resource count.",
  resourceScaleMaximum: "Ceiling for scaled resource count.",

  // Plant ecology
  "plantEcology.enabled": "Enable soil fertility driven resource growth.",
  "plantEcology.fertilityCell": "Size of each fertility grid cell in pixels.",
  "plantEcology.initialFertility": "Average starting soil fertility level.",
  "plantEcology.fertilityVariation": "Randomized spread of initial fertility.",
  "plantEcology.seedChance": "Per-second chance fertile cells emit a seed.",
  "plantEcology.seedDistance": "Maximum distance a new seed can land.",
  "plantEcology.growthFertilityThreshold": "Minimum fertility needed for growth.",
  "plantEcology.growthChance": "Per-second chance a fertile cell grows food.",
  "plantEcology.patchCount": "Number of initial fertile hotspots.",
  "plantEcology.patchRadius": "Radius of each fertile hotspot in pixels.",
  "plantEcology.patchFertility": "Fertility boost inside hotspot centers.",
  "plantEcology.harvestDepletion": "Fertility lost locally per harvest.",
  "plantEcology.harvestRadius": "Radius affected by harvest depletion.",
  "plantEcology.fertilityRecovery": "Fertility regained per second when idle.",
  "plantEcology.maxFertility": "Cap on fertility value after recovery.",
  "plantEcology.populationPressure": "Enable global fertility drain from crowding.",
  "plantEcology.pressurePerAgent": "Fertility drain per agent above threshold.",
  "plantEcology.pressureThreshold": "Agent count where pressure begins.",
  "plantEcology.spawnPressure.startAgents": "Population before spawn pressure begins.",
  "plantEcology.spawnPressure.maxAgents": "Population where pressure maxes out.",
  "plantEcology.spawnPressure.minSeedMultiplier": "Minimum seed rate under pressure.",
  "plantEcology.spawnPressure.minGrowthMultiplier": "Minimum growth rate under pressure.",
  "plantEcology.spawnPressure.minResourceMultiplier": "Minimum abundance cap under pressure.",

  // Adaptive reward
  "adaptiveReward.enabled": "Toggle adaptive reward calculations.",
  "adaptiveReward.gainFactor": "Scales generosity of adaptive rewards.",
  "adaptiveReward.avgMoveFraction": "Assumed fraction of time agents spend moving.",
  "adaptiveReward.emaAlpha": "Smoothing factor for reward EMA.",
  "adaptiveReward.minReward": "Floor value for adaptive rewards.",
  "adaptiveReward.maxReward": "Ceiling value for adaptive rewards.",
  "adaptiveReward.useAbsoluteAnchor": "Anchor rewards to absolute ATP estimates.",
  "adaptiveReward.chiPerATP": "Chi credited for each ATP molecule.",
  "adaptiveReward.moleculesPerPatch": "Estimated molecules per food patch.",
  "adaptiveReward.atpPerGlucose": "ATP released per glucose molecule.",

  // Trails
  trailCell: "Trail grid cell size in pixels.",
  depositPerSec: "Trail strength deposited each second.",
  evapPerSec: "Trail evaporation rate per second.",
  diffusePerSec: "Trail diffusion rate per second.",
  enableDiffusion: "Allow trail scent to spread between cells.",
  renderTrail: "Draw trail heatmap in the simulation view.",
  residualGainPerSec: "Chi gained per second from residual reuse.",
  residualCapPerTick: "Max residual chi recovered per tick.",
  trailCooldownTicks: "Ticks before leaving trail again deposits.",
  ownTrailPenalty: "Chi penalty per second for running own trail.",
  ownTrailGraceAge: "Ticks before own trail becomes safe again.",

  // Autonomy
  autoMove: "Start sim with agents auto-controlled.",
  "controls.autoMove": "Toggle for manual controls auto move.",

  // Sensing
  aiSensoryRangeBase: "Baseline sensory range when chi is low.",
  aiSensoryRangeMax: "Hard cap on sensory range.",
  aiSenseRangePerChi: "Extra sensing range gained per chi.",
  aiSenseBiasFromFrustr: "Bias to sensory focus from frustration.",
  aiSenseSlewPerSec: "How fast sensing direction can slew.",

  // Wall & collision
  aiWallAvoidMargin: "Distance from walls before avoidance kicks in.",
  aiWallAvoidStrength: "Strength of wall repulsion force.",
  enableAgentCollision: "Enable physical separation between agents.",
  agentCollisionPushback: "Pushback strength when agents collide.",

  // Behavior
  aiExploreNoiseBase: "Baseline randomness added to steering.",
  aiExploreNoiseGain: "Extra noise when exploration is boosted.",
  aiTrailFollowingNear: "Trail following weight for nearby scent.",
  aiTrailFollowingFar: "Trail following weight for distant scent.",
  aiSampleDistance: "Distance ahead sampled for decisions.",

  // Frustration
  aiFrustrationBuildRate: "Rate frustration accumulates per second.",
  aiFrustrationDecayRate: "Rate frustration dissipates per second.",
  aiFrustrationSightGrace: "Ticks frustration stays low after seeing food.",
  aiFrustrationLowTrail: "Trail strength threshold treated as low.",

  // Frustration effects
  aiSurgeMax: "Max speed surge granted by frustration.",
  aiTurnRateBase: "Base turning rate before modifiers.",
  aiTurnRateGain: "Extra turn rate unlocked by frustration.",

  // Hunger
  hungerBuildRate: "Per-second hunger accumulation rate.",
  hungerDecayOnCollect: "Fraction of hunger removed per food pickup.",
  hungerThresholdLow: "Hunger level considered satisfied.",
  hungerThresholdHigh: "Hunger level considered starving.",
  hungerExplorationAmp: "Exploration boost applied when hungry.",
  hungerFrustrationAmp: "Frustration build multiplier when hungry.",
  hungerSenseAmp: "Sensory range boost under hunger.",
  hungerSurgeAmp: "Speed surge boost under hunger.",

  // Scent gradient
  "scentGradient.enabled": "Enable distance-based scent fields.",
  "scentGradient.maxRange": "Maximum distance scent can travel.",
  "scentGradient.falloffType": "How scent strength decays with distance.",
  "scentGradient.strength": "Base strength of scent at resources.",
  "scentGradient.showSubtleIndicator": "Show visual rings for resources.",
  "scentGradient.rewardEnabled": "Grant rewards for moving toward food.",
  "scentGradient.rewardScale": "Chi gained per pixel closer to food.",
  "scentGradient.rewardUpdateInterval": "Ticks between gradient reward checks.",
  "scentGradient.densitySensingEnabled": "Expose nearby food density in observations.",
  "scentGradient.densityRadiusNear": "Near-field density sampling radius.",
  "scentGradient.densityRadiusMid": "Mid-field density sampling radius.",
  "scentGradient.densityRadiusFar": "Far-field density sampling radius.",
  "scentGradient.consumable": "Allow agents to deplete scent by orbiting.",
  "scentGradient.consumePerSec": "How quickly orbiting drains scent strength.",
  "scentGradient.recoverPerSec": "How quickly scent regenerates when idle.",
  "scentGradient.minStrength": "Minimum scent strength floor.",
  "scentGradient.minRange": "Minimum scent range floor in pixels.",
  "scentGradient.orbitBandPx": "Radius band counted as orbiting a resource.",

  // Mitosis
  "mitosis.enabled": "Enable reproduction mechanics.",
  "mitosis.enabledDuringTraining": "Allow mitosis while training policies.",
  "mitosis.threshold": "Chi required before mitosis can trigger.",
  "mitosis.cost": "Chi spent when reproducing.",
  "mitosis.childStartChi": "Starting chi given to a child agent.",
  "mitosis.cooldown": "Ticks to wait between reproduction attempts.",
  "mitosis.maxAgents": "Absolute population cap with mitosis.",
  "mitosis.maxAliveAgents": "Target max simultaneously alive agents.",
  "mitosis.spawnOffset": "Distance child spawns from parent.",
  "mitosis.inheritHeading": "Child inherits parent's heading direction.",
  "mitosis.headingNoise": "Random heading jitter added on birth.",
  "mitosis.buddingThreshold": "Chi needed before budding can occur.",
  "mitosis.buddingShare": "Fraction of chi transferred to budded child.",
  "mitosis.buddingOffset": "Jitter radius when budding spawns a child.",
  "mitosis.buddingRespectCooldown": "Make budding obey mitosis cooldown.",
  "mitosis.respectCarryingCapacity": "Limit reproduction based on ecology capacity.",
  "mitosis.carryingCapacityMultiplier": "Multiplier applied to ecology carrying capacity.",
  "mitosis.showLineage": "Render visual lineage links between kin.",
  "mitosis.lineageMaxDistance": "Longest lineage line to draw.",
  "mitosis.lineageFadeDuration": "Ticks before lineage lines fade away.",
  "mitosis.lineageOpacity": "Opacity of lineage lines.",
  "mitosis.lineageColor": "Color used for lineage lines.",

  // Decay
  "decay.enabled": "Enable decay system for dead agents.",
  "decay.duration": "Ticks until a corpse fully decays.",
  "decay.fertilityBoost": "Fertility returned per chi when decaying.",
  "decay.releaseRadius": "Radius affected by released chi.",
  "decay.visualFade": "Fade and shrink visuals during decay.",
  "decay.removeAfterDecay": "Remove agent object once decay finishes.",

  // HUD
  "hud.show": "Show the in-sim HUD overlay.",
  "hud.showActions": "Display raw action values for debugging.",

  // Learning
  "learning.observationDims": "Length of the observation vector.",
  "learning.normalizeObs": "Normalize observations to [-1, 1].",
  "learning.turnRate": "Maximum turn per step for agents.",
  "learning.thrustScale": "Multiplier applied to thrust action.",
  "learning.rewards.collectResource": "Reward weight for collecting food.",
  "learning.rewards.chiGain": "Reward weight for gaining chi.",
  "learning.rewards.chiSpend": "Penalty weight for spending chi.",
  "learning.rewards.stuck": "Penalty weight when stuck near walls.",
  "learning.rewards.idle": "Penalty weight for idling.",
  "learning.rewards.explore": "Reward weight for exploring new tiles.",
  "learning.rewards.provenanceCredit": "Reward when others reuse your trails.",
  "learning.rewards.death": "Penalty weight applied on death.",
  "learning.rewards.gradientClimb": "Reward weight for approaching resources.",
  "learning.episodeLength": "Maximum ticks per training episode.",
  "learning.terminateOnDeath": "End episode immediately upon death.",
  "learning.populationSize": "Number of policies evaluated per generation.",
  "learning.eliteCount": "Top performers kept each generation.",
  "learning.mutationStdDev": "Standard deviation for mutation noise.",
  "learning.generations": "Total optimization generations to run.",

  // Rendering
  "rendering.renderTrail": "Render simulation trails in UI layer.",
  "rendering.hud.show": "Render HUD overlay elements.",

  // Links
  "link.radius": "Maximum distance to maintain a link.",
  "link.formCost": "Chi cost per agent to form a link.",
  "link.maintPerSec": "Chi drained each second to sustain a link.",
  "link.decayPerSec": "Passive link strength loss per second.",
  "link.strengthenPerUse": "Strength gained per second while used.",
  "link.initStrength": "Initial link strength when created.",
  "link.minStrength": "Minimum link strength floor.",
  "link.guidanceGain": "Steering influence applied by links.",
  "link.springK": "Spring constant pulling linked agents together.",
  "link.transfer.capPerSec": "Maximum chi transferred through a link each second.",
  "link.transfer.loss": "Fraction of chi lost during transfer.",
  "link.trailMin": "Minimum shared trail intensity to form links.",
  "link.hungerEscape": "How much hunger weakens link forces.",
  "link.hungerDecayPerSec": "Extra link decay when agents are starving.",

  // Bond loss
  "bondLoss.onDeathExploreBoost": "Exploration boost after a bonded partner dies.",
  "bondLoss.onDeathBoostDuration": "Ticks that bereavement boost lasts.",
};
// ===== Config Manager & Panel =====
const PROFILES_KEY = "slime.presets.v1";

const ConfigIO = {
  // safely get/set nested CONFIG by "a.b.c"
  get(path) {
    const parts = path.split(".");
    let cur = CONFIG;
    for (const p of parts) cur = cur?.[p];
    return cur;
  },
  set(path, value) {
    const parts = path.split(".");
    let cur = CONFIG;
    for (let i=0; i<parts.length-1; i++) cur = cur[parts[i]];
    cur[parts[parts.length-1]] = value;
  },
  snapshot() {
    // capture only schema-listed keys to keep profiles tiny
    const shot = {};
    for (const group of Object.values(CONFIG_SCHEMA)) {
      for (const path of Object.keys(group)) shot[path] = this.get(path);
    }
    // include a tiny version and timestamp for sanity
    return { version: 1, ts: Date.now(), params: shot };
  },
  apply(snapshot) {
    if (!snapshot?.params) return;
    for (const [path, val] of Object.entries(snapshot.params)) {
      if (CONFIG_SCHEMA && findPathInSchema(path)) this.set(path, val);
    }
    CURRENT_BASE_SNAPSHOT = snapshot;   // <- becomes the new "revert to" base
    onConfigChanged();
    refreshPanelControls();             // sync UI with applied values  
    updateDirtyDot();                   // refresh dirty state
  },
  loadProfiles() {
    try { return JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]"); }
    catch { return []; }
  },
  saveProfiles(list) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
  }
};

// Initialize snapshots after ConfigIO is defined
initSnapshotsOnce();

function findPathInSchema(path){
  for (const group of Object.values(CONFIG_SCHEMA)) {
    if (Object.prototype.hasOwnProperty.call(group, path)) return true;
  }
  return false;
}

function onConfigChanged() {
  // react to critical changes
  // If trailCell changed, resize trail grid:
  if (typeof Trail !== 'undefined' && Trail && Trail.cell !== CONFIG.trailCell) Trail.resize();
  // You can add other "apply" hooks as needed.
}

// ---- Panel helpers ----
function panelEl() { return document.getElementById("config-panel"); }

function refreshPanelControls() {
  const root = panelEl();
  if (!root) return;
  root.querySelectorAll("[data-path]").forEach(inp => {
    const p = inp.getAttribute("data-path");
    const v = ConfigIO.get(p);
    if (v !== undefined) {
      if (inp.type === "checkbox") {
        inp.checked = v;
      } else if (inp.tagName === "SELECT") {
        inp.value = v;
      } else if (inp.type === "color") {
        inp.value = v || "#000000";
      } else {
        inp.value = v;
      }
    }
  });
}

function snapshotsEqual(a, b) {
  if (!a || !b) return false;
  const pa = a.params, pb = b.params;
  for (const k of Object.keys(CONFIG_SCHEMA).flatMap(g => Object.keys(CONFIG_SCHEMA[g]))) {
    if (pa[k] !== pb[k]) return false;
  }
  return true;
}

function currentVsBaseSnapshot() {
  const cur = ConfigIO.snapshot();
  const base = CURRENT_BASE_SNAPSHOT || BOOT_SNAPSHOT;
  return { cur, base };
}

function updateDirtyDot() {
  const dot = document.getElementById("cfg-dirty");
  if (!dot) return;
  const { cur, base } = currentVsBaseSnapshot();
  dot.style.display = snapshotsEqual(cur, base) ? "none" : "inline";
}

// ---- UI builder ----
let panelOpen = false;
function buildConfigPanel(){
  // panel shell
  const wrap = document.createElement("div");
  wrap.id = "config-panel";
  Object.assign(wrap.style, {
    position: "fixed", top: "0", right: "0", bottom: "0",
    width: "360px", background: "rgba(12,12,16,0.96)", color:"#e6f3ec",
    font: "12px ui-mono, Menlo, monospace", zIndex: 99999,
    borderLeft: "1px solid #233", padding: "10px", overflowY: "auto",
    display: "none"
  });
  wrap.innerHTML = `
  <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
    <strong style="font-size:13px;">Slime Config</strong>
    <span id="cfg-dirty" title="Modified from loaded profile" style="color:#ffd166; display:none; margin-left:4px;">●</span>
    <button id="cfg-revert"  title="Reset sliders to last loaded profile">Revert</button>
    <button id="cfg-default" title="Reset sliders to boot-time defaults">Defaults</button>
    <button id="cfg-collapse" title="Collapse all sections">Collapse All</button>
    <button id="cfg-close" style="margin-left:auto;">✕</button>
  </div>
    <div id="cfg-profiles" style="display:flex; gap:6px; margin-bottom:8px;">
      <select id="cfg-profile-list" style="flex:1"></select>
      <button id="cfg-load">Load</button>
      <button id="cfg-save">Save</button>
    </div>
    <div style="display:flex; gap:6px; margin-bottom:8px;">
      <input id="cfg-name" placeholder="profile name" style="flex:1"/>
      <button id="cfg-del">Delete</button>
      <button id="cfg-exp">Export</button>
      <button id="cfg-imp">Import</button>
    </div>
    <div id="cfg-groups"></div>
    <div style="opacity:.6; margin-top:10px;">[P] toggle · [1–9] quick load</div>
  `;
  document.body.appendChild(wrap);

  // groups & sliders
  const groupsHost = wrap.querySelector("#cfg-groups");
  for (const [groupName, fields] of Object.entries(CONFIG_SCHEMA)) {
    const g = document.createElement("details");
    g.open = true;
    const sum = document.createElement("summary");
    sum.textContent = groupName;
    sum.style.margin = "8px 0";
    g.appendChild(sum);

    for (const [path, meta] of Object.entries(fields)) {
      const val = ConfigIO.get(path);
      const row = document.createElement("div");
      row.style.margin = "6px 0";
      const hint = CONFIG_HINTS[path];

      if (meta.type === "boolean") {
        // Checkbox for boolean
        row.innerHTML = `
          <label style="display:flex; gap:6px; align-items:center;">
            <span style="flex:1">${meta.label}</span>
            <input type="checkbox" ${val ? "checked" : ""} data-path="${path}">
          </label>
        `;
        const checkbox = row.querySelector("input");
        checkbox.addEventListener("change", (e) => {
          ConfigIO.set(path, e.target.checked);
          onConfigChanged();
          updateDirtyDot();
        });
      } else if (meta.type === "color") {
        // Color picker for color
        row.innerHTML = `
          <label style="display:flex; gap:6px; align-items:center;">
            <span style="flex:1">${meta.label}</span>
            <input type="color" value="${val || "#000000"}" data-path="${path}" style="width:72px;">
          </label>
        `;
        const color = row.querySelector("input");
        color.addEventListener("change", (e) => {
          ConfigIO.set(path, e.target.value);
          onConfigChanged();
          updateDirtyDot();
        });
      } else if (meta.type === "options") {
        // Select dropdown for options
        const options = meta.options.map(opt => `<option value="${opt}" ${val === opt ? "selected" : ""}>${opt}</option>`).join("");
        row.innerHTML = `
          <label style="display:flex; gap:6px; align-items:center;">
            <span style="flex:1">${meta.label}</span>
            <select data-path="${path}" style="flex:2">
              ${options}
            </select>
          </label>
        `;
        const select = row.querySelector("select");
        select.addEventListener("change", (e) => {
          ConfigIO.set(path, e.target.value);
          onConfigChanged();
          updateDirtyDot();
        });
      } else {
        // Range + number for numeric inputs
        row.innerHTML = `
          <label style="display:flex; gap:6px; align-items:center;">
            <span style="flex:1">${meta.label}</span>
            <input type="range" min="${meta.min}" max="${meta.max}" step="${meta.step}" value="${val}" data-path="${path}" style="flex:2">
            <input type="number" min="${meta.min}" max="${meta.max}" step="${meta.step}" value="${val}" data-path="${path}" style="width:72px;">
          </label>
        `;
        const [range, number] = row.querySelectorAll("input");
        const sync = (v) => {
          const num = Number(v);
          range.value = num;
          number.value = num;
          ConfigIO.set(path, num);
          onConfigChanged();
          updateDirtyDot();
        };
        range.addEventListener("input", e => sync(e.target.value));
        number.addEventListener("change", e => sync(e.target.value));
        // Sync when number input changes (for typing)
        number.addEventListener("input", e => sync(e.target.value));
      }

      if (hint) {
        row.title = hint;
        row.querySelectorAll("label, span, input, select").forEach(el => {
          el.title = hint;
        });
      }

      g.appendChild(row);
    }
    groupsHost.appendChild(g);
  }

  // profiles
  const sel = wrap.querySelector("#cfg-profile-list");
  const name = wrap.querySelector("#cfg-name");
  const refreshProfiles = () => {
    sel.innerHTML = "";
    const list = ConfigIO.loadProfiles();
    list.forEach((p,i) => {
      const opt = document.createElement("option");
      opt.value = i; opt.textContent = p.name || `preset-${i+1}`;
      sel.appendChild(opt);
    });
  };
  refreshProfiles();

  wrap.querySelector("#cfg-load").onclick = () => {
    const idx = Number(sel.value); if (isNaN(idx)) return;
    const list = ConfigIO.loadProfiles(); const p = list[idx];
    if (p) { ConfigIO.apply(p.snapshot); name.value = p.name || ""; updateDirtyDot(); }
  };
  wrap.querySelector("#cfg-save").onclick = () => {
    const snap = ConfigIO.snapshot();
    const list = ConfigIO.loadProfiles();
    const title = name.value?.trim() || `preset-${list.length+1}`;
    // if same name exists, replace
    const existing = list.findIndex(p => p.name === title);
    if (existing >= 0) list[existing] = { name: title, snapshot: snap };
    else list.push({ name: title, snapshot: snap });
    ConfigIO.saveProfiles(list); refreshProfiles();
    CURRENT_BASE_SNAPSHOT = snap; // saving makes current state the new base
    updateDirtyDot();
  };
  wrap.querySelector("#cfg-del").onclick = () => {
    const idx = Number(sel.value); if (isNaN(idx)) return;
    const list = ConfigIO.loadProfiles(); if (!list[idx]) return;
    list.splice(idx,1); ConfigIO.saveProfiles(list); refreshProfiles();
  };
  wrap.querySelector("#cfg-exp").onclick = () => {
    const snap = ConfigIO.snapshot();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href:url, download:"slime-config.json" });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  wrap.querySelector("#cfg-imp").onclick = async () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      const text = await file.text();
      try { const snap = JSON.parse(text); ConfigIO.apply(snap); updateDirtyDot(); }
      catch { alert("Invalid JSON"); }
    };
    input.click();
  };

  // Wire up Revert and Defaults buttons
  const revertBtn = wrap.querySelector("#cfg-revert");
  if (revertBtn) {
    revertBtn.onclick = () => {
      // Ensure snapshots are initialized
      if (!BOOT_SNAPSHOT) initSnapshotsOnce();
      if (!CURRENT_BASE_SNAPSHOT) CURRENT_BASE_SNAPSHOT = BOOT_SNAPSHOT;
      if (CURRENT_BASE_SNAPSHOT) {
        ConfigIO.apply(CURRENT_BASE_SNAPSHOT);
      }
    };
  }

  const defaultBtn = wrap.querySelector("#cfg-default");
  if (defaultBtn) {
    defaultBtn.onclick = () => {
      // Ensure snapshots are initialized
      if (!BOOT_SNAPSHOT) initSnapshotsOnce();
      if (BOOT_SNAPSHOT) {
        ConfigIO.apply(BOOT_SNAPSHOT);
      }
    };
  }

  // Wire up Collapse All button
  const collapseBtn = wrap.querySelector("#cfg-collapse");
  if (collapseBtn) {
    collapseBtn.onclick = () => {
      const groupsHost = wrap.querySelector("#cfg-groups");
      if (groupsHost) {
        groupsHost.querySelectorAll("details").forEach(details => {
          details.open = false;
        });
      }
    };
  }

  wrap.querySelector("#cfg-close").onclick = () => togglePanel(false);
}

function togglePanel(force){
  const el = document.getElementById("config-panel") || buildConfigPanel();
  const node = document.getElementById("config-panel");
  if (!node) return;
  panelOpen = force ?? !panelOpen;
  node.style.display = panelOpen ? "block" : "none";
}

// hotkeys
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyP") { togglePanel(); e.preventDefault(); }
  // quick-load profiles 1..9
  if (/Digit[1-9]/.test(e.code)) {
    const idx = Number(e.code.slice(-1)) - 1;
    const list = ConfigIO.loadProfiles();
    if (list[idx]) { ConfigIO.apply(list[idx].snapshot); }
  }
  // Ctrl/Cmd+U: revert
  if (e.code === "KeyU" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (CURRENT_BASE_SNAPSHOT) ConfigIO.apply(CURRENT_BASE_SNAPSHOT);
  }
});


