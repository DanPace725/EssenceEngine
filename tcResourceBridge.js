// TC-Resource Bridge
// Links Rule 110 cellular automaton to resource spawning
// Creates a living computational environment

import { CONFIG } from './config.js';
import { TcRandom } from './tcStorage.js';

/**
 * Get current Rule 110 activity level (0..1)
 * Returns the fraction of active cells in the automaton
 */
export function getRule110Activity(stepper) {
  if (!stepper) return 0.5; // Default neutral activity
  
  try {
    const state = stepper.getState();
    if (!state || state.length === 0) return 0.5;
    
    let activeCount = 0;
    for (let i = 0; i < state.length; i++) {
      if (state[i] === 1) activeCount++;
    }
    
    return activeCount / state.length;
  } catch (err) {
    console.warn('Error reading Rule 110 activity:', err);
    return 0.5;
  }
}

/**
 * Get local activity around a cell position
 * @param {Uint8Array} state - Rule 110 state
 * @param {number} center - Center cell index
 * @param {number} radius - Radius to check
 * @returns {number} Local activity (0..1)
 */
function getLocalActivity(state, center, radius) {
  if (!state || state.length === 0) return 0.5;
  
  let count = 0;
  const localSize = 2 * radius + 1;
  
  for (let i = -radius; i <= radius; i++) {
    const idx = (center + i + state.length) % state.length; // Wrap around
    if (state[idx] === 1) count++;
  }
  
  return count / localSize;
}

/**
 * Get spawn location based on Rule 110 state (spatial mapping)
 * @param {Object} stepper - Rule 110 stepper instance
 * @param {number} canvasWidth - World width
 * @param {number} canvasHeight - World height
 * @returns {Object} {x, y, tcData} spawn location with TC metadata
 */
export function getRule110SpawnLocation(stepper, canvasWidth, canvasHeight) {
  const config = CONFIG.tcResourceIntegration;
  
  if (!stepper || !config.spatialMapping) {
    // Fallback to random
    const margin = 60;
    const configPanelWidth = 360;
    const rightMargin = margin + configPanelWidth;
    return {
      x: margin + TcRandom.random() * (canvasWidth - margin - rightMargin),
      y: margin + TcRandom.random() * (canvasHeight - 2 * margin),
      tcData: { source: 'random', activity: 0 }
    };
  }
  
  try {
    const state = stepper.getState();
    if (!state || state.length === 0) {
      throw new Error('Invalid Rule 110 state');
    }
    
    // Find all active cells
    const activeCells = [];
    for (let i = 0; i < state.length; i++) {
      if (state[i] === 1) {
        activeCells.push(i);
      }
    }
    
    // If no active cells, spawn at center with low randomness
    if (activeCells.length === 0) {
      const x = canvasWidth * (0.3 + TcRandom.random() * 0.4);
      const y = canvasHeight * (0.3 + TcRandom.random() * 0.4);
      return {
        x, y,
        tcData: { source: 'tc_empty', activity: 0, cellIndex: -1 }
      };
    }
    
    // Pick a random active cell
    const cellIndex = activeCells[Math.floor(TcRandom.random() * activeCells.length)];
    
    // Map to X coordinate
    const x = (cellIndex / state.length) * canvasWidth;
    
    // Get local activity for Y positioning
    const localActivity = getLocalActivity(state, cellIndex, config.localityRadius);
    
    // Y position varies based on local activity and configured spread
    const verticalSpread = config.verticalSpread || 0.3;
    const yCenterBias = 0.5; // Center of screen
    const yVariation = (TcRandom.random() - 0.5) * verticalSpread * localActivity;
    const y = canvasHeight * (yCenterBias + yVariation);
    
    // Clamp to margins
    const margin = 60;
    const clampedX = Math.max(margin, Math.min(canvasWidth - margin, x));
    const clampedY = Math.max(margin, Math.min(canvasHeight - margin, y));
    
    return {
      x: clampedX,
      y: clampedY,
      tcData: {
        source: 'tc_spatial',
        activity: localActivity,
        cellIndex: cellIndex,
        globalActivity: getRule110Activity(stepper)
      }
    };
  } catch (err) {
    console.warn('Error in Rule 110 spatial mapping:', err);
    const margin = 60;
    return {
      x: margin + TcRandom.random() * (canvasWidth - 2 * margin),
      y: margin + TcRandom.random() * (canvasHeight - 2 * margin),
      tcData: { source: 'fallback', activity: 0 }
    };
  }
}

/**
 * Get spawn rate multiplier based on Rule 110 activity
 * @param {Object} stepper - Rule 110 stepper instance
 * @returns {number} Multiplier for spawn rate (0.5..1.5 typically)
 */
export function getRule110SpawnMultiplier(stepper) {
  const config = CONFIG.tcResourceIntegration;
  
  if (!stepper || !config.enabled) {
    return 1.0; // No modulation
  }
  
  const activity = getRule110Activity(stepper);
  const influence = config.activityInfluence || 0.5;
  const minMult = config.minSpawnMultiplier || 0.5;
  const maxMult = config.maxSpawnMultiplier || 1.5;
  
  // Blend between min and max based on activity
  const activityMult = minMult + activity * (maxMult - minMult);
  
  // Blend with neutral (1.0) based on influence setting
  const finalMult = 1.0 + influence * (activityMult - 1.0);
  
  return finalMult;
}

/**
 * Get integrated spawn location and rate info
 * Combines spatial and activity modes
 */
