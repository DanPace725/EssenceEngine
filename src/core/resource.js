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
    getViewportHeight = defaultViewportHeight,
    getResourcesContainer
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
  if (typeof getResourcesContainer !== 'function') {
    throw new Error('getResourcesContainer dependency is required');
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
      // Resource depletion/vitality system
      this.vitality = 1.0; // Resource health (1.0 = full, 0 = depleted)
      this.depleted = false; // Whether resource is too depleted to collect
      this.tcData = null;

      this.graphics = new PIXI.Graphics();
      const container = getResourcesContainer();
      if (container) {
        container.addChild(this.graphics);
      }
    }

    draw() {
        this.graphics.clear();
        this.graphics.visible = this.visible;

        if (!this.visible) {
            return;
        }

        this.graphics.x = this.x;
        this.graphics.y = this.y;

        // Color based on local fertility if plant ecology enabled
        const field = fertilityField();
        let color = 0x00ff88; // Default color (bright green)
        let fertility = 1.0;
        
        if (CONFIG.plantEcology.enabled && field) {
            fertility = field.sampleAt(this.x, this.y);
            // Smoother color gradation based on fertility
            const greenIntensity = Math.floor(155 + fertility * 100);
            const blueComponent = Math.floor(88 + fertility * 40);
            color = (greenIntensity << 8) | blueComponent;
        }

        // Modify color and appearance based on vitality/depletion
        if (this.vitality < 1.0) {
            // Fade from green to brown/gray as vitality decreases
            const vitalityRatio = Math.max(0, this.vitality);
            const green = Math.floor(155 * vitalityRatio + 50 * (1 - vitalityRatio));
            const red = Math.floor(120 * (1 - vitalityRatio));
            const blue = Math.floor(88 * vitalityRatio);
            color = (red << 16) | (green << 8) | blue;
            fertility = fertility * vitalityRatio; // Reduce glow when depleted
        }

        // Multi-layer rendering for smooth, glowing appearance
        
        // Outer glow layer (largest)
        const glowRadius = this.r * 1.6;
        const glowColor = 0x00ff88;
        const glowAlpha = 0.08 + fertility * 0.06;
        this.graphics.beginFill(glowColor, glowAlpha);
        this.graphics.drawCircle(0, 0, glowRadius);
        this.graphics.endFill();

        // Middle glow layer
        const midGlowRadius = this.r * 1.25;
        const midGlowAlpha = 0.15 + fertility * 0.1;
        this.graphics.beginFill(color, midGlowAlpha);
        this.graphics.drawCircle(0, 0, midGlowRadius);
        this.graphics.endFill();

        // Main body with smooth anti-aliased edge
        const bodyAlpha = 0.9;
        this.graphics.beginFill(color, bodyAlpha);
        this.graphics.lineStyle({ 
            width: 1.5, 
            color: 0xffffff, 
            alpha: 0.3,
            cap: PIXI.LINE_CAP.ROUND 
        });
        this.graphics.drawCircle(0, 0, this.r);
        this.graphics.endFill();

        // Inner highlight for depth
        const highlightColor = 0xffffff;
        const highlightRadius = this.r * 0.45;
        const highlightAlpha = 0.4;
        this.graphics.beginFill(highlightColor, highlightAlpha);
        this.graphics.drawCircle(this.r * -0.15, this.r * -0.15, highlightRadius);
        this.graphics.endFill();

        // Optional: Show young resources with a glow (recently sprouted)
        if (CONFIG.plantEcology.enabled && this.age < 60) {
            const spawnGlowAlpha = (1 - this.age / 60) * 0.5;
            const spawnGlowRadius = this.r + 4 + (1 - this.age / 60) * 3;
            this.graphics.lineStyle({ 
                width: 2.5, 
                color: 0x88ffcc, 
                alpha: spawnGlowAlpha,
                cap: PIXI.LINE_CAP.ROUND 
            });
            this.graphics.drawCircle(0, 0, spawnGlowRadius);
        }

        // Subtle scent gradient indicator - smoother animation
        if (CONFIG.scentGradient.enabled && CONFIG.scentGradient.showSubtleIndicator) {
            const tick = currentTick();
            const pulse = Math.sin(tick * 0.04) * 0.5 + 0.5; // Slower, smoother pulse
            const baseAlpha = 0.08;
            const pulseAlpha = baseAlpha + pulse * 0.12;

            // Outer ring with smooth fade
            const ring1Radius = this.r + 12 + pulse * 8;
            this.graphics.lineStyle({ 
                width: 1.2, 
                color: color, 
                alpha: pulseAlpha * 0.7,
                cap: PIXI.LINE_CAP.ROUND 
            });
            this.graphics.drawCircle(0, 0, ring1Radius);

            // Inner ring with offset phase
            const pulse2 = Math.sin(tick * 0.04 + Math.PI * 0.5) * 0.5 + 0.5;
            const ring2Radius = this.r + 25 + pulse2 * 12;
            const ring2Alpha = (baseAlpha + pulse2 * 0.1) * 0.5;
            this.graphics.lineStyle({ 
                width: 0.8, 
                color: glowColor, 
                alpha: ring2Alpha,
                cap: PIXI.LINE_CAP.ROUND 
            });
            this.graphics.drawCircle(0, 0, ring2Radius);
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
        console.log(`[Resource] TC spawn at (${this.x.toFixed(0)}, ${this.y.toFixed(0)}) | Canvas: ${canvasWidth()}x${canvasHeight()}`);
      }
      // Use fertility-based spawning if plant ecology enabled
      else if (CONFIG.plantEcology.enabled) {
        const field = fertilityField();
        if (field) {
          const cw = canvasWidth();
          const ch = canvasHeight();
          const location = getResourceSpawnLocation(field, cw, ch);
          this.x = location.x;
          this.y = location.y;
          console.log(`[Resource] Plant ecology spawn at (${this.x.toFixed(0)}, ${this.y.toFixed(0)}) | Canvas: ${cw}x${ch} | Fertility grid: ${field.w * field.cell}x${field.h * field.cell}`);
        }
      } else {
        // Fallback: random spawn
        // Note: canvasWidth() is already adjusted for UI panels by canvasManager
        const margin = 60;
        const width = canvasWidth();
        const height = canvasHeight();
        const spawnWidth = Math.max(0, width - 2 * margin);
        const spawnHeight = Math.max(0, height - 2 * margin);
        
        // Spawn within canvas bounds with margin
        this.x = margin + TcRandom.random() * spawnWidth;
        this.y = margin + TcRandom.random() * spawnHeight;
        console.log(`[Resource] Random spawn at (${this.x.toFixed(0)}, ${this.y.toFixed(0)}) | Canvas: ${width}x${height} | Spawn area: ${spawnWidth}x${spawnHeight} | Margin: ${margin}`);
      }

      this.age = 0;
      this.visible = true;
      this.cooldownEnd = -1;
      // Reset scent gradient on respawn
      this.scentStrength = CONFIG.scentGradient.strength;
      this.scentRange = CONFIG.scentGradient.maxRange;
      // Reset vitality on respawn
      this.vitality = 1.0;
      this.depleted = false;
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

    destroy() {
        this.graphics.destroy();
    }
  };
}
