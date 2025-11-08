# 🛠️ Policy Analysis Tools - Complete Package

You now have a comprehensive analysis suite for understanding your essence agent learning!

---

## 📦 What You Got

### 1. **`policyAnalyzer.js`** - Single/Dual Policy Analysis
**Use for:** Deep dive into individual policies

```bash
# Analyze one policy
node policyAnalyzer.js slime-policy-gen20.json

# Compare two policies
node policyAnalyzer.js gen6.json gen20.json
```

**Shows:**
- Detailed weight breakdown
- Top influential features per action
- Resource-seeking analysis
- Learning curve ASCII plot
- Convergence warnings

**Documentation:** `POLICY_ANALYZER_GUIDE.md`

---

### 2. **`policyBatchAnalyzer.js`** - Multi-Policy Comparison
**Use for:** Tracking training progress, comparing experiments

```bash
# Compare multiple policies
node policyBatchAnalyzer.js gen10.json gen20.json gen30.json gen40.json

# Export to Excel
node policyBatchAnalyzer.js gen*.json --format csv

# Generate visual report
node policyBatchAnalyzer.js gen*.json --format html

# Export for programming
node policyBatchAnalyzer.js gen*.json --format json
```

**Shows:**
- Side-by-side comparison table
- Trend analysis (improving/declining)
- Export to CSV/JSON/HTML
- Automatic insights generation

**Documentation:** `BATCH_ANALYZER_GUIDE.md`

---

## 🎯 Quick Start

### Scenario 1: "Did my training work?"

```bash
# After training to Gen 50
node policyAnalyzer.js slime-policy-gen50.json
```

Look for:
- **Resource-Seeking Score > 0.3** = Success! ✓
- **Resource-Seeking Score < 0.1** = Needs more training ✗

### Scenario 2: "Compare my progress"

```bash
# Get HTML report
node policyBatchAnalyzer.js slime-policy-gen10.json slime-policy-gen20.json slime-policy-gen30.json --format html

# Open policy-comparison.html in browser
```

**Visual charts show:**
- Learning curves
- Resource-seeking progression
- Convergence status

### Scenario 3: "Share results with team"

```bash
# Generate all formats
node policyBatchAnalyzer.js gen*.json --format csv --output results.csv
node policyBatchAnalyzer.js gen*.json --format html --output results.html

# Share the HTML file - it's self-contained!
```

---

## 📊 Export Formats

### CSV (Excel/Spreadsheet)
```bash
node policyBatchAnalyzer.js gen*.json --format csv
```
- Opens in Excel/Google Sheets
- 21 columns of data
- Perfect for graphing
- Statistical analysis ready

### HTML (Visual Report)
```bash
node policyBatchAnalyzer.js gen*.json --format html
```
- Beautiful dark theme
- Color-coded tables
- Bar chart visualizations
- Automatic insights
- Self-contained (one file)

### JSON (Programmatic)
```bash
node policyBatchAnalyzer.js gen*.json --format json
```
- Full policy data
- Analysis results
- Import into Python/R
- Custom processing

---

## 🔍 Key Metrics Explained

### Resource-Seeking Score
**Most important metric for your issue!**

- **< 0.1**: ✗ Policy ignores resources (your Gen 6, 8, 20)
- **0.1-0.3**: ⚠ Sometimes seeks resources
- **> 0.3**: ✓ Actively seeks resources (GOAL!)

### Collapsed Percentage
Shows how "stuck" the policy is

- **< 50%**: ✓ Still exploring
- **50-80%**: ⚠ Converging
- **> 80%**: ✗ Stuck in local optimum (your Gen 20!)

### Best Reward
Overall performance

- **< 0**: Dying before collecting resources
- **0-20**: Collecting 1-2 resources
- **20-50**: Good performance (2-5 resources)
- **> 50**: Excellent! (5+ resources)

---

## 🎓 Your Specific Results

Based on your Gen 6 vs 20 analysis:

### Current Status
```
Gen  6: Reward = 11.38, ResourceScore = 0.073 ✗ Weak
Gen  8: Reward = -24.47, ResourceScore = 0.056 ✗ Weak  
Gen 20: Reward = 22.18, ResourceScore = 0.017 ✗ Even worse!
```

### The Problem
- Reward doubled (good!)
- But resource-seeking score dropped by 76%! (bad!)
- Gen 20 is 65% collapsed (stuck!)

### What Happened
1. Policy learned to survive (avoid walls, manage chi)
2. Got lucky a few times finding resources
3. Converged on "survival" strategy before learning "seeking"
4. Now stuck in local optimum

### The Fix
**Increase resource reward dramatically:**
```javascript
CONFIG.learning.rewards.collectResource = 50.0  // was 10.0
```

