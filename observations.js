// Observation Vector Builder for Slime-Bundle Learning
// Constructs normalized obs vector from bundle state

import { CONFIG } from './config.js';
import { getScentGradient, getFoodDensitySensing } from './scentGradient.js';

/**
 * Build observation vector for a bundle
 * Returns both raw object and flat normalized vector
 * 
 * Observation components (29 dims total):
 * - χ state: [chi_norm, frustration, alive]  (3)
 * - Motion: [vx_norm, vy_norm]               (2)
 * - Walls: [nx, ny, edge_mag]                (3)
 * - Resource: [res_dx, res_dy, res_visible]  (3)
 * - Trails: [trail_mean, trail_max, tdir_x, tdir_y] (4)
 * - Scent Gradient: [intensity, grad_x, grad_y] (3) - NEW!
 * - Food Density: [near, mid, far, dens_dir_x, dens_dir_y] (5) - NEW!
 * - Signal Field: [sig_res, sig_distress, sig_bond, bias_res, bias_distress, bias_bond] (6) - NEW!
 */
export function buildObservation(bundle, resource, Trail, globalTick, resources = []) {
  const obs = {};
  
  // === χ State ===
  obs.chi = bundle.chi / 20;  // normalize to roughly [0, 1]
  obs.frustration = bundle.frustration || 0; // already [0, 1]
  obs.alive = bundle.alive ? 1 : 0;
  
  // === Motion ===
  // Get velocity from bundle (we'll need to track this)
  obs.vx = (bundle.vx || 0) / CONFIG.moveSpeedPxPerSec;
  obs.vy = (bundle.vy || 0) / CONFIG.moveSpeedPxPerSec;
  
  // === Walls (distance to edges) ===
  const edgeDist = getEdgeInfo(bundle);
  obs.wallNx = edgeDist.nx;
  obs.wallNy = edgeDist.ny;
  obs.wallMag = edgeDist.mag;
  
  // === Resource (within sensory range only) ===
  const resourceInfo = getResourceInfo(bundle, resource);
  obs.resDx = resourceInfo.dx;
  obs.resDy = resourceInfo.dy;
  obs.resVisible = resourceInfo.visible;
  
  // === Trail Sampling ===
  const trailInfo = sampleTrails(bundle, Trail);
  obs.trailMean = trailInfo.mean;
  obs.trailMax = trailInfo.max;
  obs.trailDirX = trailInfo.dirX;
  obs.trailDirY = trailInfo.dirY;
  
  // === Scent Gradient (NEW!) ===
  // Get scent gradient from all resources
  const scentInfo = getScentGradient(bundle.x, bundle.y, resources);
  obs.scentIntensity = scentInfo.intensity;
  obs.scentGradX = scentInfo.gradientX;
  obs.scentGradY = scentInfo.gradientY;
  
  // === Food Density Sensing (NEW!) ===
  // Multi-scale sensing of food distribution
  const densityInfo = getFoodDensitySensing(bundle.x, bundle.y, resources);
  obs.densityNear = densityInfo.near;
  obs.densityMid = densityInfo.mid;
  obs.densityFar = densityInfo.far;
  obs.densityDirX = densityInfo.dirX;
  obs.densityDirY = densityInfo.dirY;

  // === Signal Field perception ===
  const signalInfo = getSignalObservation(bundle);
  obs.signalResource = signalInfo.resourceAmp;
  obs.signalDistress = signalInfo.distressAmp;
  obs.signalBond = signalInfo.bondAmp;
  obs.signalBiasResource = signalInfo.resourceBias;
  obs.signalBiasDistress = signalInfo.distressBias;
  obs.signalBiasBond = signalInfo.bondConflict;

  // === Build flat vector ===
  obs.vector = [
    obs.chi,
    obs.frustration,
    obs.alive,
    obs.vx,
    obs.vy,
    obs.wallNx,
    obs.wallNy,
    obs.wallMag,
    obs.resDx,
    obs.resDy,
    obs.resVisible,
    obs.trailMean,
    obs.trailMax,
    obs.trailDirX,
    obs.trailDirY,
    obs.scentIntensity,
    obs.scentGradX,
    obs.scentGradY,
    obs.densityNear,
    obs.densityMid,
    obs.densityFar,
    obs.densityDirX,
    obs.densityDirY,
    obs.signalResource,
    obs.signalDistress,
    obs.signalBond,
    obs.signalBiasResource,
    obs.signalBiasDistress,
    obs.signalBiasBond
  ];
  
  // Store resource reference for heuristic controller
  obs.resource = resource;
  
  return obs;
}

