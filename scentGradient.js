// Scent Gradient System for Food Resources
// Resources emit "scent" that decreases with distance
// Provides gradient-based navigation and rewards

import { CONFIG } from './config.js';

/**
 * Calculate scent intensity at a point from a resource
 * Uses different falloff functions based on configuration
 * 
 * @param {number} distance - Distance from resource (pixels)
 * @param {object} config - CONFIG.scentGradient settings
 * @returns {number} - Scent intensity (0..1)
 */
export function calculateScentIntensity(distance, config = CONFIG.scentGradient) {
  if (!config.enabled || distance > config.maxRange) {
    return 0;
  }
  
  const normalizedDist = distance / config.maxRange; // 0..1
  let intensity = 0;
  
  switch (config.falloffType) {
    case 'linear':
      // Linear falloff: intensity = 1 - (d / maxRange)
      intensity = 1 - normalizedDist;
      break;
      
    case 'inverse': {
      // Inverse falloff: intensity = 1 / (1 + k*d)
      const k1 = 3.0 / config.maxRange; // tuning constant
      intensity = 1 / (1 + k1 * distance);
      break;
    }
      
    case 'inverse-square': {
      // Inverse-square falloff: intensity = 1 / (1 + k*d²)
      // Similar to physics (light, gravity, etc.)
      const k2 = 10.0 / (config.maxRange * config.maxRange);
      intensity = 1 / (1 + k2 * distance * distance);
      break;
    }
      
    case 'exponential': {
      // Exponential falloff: intensity = e^(-λd)
      const lambda = 3.0 / config.maxRange;
      intensity = Math.exp(-lambda * distance);
      break;
    }
      
    default:
      intensity = 1 - normalizedDist;
  }
  
  return Math.max(0, Math.min(1, intensity * config.strength));
}

/**
 * Get scent gradient vector at a point from all resources
 * Returns both the total scent intensity and direction to climb
 * 
 * @param {number} x - Query position x
 * @param {number} y - Query position y
 * @param {Array} resources - Array of Resource objects
 * @returns {object} - {intensity, gradientX, gradientY, nearestDist}
 */
export function getScentGradient(x, y, resources) {
  if (!CONFIG.scentGradient.enabled || !resources || resources.length === 0) {
    return { intensity: 0, gradientX: 0, gradientY: 0, nearestDist: Infinity };
  }
  
  let totalIntensity = 0;
  let gradientX = 0;
  let gradientY = 0;
  let nearestDist = Infinity;
  
  // Sample each resource's contribution
  for (const resource of resources) {
    // Skip depleted or invisible resources - they emit no signal
    if (resource.depleted || !resource.visible) continue;
    
    const dx = resource.x - x;
    const dy = resource.y - y;
    const dist = Math.hypot(dx, dy);
    
    if (dist < nearestDist) {
      nearestDist = dist;
    }
    
    // Use per-resource consumable strength/range when available
    const cfg = {
      ...CONFIG.scentGradient,
      maxRange: Math.max(CONFIG.scentGradient.minRange || 0, resource.scentRange || CONFIG.scentGradient.maxRange),
      strength: Math.max(CONFIG.scentGradient.minStrength || 0, resource.scentStrength || CONFIG.scentGradient.strength)
    };
    const intensity = calculateScentIntensity(dist, cfg);
    
    if (intensity > 0 && dist > 0) {
      totalIntensity += intensity;
      
      // Gradient points toward resource (uphill direction)
      // Weighted by intensity so stronger scents have more influence
      gradientX += (dx / dist) * intensity;
      gradientY += (dy / dist) * intensity;
    }
  }
  
  // Normalize gradient vector if non-zero
  const gradMag = Math.hypot(gradientX, gradientY);
  if (gradMag > 0) {
    gradientX /= gradMag;
    gradientY /= gradMag;
  }
  
  return { 
    intensity: totalIntensity, 
    gradientX, 
    gradientY, 
    nearestDist 
  };
}

/**
 * Calculate multi-scale food density sensing
 * Returns directional hints about where food is concentrated
 * 
 * @param {number} x - Agent position x
 * @param {number} y - Agent position y
 * @param {Array} resources - Array of Resource objects
 * @returns {object} - {near, mid, far, dirX, dirY}
 */
