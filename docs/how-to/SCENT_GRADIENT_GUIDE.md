<!-- ormd:0.1 -->
---
title: "Scent Gradient Reward System"
authors: ["Essence Engine Team"]
dates:
  created: '2025-11-11T05:40:38.733223Z'
links: []
status: "complete"
description: "Essence Engine documentation"
---

# Scent Gradient Reward System

## Code Reference

**Primary Implementation File:** [`scentGradient.js`](../../scentGradient.js)

**Configuration:** `config.js` → `CONFIG.scentGradient`

**Main Functions:**
- `calculateScentIntensity()` - Compute scent at any point
- `getScentGradient()` - Get direction and intensity
- `getFoodDensitySensing()` - Multi-scale sensing
- `visualizeScentGradient()` / `visualizeScentHeatmap()` - Debug visualization

---

## Overview

This guide explains the new **scent gradient reward system** that helps AI agents learn to find food resources more effectively. The system provides three complementary mechanisms for gradient-based navigation:

1. **Scent Field** - Resources emit "scent" that decreases with distance
2. **Distance-Based Rewards** - Agents get rewarded for moving closer to food
3. **Multi-Scale Food Density Sensing** - Agents can sense general food distribution patterns

---

## 🎯 Key Features

### 1. Scent Gradient Field

Resources emit a "scent" signal that agents can sense, similar to how animals follow scent trails to find food. The scent intensity decreases with distance according to configurable falloff functions:

- **Linear**: Simple linear decay
- **Inverse**: `1 / (1 + k×distance)` - gradual falloff
- **Inverse-Square**: `1 / (1 + k×distance²)` - physics-like falloff (default)
- **Exponential**: `e^(-λ×distance)` - rapid decay

**Benefits:**
- Gives agents a continuous signal to follow (no more "blind searching")
- Stronger signal when closer to food = natural gradient to climb
- Works with multiple resources simultaneously

### 2. Distance-Based Rewards

Agents receive rewards for getting **closer** to the nearest food resource:

```javascript
reward = pixelsCloser × scalingFactor
```

**How it works:**
- Tracks distance to nearest food every N ticks (configurable, default: 10)
- If distance decreased since last check → positive reward
- Reward magnitude proportional to pixels moved closer
- Helps agents learn the value of approaching food

**Benefits:**
- Teaches "gradient climbing" behavior
- Rewards progress even before collection
- Reduces "random walk" strategies

### 3. Multi-Scale Food Density Sensing

Agents can sense food density at three spatial scales:

- **Near field** (200px): Immediate area
- **Mid field** (400px): Local region
- **Far field** (600px): Distant area

Plus a weighted direction vector pointing toward food concentration.

**Benefits:**
- Agents learn: "there's more food northeast-ish"
- Not exact location, but general direction
- Helps with exploration and long-range navigation

---

## 🎮 Usage

### Keyboard Controls

Press **[G]** to toggle scent gradient visualization:
- **Heatmap** shows scent intensity (green glow)
- **Arrows** show gradient direction and strength
- Helps you see what the agents are sensing

### Configuration

All settings are in `config.js` under `scentGradient`:

```javascript
scentGradient: {
  enabled: true,                    // Master toggle
  maxRange: 400,                    // Maximum detection range (pixels)
  falloffType: 'inverse-square',    // Falloff function type
  strength: 1.0,                    // Base scent strength
  
  // Distance rewards
  rewardEnabled: true,              // Enable gradient climbing rewards
  rewardScale: 0.5,                 // Reward per pixel closer
  rewardUpdateInterval: 10,         // Check distance every N ticks
  
  // Multi-scale sensing
  densitySensingEnabled: true,      // Enable density observations
  densityRadiusNear: 200,           // Near field radius
  densityRadiusMid: 400,            // Mid field radius
  densityRadiusFar: 600,            // Far field radius
}
```

### Tuning Recommendations

**For faster learning:**
- Increase `rewardScale` (try 1.0-2.0)
- Decrease `rewardUpdateInterval` (5-10 ticks)
- Use 'inverse-square' falloff for sharper gradients

**For exploration:**
- Increase `maxRange` (500-800 pixels)
- Use 'inverse' or 'linear' falloff for broader signals
- Enable density sensing for long-range navigation

**For challenging environments:**
- Decrease `rewardScale` (0.1-0.3) to avoid overshadowing collection reward
- Increase `rewardUpdateInterval` (20-30) to reduce noise
- Use 'exponential' falloff for more local signals

---

## 🧠 Observation Vector Changes

The observation vector has been **expanded from 15 to 23 dimensions**:

**Original (15 dims):**
- χ state (3): chi, frustration, alive
- Motion (2): vx, vy
- Walls (3): wall normal x/y, magnitude
- Resource (3): direction x/y, visible flag
- Trails (4): mean, max, direction x/y

**NEW (8 additional dims):**
- **Scent Gradient (3)**: intensity, gradient x, gradient y
- **Food Density (5)**: near, mid, far, density direction x/y

**Note:** Existing trained policies will NOT work with the new system due to dimension change. You'll need to train new policies from scratch.

---

## 📊 Reward Components

The reward system now includes a new component:

| Component | Weight | Description |
|-----------|--------|-------------|
| collectResource | 500.0 | Resource collected |
| chiGain | 0.5 | Energy gained from trails |
| chiSpend | -0.1 | Energy spent (metabolism) |
| stuck | -0.8 | Stuck near walls |
| idle | -0.2 | Not moving |
| explore | 10.0 | New area explored |
| provenanceCredit | 1.0 | Others using your trails |
| death | -50.0 | Energy depleted |
| **gradientClimb** | **2.0** | **Pixels closer to food (NEW!)** |

