I want to look at the training parts of the code. My goal is to use the current configs as a "warm start" for the training process, so the agents will work to improve on the current configurations. Below are some goals for the training process. 
These should be able to be exposed for a human or another AI to observe/ evaluate. Either through the web interface or for download initially. 
Let's look at the code and see what we can do.

# Core metric families

## 1) Survival & Energy Economy

* **Alive Ratio**: `alive_count / total_agents`
* **Chi Balance**: mean χ per agent (and stddev)
* **Energy ROI**: `(total_reward_chi) / (total_spent_chi)` over a window
* **Idle Loss**: χ lost while not moving / total χ lost

## 2) Exploration & Coverage

* **Spatial Coverage**: % of cells in `Trail.buf` ever > ε (unique visited area)
* **Frontier Rate**: new cells > ε per 100 ticks
* **Path Diversity**: entropy of agent heading histogram (8 or 16 bins)
* **Stuckness**: % ticks with |velocity| < v_min while alive

## 3) Cooperation & Network

* **Link Density**: `links / agents` and **Link Persistence**: mean link lifetime
* **Shared Trail Use**: rate of χ gained via reuse (Ledger credits) / total χ gain
* **Guidance Efficacy**: P(resource found | recent link-following/trail-following)

## 4) Foraging Performance

* **Find Rate**: resources collected per 1000 ticks
* **Path Efficiency**: avg path length to resource / straight-line distance
* **Time-to-First-Find**: ticks from spawn to first resource

## 5) Adaptivity & Robustness

* **Shock Recovery**: time to return to baseline Alive Ratio after a kill/perturb
* **Policy Shift**: fraction of ticks mode changes (explore/follow/seek/cohere/recover)
* **Sensitivity**: Δperformance / ΔCONFIG (small random jitters)

## 6) Emergence & Structure

* **Trail Morphology**: skeletonization proxy via (high-intensity pixels / total trail pixels) — lower thinness suggests tubulation; oscillate window.
* **Clustering**: average inter-agent distance vs Poisson baseline
* **Complexity Balance**: variance of metrics without collapse (no-extinction, no-blowup)

---

# Composite objectives (pick per experiment)

* **Foraging Efficiency (F)**
  `F = z(find_rate) + z(energy_ROI) – z(path_inefficiency)`
* **Collective Intelligence (C)**
  `C = z(shared_trail_use) + z(link_persistence) + z(guidance_efficacy)`
* **Resilient Exploration (R)**
  `R = z(spatial_coverage) + z(frontier_rate) – z(stuckness) + z(shock_recovery_inv)`

> Use z-scores (normalize by rolling mean/std) to make them compareable. Or just min–max on recent windows.

---

# Drop-in metric sampler (lightweight JS)

Paste this near your loop; it computes rolling windows and a snapshot every N ticks. Adjust names to match your code.

