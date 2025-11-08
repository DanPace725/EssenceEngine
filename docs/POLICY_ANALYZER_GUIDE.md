# 📊 Policy Analyzer Guide

## What It Does

The Policy Analyzer helps you understand what your trained policies have learned by:
- 🔍 Decoding weight matrices into human-readable insights
- 📈 Visualizing learning progress over generations
- ⚖️ Comparing policies to see what changed
- 🎯 Highlighting resource-seeking behavior
- ⚠️ Detecting convergence issues

---

## Installation

The analyzer is a Node.js script (no dependencies needed!).

**Requirements:**
- Node.js installed (any recent version)
- Your saved policy JSON files

---

## Usage

### 1. Analyze a Single Policy

```bash
node policyAnalyzer.js slime-policy-gen20.json
```

**Shows:**
- Performance metrics (best reward, mean, elite mean)
- Convergence status (sigma values, collapsed weights)
- Top influential features per action
- Resource-seeking analysis with scores
- ASCII learning curve plot

### 2. Compare Two Policies

```bash
node policyAnalyzer.js slime-policy-gen6.json slime-policy-gen20.json
```

**Shows:**
- Everything from single analysis (for both)
- Direct comparison of performance
- Weight changes for key features
- Learning insights (what improved/worsened)
- Side-by-side learning curves

### 3. Show All Weights

```bash
node policyAnalyzer.js slime-policy-gen20.json --all
```

**Shows:**
- All 15 observation weights (not just top 5)
- Complete weight breakdown per action

---

## Example Output

### Single Policy Analysis

```
================================================================================
Policy Analysis: Generation 20
================================================================================

Performance:
  Best Reward: 22.18
  Mean Reward: -60.20
  Elite Mean:  -38.65

Convergence:
  Average σ:     0.0111
  σ Range:       0.0100 - 0.0194
  Collapsed:     43/48 weights (89.6%)
  ⚠️  Warning: High convergence! May be stuck in local optimum

Action: TURN
  Bias: -0.0556

  Top Influential Features:
    wallMag      -0.2062 ████████████
    resDy        -0.0008 
    wallNy       -0.0234 █
    chi          -0.0252 █
    resDx         0.0315 █

Action: THRUST
  [...]

Resource-Seeking Analysis:
  Turn Response:
    resDx      → 0.0315 ⚠ Weak
    resDy      → -0.0008 ⚠ Weak
    resVisible → -0.0356

  Thrust Response:
    resDx      → 0.0577
    resDy      → -0.0375
    resVisible → -0.0306 ⚠ Should be positive

  Resource-Seeking Score: 0.046 ✗ Weak
```

### Learning Curve

```
Learning Curve (Gen 0-20):

    22 │                      ●                              
    16 │                                                     
    10 │                ●    ● ●       ●  ●  ●              
     4 │                                                     
    -2 │                                                     
    -8 │                                                     
   -14 │                                                     
   -20 │                                                     
   -26 │  ●                                                  
   -32 │    ● ●                                              
   -38 │          ●      ●        ●  ●     ●  ●  ●         
       └────────────────────────────────────────────────────
        Gen 0                                      Gen 20

  First Gen:  -39.50
  Latest Gen: -38.55
  Change:     +0.95
```

### Comparison Output

```
================================================================================
Comparison: Gen 6 → Gen 20
================================================================================

Performance Change:
  Best Reward:  11.38 → 22.18
  Change:       +10.80 (+94.9%)

Exploration Change:
  Avg σ:        0.0384 → 0.0111
  Change:       ↓ Converging

Key Weight Changes:

  TURN:
    Resource Dir X      0.0108 → 0.0315  +0.0208
    Resource Dir Y     -0.1762 → -0.0008  +0.1754
    Resource Visible    0.0685 → -0.0356  -0.1041
    Chi Level           0.0108 → -0.0252  -0.0359
    Wall Proximity     -0.0305 → -0.2062  -0.1758

  THRUST:
    Resource Dir X     -0.0509 → 0.0577  +0.1086
    Resource Dir Y     -0.1118 → -0.0375  +0.0743
    Resource Visible    0.1118 → -0.0306  -0.1424
    [...]

Learning Insights:
  • Turn response to resource direction IMPROVED (+20.8%)
  • Thrust response when resource visible WORSENED (-14.2%)
  ✓ Significant performance improvement!
  ⚠ Search space has collapsed - consider increasing mutation noise
```

