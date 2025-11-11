<!-- ormd:0.1 -->
---
title: "Biologically-Grounded Adaptive Reward System - Implementation Plan"
authors: ["Essence Engine Team"]
dates:
  created: '2025-11-11T05:40:38.727214Z'
links: []
status: "complete"
description: "Essence Engine documentation"
---

# 🧬 Biologically-Grounded Adaptive Reward System - Implementation Plan

## Overview
Implement a dynamic reward system that scales with the actual difficulty of finding resources, anchored to biological ATP/glucose metabolism principles. This makes resource-seeking behavior **more learnable** by providing stronger, context-aware signals.

---

## 📊 Current State Analysis

### Current System (Static Reward)
- **Fixed reward:** `CONFIG.rewardChi = 6`
- **Learning reward:** `CONFIG.learning.rewards.collectResource = 50.0`
- **Problem:** Reward doesn't scale with search difficulty
- **Result:** Resource-seeking scores are very weak (0.033-0.041 in Gen 10-30)

### Metabolic Costs (from config)
- `baseDecayPerSecond = 0.15 χ/s` (basal metabolism)
- `moveCostPerSecond = 0.35 χ/s` (movement cost)
- **Effective cost:** ~0.395 χ/s when moving 70% of the time

### Current Findings
- **Generation 10-30 analysis shows:**
  - Mean find time appears to be ~8-15 seconds (inferred from behavior)
  - Current reward (6 χ) only covers ~15 seconds of metabolic cost
  - Resource-seeking weights are declining (0.041 → 0.037)
  - Learning is focusing on survival, not goal-seeking

---

## 🎯 Implementation Goals

1. **Dynamic reward** that scales with search difficulty
2. **Biologically principled** anchoring (ATP/glucose → χ)
3. **Adaptive** to changing environment/behavior
4. **Backward compatible** with existing code
5. **Minimal performance overhead**

---

## 🔧 Implementation Plan

### Phase 1: Add EMA Tracking to World State

**File:** `app.js`

**Changes to World object (around line 606):**

```javascript
const World = {
  paused: false,
  bundles: [],
  resource: null,
  collected: 0,
  
  // === NEW: Adaptive Reward Tracking ===
  avgFindTime: 8.0,              // EMA of time between resource finds (seconds)
  avgAlpha: 0.1,                 // EMA smoothing factor (0.1 = slower adaptation)
  lastFindTimestamp: null,       // Timestamp of last resource collection
  rewardStats: {                 // Statistics for monitoring
    totalRewards: 0,
    avgRewardGiven: 0,
    minFindTime: Infinity,
    maxFindTime: 0
  },
  
  reset() {
    Trail.clear();
    globalTick = 0;
    Ledger.credits = {};
    const cx = innerWidth / 2, cy = innerHeight / 2;
    this.bundles = [
      new Bundle(cx - 100, cy - 80, CONFIG.bundleSize, CONFIG.startChi, 1),
      new Bundle(cx + 100, cy + 80, CONFIG.bundleSize, CONFIG.startChi, 2),
    ];
    this.resource = new Resource(cx + 120, cy, CONFIG.resourceRadius);
    this.resource.respawn();
    this.collected = 0;
    
    // Don't reset EMA across episodes during training (to track long-term difficulty)
    // Only reset timestamp
    this.lastFindTimestamp = performance.now() / 1000;
  }
};
```

---

### Phase 2: Add Config Settings

**File:** `config.js`

**Add new reward calculation settings (around line 10):**

```javascript
export const CONFIG = {
  // === Physics & Core Mechanics ===
  startChi: 12,
  baseDecayPerSecond: 0.15,
  moveSpeedPxPerSec: 160,
  moveCostPerSecond: 0.35,
  rewardChi: 6,                    // DEPRECATED: kept for backward compatibility
  resourceRadius: 8,
  bundleSize: 40,
  
  // === NEW: Adaptive Reward System ===
  adaptiveReward: {
    enabled: true,                 // Toggle adaptive vs fixed reward
    gainFactor: 6.0,               // "Ecosystem generosity" (4-10 range)
    avgMoveFraction: 0.7,          // Assume 70% of time spent moving
    emaAlpha: 0.1,                 // EMA smoothing (0.1 = slower adaptation)
    minReward: 3.0,                // Safety floor (prevent tiny rewards)
    maxReward: 100.0,              // Safety ceiling (prevent explosion)
    
    // Optional: Absolute biological anchor (disabled by default)
    useAbsoluteAnchor: false,
    chiPerATP: 1 / 1e8,            // 1 χ per 10^8 ATP molecules
    moleculesPerPatch: 6e8,        // 1 femtomole = 6×10^8 molecules
    atpPerGlucose: 30,             // ~30 ATP per glucose molecule
  },
```

**Also update suggested config tweaks (around line 14):**

```javascript
  // === Trail System ===
  trailCell: 6,
  depositPerSec: 1.8,
  evapPerSec: 0.22,              // ↑ Slightly faster fade (was 0.18)
  diffusePerSec: 0.75,
  enableDiffusion: true,
  renderTrail: true,

  // === Residuals (public-good reuse) ===
  residualGainPerSec: 0.35,      // ↓ Keep helpful but not dominant (was 0.5)
  residualCapPerTick: 0.25,      // ↓ Reduced cap (was 0.3)
  trailCooldownTicks: 8,
```

