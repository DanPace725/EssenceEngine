// Core Metrics Tracker for Training Analysis
// Observational metrics system that runs parallel to reward tracking
// Based on Training.md specification

/**
 * MetricsTracker - Lightweight observational metrics for training analysis
 * 
 * Tracks core performance indicators across three families:
 * 1. Survival & Energy Economy
 * 2. Foraging Performance
 * 3. Exploration & Coverage
 */
export class MetricsTracker {
  constructor(config = {}) {
    this.windowTicks = config.windowTicks || 1200;  // ~20s at 60fps
    this.step = config.step || 30;                  // compute every 30 ticks
    this.eps = config.eps || 0.02;                  // trail threshold
    this.hist = [];                                 // snapshot history
    
    this.state = {
      tick0: 0,
      chiSpent: 0,
      chiReward: 0,
      movedTicks: 0,
      idleTicks: 0,
      stuckTicks: 0,
      newTrailCells: 0,
      seenCells: null,              // Uint8Array - lazily initialized
      lastTrailNonzero: 0,
      headingBins: new Array(16).fill(0),
      findsInWindow: 0,
      pathLenAccum: 0,
      straightLenAccum: 0,
      episodeStart: null,
      firstFindTick: null
    };
  }
  
  /**
   * Initialize tracker for a new episode
   * @param {object} world - World object with bundles
   * @param {object} trail - Trail object with grid dimensions
   * @param {number} globalTick - Current simulation tick
   */
  init(world, trail, globalTick) {
    this.state.tick0 = globalTick;
    this.state.episodeStart = globalTick;
    this.state.firstFindTick = null;
    this.hist = [];
    
    // Initialize coverage tracking based on trail grid
    if (trail && trail.w && trail.h) {
      this.state.seenCells = new Uint8Array(trail.w * trail.h);
    }
    
    // Reset all counters
    this.state.chiSpent = 0;
    this.state.chiReward = 0;
    this.state.movedTicks = 0;
    this.state.idleTicks = 0;
    this.state.stuckTicks = 0;
    this.state.newTrailCells = 0;
    this.state.headingBins.fill(0);
    this.state.findsInWindow = 0;
    this.state.pathLenAccum = 0;
    this.state.straightLenAccum = 0;
  }
  
  /**
   * Track agent movement
   * @param {number} dx - X displacement
   * @param {number} dy - Y displacement
   * @param {number} speed - Movement speed
   */
  onMove(dx, dy, speed) {
    if (speed > 0.1) {
      this.state.movedTicks++;
      
      // Heading histogram (16 bins for directional diversity)
      const ang = Math.atan2(dy, dx);  // -pi..pi
      const bin = ((Math.floor(((ang + Math.PI) / (2 * Math.PI)) * 16)) + 16) % 16;
      this.state.headingBins[bin]++;
      
      // Stuckness (moving but very slow)
      if (speed < 5) {
        this.state.stuckTicks++;
      }
    } else {
      this.state.idleTicks++;
    }
  }
  
  /**
   * Track chi expenditure
   * @param {number} amount - Amount of chi spent
   * @param {string} reason - Reason for spending (optional)
   */
  onChiSpend(amount, reason = "misc") {
    this.state.chiSpent += Math.max(0, amount);
  }
  
  /**
   * Track chi reward/gain
   * @param {number} amount - Amount of chi gained
   * @param {string} kind - Type of gain (e.g., "resource")
   * @param {number} globalTick - Current tick (for time-to-first-find)
   */
  onChiReward(amount, kind = "resource", globalTick = 0) {
    this.state.chiReward += Math.max(0, amount);
    
    if (kind === "resource") {
      this.state.findsInWindow++;
      
      // Track first find for time-to-first-find metric
      if (this.state.firstFindTick === null) {
        this.state.firstFindTick = globalTick;
      }
    }
  }
  
  /**
   * Track path sampling for efficiency calculation
   * @param {number} toResourceDist - Direct distance to resource
   * @param {number} stepDist - Distance actually traveled
   */
  onPathSample(toResourceDist, stepDist) {
    if (toResourceDist != null && stepDist != null) {
      this.state.pathLenAccum += stepDist;
      this.state.straightLenAccum += Math.max(1e-6, toResourceDist);
    }
  }
  
