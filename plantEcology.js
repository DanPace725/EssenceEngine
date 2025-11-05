// Plant Ecology System - Soil Fertility & Resource Clustering
// Resources behave like plants: grow in fertile soil, spread seeds, deplete nutrients

import { CONFIG } from './config.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function resolveSpawnPressureConfig() {
  return CONFIG.plantEcology?.spawnPressure || null;
}

export function getSpawnPressureMultiplier(aliveCount, minMultiplier = 0) {
  const pressure = resolveSpawnPressureConfig();
  if (!pressure) return 1;

  const start = pressure.startAgents ?? 0;
  const maxAgents = pressure.maxAgents ?? start;
  const clampedMin = clamp(minMultiplier, 0, 1);

  if (aliveCount <= start || maxAgents <= start) {
    return 1;
  }

  const span = Math.max(1, maxAgents - start);
  const t = clamp((aliveCount - start) / span, 0, 1);
  return 1 - t * (1 - clampedMin);
}

/**
 * Fertility Grid - tracks soil quality across the world
 * Similar to trail grid but represents nutrient availability
 */
export class FertilityGrid {
  constructor(width, height) {
    this.cell = CONFIG.plantEcology.fertilityCell;
    this.w = Math.max(1, Math.floor(width / this.cell));
    this.h = Math.max(1, Math.floor(height / this.cell));
    const len = this.w * this.h;
    
    this.fertility = new Float32Array(len);
    this.lastHarvestTime = new Uint32Array(len); // Track when each cell was last harvested
    
    this.initialize();
  }
  
  /**
   * Initialize fertility with patches
   */
  initialize() {
    const config = CONFIG.plantEcology;
    
    // Base fertility with variation
    for (let i = 0; i < this.fertility.length; i++) {
      const variation = (Math.random() - 0.5) * 2 * config.fertilityVariation;
      this.fertility[i] = Math.max(0, Math.min(1, config.initialFertility + variation));
      this.lastHarvestTime[i] = 0;
    }
    
    // Create fertile patches (resource clusters)
    for (let p = 0; p < config.patchCount; p++) {
      const centerX = Math.random() * this.w;
      const centerY = Math.random() * this.h;
      const radius = config.patchRadius / this.cell;
      
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          const dx = x - centerX;
          const dy = y - centerY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < radius) {
            const i = this.index(x, y);
            // Gaussian falloff from patch center
            const strength = Math.exp(-(dist * dist) / (radius * radius * 0.5));
            this.fertility[i] = Math.min(1, this.fertility[i] + config.patchFertility * strength);
          }
        }
      }
    }
  }
  
  index(ix, iy) {
    return iy * this.w + ix;
  }
  
  inBounds(ix, iy) {
    return ix >= 0 && iy >= 0 && ix < this.w && iy < this.h;
  }
  
  /**
   * Sample fertility at world position
   */
  sampleAt(px, py) {
    const ix = Math.floor(px / this.cell);
    const iy = Math.floor(py / this.cell);
    if (!this.inBounds(ix, iy)) return 0;
    return this.fertility[this.index(ix, iy)];
  }
  
  /**
   * Deplete fertility around a harvest point
   */
  depleteAt(px, py, globalTick) {
    const config = CONFIG.plantEcology;
    const cx = Math.floor(px / this.cell);
    const cy = Math.floor(py / this.cell);
    const radius = Math.ceil(config.harvestRadius / this.cell);
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const ix = cx + dx;
        const iy = cy + dy;
        
        if (!this.inBounds(ix, iy)) continue;
        
        const dist = Math.sqrt(dx * dx + dy * dy) * this.cell;
        if (dist > config.harvestRadius) continue;
        
        const i = this.index(ix, iy);
        
        // Depletion strength falls off with distance
        const strength = 1 - (dist / config.harvestRadius);
        const depletion = config.harvestDepletion * strength;
        
        this.fertility[i] = Math.max(0, this.fertility[i] - depletion);
        this.lastHarvestTime[i] = globalTick;
      }
    }
  }
  
  /**
   * Add fertility in a radial area (for decay chi recycling)
   */
  addFertilityRadial(px, py, radius, amount) {
    const config = CONFIG.plantEcology;
    const cx = Math.floor(px / this.cell);
    const cy = Math.floor(py / this.cell);
    const cellRadius = Math.ceil(radius / this.cell);
    
    for (let dy = -cellRadius; dy <= cellRadius; dy++) {
      for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        const ix = cx + dx;
        const iy = cy + dy;
        
        if (!this.inBounds(ix, iy)) continue;
        
        const dist = Math.sqrt(dx * dx + dy * dy) * this.cell;
        if (dist > radius) continue;
        
        const i = this.index(ix, iy);
        
        // Boost strength falls off with distance (Gaussian)
        const strength = Math.exp(-(dist * dist) / (radius * radius * 0.5));
        const boost = amount * strength;
        
        this.fertility[i] = Math.min(config.maxFertility, this.fertility[i] + boost);
      }
    }
  }
  
  /**
   * Update fertility - recovery and population pressure
   */
  update(dt, populationSize, globalTick) {
    const config = CONFIG.plantEcology;
    
    // Natural recovery
    const recovery = config.fertilityRecovery * dt;
    
    // Population pressure (global degradation when overpopulated)
    let pressure = 0;
    if (config.populationPressure && populationSize > config.pressureThreshold) {
      const excess = populationSize - config.pressureThreshold;
      pressure = config.pressurePerAgent * excess * dt;
    }
    
    for (let i = 0; i < this.fertility.length; i++) {
      // Recovery (slower if recently harvested)
      const ticksSinceHarvest = globalTick - this.lastHarvestTime[i];
      const recoveryGrace = 120; // Ticks before full recovery kicks in
      const recoveryMult = Math.min(1, ticksSinceHarvest / recoveryGrace);
      
      this.fertility[i] = Math.min(
        config.maxFertility,
        this.fertility[i] + recovery * recoveryMult
      );
      
      // Population pressure
      this.fertility[i] = Math.max(0, this.fertility[i] - pressure);
    }
  }
  
  /**
   * Find good spawn location based on fertility
   * Biased toward fertile areas
   */
  findFertileSpawnLocation(margin = 60) {
    const width = this.w * this.cell;
    const height = this.h * this.cell;
    
    // Try multiple candidates, pick most fertile
    let bestX = margin + Math.random() * (width - 2 * margin);
    let bestY = margin + Math.random() * (height - 2 * margin);
    let bestFertility = this.sampleAt(bestX, bestY);
    
    for (let attempt = 0; attempt < 8; attempt++) {
      const x = margin + Math.random() * (width - 2 * margin);
      const y = margin + Math.random() * (height - 2 * margin);
      const fertility = this.sampleAt(x, y);
      
      if (fertility > bestFertility) {
        bestX = x;
        bestY = y;
        bestFertility = fertility;
      }
    }
    
    return { x: bestX, y: bestY, fertility: bestFertility };
  }
  
  /**
   * Resize grid (when window resizes)
   */
  resize(width, height) {
    const oldData = {
      w: this.w,
      h: this.h,
      fertility: new Float32Array(this.fertility),
    };
    
    this.w = Math.max(1, Math.floor(width / this.cell));
    this.h = Math.max(1, Math.floor(height / this.cell));
    const len = this.w * this.h;
    
    this.fertility = new Float32Array(len);
    this.lastHarvestTime = new Uint32Array(len);
    
    // Copy over old data (best effort)
    for (let y = 0; y < Math.min(this.h, oldData.h); y++) {
      for (let x = 0; x < Math.min(this.w, oldData.w); x++) {
        const oldI = y * oldData.w + x;
        const newI = this.index(x, y);
        this.fertility[newI] = oldData.fertility[oldI];
      }
    }
  }
  
  /**
   * Visualize fertility as heatmap overlay
   */
  draw(ctx) {
    if (!CONFIG.plantEcology.enabled) return;
    
    ctx.save();
    ctx.globalAlpha = 0.15; // Subtle overlay
    
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = this.index(x, y);
        const fertility = this.fertility[i];
        
        if (fertility > 0.1) {
          // Green gradient: darker = more fertile
          const intensity = Math.floor(fertility * 200);
          ctx.fillStyle = `rgb(0, ${intensity}, 0)`;
          ctx.fillRect(x * this.cell, y * this.cell, this.cell, this.cell);
        }
      }
    }
    
    ctx.restore();
  }
}