---

## 🔬 Technical Details

### Scent Gradient Calculation

The system calculates scent at any point (x, y) by:

1. For each resource, compute distance
2. Apply falloff function based on distance
3. Calculate gradient vector (direction uphill)
4. Sum contributions from all resources
5. Normalize gradient direction

### Distance Tracking

To avoid noisy rewards from frame-to-frame jitter:
- Distance checked every `rewardUpdateInterval` ticks (default: 10)
- Only rewards progress (getting closer), not regression
- Resets on resource collection

### Visualization

Two visualization modes:
1. **Heatmap**: Shows scent intensity as colored cells
2. **Vector Field**: Shows gradient direction as arrows

Both update in real-time and scale with scent intensity.

---

## 🚀 Training Tips

### Starting Fresh

1. **Reset learner** if you have old policies loaded
2. **Verify observation dims** = 23 in config
3. **Start training** with scent gradient enabled
4. **Monitor** gradient climbing rewards in training stats

### Expected Behavior

With scent gradients, agents should:
- ✅ Move more purposefully toward food
- ✅ Spend less time in "random walk"
- ✅ Learn faster (fewer episodes to convergence)
- ✅ Achieve higher collection rates

### Troubleshooting

**Agents ignoring scent:**
- Check `scentGradient.enabled = true`
- Verify `rewardScale` is significant (0.5-2.0)
- Make sure `maxRange` covers your arena

**Reward overshadowing collection:**
- Reduce `rewardScale` (try 0.1-0.3)
- Increase `rewardUpdateInterval` (20-30)
- Collection reward (500) should dominate

**Agents stuck on gradient:**
- Add exploration noise via frustration system
- Ensure `densitySensingEnabled = true` for multi-scale navigation
- Try different `falloffType` for broader signals

---

## 🎓 Theory: Why This Works

### Optimal Foraging Theory

In nature, animals follow chemical gradients (smell, pheromones) to find food. This system mimics that:

1. **Information gradient**: Scent provides a signal that increases toward food
2. **Gradient ascent**: Following the gradient leads to resources
3. **Reward shaping**: Intermediate rewards guide learning toward goal

### Reward Shaping

Classic RL problem: sparse rewards (only at collection) make learning slow.

**Solution:** Add "potential-based reward shaping"
- Reward ∝ (progress toward goal)
- Mathematically proven to preserve optimal policy
- Speeds convergence by providing learning signal

### Multi-Scale Sensing

Biological vision/perception operates at multiple scales:
- **Local**: precise, detailed (near field)
- **Mid**: tactical, regional (mid field)  
- **Global**: strategic, coarse (far field)

This hierarchy helps with:
- Exploration (follow far field hints)
- Navigation (use mid field for routing)
- Precision (use near field for collection)

---

## 📝 Example Scenarios

### Scenario 1: Single Resource, Static

**Config:**
```javascript
scentGradient: {
  enabled: true,
  maxRange: 400,
  falloffType: 'inverse-square',
  rewardScale: 1.0,
  rewardUpdateInterval: 10
}
```

**Expected:** Agents quickly learn to beeline toward food, high collection rate.

### Scenario 2: Multiple Resources, Dynamic Ecology

**Config:**
```javascript
scentGradient: {
  enabled: true,
  maxRange: 600,
  falloffType: 'inverse',
  rewardScale: 0.5,
  densitySensingEnabled: true
}
```

**Expected:** Agents balance between nearby resources and high-density regions.

### Scenario 3: Challenging (Long Range)

**Config:**
```javascript
scentGradient: {
  enabled: true,
  maxRange: 800,
  falloffType: 'linear',
  rewardScale: 0.3,
  densityRadiusFar: 1000
}
```

**Expected:** Agents use far-field density sensing for initial navigation, switch to gradient climbing when close.

---

## 🔧 Implementation Files

- **`scentGradient.js`**: Core scent field calculations and visualization
- **`config.js`**: Configuration settings (search for `scentGradient`)
- **`observations.js`**: Observation vector construction (now 23 dims)
- **`rewards.js`**: Reward tracking with gradient climbing component
- **`app.js`**: Integration and visualization rendering

---

## 🎉 Summary

The scent gradient system provides three powerful tools:

1. **Scent Field** → Something to follow (gradient ascent)
2. **Distance Rewards** → Reward for progress (reward shaping)
3. **Density Sensing** → General direction hints (multi-scale)

Together, these create a rich learning environment where agents can:
- Learn faster (more signal, less noise)
- Navigate smarter (gradient + density)
- Behave more naturally (like biological foragers)

**Press [G] to visualize and watch your agents climb the gradient!** 🎯

---

## 🤔 Questions?

- **Q: Will my old policies work?**  
  A: No, observation vector changed from 15→23 dims. Train new policies.

- **Q: Can I disable scent but keep density sensing?**  
  A: Yes! Set `scentGradient.enabled = false` but keep `densitySensingEnabled = true`.

- **Q: How do I know if it's working?**  
  A: Press [G] to visualize, watch gradient climbing rewards in training stats.

- **Q: Best settings for quick testing?**  
  A: Use defaults! They're tuned for ~400-800px arena with 2-4 resources.

---

**Happy gradient climbing!** 🚀