```js
const METRICS = {
  windowTicks: 1200,   // ~20s at 60fps
  step: 30,            // compute every 30 ticks
  eps: 0.02,           // trail threshold
  hist: [],            // store snapshots here

  state: {
    tick0: 0,
    chiSpent: 0,
    chiReward: 0,
    movedTicks: 0,
    idleTicks: 0,
    stuckTicks: 0,
    newTrailCells: 0,
    seenCells: new Uint8Array(0), // lazily sized
    lastTrailNonzero: 0,
    headingBins: new Array(16).fill(0),
    findsInWindow: 0,
    pathLenAccum: 0,
    straightLenAccum: 0,
  },

  init() {
    this.state.tick0 = globalTick;
    // coverage set based on trail grid
    this.state.seenCells = new Uint8Array(Trail.w * Trail.h);
  },

  onMove(dx, dy, speed) {
    if (speed > 0.1) this.state.movedTicks++;
    else this.state.idleTicks++;

    // heading histogram (16 bins)
    if (speed > 0.1) {
      const ang = Math.atan2(dy, dx);                // -pi..pi
      const bin = ((Math.floor(((ang + Math.PI)/(2*Math.PI)) * 16)) + 16) % 16;
      this.state.headingBins[bin]++;
      // stuckness (very low speed)
      if (speed < 5) this.state.stuckTicks++;
    }
  },

  onChiSpend(amount, from = "misc") {
    this.state.chiSpent += Math.max(0, amount);
  },

  onChiReward(amount, kind = "resource") {
    this.state.chiReward += Math.max(0, amount);
    if (kind === "resource") this.state.findsInWindow++;
  },

  onPathSample(toResourceDist, stepDist) {
    // accumulate path and straight-line denominator opportunistically
    if (toResourceDist != null && stepDist != null) {
      this.state.pathLenAccum += stepDist;
      this.state.straightLenAccum += Math.max(1e-6, toResourceDist); // crude proxy
    }
  },

  step() {
    // track new coverage (trail > eps)
    let newly = 0, active = 0;
    for (let i=0; i<Trail.buf.length; i++) {
      if (Trail.buf[i] > this.eps) {
        active++;
        if (!this.state.seenCells[i]) { this.state.seenCells[i] = 1; newly++; }
      }
    }
    this.state.newTrailCells += newly;

    if ((globalTick % this.step) !== 0) return;
    const ticks = Math.max(1, globalTick - this.state.tick0);
    const agents = World.bundles.length;
    const alive = World.bundles.filter(b=>b.alive).length;

    // exploration & diversity
    const coverage = this.state.seenCells.reduce((a,b)=>a+b,0) / (Trail.w*Trail.h);
    const frontierRate = this.state.newTrailCells / ticks;
    const moved = this.state.movedTicks / ticks;
    const stuckness = this.state.stuckTicks / ticks;

    // heading entropy
    const hb = this.state.headingBins;
    const totalH = hb.reduce((a,b)=>a+b,0) || 1;
    let H = 0;
    for (const c of hb) { if (c>0){ const p=c/totalH; H -= p*Math.log2(p); } }
    const headingEntropy = H / Math.log2(hb.length); // 0..1

    // energy economy
    const roi = this.state.chiSpent > 0 ? (this.state.chiReward / this.state.chiSpent) : 0;

    // foraging
    const findRate = (this.state.findsInWindow * 1000) / ticks;
    const pathIneff = this.state.pathLenAccum / Math.max(1, this.state.straightLenAccum);

    const snapshot = {
      tick: globalTick,
      alive_ratio: alive / Math.max(1, agents),
      mean_chi: avg(World.bundles.map(b=>b.chi)),
      std_chi: std(World.bundles.map(b=>b.chi)),
      roi, coverage, frontier_rate: frontierRate, heading_entropy: headingEntropy,
      moved_ratio: moved, stuckness,
      find_rate: findRate, path_ineff: pathIneff,
      shared_trail_use: sharedChiRatio(),       // see helper below
      link_density: linkDensity(),              // see helper below
      link_persistence: linkPersistence(),      // see helper below
    };

    this.hist.push(snapshot);
    if (this.hist.length > Math.ceil(this.windowTicks/this.step)) this.hist.shift();
    // reset per-window counters
    this.state.tick0 = globalTick;
    this.state.chiSpent = this.state.chiReward = 0;
    this.state.movedTicks = this.state.idleTicks = this.state.stuckTicks = 0;
    this.state.newTrailCells = 0;
    this.state.headingBins.fill(0);
    this.state.findsInWindow = 0;
    this.state.pathLenAccum = 0;
    this.state.straightLenAccum = 0;
  }
};

function avg(a){ if (!a.length) return 0; return a.reduce((x,y)=>x+y,0)/a.length; }
function std(a){ const m=avg(a); return Math.sqrt(avg(a.map(v=>(v-m)*(v-m)))); }

// plug into your existing data:
function sharedChiRatio(){
  const totalGain = Object.values(Ledger.credits || {}).reduce((a,b)=>a+b,0);
  const totalReward = METRICS.state.chiReward;
  if (totalReward <= 0) return 0;
  return totalGain / totalReward; // 0..1 proportion from reuse
}

function linkDensity(){
  // implement from your link store; fallback:
  return (window.LINKS?.length || 0) / Math.max(1, World.bundles.length);
}
function linkPersistence(){
  // avg link lifetime if you track it; fallback 0
  return window.LINKS?.length ? avg(window.LINKS.map(L=>L.ageTicks||0)) : 0;
}
```

Hook these from your loop and events (minimal taps on your current code):

```js
// on each agent update (after movement applied)
METRICS.onMove(dx, dy, isMoving ? CONFIG.moveSpeedPxPerSec : 0);

// where you spend chi:
METRICS.onChiSpend(chiSpendDelta, "baseline/move/sense/leap");

// when resource collected (you already know 'rewardChi'):
METRICS.onChiReward(CONFIG.rewardChi, "resource");

// each frame end:
METRICS.step();
```

Add a skinny HUD line (optional):

```js
function drawMetricsHUD(){
  const m = METRICS.hist[METRICS.hist.length-1]; if (!m) return;
  ctx.save();
  ctx.fillStyle = "#8ff";
  ctx.font = "11px ui-mono, monospace";
  ctx.fillText(
    `alive ${(100*m.alive_ratio|0)}% | χ ${m.mean_chi.toFixed(1)}±${m.std_chi.toFixed(1)} | ROI ${m.roi.toFixed(2)} | cover ${(100*m.coverage|0)}% | find ${(m.find_rate).toFixed(2)}/k | share ${(100*m.shared_trail_use|0)}%`,
    10, 90
  );
  ctx.restore();
}
```

Call `drawMetricsHUD()` after your existing HUD.

---

# Using these for a meta-AI (outer loop)

* **Multi-objective**: treat `{F, C, R}` as three axes and do Pareto selection instead of a single scalar. This avoids converging to brittle configs.
* **Curriculum** (simple weights over generations):

  1. Phase A (explore): emphasize `coverage`, `frontier_rate`, low `stuckness`.
  2. Phase B (forage): emphasize `find_rate`, `ROI`, `path_ineff` ↓.
  3. Phase C (collective): emphasize `shared_trail_use`, `link_persistence`, `alive_ratio` stability.
* Save the **top-k “genomes” (CONFIG snapshots)** with their metric summaries so you can replay/visualize later.

---

If you want, I can wire these calls into your v0.3 file exactly where they belong and include a tiny “metrics panel” toggle that graphs a couple lines live.
