# Essence Engine Learning System

## 🎯 What We've Built

We've created the foundational infrastructure for a pluggable learning system that allows essence agents to learn optimal behavior through reinforcement learning.

---

## 📁 New Files Created

### 1. **config.js** ✅
- Extracted all configuration into organized sections
- Separates tuning from logic
- Easy to experiment with different parameter sets
- Imported as ES6 module

### 2. **controllers.js** ✅
- **Controller** base class: interface for all behavior policies
- **HeuristicController**: wraps existing hand-coded AI (frustration, sensing, trail-following)
- **LinearPolicyController**: simple learned policy with weights matrix
  - Linear layer: `y = W*obs + b`
  - Activations: `tanh` for turn, `sigmoid` for thrust/sensing
  - Methods for weight serialization (for CEM training)

### 3. **observations.js** ✅
- Builds normalized observation vector (15 dimensions):
  - **χ state**: chi, frustration, alive (3)
  - **Motion**: vx, vy (2)
  - **Walls**: normal vector + magnitude (3)
  - **Resource**: direction + visibility (3)
  - **Trails**: mean, max, direction (4)
- All values normalized to [-1, 1] or [0, 1]
- Returns both structured object and flat vector

### 4. **rewards.js** ✅
- **RewardTracker**: monitors bundle performance per step
  - +10 for resource collection
  - +0.2 per χ gained (residual reuse)
  - -0.1 per χ spent
  - -0.5 when stuck near walls
  - -0.1 per tick when idle
  - +0.05 for exploring new cells
  - +0.1 per χ credited from others using your trails
  - -20 on death
- **EpisodeManager**: tracks episode history and statistics

---

## 🎮 Action Space

Controllers output 3 continuous actions per step:
- **turn** ∈ [-1, 1]: steering left/right
- **thrust** ∈ [0, 1]: speed multiplier (0=stop, 1=full speed)
- **senseFrac** ∈ [0, 1]: sensing effort (0=base range, 1=max range)

These map beautifully to your existing mechanics:
- Turn modifies heading angle
- Thrust scales movement speed and costs χ accordingly
- SenseFrac controls extended sensing (costs χ proportional to boost)

---

## 🔄 Integration Points (TODO)

To integrate this into `app.js`, we need to:

### 1. Add Action Space Mapping (Next Step)
- Add `heading` property to Bundle class
- Implement `applyAction(action, dt)` method
- Map turn/thrust/senseFrac to actual movement

### 2. Wire Up Controllers
- Add `controller` property to Bundle
- Replace direct AI calls with `controller.act(obs)`
- Build observation before acting

### 3. Add Training Loop (CEM)
- Implement Cross-Entropy Method (CEM) learner
- Run multiple episodes in parallel/sequence
- Update policy weights based on elite performers

### 4. Training UI
- Toggle between training mode and play mode
- Display episode rewards, generation progress
- Save/load learned policies
- Visualize learning curves

---

## 🚀 Next Steps

### Option A: Quick Integration Test
1. Add action space to Bundle
2. Wire up HeuristicController
3. Verify existing AI works through new interface

### Option B: Jump to Learning
1. Finish action space
2. Implement CEM trainer
3. Start training linear policies

### Option C: Incremental Approach
1. Test each component individually
2. Ensure obs vector makes sense
3. Verify rewards align with goals
4. Then integrate training

---

## 💡 Why This Design?

**Pluggable**: Switch between heuristic and learned policies without changing core logic

**Modular**: Each system (obs, actions, rewards, controllers) is independent and testable

**Scalable**: Easy to:
- Add more observation features
- Try different policy architectures (MLP, RNN)
- Experiment with reward shaping
- Upgrade from CEM to PPO/TD3 later

**Browser-native**: No heavy dependencies, runs entirely in-browser

---

## 🎓 Learning Pipeline

```
Episode Start
    ↓
Bundle State → Observation Vector
    ↓
Observation → Controller.act() → Action
    ↓
Action → Bundle Movement + Sensing
    ↓
State Change → Reward Calculation
    ↓
Repeat until episode end (death or max length)
    ↓
Episode Summary → CEM Update
    ↓
New Generation → Repeat
```

---

## 📊 What You Can Train

With this system, agents can learn to:
- ✅ Navigate toward resources efficiently
- ✅ Avoid walls and dead zones
- ✅ Balance χ spending (movement vs sensing)
- ✅ Follow trails from successful agents
- ✅ Explore vs exploit trade-offs
- ✅ Leave useful trails for others (provenance credits!)

The beauty is: **you don't hard-code any of this** - agents discover optimal strategies through reward maximization!

---

## 🔧 Configuration

All learning parameters are in `config.js` under `CONFIG.learning`:
- Observation dimensions
- Reward weights (tweak what behaviors to encourage)
- Episode settings
- CEM hyperparameters

Tune these to shape what agents learn!