---

### Phase 3: Create Adaptive Reward Calculator

**File:** `rewards.js` (create new utility function)

**Add at the top of the file (after imports):**

```javascript
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
  const alpha = CONFIG.adaptiveReward?.emaAlpha || world.avgAlpha;
  world.avgFindTime = (1 - alpha) * world.avgFindTime + alpha * dtFind;
  
  // Update stats
  world.rewardStats.minFindTime = Math.min(world.rewardStats.minFindTime, dtFind);
  world.rewardStats.maxFindTime = Math.max(world.rewardStats.maxFindTime, dtFind);
  
  return dtFind;
}
```

---

### Phase 4: Integrate into Resource Collection

**File:** `app.js`

**Modify resource collection code (around line 770):**

```javascript
// Check resource collection
let collectedResource = false;
if (bundle.alive && bundle.overlapsResource(World.resource)) {
  // === NEW: Adaptive Reward Calculation ===
  let rewardChi;
  
  if (CONFIG.adaptiveReward?.enabled) {
    // Update EMA and get adaptive reward
    import { updateFindTimeEMA, calculateAdaptiveReward } from './rewards.js';
    
    const dtFind = updateFindTimeEMA(World);
    rewardChi = calculateAdaptiveReward(World.avgFindTime);
    
    // Update stats
    World.rewardStats.totalRewards += rewardChi;
    World.rewardStats.avgRewardGiven = World.rewardStats.totalRewards / (World.collected + 1);
    
    // Optional: Log for debugging (remove in production)
    if (World.collected % 10 === 0) {
      console.log(`[Adaptive Reward] Find #${World.collected}: ` +
                  `dt=${dtFind.toFixed(2)}s, ` +
                  `avgT=${World.avgFindTime.toFixed(2)}s, ` +
                  `reward=${rewardChi.toFixed(2)}χ`);
    }
  } else {
    // Fallback to fixed reward
    rewardChi = CONFIG.rewardChi;
  }
  
  bundle.chi += rewardChi;
  bundle.alive = true;
  bundle.lastCollectTick = globalTick;
  bundle.frustration = 0;
  World.collected += 1;
  World.resource.respawn();
  collectedResource = true;
  totalCollected++;
}
```

---

### Phase 5: Update HUD to Show Adaptive Reward Info

**File:** `app.js`

**Extend HUD display (around line 675):**

```javascript
// Bottom left: Adaptive Reward Stats
if (CONFIG.adaptiveReward?.enabled) {
  ctx.fillStyle = "#ffaa00";
  ctx.fillText(
    `Adaptive Reward: avgFind=${World.avgFindTime.toFixed(2)}s | ` +
    `nextReward≈${calculateAdaptiveReward(World.avgFindTime).toFixed(1)}χ | ` +
    `avg=${World.rewardStats.avgRewardGiven.toFixed(1)}χ`,
    10, innerHeight - 10
  );
}
```

---

### Phase 6: Update Learning Reward Signal

**File:** `rewards.js` → `RewardTracker.computeStepReward()`

**Modify collection reward (around line 50):**

```javascript
// === 1. Resource Collection ===
if (collectedResource) {
  // Use adaptive multiplier that scales with χ reward given
  // This keeps the RL signal proportional to actual value
  const baseReward = CONFIG.learning.rewards.collectResource;
  const rewardMultiplier = CONFIG.adaptiveReward?.enabled 
    ? (World.rewardStats.avgRewardGiven / CONFIG.rewardChi) // Scale by ratio
    : 1.0;
  
  const r = baseReward * rewardMultiplier;
  this.stepReward += r;
  this.rewards.collect += r;
}
```

---

### Phase 7: Add Optional Public Goods Sharing

**File:** `rewards.js`

**Enhance provenance credit (around line 113):**

```javascript
// === 7. Provenance Credit (public goods) ===
if (provenanceCredit > 0) {
  // Scale reward with actual χ value created
  const lambda = CONFIG.adaptiveReward?.enabled ? 0.5 : 0.1;
  const r = CONFIG.learning.rewards.provenanceCredit * lambda * provenanceCredit;
  this.stepReward += r;
  this.rewards.provenance += r;
}
```

---

## 📈 Expected Outcomes

### Immediate Effects
1. **Reward scales appropriately:**
   - Easy environments (fast finds) → moderate rewards (~10-15 χ)
   - Hard environments (slow finds) → high rewards (~25-40 χ)
   - Current estimate: ~19 χ for 8-second average find time

2. **Learning signal strengthens:**
   - Resource collection reward now dominates noise
   - Returns from seeking resources > residual gains + wall penalties
   - Resource-seeking weights should become learnable

3. **Adaptive to changing conditions:**
   - As agents get better → find time decreases → reward decreases
   - Prevents reward inflation while maintaining appropriate incentive

### Long-term Benefits
- **Faster convergence** to resource-seeking behavior
- **More robust policies** that scale across difficulty levels
- **Better exploration** due to stronger goal signals
- **Biologically principled** system that's easier to tune

---

## 🧪 Testing Strategy

### Phase 1: Validation Tests
1. **Test EMA tracking:**
   - Manually trigger collections at fixed intervals (5s, 10s, 15s)
   - Verify EMA converges to expected average
   - Check stats tracking (min/max)

2. **Test reward calculation:**
   - avgFindTime = 5s → expect ~12 χ
   - avgFindTime = 8s → expect ~19 χ
   - avgFindTime = 15s → expect ~35 χ
   - Verify bounds (min=3, max=100)

3. **Test absolute anchor mode:**
   - Enable `useAbsoluteAnchor: true`
   - Verify ~180 χ per collection (1 femtomole)
   - Disable for normal use

### Phase 2: Integration Tests
1. **Run single episode:**
   - Watch HUD for avgFindTime convergence
   - Verify rewards scale as expected
   - Check no crashes/NaN values

2. **Run training for 10 generations:**
   - Compare Gen 10 resource scores vs baseline
   - Should see improvement in seeking weights
   - Monitor best reward trends

3. **Compare adaptive vs fixed:**
   - Train two agents (enabled: true vs false)
   - Compare resource-seeking scores after 20 generations
   - Adaptive should learn seeking faster

### Phase 3: Performance Tests
1. **Measure overhead:**
   - Time EMA calculation (<1ms expected)
   - Verify no frame drops
   - Check memory usage (negligible)

2. **Stability tests:**
   - Run 100 generations without crashes
   - Check EMA doesn't explode/collapse
   - Verify reward bounds hold

---

## 🎛️ Tuning Guide

### Primary Knobs

1. **`gainFactor` (4.0 - 10.0):**
   - **Lower (4-6):** Conservative rewards, slower learning
   - **Higher (7-10):** Generous rewards, faster learning but risk of exploitation
   - **Recommended start:** 6.0

2. **`emaAlpha` (0.05 - 0.2):**
   - **Lower (0.05):** Slow adaptation, stable
   - **Higher (0.2):** Fast adaptation, responsive
   - **Recommended start:** 0.1

3. **`avgMoveFraction` (0.5 - 0.9):**
   - Estimate of time spent moving vs idle
   - **Track actual:** Add movement tracker if needed
   - **Recommended start:** 0.7

### Secondary Knobs

4. **`minReward` / `maxReward`:**
   - Safety bounds to prevent edge cases
   - Should rarely trigger in practice
   - Adjust if you see clipping

5. **Trail system adjustments:**
   - `evapPerSec: 0.22` (faster fade → need fresh maps)
   - `residualGainPerSec: 0.35` (helpful but not dominant)
   - `aiTrailFollowingFar: 3.0` (maintain trail utility)

---

## 🔄 Rollback Plan

If adaptive rewards cause issues:

1. **Quick disable:** Set `CONFIG.adaptiveReward.enabled = false`
2. **Fallback:** System uses old `CONFIG.rewardChi = 6`
3. **No data loss:** EMA tracking is additive, doesn't break existing code

---

## 📝 Implementation Checklist

- [ ] **Phase 1:** Add EMA tracking to World state
- [ ] **Phase 2:** Add config settings for adaptive reward
- [ ] **Phase 3:** Create reward calculation utilities
- [ ] **Phase 4:** Integrate into resource collection
- [ ] **Phase 5:** Update HUD display
- [ ] **Phase 6:** Scale learning reward signal
- [ ] **Phase 7:** Enhance public goods sharing (optional)
- [ ] **Testing:** Run validation tests
- [ ] **Testing:** Run integration tests  
- [ ] **Testing:** Run performance tests
- [ ] **Tuning:** Adjust gainFactor based on results
- [ ] **Documentation:** Update main README with new system
- [ ] **Comparison:** Train Gen 40 and compare with Gen 30

---

## 🎯 Success Metrics

After 20-30 generations with adaptive rewards:

✅ **Resource-seeking scores > 0.15** (vs current 0.03-0.04)  
✅ **Turn→resDx, Turn→resDy weights > 0.2**  
✅ **Thrust→resVis weight > 0.2**  
✅ **Best reward continues improving**  
✅ **avgFindTime stabilizes (not exploding/collapsing)**

---

## 💡 Future Enhancements

1. **Provenance-weighted rewards:** When others harvest your trails, get fraction of their reward
2. **Idle penalty scaling:** Penalize standing still based on actual movement fraction
3. **Multi-agent competition:** Reward relative to other agents' performance
4. **Curriculum learning:** Start with high gainFactor, decay over generations
5. **Difficulty tracking:** Log and visualize reward history over training

---

## 📚 References

- `rewardmod.md` - Original biological anchoring proposal
- `BATCH_ANALYZER_GUIDE.md` - Analysis tools for tracking improvements
- `config.js` - Configuration system
- `rewards.js` - Reward tracking implementation
- `app.js` - Main simulation loop

---

**Ready to implement?** Start with Phase 1-4 (core functionality), then test before adding Phases 5-7 (enhancements).