/**
 * Seed dispersal - resources can spawn near existing ones
 */
export function attemptSeedDispersal(resources, fertilityGrid, globalTick, dt, aliveCount = 0) {
  const config = CONFIG.plantEcology;
  if (!config.enabled || resources.length === 0) return null;

  // Random resource tries to spawn seed
  const parent = resources[Math.floor(Math.random() * resources.length)];

  // Check spawn chance
  const spawnPressure = resolveSpawnPressureConfig();
  const minSeedMultiplier = spawnPressure?.minSeedMultiplier ?? spawnPressure?.minResourceMultiplier ?? 1;
  const seedMultiplier = getSpawnPressureMultiplier(aliveCount, minSeedMultiplier);
  const seedChance = Math.min(1, config.seedChance * seedMultiplier * dt);
  if (Math.random() > seedChance) return null;
  
  // Find location near parent
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.random() * config.seedDistance;
  const x = parent.x + Math.cos(angle) * distance;
  const y = parent.y + Math.sin(angle) * distance;
  
  // Check if in bounds
  const margin = 60;
  const width = fertilityGrid.w * fertilityGrid.cell;
  const height = fertilityGrid.h * fertilityGrid.cell;
  
  if (x < margin || x > width - margin || y < margin || y > height - margin) {
    return null;
  }
  
  // Check fertility
  const fertility = fertilityGrid.sampleAt(x, y);
  if (fertility < config.growthFertilityThreshold) {
    return null; // Too infertile, seed doesn't take
  }
  
  // Success! Return spawn location
  return { x, y, fertility };
}

/**
 * Spontaneous growth - resources can appear in fertile soil
 */
export function attemptSpontaneousGrowth(fertilityGrid, dt, aliveCount = 0) {
  const config = CONFIG.plantEcology;
  if (!config.enabled) return null;

  // Check growth chance
  const spawnPressure = resolveSpawnPressureConfig();
  const minGrowthMultiplier = spawnPressure?.minGrowthMultiplier ?? spawnPressure?.minResourceMultiplier ?? 1;
  const growthMultiplier = getSpawnPressureMultiplier(aliveCount, minGrowthMultiplier);
  const growthChance = Math.min(1, config.growthChance * growthMultiplier * dt);
  if (Math.random() > growthChance) return null;
  
  // Find fertile location
  const location = fertilityGrid.findFertileSpawnLocation();
  
  // Check fertility threshold
  if (location.fertility < config.growthFertilityThreshold) {
    return null;
  }
  
  return location;
}

/**
 * Get resource spawn location using plant ecology
 * Falls back to random if plant ecology disabled
 */
export function getResourceSpawnLocation(fertilityGrid, width, height) {
  if (CONFIG.plantEcology.enabled && fertilityGrid) {
    return fertilityGrid.findFertileSpawnLocation();
  }
  
  // Fallback: random spawn
  const margin = 60;
  return {
    x: margin + Math.random() * (width - 2 * margin),
    y: margin + Math.random() * (height - 2 * margin),
    fertility: 0.5
  };
}

