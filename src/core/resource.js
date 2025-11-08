import { CONFIG } from '../../config.js';
import { getResourceSpawnLocation } from '../../plantEcology.js';
import { getRule110SpawnInfo } from '../../tcResourceBridge.js';
import { TcRandom } from '../../tcStorage.js';

const defaultViewportWidth = () => (typeof innerWidth === 'number' ? innerWidth : 0);
const defaultViewportHeight = () => (typeof innerHeight === 'number' ? innerHeight : 0);

export function createResourceClass(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('context is required to create Resource class');
  }

  const {
    getGlobalTick,
    getCanvasWidth,
    getCanvasHeight,
    getFertilityField,
    getRule110Stepper,
    getTerrainHeight,
    getViewportWidth = defaultViewportWidth,
    getViewportHeight = defaultViewportHeight
  } = context;

  if (typeof getGlobalTick !== 'function') {
    throw new Error('getGlobalTick dependency is required');
  }
  if (typeof getCanvasWidth !== 'function') {
    throw new Error('getCanvasWidth dependency is required');
  }
  if (typeof getCanvasHeight !== 'function') {
    throw new Error('getCanvasHeight dependency is required');
  }

  const currentTick = () => getGlobalTick();
  const canvasWidth = () => getCanvasWidth();
  const canvasHeight = () => getCanvasHeight();
  const fertilityField = () => (typeof getFertilityField === 'function' ? getFertilityField() : null);
  const rule110Stepper = () => {
    if (typeof getRule110Stepper === 'function') {
      return getRule110Stepper();
    }
    if (typeof window !== 'undefined') {
      return window.rule110Stepper;
    }
    return null;
  };
  const terrainHeight = typeof getTerrainHeight === 'function' ? getTerrainHeight : null;
  const viewportWidth = () => {
    try {
      return getViewportWidth();
    } catch (err) {
      return defaultViewportWidth();
    }
  };
  const viewportHeight = () => {
    try {
      return getViewportHeight();
    } catch (err) {
      return defaultViewportHeight();
    }
  };

  return class Resource {
    constructor(x, y, r) {
      this.x = x;
      this.y = y;
      this.r = r;
      this.age = 0; // Ticks since spawn (for visualization)
      this.cooldownEnd = -1; // Tick when cooldown expires (-1 = not on cooldown)
      this.visible = true; // Whether resource is visible/collectable
      // Consumable scent parameters (per-resource)
      this.scentStrength = CONFIG.scentGradient.strength;
      this.scentRange = CONFIG.scentGradient.maxRange;
      this.tcData = null;
    }

    draw(ctx) {
      // Don't draw if on cooldown (invisible)
      if (!this.visible) return;

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);

      // Color based on local fertility if plant ecology enabled
      const field = fertilityField();
      if (CONFIG.plantEcology.enabled && field) {
        const fertility = field.sampleAt(this.x, this.y);
        const brightness = Math.floor(155 + fertility * 100);
        ctx.fillStyle = `rgb(0, ${brightness}, 88)`;
      } else {
        ctx.fillStyle = '#00ff88';
      }

      ctx.fill();

      // Optional: Show young resources with a glow (recently sprouted)
      if (CONFIG.plantEcology.enabled && this.age < 60) {
        ctx.save();
        ctx.strokeStyle = `rgba(0, 255, 136, ${1 - this.age / 60})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Subtle scent gradient indicator
      if (CONFIG.scentGradient.enabled && CONFIG.scentGradient.showSubtleIndicator) {
        const pulse = (Math.sin(currentTick() * 0.05) + 1) / 2; // 0..1

        ctx.save();
        ctx.strokeStyle = `rgba(0, 255, 136, ${0.1 + pulse * 0.2})`;
        ctx.lineWidth = 1;

        // Ring 1
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + 10 + pulse * 10, 0, Math.PI * 2);
        ctx.stroke();

        // Ring 2
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r + 30 + pulse * 20, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
      }
    }

    respawn() {
      // TC-Resource integration: spawn based on Rule 110 if enabled
      const stepper = rule110Stepper();
      if (CONFIG.tcResourceIntegration.enabled && stepper) {
        const spawnInfo = getRule110SpawnInfo(stepper, canvasWidth(), canvasHeight());
        this.x = spawnInfo.location.x;
        this.y = spawnInfo.location.y;
        this.tcData = spawnInfo.tcData; // Store TC metadata
      }
      // Use fertility-based spawning if plant ecology enabled
      else if (CONFIG.plantEcology.enabled) {
        const field = fertilityField();
        if (field) {
          const location = getResourceSpawnLocation(field, canvasWidth(), canvasHeight());
          this.x = location.x;
          this.y = location.y;
        }
      } else {
        // Fallback: random spawn
        const margin = 60;
        const width = Math.max(margin * 2, viewportWidth() || canvasWidth());
        const height = Math.max(margin * 2, viewportHeight() || canvasHeight());
        
        // Exclude config panel area (360px on right side when visible)
        const configPanelWidth = 360;
        const rightMargin = margin + configPanelWidth; // Extra margin for config panel
        
        this.x = margin + TcRandom.random() * (width - margin - rightMargin);
        this.y = margin + TcRandom.random() * (height - 2 * margin);
      }

      this.age = 0;
      this.visible = true;
      this.cooldownEnd = -1;
      // Reset scent gradient on respawn
      this.scentStrength = CONFIG.scentGradient.strength;
      this.scentRange = CONFIG.scentGradient.maxRange;
    }

    /**
     * Start cooldown after collection
     */
    startCooldown() {
      this.cooldownEnd = currentTick() + CONFIG.resourceRespawnCooldown;
      this.visible = false; // Hide resource during cooldown
    }

    /**
     * Check if cooldown has expired and respawn if ready
     */
    updateCooldown() {
      if (this.cooldownEnd > 0 && currentTick() >= this.cooldownEnd) {
        // Cooldown expired, respawn
        this.respawn();
        // Update Z position to terrain height if terrain enabled
        if (terrainHeight) {
          this.z = terrainHeight(this.x, this.y);
        }
      }
    }

    update(dt) {
      this.age++;
      this.updateCooldown();
    }
  };
}
