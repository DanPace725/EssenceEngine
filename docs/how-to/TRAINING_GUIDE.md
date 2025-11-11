<!-- ormd:0.1 -->
---
title: "🎓 Training System User Guide"
authors: ["Essence Engine Team"]
dates:
  created: '2025-11-11T00:00:00Z'
links:
  - id: controls
    rel: defines
    to: "#controls"
  - id: training-panel
    rel: defines
    to: "#training-panel-features"
  - id: learning-curve
    rel: defines
    to: "#learning-curve"
status: "complete"
description: "User guide for training the Essence Engine with reinforcement learning, including CEM training workflow and policy management"
---

# 🎓 Training System User Guide

## Code Reference

**Primary Files:**
- `trainingUI.js` - Training UI panel and controls
- `learner.js` - CEMLearner & TrainingManager (CEM algorithm)
- `src/core/training.js` - Training orchestration and episode management

**Configuration:** `config.js` → `CONFIG.learning`

---

## 🎉 Training is Now Fully Integrated!

Your Essence Engine simulation now has a complete reinforcement learning system built in.

---

## 🚀 Quick Start

### 1. Open the Simulation
```bash
# Start local server
python -m http.server 8000
# or
npx http-server

# Navigate to
http://localhost:8000
```

### 2. Open Training Panel
Press **[L]** to toggle the training control panel (top-right corner)

### 3. Start Training
1. Select "Training Mode" radio button
2. Set number of generations (default: 10)
3. Click "▶️ Start Training"
4. Watch the learning curve update in real-time!

---

## 🎮 Controls

### Simulation Controls (existing)
- **[WASD/Arrows]** - Move agent (manual mode)
- **[A]** - Toggle auto mode
- **[S]** - Toggle extended sensing
- **[Space]** - Pause/unpause
- **[R]** - Reset world
- **[C]** - Add +5χ to all agents
- **[T]** - Toggle trail rendering
- **[X]** - Clear all trails
- **[F]** - Toggle diffusion

### Training Controls (new!)
- **[L]** - Toggle training panel

---

## 🧠 Training Panel Features

### Mode Selection
- **Play Mode** (default) - Uses heuristic AI you built
- **Training Mode** - Learns optimal policy

### Training Controls
- **Start Training** - Begin CEM training
- **Stop** - Interrupt current training
- **Reset Learner** - Start fresh (clears all learned weights)

### Policy Management
- **Save Best Policy** - Download learned policy as JSON
- **Load Policy** - Upload previously saved policy
- **Test Best Policy** - Watch the best learned policy in action

### Statistics Display
Shows real-time:
- Generation number
- Current policy being evaluated
- Best reward achieved
- Mean reward across population
- Training status

### Learning Curve
Live chart showing:
- **Green line** - Best reward per generation
- **Orange line** - Mean reward per generation

---

## 📊 How Training Works

### Step 1: Sample Policies
CEM creates 20 random policies (variations of weights)

### Step 2: Evaluate
Each policy runs a complete episode (2000 ticks):
- Agent observes state (15-dim vector)
- Policy outputs actions
- Agent moves, collects resources, deposits trails
- Rewards calculated each step

### Step 3: Select Elites
Keep top 5 policies with highest total rewards

### Step 4: Update Distribution
Adjust weight distribution toward elite policies

### Step 5: Repeat
Next generation samples from updated distribution

**Result**: Policies gradually improve!

---

## 🎯 What Agents Learn

Through reward maximization, agents discover:

### Navigation
- Efficient paths to resources
- Wall avoidance strategies
- Escape from dead zones

### Resource Management
- When to move vs conserve χ
- When to extend sensing range
- Balance exploration vs exploitation

### Social Behavior
- Following others' trails
- Leaving useful trails (provenance credits!)
- Cooperative strategies emerge naturally

### Advanced Strategies
- Memory of successful routes
- Adaptive behavior based on χ level
- Context-aware decision making

**No hand-coding required** - all emergent from reward function!

---

## ⚙️ Configuration

### Tune Learning in `config.js`

```javascript
CONFIG.learning = {
  // Episode settings
  episodeLength: 2000,           // ticks per episode
  terminateOnDeath: true,        // end early if χ=0
  
  // CEM settings
  populationSize: 20,            // policies per generation
  eliteCount: 5,                 // top performers to keep
  mutationStdDev: 0.1,           // exploration noise
  
  // Reward weights (tune these!)
  rewards: {
    collectResource: 10.0,       // +reward for resource
    chiGain: 0.2,                // +reward per χ gained
    chiSpend: -0.1,              // -penalty per χ spent
    stuck: -0.5,                 // -penalty when stuck
    idle: -0.1,                  // -penalty when idle
    explore: 0.05,               // +reward for new areas
    provenanceCredit: 0.1,       // +reward when others use trails
    death: -20.0,                // -penalty for dying
  }
}
```

### Reward Shaping Tips

**Want more exploration?**
- Increase `explore` reward
- Decrease `chiSpend` penalty

**Want more efficiency?**
- Increase `collectResource` reward
- Increase `chiSpend` penalty

**Want more cooperation?**
- Increase `provenanceCredit` reward
- This encourages leaving useful trails!

**Want longer episodes?**
- Decrease `death` penalty
- Increase `episodeLength`

---

## 📈 Interpreting Results