export function getRule110SpawnInfo(stepper, canvasWidth, canvasHeight) {
  const config = CONFIG.tcResourceIntegration;
  
  if (!config.enabled || !stepper) {
    return {
      location: {
        x: 60 + TcRandom.random() * (canvasWidth - 120),
        y: 60 + TcRandom.random() * (canvasHeight - 120)
      },
      rateMultiplier: 1.0,
      tcData: { source: 'disabled' }
    };
  }
  
  const mode = config.mode || 'hybrid';
  
  if (mode === 'spatial') {
    const spawnLoc = getRule110SpawnLocation(stepper, canvasWidth, canvasHeight);
    return {
      location: { x: spawnLoc.x, y: spawnLoc.y },
      rateMultiplier: 1.0,
      tcData: spawnLoc.tcData
    };
  }
  
  if (mode === 'activity') {
    const margin = 60;
    return {
      location: {
        x: margin + TcRandom.random() * (canvasWidth - 2 * margin),
        y: margin + TcRandom.random() * (canvasHeight - 2 * margin)
      },
      rateMultiplier: getRule110SpawnMultiplier(stepper),
      tcData: {
        source: 'tc_activity',
        globalActivity: getRule110Activity(stepper)
      }
    };
  }
  
  // Hybrid mode (default)
  const spawnLoc = getRule110SpawnLocation(stepper, canvasWidth, canvasHeight);
  return {
    location: { x: spawnLoc.x, y: spawnLoc.y },
    rateMultiplier: getRule110SpawnMultiplier(stepper),
    tcData: spawnLoc.tcData
  };
}

/**
 * Draw Rule 110 overlay on canvas
 * Shows the cellular automaton state visually
 */
export function drawRule110Overlay(ctx, stepper, canvasWidth, canvasHeight) {
  const config = CONFIG.tcResourceIntegration;
  
  // Early return checks
  if (!config) {
    console.warn('TC-Resource config not found');
    return;
  }
  if (!config.showOverlay) {
    return; // Silently return if overlay disabled
  }
  if (!stepper) {
    console.warn('TC-Resource: No stepper provided to overlay');
    return;
  }
  
  try {
    const state = stepper.getState();
    if (!state || state.length === 0) return;
    
    const height = config.overlayHeight || 40;
    const opacity = config.overlayOpacity || 0.15;
    const position = config.overlayPosition || 'top';
    
    const y = position === 'top' ? 0 : canvasHeight - height;
    const cellWidth = canvasWidth / state.length;
    
    ctx.save();
    
    // Draw background bar
    ctx.fillStyle = `rgba(0, 0, 0, ${opacity * 2})`;
    ctx.fillRect(0, y, canvasWidth, height);
    
    // Draw cells
    for (let i = 0; i < state.length; i++) {
      if (state[i] === 1) {
        const x = i * cellWidth;
        ctx.fillStyle = `rgba(0, 255, 136, ${opacity * 3})`;
        ctx.fillRect(x, y, cellWidth + 1, height); // +1 to avoid gaps
      }
    }
    
    // Draw activity indicator bar and label
    const activity = getRule110Activity(stepper);
    const labelText = `Rule 110: ${(activity * 100).toFixed(1)}% active`;
    ctx.font = '11px monospace';
    const labelWidth = ctx.measureText(labelText).width;
    
    const barWidth = 180;
    const barHeight = 10;
    const padding = 10;
    const labelHeight = 12;  // Space for text below
    
    // Position bar on right side, with room for label below
    const barX = canvasWidth - barWidth - padding;
    const barY = position === 'top' ? y + 5 : y + height - barHeight - labelHeight - 10;
    
    // Draw bar background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    
    // Draw activity fill
    ctx.fillStyle = `rgba(0, 255, 136, ${0.5 + activity * 0.5})`;
    ctx.fillRect(barX, barY, barWidth * activity, barHeight);
    
    // Draw label BELOW the bar (not overlapping with cells)
    ctx.fillStyle = 'rgba(0, 255, 136, 0.9)';
    ctx.fillText(labelText, barX, barY + barHeight + labelHeight);
    
    ctx.restore();
  } catch (err) {
    console.warn('Error drawing Rule 110 overlay:', err);
  }
}

/**
 * Console logging helper for TC-resource events
 */
export function logTcResourceEvent(type, data) {
  if (!CONFIG.tcResourceIntegration.enabled) return;
  
  const prefix = '🔬 [TC→Resource]';
  switch (type) {
    case 'spawn':
      console.log(`${prefix} Spawn at (${data.x.toFixed(0)}, ${data.y.toFixed(0)}) ` +
                  `from ${data.tcData?.source || 'unknown'} ` +
                  `(activity: ${(data.tcData?.activity || 0).toFixed(2)})`);
      break;
    case 'activity_change':
      console.log(`${prefix} Activity: ${(data.activity * 100).toFixed(1)}% ` +
                  `(multiplier: ${data.multiplier.toFixed(2)}x)`);
      break;
    default:
      console.log(`${prefix} ${type}:`, data);
  }
}

/**
 * Toggle overlay visibility (helper for console)
 */
export function toggleOverlay(enabled) {
  if (enabled === undefined) {
    enabled = !CONFIG.tcResourceIntegration.showOverlay;
  }
  CONFIG.tcResourceIntegration.showOverlay = enabled;
  console.log(`🎨 TC-Resource overlay ${enabled ? 'enabled' : 'disabled'}`);
  return enabled;
}

// Make available globally
if (typeof window !== 'undefined') {
  window.toggleTcOverlay = toggleOverlay;
}