  /**
   * Main step function - compute metrics snapshot periodically
   * @param {object} world - World object with bundles
   * @param {object} trail - Trail object
   * @param {number} globalTick - Current simulation tick
   */
  step(world, trail, globalTick) {
    // Track new coverage (trail > eps)
    if (trail && trail.buf && this.state.seenCells) {
      let newly = 0;
      let active = 0;
      
      for (let i = 0; i < trail.buf.length; i++) {
        if (trail.buf[i] > this.eps) {
          active++;
          if (!this.state.seenCells[i]) {
            this.state.seenCells[i] = 1;
            newly++;
          }
        }
      }
      
      this.state.newTrailCells += newly;
    }
    
    // Only compute snapshot every N ticks
    if ((globalTick % this.step) !== 0) {
      return;
    }
    
    const ticks = Math.max(1, globalTick - this.state.tick0);
    const agents = world.bundles ? world.bundles.length : 0;
    const alive = world.bundles ? world.bundles.filter(b => b.alive).length : 0;
    
    // === Exploration & Coverage Metrics ===
    let coverage = 0;
    if (this.state.seenCells && trail && trail.w && trail.h) {
      const totalSeen = this.state.seenCells.reduce((a, b) => a + b, 0);
      coverage = totalSeen / (trail.w * trail.h);
    }
    
    const frontierRate = this.state.newTrailCells / ticks;
    const movedRatio = this.state.movedTicks / ticks;
    const stuckness = this.state.stuckTicks / ticks;
    
    // Heading entropy (path diversity)
    const hb = this.state.headingBins;
    const totalH = hb.reduce((a, b) => a + b, 0) || 1;
    let H = 0;
    for (const c of hb) {
      if (c > 0) {
        const p = c / totalH;
        H -= p * Math.log2(p);
      }
    }
    const headingEntropy = H / Math.log2(hb.length); // Normalized 0..1
    
    // === Survival & Energy Economy ===
    const aliveRatio = alive / Math.max(1, agents);
    
    let meanChi = 0;
    let stdChi = 0;
    if (world.bundles && world.bundles.length > 0) {
      const chiValues = world.bundles.map(b => b.chi || 0);
      meanChi = this._avg(chiValues);
      stdChi = this._std(chiValues);
    }
    
    const roi = this.state.chiSpent > 0 ? (this.state.chiReward / this.state.chiSpent) : 0;
    
    // === Foraging Performance ===
    const findRate = (this.state.findsInWindow * 1000) / ticks;
    const pathIneff = this.state.pathLenAccum / Math.max(1, this.state.straightLenAccum);
    
    // Time to first find (in ticks)
    const timeToFirstFind = this.state.firstFindTick !== null 
      ? (this.state.firstFindTick - this.state.episodeStart)
      : null;
    
    // Create snapshot
    const snapshot = {
      tick: globalTick,
      
      // Survival & Energy
      alive_ratio: aliveRatio,
      mean_chi: meanChi,
      std_chi: stdChi,
      roi: roi,
      
      // Exploration & Coverage
      coverage: coverage,
      frontier_rate: frontierRate,
      heading_entropy: headingEntropy,
      moved_ratio: movedRatio,
      stuckness: stuckness,
      
      // Foraging
      find_rate: findRate,
      path_ineff: pathIneff,
      time_to_first_find: timeToFirstFind
    };
    
    this.hist.push(snapshot);
    
    // Keep history within window
    const maxSnapshots = Math.ceil(this.windowTicks / this.step);
    if (this.hist.length > maxSnapshots) {
      this.hist.shift();
    }
    
    // Reset per-window counters
    this.state.tick0 = globalTick;
    this.state.chiSpent = 0;
    this.state.chiReward = 0;
    this.state.movedTicks = 0;
    this.state.idleTicks = 0;
    this.state.stuckTicks = 0;
    this.state.newTrailCells = 0;
    this.state.headingBins.fill(0);
    this.state.findsInWindow = 0;
    this.state.pathLenAccum = 0;
    this.state.straightLenAccum = 0;
  }
  
  /**
   * Get full metrics history
   * @returns {Array} Array of metric snapshots
   */
  getHistory() {
    return [...this.hist];
  }
  
  /**
   * Export metrics as JSON with metadata
   * @param {object} metadata - Additional metadata to include
   * @returns {object} Exportable metrics object
   */
  exportJSON(metadata = {}) {
    return {
      metadata: {
        exportedAt: new Date().toISOString(),
        snapshotCount: this.hist.length,
        windowTicks: this.windowTicks,
        stepInterval: this.step,
        ...metadata
      },
      snapshots: this.getHistory()
    };
  }
  
  // Helper functions
  _avg(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((x, y) => x + y, 0) / arr.length;
  }
  
  _std(arr) {
    const m = this._avg(arr);
    if (!arr || arr.length === 0) return 0;
    return Math.sqrt(this._avg(arr.map(v => (v - m) * (v - m))));
  }
}