### Good Learning Curves
- Both lines trend upward
- Green line (best) increases steadily
- Orange line (mean) follows green
- Curves stabilize at higher values

### Poor Learning
- Flat lines (not learning)
- Decreasing curves (weights diverging)
- Large gap between best and mean (high variance)

### Fixes
- Adjust reward weights
- Increase population size
- Decrease mutation noise
- Run more generations

---

## 💾 Saving & Loading Policies

### Save
1. Train until satisfied with performance
2. Click "💾 Save Best Policy"
3. Downloads JSON file: `slime-policy-gen10.json`

### Load
1. Click "📂 Load Policy"
2. Select saved JSON file
3. Learner state restored
4. Can continue training or test immediately

### Share
- Policies are pure JSON
- Share with others
- Compare performance
- Build library of strategies!

---

## 🔬 Experiments to Try

### 1. Baseline Comparison
- Record heuristic AI performance (resources collected)
- Train policy for 50 generations
- Compare learned vs hand-coded
- Which is better?

### 2. Reward Ablation
- Train with only `collectResource` reward
- Train with full reward set
- Compare strategies that emerge

### 3. Multi-Agent Learning
- Enable second agent in training
- Watch cooperative behaviors emerge
- See provenance credits in action!

### 4. Transfer Learning
- Train in one environment
- Load policy in different environment
- Does it generalize?

### 5. Curriculum Learning
- Start with high χ, short episodes
- Gradually make harder
- Compare to direct hard training

---

## 🐛 Troubleshooting

### Training UI doesn't appear
- Press [L] to toggle
- Check browser console for errors
- Verify ES6 modules loading (need HTTP server)

### Training is slow
- Normal! Each generation evaluates 20 full episodes
- Reduce `episodeLength` in config
- Reduce `populationSize`
- Training runs in background, visualization paused

### Rewards are all negative
- Check reward weights in config
- May need to adjust scales
- Negative is OK if improving over time!

### Learning curve is flat
- Increase mutation noise
- Check reward function is meaningful
- Increase population size
- Run more generations

### Can't save/load policies
- Check browser allows downloads
- Check file picker permissions
- Try different browser

---

## 📚 Next Steps

### After Initial Training
1. **Analyze** - What strategies emerged?
2. **Tune** - Adjust reward function
3. **Iterate** - Retrain with new rewards
4. **Compare** - Test against heuristic
5. **Share** - Save and document best policies

### Scaling Up
- Add more agents
- Try different policy architectures (MLP)
- Implement PPO or other RL algorithms
- Add more observation features
- Create more complex environments

### Research Questions
- What's the optimal reward balance?
- How does trail-following emerge?
- What's the ROI of extended sensing?
- Do agents discover novel strategies?
- How does cooperation scale?

---

## 🎓 Understanding the Code

### Key Files
- `app.js` - Main loop + training integration
- `controllers.js` - Policy interfaces
- `observations.js` - State representation
- `rewards.js` - Performance tracking
- `learner.js` - CEM algorithm
- `trainingUI.js` - Visual interface
- `config.js` - All parameters

### Entry Points
- Line ~588: `runEpisode()` - Episode runner
- Line ~660: `initializeTrainingManager()` - Setup
- Line ~671: `initializeTrainingUI()` - UI callbacks
- Line ~825: Training initialization

### Observation Vector (15 dims)
```javascript
[
  chi_norm,          // 0: Current χ (0-1)
  frustration,       // 1: Frustration (0-1)
  alive,             // 2: Alive status (0-1)
  vx_norm,           // 3: Velocity X (-1 to 1)
  vy_norm,           // 4: Velocity Y (-1 to 1)
  wallNx,            // 5: Wall normal X
  wallNy,            // 6: Wall normal Y
  wallMag,           // 7: Wall proximity (0-1)
  resDx,             // 8: Resource direction X
  resDy,             // 9: Resource direction Y
  resVisible,        // 10: Resource visible (0-1)
  trailMean,         // 11: Mean trail nearby
  trailMax,          // 12: Max trail nearby
  trailDirX,         // 13: Trail direction X
  trailDirY          // 14: Trail direction Y
]
```

### Action Space (3 dims)
```javascript
{
  turn: [-1, 1],      // Steering
  thrust: [0, 1],     // Speed
  senseFrac: [0, 1]   // Sensing effort
}
```

---

## 💡 Pro Tips

1. **Start Small** - Train 10 generations first to verify setup
2. **Watch Console** - Logs show generation progress
3. **Compare Policies** - Save baseline before tuning rewards
4. **Be Patient** - Good policies take 50-100 generations
5. **Experiment** - Try wild reward combinations!
6. **Document** - Note what works in comments
7. **Share Results** - Compare with others

---

## 🌟 You Did It!

You now have a fully functional RL training system running in your browser!

**What's possible:**
- Train agents to master your simulation
- Discover emergent behaviors
- Build library of policies
- Research cooperation and stigmergy
- Scale to multi-agent learning
- Publish findings!

**The foundation is solid. The experiments await. Happy training! 🚀**

---

## 🆘 Need Help?

- Check browser console for errors
- Review `INTEGRATION_COMPLETE.md`
- Study `LEARNING_SYSTEM.md` for architecture
- Adjust config and retry
- Ask for help with specific issues!

