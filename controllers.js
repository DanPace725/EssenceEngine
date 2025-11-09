// Controller Interface for Essence Engine AI
// Enables pluggable behavior: heuristic OR learned policy

import { TcRandom, TcScheduler } from './tcStorage.js';

// ========== Base Controller ==========
// Interface: all controllers must implement act(obs)
export class Controller {
  constructor() {
    this._tcUnsubscribe = null;
  }

  registerTcHooks(hooks) {
    this.clearTcHooks();
    if (!hooks) return;
    const normalized = typeof hooks === 'function' ? hooks(this) : hooks;
    if (!normalized) return;
    const mapped = {};
    if (typeof normalized.capture === 'function') {
      mapped.capture = (ctx) => normalized.capture.call(this, ctx);
    }
    if (typeof normalized.compute === 'function') {
      mapped.compute = (ctx) => normalized.compute.call(this, ctx);
    }
    if (typeof normalized.commit === 'function') {
      mapped.commit = (ctx) => normalized.commit.call(this, ctx);
    }
    if (Object.keys(mapped).length) {
      this._tcUnsubscribe = TcScheduler.registerHooks(mapped);
    }
  }

  clearTcHooks() {
    if (typeof this._tcUnsubscribe === 'function') {
      try {
        this._tcUnsubscribe();
      } catch (err) {
        console.error('Error clearing TC controller hooks:', err);
      }
    }
    this._tcUnsubscribe = null;
  }
  
  /**
   * Given an observation, return an action
   * @param {Object} obs - observation vector/object
   * @returns {Object} action - {turn, thrust, senseFrac}
   *   turn: float in [-1, 1] - left/right steering
   *   thrust: float in [0, 1] - speed multiplier
   *   senseFrac: float in [0, 1] - sensing effort (0=base, 1=max)
   */
  act(_obs) {
    return { turn: 0, thrust: 0, senseFrac: 0 };
  }
  
  /**
   * Optional: update internal state per step
   */
  update(_dt) {}
  
  /**
   * Optional: reset for new episode
   */
  reset() {
    this.clearTcHooks();
  }
}

// ========== Heuristic Controller ==========
// Wraps the existing hand-coded AI logic
// Note: In practice, you can just use useController=false to get heuristic behavior
// This class exists for compatibility and testing
export class HeuristicController extends Controller {
  constructor(bundle) {
    super();
    this.bundle = bundle;
  }
  
  act(obs) {
    // Simple heuristic policy derived from observation vector
    // This is a simplified version - the full heuristic uses updateHeuristicMovement()
    
    const bundle = this.bundle;
    const resource = obs.resource;
    
    if (!resource) {
      return { turn: 0, thrust: 0, senseFrac: 0 };
    }
    
    // Calculate desired direction toward resource
    const dx = resource.x - bundle.x;
    const dy = resource.y - bundle.y;
    const dist = Math.hypot(dx, dy);
    
    if (dist < 1) {
      return { turn: 0, thrust: 0, senseFrac: 0 };
    }
    
    // Desired angle
    const desiredAngle = Math.atan2(dy, dx);
    const currentAngle = bundle.heading || 0;
    
    // Angle difference
    let angleDiff = desiredAngle - currentAngle;
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    
    // Turn toward target
    const turn = Math.max(-1, Math.min(1, angleDiff / 0.5)); // scale for responsiveness
    
    // Full thrust if resource is visible
    const thrust = obs.resVisible ? 1.0 : 0.5;
    
    // Use extended sensing when frustrated or resource not visible
    const senseFrac = (bundle.frustration > 0.5 || !obs.resVisible) ? 1.0 : 0.0;
    
    return { turn, thrust, senseFrac };
  }
}

// ========== Linear Policy Controller ==========
// Simple learned policy: linear layer + activations
export class LinearPolicyController extends Controller {
  constructor(weights = null, observationDims = CONFIG.learning.observationDims) {
    super();
    this.obsDims = observationDims;
    this.actionDims = 3; // turn, thrust, senseFrac
    
    if (weights) {
      this.weights = weights;
    } else {
      // Initialize random small weights
      this.weights = {
        W: this.randomMatrix(this.actionDims, this.obsDims, 0.1),
        b: this.randomVector(this.actionDims, 0.0)
      };
    }
  }
  
  randomMatrix(rows, cols, scale) {
    const mat = [];
    for (let i = 0; i < rows; i++) {
      const row = [];
      for (let j = 0; j < cols; j++) {
        row.push((TcRandom.random() - 0.5) * 2 * scale);
      }
      mat.push(row);
    }
    return mat;
  }
  
  randomVector(dim, scale) {
    const vec = [];
    for (let i = 0; i < dim; i++) {
      vec.push((TcRandom.random() - 0.5) * 2 * scale);
    }
    return vec;
  }
  
  act(obs) {
    // obs should be a normalized vector [15 dimensions]
    const obsVec = obs.vector; // assume obs.vector is the array
    
    // Compute y = W * obs + b
    const y = [];
    for (let i = 0; i < this.actionDims; i++) {
      let sum = this.weights.b[i];
      for (let j = 0; j < this.obsDims; j++) {
        sum += this.weights.W[i][j] * obsVec[j];
      }
      y.push(sum);
    }
    
    // Apply activations
    const turn = Math.tanh(y[0]);          // tanh: [-1, 1]
    const thrust = 1 / (1 + Math.exp(-y[1])); // sigmoid: [0, 1]
    const senseFrac = 1 / (1 + Math.exp(-y[2])); // sigmoid: [0, 1]
    
    return { turn, thrust, senseFrac };
  }
  
  // Get flattened weights for CEM
  getWeightsFlat() {
    const flat = [];
    for (let i = 0; i < this.actionDims; i++) {
      for (let j = 0; j < this.obsDims; j++) {
        flat.push(this.weights.W[i][j]);
      }
    }
    for (let i = 0; i < this.actionDims; i++) {
      flat.push(this.weights.b[i]);
    }
    return flat;
  }
  
  // Set weights from flattened array
  setWeightsFlat(flat) {
    let idx = 0;
    this.weights.W = [];
    for (let i = 0; i < this.actionDims; i++) {
      const row = [];
      for (let j = 0; j < this.obsDims; j++) {
        row.push(flat[idx++]);
      }
      this.weights.W.push(row);
    }
    this.weights.b = [];
    for (let i = 0; i < this.actionDims; i++) {
      this.weights.b.push(flat[idx++]);
    }
  }
  
  // Clone this controller with same weights
  clone() {
    return new LinearPolicyController({
      W: this.weights.W.map(row => [...row]),
      b: [...this.weights.b]
    }, this.obsDims);
  }
}

