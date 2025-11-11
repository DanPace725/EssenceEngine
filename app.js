// Essence Engine v0.6 — Learning system with plant ecology
// Controls: [WASD/Arrows]=move (Agent 1 when MANUAL) | [A]=auto toggle | [S]=toggle extended sensing
// [G]=scent gradient viz | [P]=fertility viz | [M]=mitosis toggle | [Space]=pause [R]=reset [C]=+5χ all
// [T]=trail on/off [X]=clear trail [F]=diffusion on/off | [1-4]=toggle individual agents | [V]=toggle all | [L]=training UI
// [Y]=adaptive heuristics | [U]=cycle HUD (full/minimal/hidden) | [K]=toggle hotkey strip | [O]=config panel

import { PIXI } from './lib/pixi.js';

// ========================================================================
// 📋 INITIALIZATION ORDER REQUIREMENTS FOR AI AGENTS
// ========================================================================
// This file has a STRICT initialization order that must be maintained:
// 1. Imports
// 2. Canvas & helper setup
// 3. Trail, Links, Ledger systems
// 4. Bundle & Resource classes (they reference World via getWorld callback)
// 5. ⚠️  World creation (line ~521)
// 6. ⚠️  trainingModule creation (line ~546) - REQUIRES World to exist
// 7. Simulation loop setup
//
// CRITICAL: Do NOT create trainingModule before World exists!
// CRITICAL: Do NOT move World creation after trainingModule!
// ========================================================================

import { CONFIG } from './config.js';
import { SignalField } from './signalField.js';
import { EpisodeManager, updateFindTimeEMA, calculateAdaptiveReward } from './rewards.js';
import { buildObservation } from './observations.js';
import { CEMLearner, TrainingManager } from './learner.js';
import { TrainingUI, AdaptiveHeuristicsUI } from './trainingUI.js';
import { visualizeScentGradient } from './scentGradient.js';
import { FertilityGrid, attemptSeedDispersal, attemptSpontaneousGrowth, getSpawnPressureMultiplier } from './plantEcology.js';
import { SignalResponseAnalytics } from './analysis/signalResponseAnalytics.js';
import { TcScheduler } from './tcStorage.js';
import { drawRule110Overlay } from './tcResourceBridge.js';
import { createBundleClass } from './src/core/bundle.js';
import { createResourceClass } from './src/core/resource.js';
import { createWorld } from './src/core/world.js';
import { initializeCanvasManager } from './src/ui/canvasManager.js';
import { initializeInputManager } from './src/ui/inputManager.js';
import ParticipationManager from './src/systems/participation.js';
import { startSimulation } from './src/core/simulationLoop.js';
import { createTrainingModule } from './src/core/training.js';
import { collectResource } from './src/systems/resourceSystem.js';
import { MetricsTracker } from './src/core/metricsTracker.js';
import { 
  SIGNAL_CHANNELS,
  SIGNAL_MEMORY_LENGTH,
  SIGNAL_DISTRESS_NOISE_GAIN,
  SIGNAL_RESOURCE_PULL_GAIN, 
  SIGNAL_BOND_CONFLICT_DAMP
} from './app/constants.js';

const getTerrainHeight = null;
const loadedPolicyInfo = null;

// Declare trainingModule early to avoid initialization order issues
let trainingModule = null;