/**
 * Calculate wall/edge proximity
 * Returns normal vector pointing away from nearest edge
 */
function getEdgeInfo(bundle) {
  const margin = 50; // activation distance from edge
  const x = bundle.x;
  const y = bundle.y;
  const w = typeof innerWidth !== 'undefined' ? innerWidth : 800;
  const h = typeof innerHeight !== 'undefined' ? innerHeight : 600;
  
  // Distance to each edge
  const dLeft = x;
  const dRight = w - x;
  const dTop = y;
  const dBottom = h - y;
  
  // Find nearest edge
  const dMin = Math.min(dLeft, dRight, dTop, dBottom);
  
  // If far from edges, return zero
  if (dMin > margin) {
    return { nx: 0, ny: 0, mag: 0 };
  }
  
  // Compute normal pointing inward
  let nx = 0, ny = 0;
  if (dMin === dLeft) nx = 1;
  else if (dMin === dRight) nx = -1;
  else if (dMin === dTop) ny = 1;
  else if (dMin === dBottom) ny = -1;
  
  // Magnitude: stronger when closer
  const mag = 1 - (dMin / margin);
  
  return { nx, ny, mag };
}

/**
 * Get resource direction info (only if visible within sensory range)
 */
function getResourceInfo(bundle, resource) {
  if (!resource) {
    return { dx: 0, dy: 0, visible: 0 };
  }
  
  const dx = resource.x - bundle.x;
  const dy = resource.y - bundle.y;
  const dist = Math.hypot(dx, dy);
  
  // Check if visible within current sensory range
  const range = bundle.currentSensoryRange || CONFIG.aiSensoryRangeBase;
  const visible = (dist <= range) ? 1 : 0;
  
  if (visible && dist > 0) {
    // Return unit vector toward resource
    return {
      dx: dx / dist,
      dy: dy / dist,
      visible: 1
    };
  }
  
  return { dx: 0, dy: 0, visible: 0 };
}

/**
 * Sample trails in multiple directions
 * Returns mean, max, and direction of strongest trail
 */
function sampleTrails(bundle, Trail) {
  const sampleDist = CONFIG.aiSampleDistance;
  const numSamples = 16;

  let sum = 0;
  let max = 0;
  let maxAngle = 0;
  
  for (let i = 0; i < numSamples; i++) {
    const angle = (i / numSamples) * Math.PI * 2;
    const sx = bundle.x + Math.cos(angle) * sampleDist;
    const sy = bundle.y + Math.sin(angle) * sampleDist;
    
    const { value, authorId, age } = Trail.sample(sx, sy);
    
    // Only consider trails from others that are old enough
    const valid = (authorId !== bundle.id && authorId !== 0 && 
                   age >= CONFIG.trailCooldownTicks);
    
    const v = valid ? value : 0;
    sum += v;
    
    if (v > max) {
      max = v;
      maxAngle = angle;
    }
  }
  
  const mean = sum / numSamples;
  
  // Direction of strongest trail as unit vector
  const dirX = max > 0 ? Math.cos(maxAngle) : 0;
  const dirY = max > 0 ? Math.sin(maxAngle) : 0;
  
  return { mean, max, dirX, dirY };
}

function getSignalObservation(bundle) {
  const channels = ['resource', 'distress', 'bond'];
  const amplitudes = {};
  for (const channel of channels) {
    let amp = 0;
    if (typeof bundle?.getSignalAverage === 'function') {
      amp = bundle.getSignalAverage(channel);
    } else if (bundle?.signal_memory?.[channel]?.values) {
      const mem = bundle.signal_memory[channel];
      const len = mem.values.length || 1;
      const sum = mem.values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
      amp = sum / len;
    }
    amplitudes[channel] = clamp01(amp);
  }

  const bias = bundle?.interpretation_bias || {};

  return {
    resourceAmp: amplitudes.resource || 0,
    distressAmp: amplitudes.distress || 0,
    bondAmp: amplitudes.bond || 0,
    resourceBias: clamp01(bias.resource),
    distressBias: clamp01(bias.distress),
    bondConflict: clamp01(bias.bond)
  };
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