export function getFoodDensitySensing(x, y, resources) {
  const config = CONFIG.scentGradient;
  
  if (!config.densitySensingEnabled || !resources || resources.length === 0) {
    return { 
      near: 0, 
      mid: 0, 
      far: 0, 
      dirX: 0, 
      dirY: 0 
    };
  }
  
  let nearCount = 0;
  let midCount = 0;
  let farCount = 0;
  let weightedX = 0;
  let weightedY = 0;
  let totalWeight = 0;
  
  for (const resource of resources) {
    // Skip depleted or invisible resources - they don't count for density sensing
    if (resource.depleted || !resource.visible) continue;
    
    const dx = resource.x - x;
    const dy = resource.y - y;
    const dist = Math.hypot(dx, dy);
    
    // Count resources in each distance band
    if (dist <= config.densityRadiusNear) {
      nearCount++;
    }
    if (dist <= config.densityRadiusMid) {
      midCount++;
    }
    if (dist <= config.densityRadiusFar) {
      farCount++;
    }
    
    // Weight direction by inverse distance (closer = more influence)
    if (dist > 0 && dist <= config.densityRadiusFar) {
      const weight = 1 / (1 + dist / 100); // Falloff for weighting
      weightedX += (dx / dist) * weight;
      weightedY += (dy / dist) * weight;
      totalWeight += weight;
    }
  }
  
  // Normalize counts to [0, 1] based on max expected resources
  const maxResources = CONFIG.resourceStableMax || 4;
  const near = Math.min(1, nearCount / maxResources);
  const mid = Math.min(1, midCount / maxResources);
  const far = Math.min(1, farCount / maxResources);
  
  // Normalize direction vector
  let dirX = 0, dirY = 0;
  if (totalWeight > 0) {
    const dirMag = Math.hypot(weightedX, weightedY);
    if (dirMag > 0) {
      dirX = weightedX / dirMag;
      dirY = weightedY / dirMag;
    }
  }
  
  return { near, mid, far, dirX, dirY };
}

/**
 * Visualize scent gradient field (debug helper)
 * Draws gradient vectors on canvas
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array} resources - Array of Resource objects
 * @param {number} gridSize - Spacing between sample points
 */
export function visualizeScentGradient(ctx, resources, gridSize = 80) {
  if (!CONFIG.scentGradient.enabled) return;
  
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  
  ctx.save();
  ctx.strokeStyle = '#00ff88';
  ctx.lineWidth = 1;
  
  for (let x = gridSize / 2; x < w; x += gridSize) {
    for (let y = gridSize / 2; y < h; y += gridSize) {
      const scent = getScentGradient(x, y, resources);
      
      if (scent.intensity > 0.05) {
        // Draw vector showing gradient direction
        const arrowLen = 25; // Fixed length for all arrows
        const endX = x + scent.gradientX * arrowLen;
        const endY = y + scent.gradientY * arrowLen;

        // Set opacity based on intensity (stronger scent = more opaque)
        ctx.globalAlpha = Math.min(0.8, scent.intensity * 0.6);

        // Arrow body
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Arrow head
        const angle = Math.atan2(scent.gradientY, scent.gradientX);
        const headLen = 5;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - headLen * Math.cos(angle - Math.PI / 6),
          endY - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - headLen * Math.cos(angle + Math.PI / 6),
          endY - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }
    }
  }
  
  ctx.restore();
}

/**
 * Visualize scent intensity as heatmap
 * 
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array} resources - Array of Resource objects
 * @param {number} cellSize - Size of heatmap cells
 */
export function visualizeScentHeatmap(ctx, resources, cellSize = 40) {
  if (!CONFIG.scentGradient.enabled) return;
  
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  
  ctx.save();
  
  for (let x = 0; x < w; x += cellSize) {
    for (let y = 0; y < h; y += cellSize) {
      const scent = getScentGradient(x + cellSize/2, y + cellSize/2, resources);
      
      if (scent.intensity > 0.01) {
        // Color based on intensity (green gradient)
        const alpha = Math.min(0.3, scent.intensity * 0.5);
        ctx.fillStyle = `rgba(0, 255, 136, ${alpha})`;
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }
  
  ctx.restore();
}