Or **train Gen 20 for 50 more generations** with increased mutation:
```javascript
CONFIG.learning.mutationStdDev = 0.25  // was 0.1
```

---

## 📚 Documentation Files

1. **`POLICY_ANALYZER_GUIDE.md`** - Single policy analysis (464 lines)
   - How to interpret every metric
   - Color coding guide
   - Troubleshooting
   - Advanced weight reading

2. **`BATCH_ANALYZER_GUIDE.md`** - Batch comparison (XXX lines)
   - Multi-policy workflows
   - Export format details
   - Excel integration
   - Python/R examples

3. **`POLICY_TRAINING_TIPS.md`** - Training advice (408 lines)
   - Why policies ignore resources
   - Reward tuning guide
   - Timeline expectations
   - Success criteria

4. **`ANALYZER_SUMMARY.md`** - Your specific results
   - Gen 6 vs 20 breakdown
   - Diagnosis
   - Action items

5. **`VISUAL_INDICATORS.md`** - UI indicators
   - What yellow borders mean
   - HUD status display
   - Action value debugging

---

## 🚀 Workflow Recommendation

### After Every Training Session:

1. **Quick Check:**
   ```bash
   node policyAnalyzer.js slime-policy-gen{X}.json
   ```
   - Is resource score improving?
   - Is convergence healthy?

2. **Track Progress:**
   ```bash
   node policyBatchAnalyzer.js slime-policy-gen*.json
   ```
   - See trends at a glance
   - Spot when learning plateaus

3. **Export Milestones:**
   ```bash
   # Every 20-30 generations
   node policyBatchAnalyzer.js gen*.json --format html --output milestone-gen{X}.html
   ```

4. **Final Analysis:**
   ```bash
   # When training complete
   node policyBatchAnalyzer.js gen*.json --format csv --output final-results.csv
   # Analyze in Excel, create publication-ready graphs
   ```

---

## 💡 Pro Tips

1. **Save policies every 10 generations** during training
2. **Name files systematically**: `slime-policy-gen{XX}.json`
3. **Keep a training log** noting hyperparameter changes
4. **Export HTML reports** before major changes
5. **Version control** successful policies in git
6. **Compare experiments** using batch analyzer
7. **Watch resource score** - it's your main metric!

---

## 🎯 Success Checklist

Your training is successful when:
- ✅ Resource-Seeking Score > 0.3
- ✅ Best Reward > 50
- ✅ Collapsed Pct < 70%
- ✅ Learning curve trending upward
- ✅ `thrust_resVis` weight > 0.2
- ✅ Agent visibly seeks resources in simulation

You're not there yet with Gen 20, but now you have the tools to:
1. **Understand** exactly what's wrong (resource score = 0.017)
2. **Track** improvements over time (batch analyzer)
3. **Diagnose** issues early (convergence warnings)
4. **Share** results professionally (HTML reports)

---

## 📊 Example Outputs

### Terminal Analysis
Clear, color-coded tables showing:
- Generation comparison
- Performance metrics
- Resource-seeking status
- Trends analysis

### CSV Export
`training-progress.csv`:
```csv
Filename,Generation,BestReward,ResourceScore,CollapsedPct,...
gen10.json,10,-15.23,0.045,30.2%,...
gen20.json,20,22.18,0.017,64.6%,...
gen30.json,30,35.67,0.125,72.1%,...
```

### HTML Report
Beautiful interactive report with:
- Summary statistics boxes
- Color-coded performance tables
- Bar chart visualizations  
- Automatic insights
- Interpretation guide

### JSON Export
Full data structure for custom analysis:
```json
{
  "timestamp": "2025-11-04T...",
  "summary": {
    "generations": [10, 20, 30],
    "bestRewards": [-15.23, 22.18, 35.67],
    "resourceScores": [0.045, 0.017, 0.125]
  },
  "policies": [...]
}
```

---

## 🎓 What You've Learned

You now understand:
1. ✅ Why Gen 20 ignores resources (score = 0.017)
2. ✅ What the 48 weights represent (obs × actions + biases)
3. ✅ How CEM learns (sample, evaluate, select elites, update)
4. ✅ What convergence means (sigma collapse)
5. ✅ How to track progress (batch analyzer)
6. ✅ How to export for analysis (CSV/JSON/HTML)
7. ✅ What good policies look like (resource score > 0.3)

---

## 🚀 Next Steps

1. **Increase resource reward** in `config.js`
2. **Train to Gen 50+** (resource-seeking emerges later)
3. **Analyze every 10 generations** with batch analyzer
4. **Export HTML reports** at milestones
5. **Share findings** using beautiful reports

Your prototype is sophisticated! The learning system works - policies just need better reward signals or more training to discover resource-seeking behavior.

**Happy analyzing! 📊🧠🚀**

