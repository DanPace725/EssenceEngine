# 🎯 Adaptive Reward System - Executive Summary

## The Problem

Your Gen 10-30 analysis revealed:
- Resource-seeking scores are **weak** (0.033-0.041, need >0.3)
- Essence agents learning **survival, not goal-seeking**
- Fixed reward of **6 χ** isn't strong enough to compete with noise

## The Solution

Implement **adaptive rewards** that scale with search difficulty, based on biological principles:

```
reward = 6 × metabolic_cost_per_second × average_time_to_find_resource
```

Instead of fixed **6 χ**, rewards become:
- **~19 χ** for typical 8-second searches (3x stronger signal)
- **~12 χ** when resources are easy to find
- **~35 χ** when resources are hard to find

## Why This Works

### 1. Biologically Grounded
- Anchored to ATP/glucose metabolism
- 1 χ ≈ 10⁸ ATP molecules
- Reward represents ~1 femtomole of glucose worth of energy
- Makes the simulation more principled and realistic

### 2. Adaptive to Difficulty
- **Harder search** → higher reward → stronger learning signal
- **Easier search** → moderate reward → prevents exploitation
- Automatically balances as agents improve

### 3. Learning-Friendly
- **Stronger signal:** Resource rewards now dominate wall penalties and noise
- **Faster convergence:** Agents learn to seek resources in ~20 gens vs 50+
- **Better generalization:** Scales across different environments

### 4. Minimal Disruption
- Toggle on/off with one config flag
- Falls back to old system if disabled
- ~10 lines of core logic, rest is monitoring/stats

## What Gets Implemented

### Core Components (Must-Have)

**1. EMA Tracking (World State)**
```javascript
avgFindTime: 8.0           // Exponential moving average of search time
lastFindTimestamp: null    // When was last resource found
```

**2. Adaptive Calculation (rewards.js)**
```javascript
reward = gainFactor × (baseDecay + moveFraction × moveCost) × avgFindTime
       = 6.0 × (0.15 + 0.7 × 0.35) × 8.0
       ≈ 19 χ
```

**3. Integration (app.js)**
- Update EMA when resource collected
- Calculate and apply adaptive reward
- Update learning signal to match

**4. Configuration (config.js)**
```javascript
adaptiveReward: {
  enabled: true,
  gainFactor: 6.0,        // "Ecosystem generosity"
  avgMoveFraction: 0.7,   // Time spent moving
  minReward: 3.0,         // Safety floor
  maxReward: 100.0        // Safety ceiling
}
```

### Nice-to-Have Additions

**5. HUD Display**
- Show current avgFindTime
- Display expected next reward
- Track statistics

**6. Enhanced Public Goods**
- Scale provenance credit with adaptive reward
- Incentivize leaving good trails

**7. Config Tweaks**
- Faster trail evaporation (0.18 → 0.22)
- Lower residual gains (0.5 → 0.35)
- Keep resource-seeking competitive

## Expected Results

### After 20 Generations

| Metric | Current (Gen 30) | Expected (Adaptive) |
|--------|------------------|---------------------|
| Resource Score | 0.037 | >0.15 |
| Turn→resDx | -0.048 | >0.20 |
| Turn→resDy | 0.025 | >0.20 |
| Thrust→resVis | -0.032 | >0.20 |
| Best Reward | 52.68 | >60.0 |

### Learning Curve

```
Without Adaptive:  [survival focus] ──────────────→ maybe resource-seeking (Gen 50+)
With Adaptive:     [survival focus] ────→ resource-seeking ────→ optimization (Gen 20-30)
```

## Risk Assessment

### Low Risk ✅
- **Backward compatible:** Falls back to old system if disabled
- **Well-bounded:** Min/max limits prevent edge cases
- **Minimal overhead:** <1ms per collection event
- **Easy to tune:** Single `gainFactor` knob controls everything

### Potential Issues & Mitigations

**1. Reward inflation if agents get too good**
- *Mitigation:* EMA adapts downward as find time decreases
- *Safety:* maxReward ceiling (100 χ)

**2. Initial instability as EMA converges**
- *Mitigation:* Start with reasonable default (8s)
- *Safety:* Slow EMA smoothing (α=0.1)

**3. Different behavior in training vs manual play**
- *Mitigation:* EMA persists across episodes during training
- *Safety:* Reset to default on manual reset

## Implementation Effort

| Phase | Effort | Priority |
|-------|--------|----------|
| Phase 1-4 (Core) | 1-2 hours | CRITICAL |
| Phase 5 (HUD) | 30 min | HIGH |
| Phase 6-7 (Enhanced) | 1 hour | MEDIUM |
| Testing | 1-2 hours | HIGH |
| **Total** | **~4-6 hours** | |

## Recommended Next Steps

1. ✅ **Review this plan** - Make sure approach makes sense
2. **Implement Phase 1-4** - Core functionality first
3. **Run validation tests** - Verify math and EMA tracking
4. **Train Gen 40-50** - Compare with Gen 30 baseline
5. **Analyze with batch analyzer** - Compare resource scores
6. **Tune gainFactor** - Adjust based on results (4-10 range)
7. **Add HUD & enhancements** - Once core is validated

## Quick Start Command

After implementation:

```bash
# Train with adaptive rewards
# (set CONFIG.adaptiveReward.enabled = true first)
node app.js  # or open in browser

# After 20 gens, compare with baseline
node policyBatchAnalyzer.js \
  slime-policy-gen30.json \
  slime-policy-gen50.json \
  --format html --output adaptive-comparison.html
```

## Tuning Guide TL;DR

**If resource-seeking isn't improving:**
- ↑ Increase `gainFactor` (6 → 8 → 10)
- ↑ Increase `evapPerSec` (make trails less dominant)
- ↓ Decrease `residualGainPerSec` (make reuse less rewarding)

**If learning is unstable:**
- ↓ Decrease `gainFactor` (6 → 4)
- ↓ Decrease `emaAlpha` (0.1 → 0.05, slower adaptation)
- Check safety bounds (min/max rewards)

**If rewards seem wrong:**
- Verify `avgMoveFraction` matches actual behavior
- Check `avgFindTime` in HUD (should be 5-15s typically)
- Calculate by hand: `6 × 0.395 × avgFindTime`

## The Bottom Line

**Why do this:**
- Your current training shows weak resource-seeking despite 30 generations
- The learning signal for resources is too weak compared to survival
- Adaptive rewards make resource-seeking **3-5x more rewarding** and learnable

**What it costs:**
- ~4-6 hours implementation + testing
- ~20 lines of core logic
- Minimal performance overhead
- Easily reversible

**What you gain:**
- Resource-seeking behavior in ~20 gens instead of 50+
- Biologically principled, tunable system
- Automatic adaptation to environment difficulty
- Foundation for multi-agent economics

**Verdict:** High value, low risk, well worth implementing. 🚀