(() => {
    const canvas = document.getElementById("view");
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });

    // ---------- PixiJS Integration ----------
    // IMPORTANT: Get stable dimensions for high-DPI displays (Surface laptops, etc.)
    // Wait for layout to settle before reading window dimensions
    let actualWidth = window.innerWidth;
    let actualHeight = window.innerHeight;
    const actualDPR = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    
    // On high-DPI displays, force a synchronous reflow to ensure dimensions are accurate
    if (actualDPR > 1) {
        // Force layout calculation by reading offsetWidth/Height
        actualWidth = document.documentElement.clientWidth || window.innerWidth;
        actualHeight = document.documentElement.clientHeight || window.innerHeight;
    }
    
    const pixiApp = new PIXI.Application({
        width: actualWidth,
        height: actualHeight,
        backgroundAlpha: 0,
        resolution: actualDPR,
        autoDensity: true,
        autoStart: false,
        antialias: true,  // Enable anti-aliasing for smooth edges
        powerPreference: 'high-performance'
    });
    const resourcesContainer = new PIXI.Container();
    resourcesContainer.sortableChildren = true;
    pixiApp.stage.addChild(resourcesContainer);
    const agentTrailsContainer = new PIXI.Container();
    agentTrailsContainer.sortableChildren = true;
    pixiApp.stage.addChild(agentTrailsContainer);
    const agentsContainer = new PIXI.Container();
    agentsContainer.sortableChildren = true;
    pixiApp.stage.addChild(agentsContainer);
    window.pixiApp = pixiApp; // For debugging
    window.resourcesContainer = resourcesContainer; // For debugging
    window.agentsContainer = agentsContainer; // For debugging
    window.agentTrailsContainer = agentTrailsContainer; // For debugging
  
    // ---------- DPR-aware sizing ----------
    let dpr = actualDPR; // Use the stable DPR we calculated above
    let canvasWidth = actualWidth;
    let canvasHeight = actualHeight;

    const getAvailableSize = () => {
      const configPanel = document.getElementById("config-panel");
      const panelOpen = configPanel && configPanel.style.display !== "none";
      const panelWidth = panelOpen ? 360 : 0; // Config panel width

      // Use stable dimension calculation for high-DPI displays
      // Prefer clientWidth/Height as they're more reliable on scaled displays
      const dprCheck = window.devicePixelRatio || 1;
      const width = dprCheck > 1
        ? (document.documentElement.clientWidth || window.innerWidth)
        : window.innerWidth;
      const height = dprCheck > 1
        ? (document.documentElement.clientHeight || window.innerHeight)
        : window.innerHeight;

      const headerHeight = 40; // Account for header height
      const hotkeyStripHeight = 35; // Account for hotkey strip height

      return {
        width: width - panelWidth,
        height: height - headerHeight - hotkeyStripHeight,
        panelWidth: panelWidth,
        topReserve: headerHeight
      };
    };
    
    const canvasManager = initializeCanvasManager({
      canvas,
      ctx,
      getAvailableSize
    });

    const updateCanvasState = ({ width, height, dpr: nextDpr }) => {
      canvasWidth = width;
      canvasHeight = height;
      dpr = nextDpr;
    };

    updateCanvasState(canvasManager.getState());
    canvasManager.onResize(updateCanvasState);

    // Expose resize function globally so config panel can trigger it
    window.resizeCanvas = canvasManager.resizeCanvas;

    // ---------- Helpers ----------
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // ---------- Mouse Tracking for Resource Tooltips ----------
    const mousePos = { x: 0, y: 0, hoveredResource: null };
    
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      mousePos.x = (e.clientX - rect.left) * (canvas.width / rect.width);
      mousePos.y = (e.clientY - rect.top) * (canvas.height / rect.height);
      
      // Check if mouse is over any resource
      mousePos.hoveredResource = null;
      const hoverRadius = 30; // Detection radius for hover
      
      const resources = World?.resources ?? [];
      for (const res of resources) {
        const dx = mousePos.x - res.x;
        const dy = mousePos.y - res.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist <= res.r + hoverRadius) {
          mousePos.hoveredResource = res;
          break;
        }
      }
    });
    
    canvas.addEventListener('mouseleave', () => {
      mousePos.hoveredResource = null;
    });

    // ---------- Resource Tooltip Drawer ----------
    function drawResourceTooltip(ctx, resource) {
      const padding = 8;
      const lineHeight = 16;
      const fontSize = 12;
      
      // Prepare tooltip text
      const lines = [
        `Resource #${World.resources.indexOf(resource) + 1}`,
        `Position: (${Math.round(resource.x)}, ${Math.round(resource.y)})`,
        `Radius: ${resource.r}px`,
        `Age: ${resource.age} ticks`,
        `Visible: ${resource.visible}`,
        `─────────────────────`,
        `Vitality: ${(resource.vitality || 0).toFixed(3)}`,
        `Status: ${resource.depleted ? 'DEPLETED' : 'Available'}`,
        `Depletion Threshold: ${CONFIG.scentGradient.depletionThreshold}`,
        `─────────────────────`,
        `Scent Strength: ${(resource.scentStrength || 0).toFixed(3)}`,
        `Scent Range: ${Math.round(resource.scentRange || 0)}px`,
        `Base Strength: ${CONFIG.scentGradient.strength}`,
        `Min Strength: ${CONFIG.scentGradient.minStrength}`,
        `Consumable: ${CONFIG.scentGradient.consumable ? 'Yes' : 'No'}`
      ];
      
      // Calculate tooltip dimensions
      ctx.save();
      ctx.font = `${fontSize}px ui-mono, monospace`;
      const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
      const tooltipWidth = maxWidth + padding * 2;
      const tooltipHeight = lines.length * lineHeight + padding * 2;
      
      // Position tooltip near resource but keep on screen
      let tooltipX = resource.x + 40;
      let tooltipY = resource.y - tooltipHeight / 2;
      
      // Keep tooltip on screen
      if (tooltipX + tooltipWidth > canvas.width - 10) {
        tooltipX = resource.x - tooltipWidth - 40;
      }
      if (tooltipY < 10) tooltipY = 10;
      if (tooltipY + tooltipHeight > canvas.height - 10) {
        tooltipY = canvas.height - tooltipHeight - 10;
      }
      
      // Draw tooltip background
      ctx.fillStyle = 'rgba(12, 12, 16, 0.95)';
      ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
      
      // Draw border - red if depleted, green if available
      if (resource.depleted) {
        ctx.strokeStyle = '#ff4444';
      } else {
        ctx.strokeStyle = CONFIG.scentGradient.consumable ? '#00ff88' : '#888';
      }
      ctx.lineWidth = 2;
      ctx.strokeRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
      
      // Draw text
      ctx.fillStyle = '#e6f3ec';
      ctx.textBaseline = 'top';
      lines.forEach((line, i) => {
        // Color-code important values
        if (line.includes('Vitality:')) {
          const vitality = resource.vitality || 0;
          const threshold = CONFIG.scentGradient.depletionThreshold;
          
          // Color from red (depleted) to yellow to green (full)
          if (vitality <= threshold) {
            // Red when depleted
            ctx.fillStyle = '#ff4444';
          } else if (vitality < 0.6) {
            // Yellow transitioning
            const r = 255;
            const g = Math.round(140 + (vitality - threshold) * 200);
            ctx.fillStyle = `rgb(${r}, ${g}, 0)`;
          } else {
            // Green when healthy
            const g = Math.round(155 + vitality * 100);
            ctx.fillStyle = `rgb(0, ${g}, 88)`;
          }
        } else if (line.includes('Status:')) {
          // Red if depleted, green if available
          ctx.fillStyle = resource.depleted ? '#ff4444' : '#00ff88';
        } else if (line.includes('Scent Strength:')) {
          const strength = resource.scentStrength || 0;
          const minStrength = CONFIG.scentGradient.minStrength;
          const baseStrength = CONFIG.scentGradient.strength;
          const ratio = (strength - minStrength) / (baseStrength - minStrength);
          
          // Color from red (depleted) to green (full)
          const r = Math.round(255 * (1 - ratio));
          const g = Math.round(255 * ratio);
          ctx.fillStyle = `rgb(${r}, ${g}, 0)`;
        } else if (line.includes('───')) {
          ctx.fillStyle = '#666';
        } else {
          ctx.fillStyle = '#e6f3ec';
        }
        
        ctx.fillText(line, tooltipX + padding, tooltipY + padding + i * lineHeight);
      });
      
      // Draw connector line from resource to tooltip
      ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(resource.x, resource.y);
      ctx.lineTo(tooltipX, tooltipY + tooltipHeight / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.restore();
    }
    const normalizeRewardSignal = (rewardChi) => {
      if (!Number.isFinite(rewardChi)) return 0;
      const base = Math.max(CONFIG.rewardChi || rewardChi || 0, 1e-6);
      return clamp(rewardChi / base, 0, 1);
    };
    const getSignalConfig = () => CONFIG.signal || {};
    const getSignalSensitivity = (channel) => {
      const cfg = getSignalConfig();
      return cfg?.sensitivity?.[channel] ?? 1;
    };
    const getSignalDecayRate = (channel) => {
      const cfg = getSignalConfig();
      return clamp(cfg?.decay?.[channel] ?? 0.08, 0, 1);
    };
    const getSignalWeight = (channel) => {
      const cfg = getSignalConfig();
      const value = cfg?.channelWeights?.[channel];
      return Number.isFinite(value) ? value : 1;
    };
    const getSignalActivationThreshold = () => {
      const cfg = getSignalConfig();
      const value = cfg?.activationThreshold;
      return clamp(Number.isFinite(value) ? value : 0.05, 0, 1);
    };
    const getParticipationConfig = () => CONFIG.participation || {};
    const getParticipationModeConfig = (mode) => {
      const participation = getParticipationConfig();
      if (!mode) return participation;
      return participation?.modes?.[mode] || null;
    };
    const isParticipationEnabled = () => !!getParticipationConfig().enabled;

    const participationLogger = () => (CONFIG?.participation?.debugLog && typeof console !== 'undefined') ? console : null;

    const applyChiDelta = ({ bundle, delta, reason = 'participation-energy' }) => {
      if (!bundle || !Number.isFinite(delta) || delta === 0) {
        return 0;
      }

      const current = Number.isFinite(bundle.chi) ? bundle.chi : 0;
      const minChi = 0;
      const maxChi = Number.isFinite(CONFIG?.maxChi) ? CONFIG.maxChi : Infinity;
      const next = Math.min(maxChi, Math.max(minChi, current + delta));
      const applied = next - current;

      if (applied === 0) {
        return 0;
      }

      bundle.chi = next;

      const logger = participationLogger();
      if (logger && typeof logger.debug === 'function') {
        logger.debug(
          `[Participation][Energy] ${reason}: agent ${bundle.id} Δχ=${applied.toFixed(3)} (requested ${delta.toFixed(3)})`
        );
      }

      return applied;
    };

    const isEnergyParticipationActive = () => {
      if (!isParticipationEnabled()) return false;
      if (!ParticipationManager || typeof ParticipationManager.sampleEnergy !== 'function') return false;
      const state = ParticipationManager.state || {};
      if (!state.isActive) return false;
      return state.mode === 'energy';
    };

    const applyParticipationEnergy = (bundle) => {
      if (!bundle || !bundle.alive) return 0;
      if (!isEnergyParticipationActive()) return 0;

      const delta = ParticipationManager.sampleEnergy(bundle);
      if (!Number.isFinite(delta) || Math.abs(delta) <= 1e-6) {
        return 0;
      }

      const applied = applyChiDelta({ bundle, delta, reason: 'participation-energy' });
      if (applied !== 0 && ParticipationManager && typeof ParticipationManager.registerEnergyPulse === 'function') {
        try {
          ParticipationManager.registerEnergyPulse({ bundle, delta: applied });
        } catch (error) {
          if (CONFIG?.participation?.debugLog && typeof console !== 'undefined' && console.debug) {
            console.debug('[Participation] energy pulse error:', error);
          }
        }
      }
      return applied;
    };

    const resetParticipationEnergy = ({
      clearFields = false,
      reason = 'reset',
      clearEvents = true,
      clearSummary = true
    } = {}) => {
      if (!ParticipationManager) return;
      if (typeof ParticipationManager.resetState === 'function') {
        ParticipationManager.resetState({
          reason,
          clearEvents,
          clearSummary,
          resetMode: true,
          resetCursor: true
        });
      } else {
        if (typeof ParticipationManager.setActive === 'function') {
          ParticipationManager.setActive(false);
        }
        if (clearFields && typeof ParticipationManager.clearActiveFieldEntries === 'function') {
          ParticipationManager.clearActiveFieldEntries();
        }
        if (typeof ParticipationManager.resetTimers === 'function') {
          ParticipationManager.resetTimers();
        }
      }
      if (typeof updateParticipationStatusUI === 'function') {
        updateParticipationStatusUI();
      }
    };

    ParticipationManager.setConfig(getParticipationConfig);

    const updateParticipationStatusUI = (stateSnapshot = null) => {
      if (typeof window === 'undefined') {
        return;
      }
      const updater = window.updateParticipationStatusDisplay;
      if (typeof updater !== 'function') {
        return;
      }
      try {
        updater(stateSnapshot || ParticipationManager?.state || {});
      } catch (error) {
        if (CONFIG?.participation?.debugLog && typeof console !== 'undefined' && console.debug) {
          console.debug('[Participation] status UI update failed:', error);
        }
      }
    };

    ParticipationManager.setEmitters({
      onUpdate: (state) => {
        updateParticipationStatusUI(state);
      }
    });

    if (typeof window !== 'undefined') {
      window.CONFIG = CONFIG;
      window.participationConfig = {
        getConfig: getParticipationConfig,
        getModeConfig: getParticipationModeConfig,
        isEnabled: isParticipationEnabled
      };
      window.ParticipationManager = ParticipationManager;
      updateParticipationStatusUI();
    }

    // Generate color for agent based on ID (supports unlimited agents)
    const hslToRgb = (hue, saturation, lightness) => {
      const s = saturation;
      const l = lightness;

      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
      const m = l - c / 2;

      let r, g, b;
      if (hue < 60) { r = c; g = x; b = 0; }
      else if (hue < 120) { r = x; g = c; b = 0; }
      else if (hue < 180) { r = 0; g = c; b = x; }
      else if (hue < 240) { r = 0; g = x; b = c; }
      else if (hue < 300) { r = x; g = 0; b = c; }
      else { r = c; g = 0; b = x; }

      return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
      };
    };

    const rgbToHexString = ({ r, g, b }) => `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

    const getAgentColor = (id, alive = true) => {
      // First 4 agents use classic colors for consistency
      const classicColors = {
        1: { alive: "#00ffff", dead: "#005555" },  // cyan
        2: { alive: "#ff00ff", dead: "#550055" },  // magenta
        3: { alive: "#ffff00", dead: "#555500" },  // yellow
        4: { alive: "#ff8800", dead: "#553300" },  // orange
      };

      if (id <= 4 && classicColors[id]) {
        return alive ? classicColors[id].alive : classicColors[id].dead;
      }

      // For agents beyond 4, use HSL with varying hue converted to hex
      const hue = ((id - 1) * 137.5) % 360; // Golden angle for good distribution
      const saturation = alive ? 1.0 : 0.3;
      const lightness = alive ? 0.5 : 0.2;
      const rgb = hslToRgb(hue, saturation, lightness);
      return rgbToHexString(rgb);
    };

    // Get RGB values for trail rendering
    const getAgentColorRGB = (id) => {
      // First 4 use classic RGB
      const classicRGB = {
        1: { r: 0, g: 255, b: 255 },    // cyan
        2: { r: 255, g: 0, b: 255 },    // magenta
        3: { r: 255, g: 255, b: 0 },    // yellow
        4: { r: 255, g: 136, b: 0 }     // orange
      };

      if (id <= 4 && classicRGB[id]) {
        return classicRGB[id];
      }

      const hue = ((id - 1) * 137.5) % 360;
      const saturation = 1.0;
      const lightness = 0.5;
      return hslToRgb(hue, saturation, lightness);
    };
  
    // ---------- Global time & economy ----------
    let globalTick = 0;
    let lastSignalStatTick = 0;
    const Ledger = {
      credits: {},  // authorId -> total χ from reuse
      credit(authorId, amount) { this.credits[authorId] = (this.credits[authorId] || 0) + amount; },
      getCredits(authorId) { return this.credits[authorId] || 0; }
    };
    
    // ---------- Link System (agent-to-agent tubes) ----------
    // Link: { aId, bId, strength, age, restLen, lastUseTick }
    const Links = [];
    function linksForAgent(id) {
      return Links.filter(L => L.aId === id || L.bId === id);
    }
    function otherId(L, id) { return L.aId === id ? L.bId : L.aId; }
    function getBundleById(id) { return World.bundles.find(b => b.id === id); }
    function linkExists(aId, bId) {
      return Links.some(L => (L.aId === aId && L.bId === bId) || (L.aId === bId && L.bId === aId));
    }
    function removeLinksFor(id) {
      for (let i = Links.length - 1; i >= 0; i--) {
        const L = Links[i];
        if (L.aId === id || L.bId === id) Links.splice(i, 1);
      }
    }
    function provokeBondedExploration(deadId) {
      const duration = CONFIG.bondLoss?.onDeathBoostDuration ?? 600;
      const affected = linksForAgent(deadId);
      const deadBundle = getBundleById(deadId);
      const deathPos = deadBundle ? { x: deadBundle.x, y: deadBundle.y } : null;
      for (const L of affected) {
        const survivorId = otherId(L, deadId);
        const survivor = getBundleById(survivorId);
        if (survivor && survivor.alive) {
          const previousTicks = survivor.bereavementBoostTicks || 0;
          const nextTicks = Math.max(previousTicks, duration);
          survivor.bereavementBoostTicks = nextTicks;
          const distressStrength = clamp(L.strength / 2, 0, 1);
          if (distressStrength > 0) {
            survivor.emitSignal('distress', distressStrength, { cap: 1 });
            if (deadBundle && deathPos) {
              deadBundle.emitSignal('distress', distressStrength, { cap: 1, x: deathPos.x, y: deathPos.y });
            } else if (deathPos && CONFIG.signal?.enabled && SignalField) {
              SignalField.deposit(deathPos.x, deathPos.y, distressStrength, SIGNAL_CHANNELS.distress);
            }
          }
        }
      }
      // Immediately remove links tied to dead agent to avoid stale guidance
      removeLinksFor(deadId);
    }
    function tryFormLink(a, b) {
      const maxR = CONFIG.link.radius;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > maxR) return;
      if (!a.alive || !b.alive) return;
      if (linkExists(a.id, b.id)) return;
      if (a.chi < CONFIG.link.formCost || b.chi < CONFIG.link.formCost) return;
      // Shared-context: same hot trail cell snapshot
      const sA = Trail.sample(a.x, a.y);
      const sB = Trail.sample(b.x, b.y);
      const sharedHot = Math.min(sA.value, sB.value) > CONFIG.link.trailMin;
      if (!sharedHot) return;
      a.chi -= CONFIG.link.formCost;
      b.chi -= CONFIG.link.formCost;
      Links.push({
        aId: a.id,
        bId: b.id,
        strength: CONFIG.link.initStrength,
        age: 0,
        restLen: d,
        lastUseTick: globalTick
      });
    }
    function maintainLinks(dt) {
      // maintenance leak and passive decay; strengthen on use; breakage
      for (let i = Links.length - 1; i >= 0; i--) {
        const L = Links[i];
        const a = getBundleById(L.aId);
        const b = getBundleById(L.bId);
        if (!a || !b || !a.alive || !b.alive) {
          // Link broken due to death - track lifetime if collecting baseline
          if (isCollectingBaseline && baselineMetricsTracker && L.age > 0) {
            baselineMetricsTracker.onLinkBreak(L.age);
          }
          Links.splice(i, 1);
          continue;
        }
        // χ maintenance proportional to strength
        const leak = CONFIG.link.maintPerSec * L.strength * dt;
        a.chi = Math.max(0, a.chi - leak);
        b.chi = Math.max(0, b.chi - leak);
        // passive decay
        L.strength -= CONFIG.link.decayPerSec * dt;
        // hunger-driven extra decay (averaged)
        const hA = clamp(a.hunger, 0, 1);
        const hB = clamp(b.hunger, 0, 1);
        const escapeA = Math.max(0, (hA - CONFIG.hungerThresholdHigh)) / Math.max(1e-6, 1 - CONFIG.hungerThresholdHigh);
        const escapeB = Math.max(0, (hB - CONFIG.hungerThresholdHigh)) / Math.max(1e-6, 1 - CONFIG.hungerThresholdHigh);
        const hungerEsc = (escapeA * escapeA + escapeB * escapeB) * 0.5; // quadratic mean
        if (hungerEsc > 0) {
          L.strength -= CONFIG.link.hungerDecayPerSec * hungerEsc * dt;
        }
        // use-based strengthening: projection of velocity along link direction
        const vx = b.x - a.x, vy = b.y - a.y;
        const len = Math.hypot(vx, vy) || 1;
        const ux = vx / len, uy = vy / len;
        const aProj = (a.vx * ux + a.vy * uy);
        const bProj = (b.vx * ux + b.vy * uy) * -1; // moving toward each other counts
        const useFactor = Math.max(0, aProj) + Math.max(0, bProj);
        if (useFactor > 0) {
          L.strength += CONFIG.link.strengthenPerUse * dt;
          L.lastUseTick = globalTick;
        }
        const bondSignal = clamp(L.strength * 0.15 * dt, 0, 1);
        if (bondSignal > 0) {
          a.emitSignal('bond', bondSignal, { cap: 1 });
          b.emitSignal('bond', bondSignal, { cap: 1 });
        }
        // clamp and breakage
        if (L.strength < CONFIG.link.minStrength) {
          // Link broken due to weakness - track lifetime if collecting baseline
          if (isCollectingBaseline && baselineMetricsTracker && L.age > 0) {
            baselineMetricsTracker.onLinkBreak(L.age);
          }
          Links.splice(i, 1);
          continue;
        }
        L.strength = Math.min(2.0, Math.max(0, L.strength));
        L.age += dt;
      }
    }
  
    // ---------- Learning System ----------
    const learner = new CEMLearner(CONFIG.learning.observationDims, 3); // observation dims from config, 3 action dims
    const episodeManager = new EpisodeManager();
    
    // ---------- Baseline Metrics Tracker ----------
    let baselineMetricsTracker = null;
    let isCollectingBaseline = false;
  
    // ---------- Trail field (downsampled) ----------
    const Trail = {
      w: 0, h: 0, cell: CONFIG.trailCell,
      buf: null, tmp: null, snapshot: null,
      authorBuf: null, authorSnapshot: null,
      timestampBuf: null, timestampSnapshot: null,
      img: null, offscreen: null,
      offscreenCtx: null,
  
      resize() {
        // Preserve old dimensions and buffers
        const oldW = this.w;
        const oldH = this.h;
        const oldBuf = this.buf;
        const oldAuthorBuf = this.authorBuf;
        const oldTimestampBuf = this.timestampBuf;
        
        // Calculate new dimensions
        this.cell = CONFIG.trailCell;
        this.w = Math.max(1, Math.floor(canvasWidth  / this.cell));
        this.h = Math.max(1, Math.floor(canvasHeight / this.cell));
        const len = this.w * this.h;
        
        // Create new buffers
        this.buf = new Float32Array(len);
        this.tmp = new Float32Array(len);
        this.snapshot = new Float32Array(len);
        this.authorBuf = new Uint32Array(len);
        this.authorSnapshot = new Uint32Array(len);
        this.timestampBuf = new Uint32Array(len);
        this.timestampSnapshot = new Uint32Array(len);
        this.img = ctx.createImageData(this.w, this.h);
        this.offscreen = document.createElement('canvas');
        this.offscreen.width = this.w;
        this.offscreen.height = this.h;
        this.offscreenCtx = this.offscreen.getContext('2d');
        
        // Copy old data to new buffers (best effort)
        if (oldBuf && oldW > 0 && oldH > 0) {
          const copyW = Math.min(oldW, this.w);
          const copyH = Math.min(oldH, this.h);
          for (let y = 0; y < copyH; y++) {
            for (let x = 0; x < copyW; x++) {
              const oldIdx = y * oldW + x;
              const newIdx = y * this.w + x;
              this.buf[newIdx] = oldBuf[oldIdx];
              if (oldAuthorBuf) this.authorBuf[newIdx] = oldAuthorBuf[oldIdx];
              if (oldTimestampBuf) this.timestampBuf[newIdx] = oldTimestampBuf[oldIdx];
            }
          }
        }
      },
      clear() {
        if (this.buf) this.buf.fill(0);
        if (this.authorBuf) this.authorBuf.fill(0);
        if (this.timestampBuf) this.timestampBuf.fill(0);
      },
      index(ix, iy) { return iy * this.w + ix; },
      inBounds(ix, iy) { return ix >= 0 && iy >= 0 && ix < this.w && iy < this.h; },
  
      deposit(px, py, amount, authorId) {
        const ix = Math.floor(px / this.cell);
        const iy = Math.floor(py / this.cell);
        if (!this.inBounds(ix, iy)) return;
        const i = this.index(ix, iy);
        this.buf[i] = Math.min(1, this.buf[i] + amount);
        this.authorBuf[i] = authorId;
        this.timestampBuf[i] = globalTick;
      },
  
      sample(px, py) {
        // from snapshot
        const ix = Math.floor(px / this.cell);
        const iy = Math.floor(py / this.cell);
        if (!this.inBounds(ix, iy)) return { value: 0, authorId: 0, age: Infinity };
        const i = this.index(ix, iy);
        const value = this.snapshot[i];
        const authorId = this.authorSnapshot[i];
        const timestamp = this.timestampSnapshot[i];
        const age = globalTick - timestamp;
        return { value, authorId, age };
      },
  
      captureSnapshot() {
        if (this.buf) {
          this.snapshot.set(this.buf);
          this.authorSnapshot.set(this.authorBuf);
          this.timestampSnapshot.set(this.timestampBuf);
        }
      },
  
      step(dt) {
        if (!this.buf) return;
  
        // Evaporation: Simulates the fading of the trail over time.
        // This is a simple exponential decay model where a fraction of the trail's
        // strength is removed each frame. The rate is controlled by `evapPerSec`.
        // The formula is `v' = v - k*v`, which is a forward Euler approximation
        // of the differential equation `dV/dt = -k*V`.
        const k = CONFIG.evapPerSec * dt;
        for (let i = 0; i < this.buf.length; i++) {
          const v = this.buf[i];
          this.buf[i] = v > 0 ? Math.max(0, v - k * v) : 0;
        }
  
        // Diffusion: Simulates the spreading of the trail scent.
        // This process uses a simplified 5-point stencil (a cross shape) to
        // approximate the heat equation. Each cell's value moves towards the
        // average of its four cardinal neighbors.
        if (CONFIG.enableDiffusion) {
          const a = CONFIG.diffusePerSec * dt;
          if (a > 0) {
            const w = this.w, h = this.h, src = this.buf, dst = this.tmp;

            // We use a temporary buffer (`dst`) to store the new values.
            // This is critical to ensure that the calculation for each cell is based
            // on the state of its neighbors from the *previous* time step, preventing
            // numerical instability and ensuring the diffusion is calculated correctly.
            for (let y = 0; y < h; y++) {
              // Clamp coordinates at the edges to prevent reading out of bounds.
              // This is a simple "zero-flux" boundary condition where the trail
              // does not diffuse beyond the edge of the grid.
              const yUp = (y > 0) ? y-1 : y;
              const yDn = (y < h-1) ? y+1 : y;
              for (let x = 0; x < w; x++) {
                const xLt = (x > 0) ? x-1 : x;
                const xRt = (x < w-1) ? x+1 : x;

                const iC = y*w + x; // Current cell index
                const vC = src[iC]; // Current cell value

                // Get values of the four neighbors
                const vUp = src[yUp*w + x];
                const vDn = src[yDn*w + x];
                const vLt = src[y*w + xLt];
                const vRt = src[y*w + xRt];

                // Calculate the average of the neighbors. This represents the
                // equilibrium point that the current cell's value is moving towards.
                const mean = (vUp + vDn + vLt + vRt) * 0.25;

                // The new value is the current value plus a fraction `a` of the
                // difference between the neighbor average and the current value.
                // This is a discrete approximation of the diffusion process.
                dst[iC] = clamp(vC + a * (mean - vC), 0, 1);
              }
            }
            // Swap the buffers for the next frame. The temporary buffer now holds
            // the new state, and the old buffer can be reused as the temporary one.
            const t = this.buf; this.buf = this.tmp; this.tmp = t;
          }
        }
      },
  
      draw() {
        if (!CONFIG.renderTrail || !this.buf || !this.offscreen) return;
        const data = this.img.data;

        for (let i = 0; i < this.buf.length; i++) {
          const v = this.buf[i];                 // 0..1
          const authorId = this.authorBuf[i];
          const baseStrength = Math.pow(v, 0.55);
          const glowStrength = Math.pow(v, 0.85);
          const highlightStrength = Math.pow(v, 1.35);
          const o = i * 4;

          // Get color based on author using dynamic color function
          // Neutral deposits (authorId===0) use a subtle gray to avoid overpowering
          const color = authorId !== 0 ? getAgentColorRGB(authorId) : { r: 140, g: 140, b: 140 };
          const highlightedColor = {
            r: Math.min(255, color.r + (255 - color.r) * highlightStrength * 0.45),
            g: Math.min(255, color.g + (255 - color.g) * highlightStrength * 0.45),
            b: Math.min(255, color.b + (255 - color.b) * highlightStrength * 0.45)
          };

          data[o+0] = Math.floor(highlightedColor.r * baseStrength);
          data[o+1] = Math.floor(highlightedColor.g * baseStrength);
          data[o+2] = Math.floor(highlightedColor.b * baseStrength);
          data[o+3] = Math.min(255, glowStrength * 210 + highlightStrength * 45);
        }

        const octx = this.offscreenCtx || (this.offscreenCtx = this.offscreen.getContext('2d'));
        if (!octx) return;
        octx.putImageData(this.img, 0, 0);

        const destW = this.w * this.cell;
        const destH = this.h * this.cell;
        const blurPx = Math.max(1.5, this.cell * 0.85);
        const outerPad = Math.max(this.cell * 0.8, 2);
        const midBlur = Math.max(0.75, this.cell * 0.45);

        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.imageSmoothingEnabled = true;

        ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
        ctx.globalAlpha = 0.55;
        ctx.drawImage(
          this.offscreen,
          0, 0, this.w, this.h,
          -outerPad, -outerPad,
          destW + outerPad * 2,
          destH + outerPad * 2
        );

        ctx.filter = `blur(${midBlur.toFixed(2)}px)`;
        ctx.globalAlpha = 0.35;
        ctx.drawImage(
          this.offscreen,
          0, 0, this.w, this.h,
          -this.cell * 0.4,
          -this.cell * 0.4,
          destW + this.cell * 0.8,
          destH + this.cell * 0.8
        );

        ctx.filter = 'none';
        ctx.globalAlpha = 0.9;
        ctx.drawImage(
          this.offscreen,
          0, 0, this.w, this.h,
          0, 0, destW, destH
        );

        ctx.globalAlpha = 1;
        ctx.filter = 'none';
        ctx.restore();
      }
    };

    // Call resize after Trail is defined (done later in code)

    // ---------- Fertility Grid (Plant Ecology) ----------
    // Note: FertilityField is created in the onResize callback to ensure correct dimensions
    let FertilityField = null;

    canvasManager.onResize(({ width, height, dpr }) => {
      if (Trail && Trail.resize) {
        Trail.resize();
      }

      if (SignalField && SignalField.resize) {
        SignalField.resize(width, height, ctx);
      }

      if (CONFIG.plantEcology.enabled && typeof FertilityGrid !== 'undefined') {
        FertilityField = new FertilityGrid(width, height);
      }
      
      // CRITICAL: Update PixiJS renderer resolution AND dimensions
      // Surface laptops need the resolution to be recalculated on each resize
      pixiApp.renderer.resolution = dpr;
      pixiApp.renderer.resize(width, height);
    });

    // Call initial resize - this will create FertilityField with correct dimensions
    canvasManager.resizeCanvas();
  
    
  

    const { held, state: inputState } = initializeInputManager({
      canvas,
      getWorld: () => World,
      getTrail: () => Trail,
      getSignalField: () => SignalField,
      getTrainingUI: () => window.trainingUI,
      getAdaptiveHeuristicsUI: () => adaptiveHeuristicsUI,
      getParticipationManager: () => ParticipationManager,
      getTrainingModule: () => trainingModule,
      CONFIG
    });

    // ---------- Entities ----------
    // Note: Bundle and Resource use getWorld: () => World callback pattern
    // This allows them to be created BEFORE World while still accessing it later
    const Bundle = createBundleClass({
      PIXI,
      Trail,
      getGlobalTick: () => globalTick,
      getCanvasWidth: () => canvasWidth,
      getCanvasHeight: () => canvasHeight,
      Ledger,
      getSignalWeight,
      getSignalSensitivity,
      getSignalDecayRate,
      getSignalActivationThreshold,
      linksForAgent,
      otherId,
      getBundleById,
      held,
      provokeBondedExploration,
      getAgentColor,
      getAgentColorRGB,
      getAgentTrailsContainer: () => agentTrailsContainer,
      getAgentsContainer: () => agentsContainer,
      getWorld: () => World,  // Callback pattern - World is referenced later when needed
      getTrainingModule: () => trainingModule  // For adaptive heuristics access
    });
    const terrainHeightFn = typeof getTerrainHeight === 'function'
      ? (x, y) => getTerrainHeight(x, y)
      : undefined;

    const Resource = createResourceClass({
      PIXI,
      getGlobalTick: () => globalTick,
      getCanvasWidth: () => canvasWidth,
      getCanvasHeight: () => canvasHeight,
      getFertilityField: () => FertilityField,
      getRule110Stepper: () => (typeof window !== 'undefined' ? window.rule110Stepper : null),
      getTerrainHeight: terrainHeightFn,
      getViewportWidth: () => innerWidth,
      getViewportHeight: () => innerHeight,
      getResourcesContainer: () => resourcesContainer
    });
  
    // ========================================================================
    // ⚠️  CRITICAL INITIALIZATION ORDER - DO NOT REARRANGE ⚠️
    // ========================================================================
    // World MUST be created BEFORE trainingModule (see line ~533 below).
    // Many other components reference World and will break if this order changes.
    // If you're an AI agent: DO NOT move World creation after trainingModule!
    // ========================================================================
    // ---------- World ----------
    const World = createWorld({
      Trail,
      getCanvasWidth: () => canvasWidth,
      getCanvasHeight: () => canvasHeight,
      getGlobalTick: () => globalTick,
      setGlobalTick: (value) => { globalTick = value; },
      Ledger,
      Links,
      Bundle,
      Resource,
      getPerformanceNow: () => performance.now()
    });
    const setWorldPaused = (paused) => {
      const next = Boolean(paused);
      if (World.paused === next) {
        if (!next && ParticipationManager) {
          // Resume clears timers without forcing active state
          if (typeof ParticipationManager.resetState === 'function') {
            ParticipationManager.resetState({
              reason: 'resume',
              clearEvents: false,
              clearSummary: false,
              resetMode: false,
              resetCursor: true
            });
          } else if (typeof ParticipationManager.resetTimers === 'function') {
            ParticipationManager.resetTimers();
          }
        }
        return World.paused;
      }

      World.paused = next;

      if (next) {
        resetParticipationEnergy({ reason: 'pause', clearFields: true, clearEvents: false, clearSummary: false });
      } else if (ParticipationManager) {
        if (typeof ParticipationManager.resetState === 'function') {
          ParticipationManager.resetState({
            reason: 'resume',
            clearEvents: false,
            clearSummary: false,
            resetMode: false,
            resetCursor: true
          });
          updateParticipationStatusUI();
        } else if (typeof ParticipationManager.resetTimers === 'function') {
          ParticipationManager.resetTimers();
          updateParticipationStatusUI();
        }
      }

      return World.paused;
    };

    World.setPaused = setWorldPaused;
    World.togglePause = () => setWorldPaused(!World.paused);

    const originalWorldReset = World.reset.bind(World);
    World.reset = (...args) => {
      setWorldPaused(false);
      
      // Clear PixiJS containers to remove any lingering graphics
      if (resourcesContainer) {
        resourcesContainer.removeChildren();
      }
      if (agentsContainer) {
        agentsContainer.removeChildren();
      }
      if (agentTrailsContainer) {
        agentTrailsContainer.removeChildren();
      }
      
      const result = originalWorldReset(...args);
      
      if (ParticipationManager && typeof ParticipationManager.resetState === 'function') {
        updateParticipationStatusUI();
      } else {
        resetParticipationEnergy({ reason: 'world-reset', clearFields: true });
      }
      
      // Force a render to clear any remaining artifacts
      pixiApp.render();
      
      // Ensure canvas sizing is correct after restart
      if (typeof window !== 'undefined' && typeof window.resizeCanvas === 'function') {
        // Defer to next frame so layout/UI updates settle first
        window.requestAnimationFrame(() => window.resizeCanvas());
      }
      
      return result;
    };

    World.reset();

    // Expose World globally for console access
    if (typeof window !== 'undefined') {
      window.World = World;
      window.Trail = Trail;
      window.SignalField = SignalField;
      window.FertilityField = FertilityField; // May be null if plant ecology disabled
      window.FertilityGrid = FertilityGrid; // Expose class so config can recreate field
    }

    // ---------- Baseline Collection Functions ----------
    function startBaselineCollection() {
      if (isCollectingBaseline) {
        console.warn('Baseline collection already in progress');
        return false;
      }
      
      try {
        baselineMetricsTracker = new MetricsTracker();
        baselineMetricsTracker.init(World, Trail, globalTick);
        isCollectingBaseline = true;
        
        console.log('📊 Started baseline metrics collection');
        console.log('   Tracker initialized:', !!baselineMetricsTracker);
        console.log('   Step method exists:', typeof baselineMetricsTracker.step);
        return true;
      } catch (err) {
        console.error('Failed to start baseline collection:', err);
        baselineMetricsTracker = null;
        isCollectingBaseline = false;
        return false;
      }
    }
    
    function stopBaselineCollection() {
      if (!isCollectingBaseline) {
        console.warn('No baseline collection in progress');
        return false;
      }
      
      isCollectingBaseline = false;
      console.log(`📊 Stopped baseline metrics collection (${baselineMetricsTracker?.hist?.length || 0} snapshots)`);
      return true;
    }
    
    function getBaselineMetrics() {
      if (!baselineMetricsTracker) {
        return null;
      }
      return baselineMetricsTracker.getHistory();
    }
    
    function isBaselineCollecting() {
      return isCollectingBaseline;
    }

    // ========================================================================
    // ⚠️  World is NOW initialized - trainingModule can reference it safely ⚠️
    // ========================================================================
    // This trainingModule creation MUST happen AFTER World is created above.
    // DO NOT move this code before World initialization!
    // ========================================================================
    trainingModule = createTrainingModule({
      world: World,
      config: CONFIG,
      trail: Trail,
      signalField: SignalField,
      tcScheduler: TcScheduler,
      ledger: Ledger,
      episodeManager,
      learner,
      TrainingManagerClass: TrainingManager,
      TrainingUIClass: TrainingUI,
      normalizeRewardSignal,
      updateFindTimeEMA,
      calculateAdaptiveReward,
      getGlobalTick: () => globalTick,
      incrementGlobalTick: () => { globalTick += 1; },
      setWorldPaused,
      onLearningModeChange: (mode) => {
        if (mode === 'train') {
          World.bundles.forEach((b) => (b.useController = true));
        } else {
          World.bundles.forEach((b) => (b.useController = false));
        }
      },
      // Baseline metrics collection
      startBaselineCollection,
      stopBaselineCollection,
      getBaselineMetrics,
      isBaselineCollecting
    });
  
    // ---------- Lineage Visualization ----------
    function drawLineageLinks(ctx) {
      if (!CONFIG.mitosis.showLineage || !World.lineageLinks || World.lineageLinks.length === 0) {
        return;
      }
      
      const maxDistance = CONFIG.mitosis.lineageMaxDistance || 500;
      const fadeDuration = CONFIG.mitosis.lineageFadeDuration || 600;
      const baseOpacity = CONFIG.mitosis.lineageOpacity || 0.4;
      const color = CONFIG.mitosis.lineageColor || "#888888";
      
      ctx.save();
      ctx.strokeStyle = color;
      
      World.lineageLinks.forEach(link => {
        // Find parent and child bundles
        const parent = World.bundles.find(b => b.id === link.parentId);
        const child = World.bundles.find(b => b.id === link.childId);
        
        if (!parent || !child) return; // Skip if either doesn't exist
        
        // Calculate distance
        const dx = child.x - parent.x;
        const dy = child.y - parent.y;
        const dist = Math.hypot(dx, dy);
        
        // Skip if too far away
        if (dist > maxDistance) return;
        
        // Calculate fade based on age
        const age = globalTick - link.birthTick;
        const fadeProgress = Math.min(1, age / fadeDuration);
        const opacity = baseOpacity * (1 - fadeProgress * 0.7); // Fade to 30% of base opacity
        
        if (opacity < 0.05) return; // Too faded to draw
        
        // Draw line
        ctx.globalAlpha = opacity;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(parent.x, parent.y);
        ctx.lineTo(child.x, child.y);
        ctx.stroke();
      });
      
      ctx.restore();
    }
    
    function getControllerBadge(bundle, index = 0) {
      if (bundle.useController && bundle.controller) {
        if (index === 0 && loadedPolicyInfo) {
          return `🤖 ${loadedPolicyInfo.filename.replace('.json', '').substring(0, 12)}`;
        }
        return bundle.controller.constructor.name === "LinearPolicyController" ? "🤖 POLICY" : "🎮 CTRL";
      }
      return "🧠 AI";
    }

    // ---------- HUD ----------
    function drawHUD() {
      if (!CONFIG.hud.show || inputState.hudDisplayMode === 'hidden') return;
      ctx.save();
      
      const baselineY = 10;
      const padding = 14;
      const lineHeight = 16;
      const sectionSpacing = 10;
      
      // Helper function to draw status badge (horizontal layout)
      const drawBadge = (x, y, enabled, label) => {
        const badgeWidth = 80; // Fixed width for alignment
        const badgeHeight = 16;
        
        // Badge background
        ctx.fillStyle = enabled 
          ? "rgba(0, 255, 136, 0.2)" 
          : "rgba(128, 128, 128, 0.15)";
        ctx.fillRect(x, y - 11, badgeWidth, badgeHeight);
        
        // Badge border
        ctx.strokeStyle = enabled 
          ? "rgba(0, 255, 136, 0.5)" 
          : "rgba(128, 128, 128, 0.3)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y - 11, badgeWidth, badgeHeight);
        
        // Check mark or cross
        ctx.fillStyle = enabled ? "#4dffaa" : "#666";
        ctx.font = "bold 11px ui-mono, monospace";
        ctx.fillText(enabled ? "✓" : "✗", x + 4, y);
        
        // Label
        ctx.fillStyle = enabled ? "#00ff88" : "#888";
        ctx.font = "12px ui-mono, monospace";
        ctx.fillText(label, x + 18, y);
        
        return y + badgeHeight + 3; // Return next Y position
      };
      
      // Calculate metrics
      const totalAgents = World.bundles.length;
      const aliveCount = World.bundles.filter(b => b.alive).length;
      const totalChi = World.bundles.reduce((sum, b) => sum + b.chi, 0);
      const avgChi = totalAgents ? totalChi / totalAgents : 0;
      const avgFrustration = totalAgents
        ? World.bundles.reduce((sum, b) => sum + b.frustration, 0) / totalAgents
        : 0;
      const avgHunger = totalAgents
        ? World.bundles.reduce((sum, b) => sum + b.hunger, 0) / totalAgents
        : 0;

      let resourceSummary = `${World.resources.length}`;
      let resourceDetails = "";
      if (CONFIG.plantEcology.enabled) {
        if (CONFIG.resourceScaleWithAgents) {
          const spawnPressure = CONFIG.plantEcology.spawnPressure;
          const minResourceMultiplier = spawnPressure?.minResourceMultiplier ?? spawnPressure?.minSeedMultiplier ?? 1;
          const pressureMultiplier = getSpawnPressureMultiplier(aliveCount, minResourceMultiplier);
          const maxResources = Math.floor(
            clamp(
              CONFIG.resourceBaseAbundance * pressureMultiplier,
              CONFIG.resourceScaleMinimum,
              CONFIG.resourceScaleMaximum
            )
          );
          const pressurePct = Math.round((1 - pressureMultiplier) * 100);
          resourceSummary = `${World.resources.length}/${maxResources}`;
          resourceDetails = `pressure ${pressurePct}%`;
        } else {
          resourceSummary = `${World.resources.length}/${World.carryingCapacity}`;
          resourceDetails = `cap ${World.carryingCapacity}`;
        }
      } else if (CONFIG.resourceDynamicCount) {
        resourceSummary = `${World.resources.length}/${World.carryingCapacity}`;
        resourceDetails = `pressure ${(World.resourcePressure * 100).toFixed(0)}%`;
      }

      const hudSections = [];

      // Minimal mode: compact single line
      if (inputState.hudDisplayMode === 'minimal') {
        hudSections.push({
          color: "#88ffff",
          lines: [
            `📊 ${aliveCount}/${totalAgents}  χ:${avgChi.toFixed(1)}  🌿:${resourceSummary}  tick:${globalTick}`
          ]
        });
      } else {
        // Full mode: organized sections
        
        // Section 1: Agent Statistics
        hudSections.push({
          color: "#88ffff",
          lines: [
            `📊 AGENTS`,
            `   alive:   ${aliveCount}/${totalAgents}`,
            `   avg χ:   ${avgChi.toFixed(1)}`,
            `   births:  ${World.totalBirths}`,
            `   avg F/H: ${Math.round(avgFrustration * 100)}% / ${Math.round(avgHunger * 100)}%`
          ]
        });

        // Section 2: Simulation Stats
        const simLines = [
          `⚙️  SIMULATION`,
          `   mode:      ${CONFIG.autoMove ? "AUTO" : "MANUAL"}`,
          `   learning:  ${trainingModule?.getLearningMode?.() === 'train' ? "TRAINING" : "PLAY"}`,
          `   tick:      ${globalTick}`,
          `   χ earned:  ${World.collected}`
        ];
        hudSections.push({
          color: "#00ff88",
          lines: simLines
        });

        // Section 3: Resources
        const resourceLines = [
          `🌿 RESOURCES`,
          `   count:  ${resourceSummary}`
        ];
        if (resourceDetails) {
          resourceLines.push(`   ${resourceDetails}`);
        }
        hudSections.push({
          color: "#ffaa00",
          lines: resourceLines
        });

        // Section 4: Status badges (visual checkmarks) - vertical layout
        hudSections.push({
          type: 'badges',
          color: "#88ddff",
          label: "⚡ STATUS",
          badges: [
            { label: 'Trail', enabled: CONFIG.renderTrail },
            { label: 'Diffusion', enabled: CONFIG.enableDiffusion },
            { label: 'Mitosis', enabled: CONFIG.mitosis.enabled },
            { label: 'Scent', enabled: inputState.showScentGradient },
            { label: 'Fertility', enabled: inputState.showFertility },
            { label: 'Dashboard', enabled: inputState.showAgentDashboard }
          ]
        });
      }

      // Calculate HUD dimensions
      let totalLines = 0;
      let badgeCount = 0;
      hudSections.forEach(section => {
        if (section.type === 'badges') {
          totalLines += 1; // Header line
          badgeCount = section.badges.length;
        } else {
          totalLines += section.lines.length;
        }
      });
      
      // Add space for vertical badges (each badge is ~19px including spacing)
      const badgeVerticalSpace = badgeCount * 19;
      const hudHeight = padding * 2 + totalLines * lineHeight + (hudSections.length - 1) * sectionSpacing + badgeVerticalSpace;
      const hudWidth = inputState.hudDisplayMode === 'minimal' ? 500 : 175;

      // Draw HUD background
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.fillRect(baselineY, baselineY, hudWidth, hudHeight);
      ctx.strokeStyle = "rgba(0, 255, 136, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(baselineY, baselineY, hudWidth, hudHeight);

      // Draw HUD content
      ctx.font = "13px ui-mono, monospace";
      ctx.textAlign = "left";
      
      let currentY = baselineY + padding + 13;
      
      hudSections.forEach(section => {
        if (section.type === 'badges') {
          // Draw status badges section header
          ctx.fillStyle = section.color;
          ctx.font = "bold 13px ui-mono, monospace";
          ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
          ctx.shadowBlur = 2;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1;
          ctx.fillText(section.label, baselineY + padding, currentY);
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          
          currentY += lineHeight + 3;
          
          // Draw status badges vertically
          const badgeX = baselineY + padding + 3;
          section.badges.forEach(badge => {
            currentY = drawBadge(badgeX, currentY, badge.enabled, badge.label);
          });
          currentY += sectionSpacing;
        } else {
          // Draw text lines
          const lines = section.lines.filter(Boolean);
          ctx.fillStyle = section.color;
          lines.forEach((line, idx) => {
            // Add subtle shadow for readability
            ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
            ctx.shadowBlur = 2;
            ctx.shadowOffsetX = 1;
            ctx.shadowOffsetY = 1;
            
            // Make section headers bold
            if (idx === 0) {
              ctx.font = "bold 13px ui-mono, monospace";
            } else {
              ctx.font = "12px ui-mono, monospace";
            }
            
            ctx.fillText(line, baselineY + padding, currentY);
            
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            currentY += lineHeight;
          });
          currentY += sectionSpacing;
        }
      });

      if (inputState.showAgentDashboard) {
        drawAgentDashboardOverlay(baselineY);
      }

      ctx.restore();
    }

    function drawAgentDashboardOverlay(baselineY = 10) {
      const agents = World.bundles;
      if (!agents.length) return;

      const viewWidth = canvas.width / dpr;
      const viewHeight = canvas.height / dpr;
      const padding = 12;
      const rowHeight = 17; // Slightly increased for better readability
      const headerHeight = 65; // Updated to match actual header layout
      const rightMargin = 10; // Margin from right edge
      
      // Fixed column widths for aligned table layout
      ctx.font = "12px ui-mono, monospace";
      const colWidths = {
        vis: 28,      // "vis/alive" - icons
        id: 36,       // "ID"
        pos: 85,      // "X,Y" position
        chi: 62,      // "χ" with value
        cr: 62,       // "cr" with value
        f: 48,        // "F" with %
        h: 48,        // "H" with %
        sense: 60,    // "sense" with value
        controller: 80 // "controller"
      };
      
      const singleColumnWidth = Object.values(colWidths).reduce((sum, w) => sum + w, 0) + 8; // +8 for spacing
      const maxRows = Math.max(1, Math.floor((viewHeight - padding * 2 - headerHeight) / rowHeight));
      const maxColumns = Math.max(1, Math.floor((viewWidth - padding * 2 - rightMargin) / singleColumnWidth));

      let columns = 1;
      let rowsPerColumn = Math.ceil(agents.length / columns);
      while (columns < maxColumns && rowsPerColumn > maxRows) {
        columns += 1;
        rowsPerColumn = Math.ceil(agents.length / columns);
      }

      columns = Math.max(1, Math.min(columns, maxColumns, agents.length || 1));
      rowsPerColumn = Math.max(1, Math.ceil(agents.length / columns));

      // Calculate panel width - ensure it fits all content
      const calculatedWidth = columns * singleColumnWidth + padding * 2;
      const maxWidth = viewWidth - rightMargin - padding; // Leave margin from right edge
      const panelWidth = Math.min(maxWidth, calculatedWidth);
      const panelHeight = Math.min(viewHeight - 20, headerHeight + rowsPerColumn * rowHeight + padding * 2);
      const panelX = Math.max(padding, viewWidth - panelWidth - rightMargin);
      const panelY = baselineY; // Aligned to same baseline as HUD

      ctx.save();
      
      // Draw dashboard background with higher opacity
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
      ctx.strokeStyle = "rgba(0, 255, 136, 0.6)";
      ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

      // Draw header text with shadow for readability
      const titleY = panelY + padding + 15; // Title baseline
      const headerRowY = titleY + 18; // Header row below title with spacing
      
      ctx.font = "13px ui-mono, monospace";
      ctx.fillStyle = "#00ff88";
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillText(`Agent dashboard (${agents.length})`, panelX + padding, titleY);
      
      // Draw header row with fixed column alignment
      ctx.font = "12px ui-mono, monospace";
      ctx.fillStyle = "#d0ffd8";
      
      // Add shadow to header for readability
      ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
      ctx.shadowBlur = 1;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      
      const drawHeaderRow = (startX, startY) => {
        let x = startX;
        ctx.fillText("vis", x, startY);
        x += colWidths.vis;
        ctx.fillText("ID", x, startY);
        x += colWidths.id;
        ctx.fillText("X,Y", x, startY);
        x += colWidths.pos;
        ctx.fillText("chi", x, startY);
        x += colWidths.chi;
        ctx.fillText("credits", x, startY);
        x += colWidths.cr;
        ctx.fillText("Frust", x, startY);
        x += colWidths.f;
        ctx.fillText("Hunger", x, startY);
        x += colWidths.h;
        ctx.fillText("sense", x, startY);
        x += colWidths.sense;
        ctx.fillText("control", x, startY);
      };
      
      // Draw header for each column
      for (let col = 0; col < columns; col++) {
        const headerX = panelX + padding + col * singleColumnWidth;
        drawHeaderRow(headerX, headerRowY);
      }
      
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      const contentY = headerRowY + 20; // Start content below header with spacing

      agents.forEach((bundle, index) => {
        const column = Math.floor(index / rowsPerColumn);
        const row = index % rowsPerColumn;
        const rowBaseX = panelX + padding + column * singleColumnWidth;
        const rowY = contentY + row * rowHeight;
        if (rowY > panelY + panelHeight - padding) return;

        const aliveIcon = bundle.alive ? "✓" : "✗";
        const visibilityIcon = bundle.visible ? "👁" : "🚫";
        const frustrationPct = Math.round(clamp(bundle.frustration, 0, 1) * 100).toString().padStart(3, " ");
        const hungerPct = Math.round(clamp(bundle.hunger, 0, 1) * 100).toString().padStart(3, " ");
        const chiStr = bundle.chi.toFixed(1).padStart(5, " ");
        const creditStr = Ledger.getCredits(bundle.id).toFixed(1).padStart(5, " ");
        const senseStr = Math.round(bundle.currentSensoryRange || 0).toString().padStart(3, " ");
        const controllerLabel = getControllerBadge(bundle, index); // No truncation
        const idLabel = `A${bundle.id.toString().padStart(2, "0")}`;
        const posStr = `${Math.round(bundle.x)},${Math.round(bundle.y)}`;

        ctx.fillStyle = bundle.alive ? getAgentColor(bundle.id, true) : "#777777";
        
        // Add text shadow for readability
        ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
        ctx.shadowBlur = 1;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        
        // Draw each field with fixed column alignment
        let x = rowBaseX;
        ctx.fillText(`${visibilityIcon}${aliveIcon}`, x, rowY);
        x += colWidths.vis;
        ctx.fillText(idLabel, x, rowY);
        x += colWidths.id;
        ctx.fillText(posStr, x, rowY);
        x += colWidths.pos;
        ctx.fillText(`χ${chiStr}`, x, rowY);
        x += colWidths.chi;
        ctx.fillText(`cr${creditStr}`, x, rowY);
        x += colWidths.cr;
        ctx.fillText(`F${frustrationPct}%`, x, rowY);
        x += colWidths.f;
        ctx.fillText(`H${hungerPct}%`, x, rowY);
        x += colWidths.h;
        ctx.fillText(`s${senseStr}`, x, rowY);
        x += colWidths.sense;
        ctx.fillText(controllerLabel, x, rowY);
        
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      });

      const totalCapacity = rowsPerColumn * columns;
      if (totalCapacity < agents.length) {
        ctx.font = "11px ui-mono, monospace";
        ctx.fillStyle = "#ffaa88";
        ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
        ctx.shadowBlur = 1;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillText(`showing ${totalCapacity} of ${agents.length} agents`, panelX + padding, panelY + panelHeight - padding);
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }

      ctx.restore();
    }

    // ---------- Main loop ----------
    const beginTick = ({ dt, mode }) => {
      const schedulerConfig = TcScheduler.getConfig();
      if (!schedulerConfig?.enabled) {
        return null;
      }
      return TcScheduler.beginTick({
        tick: globalTick,
        dt,
        mode,
        scheduler: mode === 'train' ? 'episode' : 'play',
        world: World
      });
    };

    const capturePhase = ({ tickContext }) => {
      Trail.captureSnapshot();
      if (CONFIG.signal.enabled) {
        SignalField.captureSnapshot();
      }
      if (tickContext) {
        TcScheduler.runPhase('capture', tickContext);
      }
    };

    const updateAgentsPhase = ({ dt, tickContext }) => {
      try {
        ParticipationManager.update(dt);
      } catch (error) {
        if (CONFIG?.participation?.debugLog && typeof console !== 'undefined' && console.debug) {
          console.debug('[Participation] update error:', error);
        }
      }

      for (let i = 0; i < World.bundles.length; i++) {
        for (let j = i + 1; j < World.bundles.length; j++) {
          const a = World.bundles[i];
          const b = World.bundles[j];
          if (!a.alive || !b.alive) continue;
          tryFormLink(a, b);
        }
      }

      let totalEnergyDelta = 0;
      
      World.bundles.forEach((bundle) => {
        const chiBeforeUpdate = bundle.chi;
        const posBeforeUpdate = { x: bundle.x, y: bundle.y };
        
        const nearestResource = World.getNearestResource(bundle);
        bundle.update(dt, nearestResource);
        
        // Track baseline metrics if collecting
        if (isCollectingBaseline && baselineMetricsTracker) {
          const dx = bundle.x - posBeforeUpdate.x;
          const dy = bundle.y - posBeforeUpdate.y;
          const speed = Math.hypot(dx, dy) / dt;
          baselineMetricsTracker.onMove(dx, dy, speed);
          
          const chiSpent = Math.max(0, chiBeforeUpdate - bundle.chi);
          if (chiSpent > 0) {
            baselineMetricsTracker.onChiSpend(chiSpent, 'play-mode');
          }
        }
        
        const applied = applyParticipationEnergy(bundle);
        if (applied !== 0) {
          totalEnergyDelta += applied;
        }
      });

      if (totalEnergyDelta !== 0) {
        const logger = participationLogger();
        if (logger && typeof logger.debug === 'function') {
          logger.debug(
            `[Participation][Energy] Tick total Δχ=${totalEnergyDelta.toFixed(3)}`
          );
        }
      }

      if (tickContext) {
        TcScheduler.runPhase('compute', tickContext);
      }

      maintainLinks(dt);
    };

    const environmentPhase = ({ dt }) => {
      Trail.step(dt);
      if (CONFIG.signal.enabled) {
        SignalField.step(dt);
      }

      // reinforceLinks(dt); // Disabled: Link/Bond trail deposits (was grey)
      World.updateEcology(dt);

      if (CONFIG.scentGradient.consumable) {
        const orbitBand = CONFIG.scentGradient.orbitBandPx;
        const minStrength = CONFIG.scentGradient.minStrength;
        const minRange = CONFIG.scentGradient.minRange;
        const baseStrength = CONFIG.scentGradient.strength;
        const baseRange = CONFIG.scentGradient.maxRange;
        const consumeRate = CONFIG.scentGradient.consumePerSec * dt;
        const recoverRate = CONFIG.scentGradient.recoverPerSec * dt;
        
        // Resource vitality depletion
        const vitalityConsumeRate = CONFIG.scentGradient.vitalityConsumePerSec * dt;
        const vitalityRecoverRate = CONFIG.scentGradient.vitalityRecoverPerSec * dt;
        const minVitality = CONFIG.scentGradient.minVitality;
        const depletionThreshold = CONFIG.scentGradient.depletionThreshold;
        const vitalityToChiRate = CONFIG.scentGradient.vitalityToChiRate || 0;

        for (const res of World.resources) {
          // Skip invisible resources unless they're depleted (need to recover)
          if (!res.visible && !res.depleted) continue;
          
          const inner = res.r;
          const outer = res.r + orbitBand;
          
          // Find all orbiting agents and their distances
          const orbitingAgents = [];
          for (const bundle of World.bundles) {
            if (!bundle.alive) continue;
            const d = Math.hypot(res.x - bundle.x, res.y - bundle.y);
            if (d > inner && d <= outer) {
              // Calculate proximity factor (closer = higher)
              const t = 1 - (d - inner) / Math.max(1e-6, outer - inner);
              const proximity = t * t; // Quadratic falloff
              orbitingAgents.push({ bundle, distance: d, proximity });
            }
          }
          
          // Handle depleted resources separately - they can only recover, not be consumed
          if (res.depleted) {
            // Depleted resources recover vitality (but no agents can orbit them since they're invisible)
            res.vitality = Math.min(1.0, res.vitality + vitalityRecoverRate);
            
            // Un-deplete if recovered above threshold
            if (res.vitality > depletionThreshold + 0.1) {
              res.depleted = false;
              res.visible = true; // Show recovered resources
              // Reset scent strength to base when recovering
              res.scentStrength = baseStrength;
              res.scentRange = baseRange;
            }
            continue; // Skip the rest of the processing for depleted resources
          }
          
          if (orbitingAgents.length > 0) {
            // Calculate total consumption intensity (sum of all agents' proximity)
            // More agents orbiting = faster depletion
            const totalProximity = orbitingAgents.reduce((sum, agent) => sum + agent.proximity, 0);
            const use = Math.min(1.0, totalProximity); // Cap at 1.0 to prevent excessive depletion
            
            // Store vitality before consumption
            const vitalityBefore = res.vitality;
            
            // Deplete scent
            res.scentStrength = Math.max(minStrength, res.scentStrength - consumeRate * use);
            const frac = res.scentStrength / baseStrength;
            const targetRange = Math.max(minRange, baseRange * frac);
            res.scentRange += (targetRange - res.scentRange) * 0.5;
            
            // Deplete vitality (resource health)
            res.vitality = Math.max(minVitality, res.vitality - vitalityConsumeRate * use);
            
            // Calculate how much vitality was consumed
            const vitalityConsumed = vitalityBefore - res.vitality;
            
            // Convert consumed vitality to chi and distribute among orbiting agents
            if (vitalityConsumed > 0 && vitalityToChiRate > 0) {
              const totalChiGain = vitalityConsumed * vitalityToChiRate;
              
              // Distribute chi proportionally based on proximity
              // Agents closer to the resource get more chi
              for (const { bundle, proximity } of orbitingAgents) {
                const agentShare = totalProximity > 0 ? (proximity / totalProximity) : (1 / orbitingAgents.length);
                const chiGain = totalChiGain * agentShare;
                
                // Apply chi gain to agent
                if (chiGain > 0 && Number.isFinite(chiGain)) {
                  bundle.chi = Math.max(0, (bundle.chi || 0) + chiGain);
                }
              }
            }
            
            // Mark as depleted if below threshold
            if (res.vitality <= depletionThreshold) {
              res.depleted = true;
              res.visible = false; // Hide depleted resources
              res.scentStrength = 0; // No signal from depleted resources
            }
          } else {
            // No agent orbiting - recover scent and vitality
            res.scentStrength = Math.min(baseStrength, res.scentStrength + recoverRate);
            res.scentRange = Math.min(baseRange, res.scentRange + (baseRange - res.scentRange) * 0.1);
            
            // Recover vitality
            res.vitality = Math.min(1.0, res.vitality + vitalityRecoverRate);
            
            // Un-deplete if recovered above threshold (shouldn't happen here since depleted resources are handled separately)
            if (res.vitality > depletionThreshold + 0.1) {
              res.depleted = false;
              res.visible = true; // Show recovered resources
            }
          }
        }
      }

      World.cleanupLineageLinks();

      if (CONFIG.enableAgentCollision) {
        for (let i = 0; i < World.bundles.length; i++) {
          for (let j = i + 1; j < World.bundles.length; j++) {
            const a = World.bundles[i];
            const b = World.bundles[j];
            if (!a.alive || !b.alive) continue;

            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy);
            const minDist = a.size;

            if (dist < minDist && dist > 0.001) {
              const overlap = minDist - dist;
              const nx = dx / dist;
              const ny = dy / dist;
              const pushStrength = CONFIG.agentCollisionPushback;
              a.x -= nx * overlap * pushStrength;
              a.y -= ny * overlap * pushStrength;
              b.x += nx * overlap * pushStrength;
              b.y += ny * overlap * pushStrength;

              const half = a.size / 2;
              a.x = clamp(a.x, half, canvasWidth - half);
              a.y = clamp(a.y, half, canvasHeight - half);
              b.x = clamp(b.x, half, canvasWidth - half);
              b.y = clamp(b.y, half, canvasHeight - half);
            }
          }
        }
      }
    };

    const resourcePhase = ({ dt }) => {
      World.bundles.forEach((bundle) => {
        if (!bundle.alive) return;
        for (const res of World.resources) {
          // Skip if resource is not visible, not overlapping, or depleted
          if (!(res.visible && bundle.overlapsResource(res))) continue;
          if (res.depleted) continue; // Can't collect depleted resources!

          const result = collectResource({
            bundle,
            resource: res,
            world: World,
            config: CONFIG,
            normalizeRewardSignal,
            updateFindTimeEMA,
            calculateAdaptiveReward,
            getGlobalTick: () => globalTick,
            logger: console,
            onCollected: ({ resource }) => {
              if (CONFIG.plantEcology.enabled && FertilityField) {
                FertilityField.depleteAt(resource.x, resource.y, globalTick);
              }
              
              // Track baseline metrics if collecting
              if (isCollectingBaseline && baselineMetricsTracker) {
                const rewardAmount = CONFIG.rewardChi || 0;
                baselineMetricsTracker.onChiReward(rewardAmount, 'resource', globalTick);
                
                // Track guidance efficacy (was agent near strong trail?)
                const sample = Trail.sample(bundle.x, bundle.y);
                const nearTrail = sample.value > 0.15; // Strong trail threshold
                baselineMetricsTracker.onResourceFound(nearTrail);
                
                // Track chi from reuse (provenance credits)
                const provenanceCredit = Ledger.getCredits(bundle.id);
                if (provenanceCredit > 0) {
                  baselineMetricsTracker.onChiFromReuse(provenanceCredit);
                }
              }
            },
          });

          if (result.collected) {
            break;
          }
        }

        // Adaptive heuristics learning during normal gameplay
        const adaptiveHeuristics = trainingModule?.getAdaptiveHeuristics?.();
        if (adaptiveHeuristics?.isActive) {
          // Compute reward based on agent state
          // Positive rewards: chi, recent resource collection
          // Negative rewards: hunger, frustration
          const chiReward = bundle.chi * 0.1;
          const hungerPenalty = (bundle.hunger || 0) * -0.5;
          const frustrationPenalty = (bundle.frustration || 0) * -0.3;
          const reward = chiReward + hungerPenalty + frustrationPenalty;

          // Find nearest visible resource for observation
          let nearestResource = null;
          let nearestDist = Infinity;
          for (const res of World.resources) {
            if (!res.visible) continue;
            const dx = res.x - bundle.x;
            const dy = res.y - bundle.y;
            const dist = Math.hypot(dx, dy);
            if (dist < nearestDist) {
              nearestDist = dist;
              nearestResource = res;
            }
          }

          // Build observation for learning
          const observation = buildObservation(bundle, nearestResource, Trail, globalTick, World.resources);

          // Learn from this experience
          trainingModule.learnAdaptiveHeuristics(reward, observation);
        }
      });

      World.resources.forEach((res) => res.update(dt));

      if (CONFIG.plantEcology.enabled && FertilityField) {
        let maxResources = CONFIG.resourceStableMax;
        const aliveCount = World.bundles.filter((bundle) => bundle.alive).length;

        if (CONFIG.resourceScaleWithAgents) {
          const spawnPressure = CONFIG.plantEcology.spawnPressure;
          const minResourceMultiplier = spawnPressure?.minResourceMultiplier ?? spawnPressure?.minSeedMultiplier ?? 1;
          const pressureMultiplier = getSpawnPressureMultiplier(aliveCount, minResourceMultiplier);
          const targetAbundance = CONFIG.resourceBaseAbundance * pressureMultiplier;
          maxResources = Math.floor(
            clamp(
              targetAbundance,
              CONFIG.resourceScaleMinimum,
              CONFIG.resourceScaleMaximum
            )
          );
        }

        if (World.resources.length > maxResources) {
          const excess = World.resources.length - maxResources;
          const removed = World.resources.splice(-excess, excess);
          removed.forEach(res => res.destroy());
          // console.log(`🔪 Culled ${excess} excess resources due to competition (${aliveCount} agents)`);
        }

        const seedLocation = attemptSeedDispersal(World.resources, FertilityField, globalTick, dt, aliveCount);
        if (seedLocation && World.resources.length < maxResources) {
          const newResource = new Resource(seedLocation.x, seedLocation.y, CONFIG.resourceRadius);
          World.resources.push(newResource);
          // console.log(`🌱 Seed sprouted at (${Math.round(seedLocation.x)}, ${Math.round(seedLocation.y)}) | Fertility: ${seedLocation.fertility.toFixed(2)}`);
        }

        const growthLocation = attemptSpontaneousGrowth(FertilityField, dt, aliveCount, canvasWidth, canvasHeight);
        if (growthLocation && World.resources.length < maxResources) {
          const newResource = new Resource(growthLocation.x, growthLocation.y, CONFIG.resourceRadius);
          World.resources.push(newResource);
          // console.log(`🌿 Spontaneous growth at (${Math.round(growthLocation.x)}, ${Math.round(growthLocation.y)}) | Fertility: ${growthLocation.fertility.toFixed(2)}`);
        }

        FertilityField.update(dt, aliveCount, globalTick);
      }
    };

    const reproductionPhase = ({ mode }) => {
      if (mode !== 'play') {
        return;
      }
      const currentBundles = [...World.bundles];
      currentBundles.forEach((bundle) => {
        if (bundle.alive) {
          bundle.attemptMitosis();
        }
      });
    };

    const decayPhase = ({ dt }) => {
      if (!CONFIG.decay.enabled) {
        return;
      }
      try {
        const toRemove = [];
        World.bundles.forEach((bundle, idx) => {
          try {
            const fullyDecayed = bundle.updateDecay(dt, FertilityField);
            if (fullyDecayed) {
              toRemove.push(idx);
            }
          } catch (err) {
            console.error(`Error updating decay for agent ${bundle.id}:`, err);
          }
        });

        for (let i = toRemove.length - 1; i >= 0; i--) {
          const idx = toRemove[i];
          if (idx >= 0 && idx < World.bundles.length) {
            const removed = World.bundles.splice(idx, 1)[0];
            removed.destroy();
            // console.log(`💀 Agent ${removed.id} fully decayed and removed | Pop: ${World.bundles.length}`);
          }
        }
      } catch (err) {
        console.error('Error in decay system:', err);
      }
    };

    const finalizePhase = ({ tickContext }) => {
      if (tickContext) {
        TcScheduler.runPhase('commit', tickContext);
      }
      globalTick += 1;
      
      // Update baseline metrics if collecting
      if (isCollectingBaseline && baselineMetricsTracker) {
        try {
          if (typeof baselineMetricsTracker.step === 'function') {
            // Pass Links array for active link age tracking
            baselineMetricsTracker.step(World, Trail, globalTick, Links);
          } else {
            console.error('baselineMetricsTracker.step is not a function, stopping collection');
            isCollectingBaseline = false;
          }
        } catch (err) {
          console.error('Error updating baseline metrics:', err);
          isCollectingBaseline = false;
        }
      }
      
      if (globalTick - lastSignalStatTick >= 30) {
        lastSignalStatTick = globalTick;
        const fieldStats = typeof SignalField.getStats === 'function' ? SignalField.getStats() : null;
        const responseSummary = SignalResponseAnalytics.getSummary();
        if (window.trainingUI && typeof window.trainingUI.updateSignalStats === 'function') {
          const snr = fieldStats?.snr ?? [];
          const totalPower = fieldStats?.totalPower ?? [];
          const channelCount = fieldStats?.channels ?? (SignalField.channelCount || 0);
          window.trainingUI.updateSignalStats({
            channelCount,
            diversity: fieldStats?.diversity ?? 0,
            snr,
            totalPower,
            coherence: responseSummary?.coherence ?? 0,
            perChannel: responseSummary?.perChannel ?? {}
          });
        }
      }
    };

    const simulationPhases = [
      capturePhase,
      updateAgentsPhase,
      environmentPhase,
      resourcePhase,
      reproductionPhase,
      decayPhase,
      finalizePhase
    ];

    const drawFrame = () => {
      // CRITICAL: Use logical dimensions, not physical (canvas has DPR transform applied)
      ctx.fillStyle = "#000"; 
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      if (inputState.showFertility && CONFIG.plantEcology.enabled && FertilityField) {
        FertilityField.draw(ctx);
      }

      if (inputState.showScentGradient && CONFIG.scentGradient.enabled) {
        // visualizeScentHeatmap(ctx, World.resources, 40); // Removed green background
        visualizeScentGradient(ctx, World.resources, 80);
      }

      if (CONFIG.signal.enabled) {
        SignalField.draw(ctx);
      }
      Trail.draw();

      World.resources.forEach((res) => res.draw());

      // Draw resource hover tooltip
      if (mousePos.hoveredResource) {
        drawResourceTooltip(ctx, mousePos.hoveredResource);
      }

      if (ParticipationManager && typeof ParticipationManager.draw === 'function') {
        try {
          ParticipationManager.draw(ctx);
        } catch (error) {
          if (CONFIG?.participation?.debugLog && typeof console !== 'undefined' && console.debug) {
            console.debug('[Participation] draw error:', error);
          }
        }
      }

      (function drawLinks() {
        if (!Links.length) return;
        ctx.save();
        ctx.globalAlpha = 0.6;
        for (const L of Links) {
          const a = getBundleById(L.aId);
          const b = getBundleById(L.bId);
          if (!a || !b) continue;
          const color = getAgentColor(L.aId, true);
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1, L.strength * 2);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.restore();
      })();

      if (CONFIG.mitosis.showLineage) {
        drawLineageLinks(ctx);
      }

      World.bundles.forEach((bundle) => bundle.draw());

      drawHUD();

      if (CONFIG.tcResourceIntegration?.showOverlay && window.rule110Stepper) {
        drawRule110Overlay(ctx, window.rule110Stepper, canvasWidth, canvasHeight);
      }

      // Draw the PixiJS stage
      // CRITICAL FIX: Draw PixiJS at logical size to account for DPR transform
      // The context has setTransform(dpr, 0, 0, dpr, 0, 0), so we draw at logical coords
      pixiApp.render();
      ctx.drawImage(pixiApp.view, 0, 0, canvasWidth, canvasHeight);
    };

    startSimulation({
      shouldStep: () => !World.paused,
      getMode: () => trainingModule?.getLearningMode?.() || 'play',
      getPhases: () => simulationPhases,
      beginTick,
      endTick: (context) => {
        if (context) {
          TcScheduler.endTick(context);
        }
      },
      draw: drawFrame,
      onError: (error) => {
        console.error('Critical error in main loop (tick ' + globalTick + '):', error);
        if (error && error.stack) {
          console.error('Stack trace:', error.stack);
        }
      }
    });

    // Initialize Adaptive Heuristics UI
    const adaptiveHeuristicsUI = new AdaptiveHeuristicsUI(document.body, trainingModule);

    const initTrainingUI = () => trainingModule?.initializeTrainingUI?.();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initTrainingUI, { once: true });
    } else {
      initTrainingUI();
    }
  })();
  