---

## Interpreting Results

### Performance Metrics

**Best Reward**
- Positive = good! Agent collected resources
- Negative = died before collecting much
- Gen 6: +11.38 = collected 1 resource, barely survived
- Gen 20: +22.18 = collected 2 resources

**Mean Reward**
- Average across all 20 policies in population
- Negative is common early in training
- Gap between best and mean shows variance

**Elite Mean**
- Average of top 5 policies
- Should be closer to best reward
- Large gap = unstable population

### Convergence Status

**Average σ (sigma)**
- Starts around 0.1
- Decreases as learning converges
- < 0.02 = highly converged
- < 0.01 = collapsed (stuck)

**Collapsed Weights**
- Weights with σ = 0.01 (minimum)
- Shows how many weights have "settled"
- > 80% = may be stuck in local optimum
- < 50% = still actively exploring

**⚠️ Warning Signs:**
- High collapsed % + negative rewards = stuck in bad optimum
- Need to increase mutation noise or restart

### Weight Interpretation

**Color Coding:**
- 🟢 **Green** (> +0.2) = Strong positive influence
- 🔴 **Red** (< -0.2) = Strong negative influence  
- 🔵 **Cyan** (> 0) = Weak positive
- 🟡 **Yellow** (< 0) = Weak negative
- ⚪ **Gray** (near 0) = Ignored

**Magnitude:**
- < 0.05 = essentially ignored
- 0.05-0.2 = weak influence
- 0.2-0.5 = moderate influence
- \> 0.5 = strong influence

### Resource-Seeking Analysis

This is the **most important section** for understanding if your policy works!

**Turn Response:**
- `resDx` (X direction) should be **positive** and **> 0.2**
- `resDy` (Y direction) should be **positive/negative** and **> 0.2 magnitude**
- `resVisible` should influence turn (any direction OK)

**Thrust Response:**
- `resVisible` should be **positive** and **> 0.2**
- Means "thrust forward when I see a resource"
- Negative = "slow down when resource visible" (bad!)

**Resource-Seeking Score:**
- < 0.1 = ✗ **Weak** - agent ignores resources (your Gen 20!)
- 0.1-0.3 = ⚠ **Moderate** - sometimes seeks resources
- \> 0.3 = ✓ **Strong** - actively seeks resources

### Learning Curve Insights

**Good Curve:**
```
 Reward
   20 ─────────────────╱
   10 ──────────╱╱╱╱╱╱
    0 ────╱╱╱╱╱
  -10 ╱╱╱
```
Steady upward trend = learning!

**Stuck Curve:**
```
 Reward
   10 ╱────────────────
    0 ╱
  -10 ────────────────
```
Spike then flat = found one solution, stopped exploring

**Unstable Curve:**
```
 Reward
   10 ╱╲ ╱╲  ╱╲╱
    0 ╲╱ ╲╱╲╱
  -10 ──────────────
```
Wild oscillation = population diverging, bad hyperparameters

---

## Common Patterns

### "Gen X ignores resources"

**Symptoms:**
```
Resource-Seeking Score: 0.046 ✗ Weak
Turn Response:
  resDx      → 0.0315 ⚠ Weak
  resVisible → -0.0356
```

**Diagnosis:** Weights for resource features are too small

**Fix:**
1. Train much longer (50-100+ generations)
2. Increase `collectResource` reward to 30-50
3. Decrease `chiSpend` penalty

### "Stuck in Local Optimum"

**Symptoms:**
```
Collapsed:     43/48 weights (89.6%)
Average σ:     0.0111
Learning curve flat for 10+ generations
```

**Diagnosis:** Search space collapsed prematurely

**Fix:**
1. Increase `CONFIG.learning.mutationStdDev` to 0.2
2. Continue training - might escape
3. Or restart from scratch with better rewards

### "Performance Regression"

**Symptoms:**
```
Performance Change:
  Best Reward:  22.18 → 11.38
  Change:       -10.80 (-48.7%)
```

**Diagnosis:** CEM found worse elites, shifted away from good solution

**Fix:**
1. Load previous better policy
2. Increase elite count to 8-10 (more stability)
3. Decrease mutation noise (less exploration)

---

## Recommended Workflow

### 1. Initial Analysis
```bash
node policyAnalyzer.js slime-policy-gen8.json
```

Check:
- Is best reward positive?
- Is resource-seeking score > 0.1?
- Is sigma still > 0.03?

### 2. After More Training
```bash
node policyAnalyzer.js slime-policy-gen8.json slime-policy-gen50.json
```

Check:
- Did best reward improve?
- Did resource-seeking score increase?
- Did key weights change in the right direction?

### 3. Diagnose Issues

If stuck:
```bash
node policyAnalyzer.js slime-policy-gen50.json --all
```

Look at:
- All 15 weights for each action
- Find which observations are ignored
- Adjust reward function accordingly

### 4. Compare Multiple Generations
```bash
node policyAnalyzer.js slime-policy-gen20.json slime-policy-gen50.json
node policyAnalyzer.js slime-policy-gen50.json slime-policy-gen100.json
```

Track progress over time!

---

## Tips

1. **Save policies every 10-20 generations** so you can analyze progress
2. **Name files descriptively**: `slime-gen50-highExplore.json`
3. **Compare against baseline** - keep your Gen 0 policy!
4. **Look for patterns** - if `resDx` never goes positive, increase resource reward
5. **Trust the resource-seeking score** - it's the best single metric
6. **Don't panic if early gens are bad** - Gen 20 with score 0.046 is expected!
7. **Use `--all` flag** when debugging specific behaviors

---

## Advanced: Reading the Weight Matrix

### How Actions Are Computed

```javascript
// From controllers.js
y[0] = sum(weights[0-14] * obs[0-14]) + bias[0]
turn = tanh(y[0])  // maps to [-1, 1]

y[1] = sum(weights[15-29] * obs[0-14]) + bias[1]
thrust = sigmoid(y[1])  // maps to [0, 1]

y[2] = sum(weights[30-44] * obs[0-14]) + bias[2]
senseFrac = sigmoid(y[2])  // maps to [0, 1]
```

### Example Calculation

If policy has:
```
Turn weights: [0.1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.3, 0.2, ...]
Observation:  [0.5, 0.1, 1, 0, 0, 0, 0, 0, 0.8, 0.6, 1.0, ...]
              (chi=0.5, resVisible=1, resDx=0.8, resDy=0.6)
```

Calculation:
```
y = 0.1*0.5 + 0.5*0.8 + 0.3*0.6 + 0.2*1.0 + ... + bias
  = 0.05 + 0.4 + 0.18 + 0.2 + ...
  = 0.83 + ...

turn = tanh(0.83) ≈ 0.68
```

Agent turns right at 68% strength!

---

## Troubleshooting

### "Script not found"
```bash
# Make sure you're in the project directory
cd EssenceEngine
node policyAnalyzer.js slime-policy-gen20.json
```

### "Cannot find module"
The script has no dependencies! Just needs Node.js installed.

### "File not found"
```bash
# Check your policy files exist
ls slime-policy-*.json

# Use full path if needed
node policyAnalyzer.js ./slime-policy-gen20.json
```

### Colors not showing (Windows)
Some Windows terminals don't support ANSI colors. Use Windows Terminal or Git Bash.

---

## Summary

The Policy Analyzer helps you:
1. **Understand** what weights mean
2. **Diagnose** why policies fail
3. **Track** learning progress
4. **Compare** different approaches
5. **Optimize** reward functions

**Key insight:** If `Resource-Seeking Score < 0.1`, your policy doesn't care about resources yet. Train more or adjust rewards!

🎯 Now you can see exactly what your essence agents are learning!

