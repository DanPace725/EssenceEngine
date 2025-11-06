// Slime-Bundle v0.6 — Learning system with plant ecology
// Controls: [WASD/Arrows]=move (Agent 1 when MANUAL) | [A]=auto toggle | [S]=toggle extended sensing
// [G]=scent gradient viz | [P]=fertility viz | [M]=mitosis toggle | [Space]=pause [R]=reset [C]=+5χ all 
// [T]=trail on/off [X]=clear trail [F]=diffusion on/off | [1-4]=toggle individual agents | [V]=toggle all | [L]=training UI

import { CONFIG } from './config.js';
import { HeuristicController, LinearPolicyController } from './controllers.js';
import { buildObservation } from './observations.js';
import { RewardTracker, EpisodeManager, updateFindTimeEMA, calculateAdaptiveReward } from './rewards.js';
import { CEMLearner, TrainingManager } from './learner.js';
import { TrainingUI } from './trainingUI.js';
import { visualizeScentGradient, visualizeScentHeatmap } from './scentGradient.js';
import { FertilityGrid, attemptSeedDispersal, attemptSpontaneousGrowth, getResourceSpawnLocation, getSpawnPressureMultiplier } from './plantEcology.js';

(() => {
    const canvas = document.getElementById("view");
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  
    // ---------- DPR-aware sizing ----------
    let dpr = 1;
    const resize = () => {
      dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
      canvas.width  = Math.floor(innerWidth  * dpr);
      canvas.height = Math.floor(innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      Trail.resize();
    };
    window.addEventListener("resize", resize, { passive: true });
  
    // Config is now imported from config.js
  
    // ---------- Input ----------
    const held = new Set();
    let showScentGradient = true; // Toggle for scent gradient visualization
    let showFertility = false; // Toggle for fertility grid visualization
    let showAgentDashboard = false; // Toggle for agent dashboard overlay
    
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup","w","arrowdown","s","arrowleft","a","arrowright","d"].includes(k)) held.add(k);
      if (e.code === "Space") { World.paused = !World.paused; e.preventDefault(); }
      else if (e.code === "KeyR") { World.reset(); }
      else if (e.code === "KeyC") { 
        World.bundles.forEach(b => { 
          b.chi += 5; 
          b.alive = true;
          // Reset decay state when reviving
          b.deathTick = -1;
          b.decayProgress = 0;
        }); 
      }
      else if (e.code === "KeyS") { World.bundles.forEach(b => { b.extendedSensing = !b.extendedSensing; }); }
      else if (e.code === "KeyT") { CONFIG.renderTrail = !CONFIG.renderTrail; }
      else if (e.code === "KeyX") { Trail.clear(); }
      else if (e.code === "KeyF") { CONFIG.enableDiffusion = !CONFIG.enableDiffusion; }
      else if (e.code === "KeyA") { CONFIG.autoMove = !CONFIG.autoMove; }
      else if (e.code === "KeyL") { if (window.trainingUI) window.trainingUI.toggle(); }
      else if (e.code === "KeyG") { showScentGradient = !showScentGradient; } // Toggle scent gradient visualization
      else if (e.code === "KeyM") { 
        CONFIG.mitosis.enabled = !CONFIG.mitosis.enabled; 
        console.log(`🧫 Mitosis ${CONFIG.mitosis.enabled ? "ENABLED" : "DISABLED"}`);
      } // Toggle mitosis
      else if (e.code === "KeyP") {
        showFertility = !showFertility;
      } // Toggle plant/fertility visualization
      else if (e.code === "KeyH") {
        showAgentDashboard = !showAgentDashboard;
      } // Toggle agent dashboard overlay
      // Toggle individual agents visibility
      else if (e.code === "Digit1") { if (World.bundles[0]) World.bundles[0].visible = !World.bundles[0].visible; }
      else if (e.code === "Digit2") { if (World.bundles[1]) World.bundles[1].visible = !World.bundles[1].visible; }
      else if (e.code === "Digit3") { if (World.bundles[2]) World.bundles[2].visible = !World.bundles[2].visible; }
      else if (e.code === "Digit4") { if (World.bundles[3]) World.bundles[3].visible = !World.bundles[3].visible; }
      else if (e.code === "KeyV") { World.bundles.forEach(b => b.visible = !b.visible); } // Toggle all
    });
    window.addEventListener("keyup", (e) => held.delete(e.key.toLowerCase()));
  
    // ---------- Helpers ----------
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const mix = (a,b,t)=>a+(b-a)*t;
    const randomRange = (min, max) => Math.random() * (max - min) + min;
    const smoothstep = (e0,e1,x)=> {
      const t = clamp((x - e0) / Math.max(1e-6, e1 - e0), 0, 1);
      return t * t * (3 - 2 * t);
    };
    
    // Generate color for agent based on ID (supports unlimited agents)
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
      
      // For agents beyond 4, use HSL with varying hue
      const hue = ((id - 1) * 137.5) % 360; // Golden angle for good distribution
      const saturation = alive ? 100 : 30;
      const lightness = alive ? 50 : 20;
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
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
      
      // Convert HSL to RGB for agents beyond 4
      const hue = ((id - 1) * 137.5) % 360;
      const s = 1.0;
      const l = 0.5;
      
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
  
    // ---------- Global time & economy ----------
    let globalTick = 0;
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
      for (const L of affected) {
        const survivorId = otherId(L, deadId);
        const survivor = getBundleById(survivorId);
        if (survivor && survivor.alive) {
          survivor.bereavementBoostTicks = Math.max(survivor.bereavementBoostTicks || 0, duration);
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
        if (!a || !b || !a.alive || !b.alive) { Links.splice(i, 1); continue; }
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
        // clamp and breakage
        if (L.strength < CONFIG.link.minStrength) { Links.splice(i, 1); continue; }
        L.strength = Math.min(2.0, Math.max(0, L.strength));
        L.age += dt;
      }
    }
    function reinforceLinks(dt) {
      // deposit faint trail along each link segment, scaled by strength
      const samples = 10;
      for (const L of Links) {
        const a = getBundleById(L.aId);
        const b = getBundleById(L.bId);
        if (!a || !b) continue;
        const depBase = CONFIG.depositPerSec * 0.1 * L.strength * dt;
        for (let s = 0; s <= samples; s++) {
          const t = s / samples;
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          Trail.deposit(x, y, depBase, 0); // authorId 0 for neutral paving
        }
      }
    }
  
    // ---------- Learning System ----------
    let learningMode = 'play'; // 'play' or 'train'
    const learner = new CEMLearner(23, 3); // 23 obs dims (was 15, now includes scent+density), 3 action dims
    const episodeManager = new EpisodeManager();
    let trainingManager = null;
    let currentTrainingPolicy = null;
    let stopTrainingFlag = false;
    let loadedPolicyInfo = null; // Store info about loaded policy file
  
    // ---------- Trail field (downsampled) ----------
    const Trail = {
      w: 0, h: 0, cell: CONFIG.trailCell,
      buf: null, tmp: null, snapshot: null,
      authorBuf: null, authorSnapshot: null,
      timestampBuf: null, timestampSnapshot: null,
      img: null, offscreen: null,
  
      resize() {
        this.cell = CONFIG.trailCell;
        this.w = Math.max(1, Math.floor(innerWidth  / this.cell));
        this.h = Math.max(1, Math.floor(innerHeight / this.cell));
        const len = this.w * this.h;
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
  
        // Evaporation (exponential-ish)
        const k = CONFIG.evapPerSec * dt;
        for (let i = 0; i < this.buf.length; i++) {
          const v = this.buf[i];
          this.buf[i] = v > 0 ? Math.max(0, v - k * v) : 0;
        }
  
        // Diffusion (cross kernel)
        if (CONFIG.enableDiffusion) {
          const a = CONFIG.diffusePerSec * dt;
          if (a > 0) {
            const w = this.w, h = this.h, src = this.buf, dst = this.tmp;
            for (let y = 0; y < h; y++) {
              const yUp = (y > 0) ? y-1 : y;
              const yDn = (y < h-1) ? y+1 : y;
              for (let x = 0; x < w; x++) {
                const xLt = (x > 0) ? x-1 : x;
                const xRt = (x < w-1) ? x+1 : x;
                const iC = y*w + x;
                const vC = src[iC];
                const vUp = src[yUp*w + x];
                const vDn = src[yDn*w + x];
                const vLt = src[y*w + xLt];
                const vRt = src[y*w + xRt];
                const mean = (vUp + vDn + vLt + vRt) * 0.25;
                dst[iC] = clamp(vC + a * (mean - vC), 0, 1);
              }
            }
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
          const intensity = Math.floor(Math.pow(v, 0.6) * 255);
          const o = i * 4;
          
          // Get color based on author using dynamic color function
          // Neutral deposits (authorId===0) use a subtle gray to avoid overpowering
          const color = authorId !== 0 ? getAgentColorRGB(authorId) : { r: 140, g: 140, b: 140 };
          
          data[o+0] = Math.floor(color.r * intensity / 255);
          data[o+1] = Math.floor(color.g * intensity / 255);
          data[o+2] = Math.floor(color.b * intensity / 255);
          data[o+3] = Math.min(255, intensity * 1.5);
        }
        const octx = this.offscreen.getContext('2d');
        octx.putImageData(this.img, 0, 0);
  
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(
          this.offscreen,
          0, 0, this.w, this.h,
          0, 0, this.w * this.cell, this.h * this.cell
        );
        ctx.globalCompositeOperation = "source-over";
        ctx.restore();
      }
    };
    resize();
    
    // ---------- Fertility Grid (Plant Ecology) ----------
    let FertilityField = null;
    if (CONFIG.plantEcology.enabled) {
      FertilityField = new FertilityGrid(innerWidth, innerHeight);
    }
  
    // ---------- Entities ----------
    class Bundle {
      constructor(x, y, size, chi, id, useController = false) {
        this.x = x; this.y = y;
        this.vx = 0; this.vy = 0;                // inertial velocity
        this.size = size;
        this.chi = chi;
        this.alive = true;
        this.id = id;

        // sensing (extended by default for better foraging)
        this.extendedSensing = true;
        this.currentSensoryRange = CONFIG.aiSensoryRangeBase;
        this._targetSensoryRange = CONFIG.aiSensoryRangeBase;

        // frustration (0..1)
        this.frustration = 0;
        this.lastCollectTick = 0;

        // hunger (0..1) - biological drive that amplifies exploration and frustration
        this.hunger = 0;

        // heading cache & angle
        this._lastDirX = 1; this._lastDirY = 0;
        this.heading = 0; // angle in radians (0 = right, π/2 = down)
        
        // learning system
        this.useController = useController;
        this.controller = null; // Set by training system when needed
        this.rewardTracker = new RewardTracker(this);
        this.lastAction = null; // Store last action for display
        
        // visibility toggle
        this.visible = true; // Agent is visible by default
        
        // mitosis tracking
        this.lastMitosisTick = 0; // Last tick when mitosis occurred
        this.generation = 0; // Generation counter (0 = original)
        this.parentId = null; // ID of parent (null for originals)
        
        // decay tracking
        this.deathTick = -1; // Tick when agent died (-1 = not dead)
        this.decayProgress = 0; // 0 to 1, how much decayed
        this.chiAtDeath = 0; // Chi remaining when died (for recycling)

        // Bond-loss exploration boost (bereavement)
        this.bereavementBoostTicks = 0; // ticks remaining for exploration boost
      }
  
      computeSensoryRange(dt) {
        const base = CONFIG.aiSensoryRangeBase;
        const max  = CONFIG.aiSensoryRangeMax;

        if (!this.extendedSensing || !this.alive) {
          this._targetSensoryRange = base;
        } else {
          const f = clamp(this.frustration, 0, 1);
          const h = clamp(this.hunger, 0, 1);
          // Hunger amplifies sensory expansion - desperate agents sense further
          const hungerAmp = 1 + (CONFIG.hungerSenseAmp - 1) * h;
          const bias = smoothstep(0.0, 1.0, f) * CONFIG.aiSenseBiasFromFrustr * hungerAmp;
          this._targetSensoryRange = clamp(base + (max - base) * bias, base, max);
        }
  
        // Slew current toward target (visual & smooth)
        const slew = CONFIG.aiSenseSlewPerSec * dt;
        const delta = clamp(this._targetSensoryRange - this.currentSensoryRange, -slew, slew);
        const newRange = clamp(this.currentSensoryRange + delta, base, max);
  
        // χ cost proportional to *delta above base* for this frame + quadratic holding cost
        const achievedBoost = Math.max(0, newRange - this.currentSensoryRange);
        const pxPerChiPerSec = CONFIG.aiSenseRangePerChi;
        const chiPerSecForBoost = achievedBoost > 0 ? (achievedBoost / dt) / pxPerChiPerSec : 0;
        let cost = chiPerSecForBoost * dt;
  
        // Quadratic holding cost - scales with range²! Makes max range very expensive
        const aboveBase = Math.max(0, newRange - base);
        const holdChiPerSec = (aboveBase * aboveBase) / (pxPerChiPerSec * 100);
        cost += holdChiPerSec * dt;
        
        // Hunger scaling - hungry agents can't afford expensive sensing
        const h = clamp(this.hunger, 0, 1);
        const hungerPenalty = 1 + h * 0.5;  // 0-50% more expensive when hungry
        cost *= hungerPenalty;
  
        // Don't overspend χ
        if (cost > this.chi) {
          const scale = this.chi / Math.max(cost, 1e-6);
          const scaledBoost = achievedBoost * scale;
          cost = this.chi;
          this.currentSensoryRange = clamp(this.currentSensoryRange + scaledBoost, base, max);
        } else {
          this.currentSensoryRange = newRange;
        }
        return cost;
      }
  
      computeAIDirection(resource) {
        let dx = 0, dy = 0;
        let resourceVisible = false;

        // (1) Wall avoidance - repulsion from ALL nearby walls (handles corners!)
        const wallMargin = CONFIG.aiWallAvoidMargin;
        const wallStrength = CONFIG.aiWallAvoidStrength;
        
        const dLeft = this.x;
        const dRight = innerWidth - this.x;
        const dTop = this.y;
        const dBottom = innerHeight - this.y;
        
        // Apply repulsion from each wall independently (creates diagonal escape in corners)
        if (dLeft < wallMargin) {
          const repulsion = wallStrength * (1 - dLeft / wallMargin);
          dx += repulsion; // Push right
        }
        if (dRight < wallMargin) {
          const repulsion = wallStrength * (1 - dRight / wallMargin);
          dx -= repulsion; // Push left
        }
        if (dTop < wallMargin) {
          const repulsion = wallStrength * (1 - dTop / wallMargin);
          dy += repulsion; // Push down
        }
        if (dBottom < wallMargin) {
          const repulsion = wallStrength * (1 - dBottom / wallMargin);
          dy -= repulsion; // Push up
        }

        // (2) resource seek within range
        if (resource) {
          const tx = resource.x - this.x;
          const ty = resource.y - this.y;
          const dist = Math.hypot(tx, ty);
          if (dist > 0 && dist <= this.currentSensoryRange) {
            dx += (tx / dist);
            dy += (ty / dist);
            resourceVisible = true;
          }
        }

        // (3) trail following (reduced near walls and when close to resources)
        let trailStrength = resourceVisible ? CONFIG.aiTrailFollowingNear
                                             : CONFIG.aiTrailFollowingFar;
        
        // Reduce trail following when very close to resource (direct pursuit mode)
        if (resource && resourceVisible) {
          const dist = Math.hypot(resource.x - this.x, resource.y - this.y);
          const closeRange = (resource.r || 15) + this.size / 2 + 30;
          if (dist < closeRange) {
            // Reduce trail following when close to resource (0% when at collection range)
            const proximityFactor = Math.max(0, dist / closeRange);
            trailStrength *= proximityFactor * proximityFactor; // Quadratic falloff
          }
        }
        
        // Reduce trail following when near walls to avoid corner death spirals
        const dMin = Math.min(dLeft, dRight, dTop, dBottom);
        if (dMin < wallMargin) {
          const wallProximity = 1 - (dMin / wallMargin); // 0 = far, 1 = at wall
          trailStrength *= (1 - wallProximity * 0.7); // Reduce up to 70% when at wall
        }
        
        if (trailStrength > 0) {
          const sampleDist = CONFIG.aiSampleDistance;
          let sumX = 0, sumY = 0, wsum = 0;
          for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
            const cx = Math.cos(angle), sy = Math.sin(angle);
            const sx = this.x + cx * sampleDist;
            const syy = this.y + sy * sampleDist;
            const { value, authorId, age } = Trail.sample(sx, syy);
            if (authorId !== 0 && authorId !== this.id && age >= CONFIG.trailCooldownTicks) {
              const w = value * value;
              sumX += cx * w; sumY += sy * w; wsum += w;
            }
          }
          if (wsum > 0) {
            const len = Math.hypot(sumX, sumY);
            if (len > 0) {
              dx += (sumX / len) * trailStrength * (wsum / 16);
              dy += (sumY / len) * trailStrength * (wsum / 16);
            }
          }
        }
        
        // (3.5) Link guidance and spring (when no resource visible)
        if (!resourceVisible) {
          const h = clamp(this.hunger, 0, 1);
          // Escape factor grows as hunger exceeds high threshold
          const escape = (function(th, hv){
            const t0 = th; // hungerThresholdHigh from config
            const x = Math.max(0, hv - t0) / Math.max(1e-6, 1 - t0);
            return Math.min(1, x * x); // quadratic ramp for decisiveness
          })(CONFIG.hungerThresholdHigh, h);
          const damp = 1 - CONFIG.link.hungerEscape * escape;
          const myLinks = linksForAgent(this.id);
          for (const L of myLinks) {
            const other = getBundleById(otherId(L, this.id));
            if (!other) continue;
            const vx = other.x - this.x, vy = other.y - this.y;
            const len = Math.hypot(vx, vy) || 1;
            const w = CONFIG.link.guidanceGain * L.strength * damp;
            dx += (vx / len) * w;
            dy += (vy / len) * w;
            // Springy geometry around rest length
            const k = CONFIG.link.springK * L.strength * damp;
            const delta = len - L.restLen;
            const f = k * delta;
            dx += (vx / len) * f;
            dy += (vy / len) * f;
          }
        }
  
        // (4) exploration noise scales with frustration AND hunger (+bereavement)
        const f = clamp(this.frustration, 0, 1);
        const h = clamp(this.hunger, 0, 1);
        // Hunger amplifies exploration - hungry agents explore more desperately
        const hungerAmp = 1 + (CONFIG.hungerExplorationAmp - 1) * h;
        const bereaveMul = 1 + (this.bereavementBoostTicks > 0 ? (CONFIG.bondLoss?.onDeathExploreBoost ?? 0) : 0);
        const noise = (CONFIG.aiExploreNoiseBase + CONFIG.aiExploreNoiseGain * f) * hungerAmp * bereaveMul;
        dx += (Math.random() - 0.5) * noise * (resourceVisible ? 1.0 : 1.8);
        dy += (Math.random() - 0.5) * noise * (resourceVisible ? 1.0 : 1.8);
  
        // normalize
        const mag = Math.hypot(dx, dy);
        if (mag > 1e-6) { dx /= mag; dy /= mag; }
        else { dx = this._lastDirX; dy = this._lastDirY; }
  
        return { dx, dy };
      }
  
      update(dt, resource) {
        if (!this.alive) return;
  
        // Base metabolism + sensing costs
        let chiSpend = CONFIG.baseDecayPerSecond * dt;
        chiSpend += this.computeSensoryRange(dt);

        // Update hunger (biological drive)
        this.updateHunger(dt);

        // Update frustration (progress vs lost, amplified by hunger)
        this.updateFrustration(dt, resource);
  
        // === ROUTING: Controller vs Heuristic AI ===
        if (this.useController && this.controller) {
          // Use controller (learned or wrapped heuristic)
          const obs = buildObservation(this, resource, Trail, globalTick, World.resources);
          const action = this.controller.act(obs);
          this.lastAction = action; // Store for display
          const result = this.applyAction(action, dt);
          chiSpend += result.chiSpend;
        } else {
          // Use original heuristic AI
          this.updateHeuristicMovement(dt, resource);
          
          // Integrate motion
          const oldX = this.x, oldY = this.y;
          this.x += this.vx * dt;
          this.y += this.vy * dt;
  
          const movedDist = Math.hypot(this.x - oldX, this.y - oldY);
          if (movedDist > 0) chiSpend += CONFIG.moveCostPerSecond * dt;
  
          // Stay inside viewport
          const half = this.size / 2;
          this.x = clamp(this.x, half, innerWidth - half);
          this.y = clamp(this.y, half, innerHeight - half);
  
          // Deposit trail when moving
          if (movedDist > 0) {
            const health = clamp(this.chi / 20, 0.2, 1.0);
            const dep = CONFIG.depositPerSec * health * dt;
            Trail.deposit(this.x, this.y, dep, this.id);
            Trail.deposit(this.x - half, this.y - half, dep * 0.25, this.id);
            Trail.deposit(this.x + half, this.y - half, dep * 0.25, this.id);
            Trail.deposit(this.x - half, this.y + half, dep * 0.25, this.id);
            Trail.deposit(this.x + half, this.y + half, dep * 0.25, this.id);
          }
  
          // Residual χ reuse
          if (movedDist > 0) {
            const { value, authorId, age } = Trail.sample(this.x, this.y);
            const isDifferentAuthor = authorId !== this.id && authorId !== 0;
            const isOldEnough = age >= CONFIG.trailCooldownTicks;
            
            // Gain from other agents' trails
            if (isDifferentAuthor && isOldEnough) {
              const squashed = Math.sqrt(value);
              const gain = Math.min(CONFIG.residualCapPerTick, CONFIG.residualGainPerSec * squashed * dt);
              this.chi += gain;
              Ledger.credit(authorId, gain);
            }
            
            // Penalty for walking on own fresh trail (discourages circuits)
            if (CONFIG.ownTrailPenalty > 0) {
              const isOwnTrail = authorId === this.id;
              const isFresh = age < CONFIG.ownTrailGraceAge;
              if (isOwnTrail && isFresh && value > 0.1) {
                const penalty = CONFIG.ownTrailPenalty * dt;
                this.chi -= penalty;
              }
            }
          }
        }
  
        // Pay costs
        this.chi = Math.max(0, this.chi - chiSpend);
        if (this.chi === 0 && this.alive) {
          this.alive = false;
          // Track death for decay system
          this.deathTick = globalTick;
          this.chiAtDeath = 0; // Already spent all chi
          // Signal bonded survivors and remove dead links immediately
          provokeBondedExploration(this.id);
        }
        
        // Decay bereavement boost (per tick)
        if (this.bereavementBoostTicks > 0) this.bereavementBoostTicks--;
      }

      updateHunger(dt) {
        // Hunger increases over time - biological drive
        this.hunger = Math.min(1, this.hunger + CONFIG.hungerBuildRate * dt);
      }

      updateFrustration(dt, resource) {
        const ticksSinceCollect = globalTick - this.lastCollectTick;
        const { value: localTrailPrev } = Trail.sample(this.x, this.y);
        const lowTrail = localTrailPrev < CONFIG.aiFrustrationLowTrail;
        const canSeeResource = resource
          ? Math.hypot(resource.x - this.x, resource.y - this.y) <= this.currentSensoryRange
          : false;

        if (canSeeResource || ticksSinceCollect <= CONFIG.aiFrustrationSightGrace) {
          this.frustration = Math.max(0, this.frustration - CONFIG.aiFrustrationDecayRate * dt);
        } else if (lowTrail) {
          // Hunger amplifies frustration build rate - hungry agents get frustrated faster!
          const h = clamp(this.hunger, 0, 1);
          const hungerAmp = 1 + (CONFIG.hungerFrustrationAmp - 1) * h;
          this.frustration = Math.min(1, this.frustration + CONFIG.aiFrustrationBuildRate * hungerAmp * dt);
        }
      }

      updateHeuristicMovement(dt, resource) {
        // Steering (manual only for agent 1 in MANUAL mode)
        let want = { dx: 0, dy: 0 };
        if (CONFIG.autoMove || this.id !== 1) {
          want = this.computeAIDirection(resource);
        } else {
          if (held.has("w") || held.has("arrowup")) want.dy -= 1;
          if (held.has("s") || held.has("arrowdown")) want.dy += 1;
          if (held.has("a") || held.has("arrowleft")) want.dx -= 1;
          if (held.has("d") || held.has("arrowright")) want.dx += 1;
          const m = Math.hypot(want.dx, want.dy);
          if (m > 1e-6) { want.dx /= m; want.dy /= m; }
          else { want.dx = this._lastDirX; want.dy = this._lastDirY; }
        }
  
        // Frustration-driven turn agility & speed surge (amplified by hunger)
        const f = clamp(this.frustration, 0, 1);
        const h = clamp(this.hunger, 0, 1);
        const turnRate = CONFIG.aiTurnRateBase + CONFIG.aiTurnRateGain * f;
        // Hunger amplifies speed surge - starving agents move faster in desperation
        const hungerAmp = 1 + (CONFIG.hungerSurgeAmp - 1) * h;
        const surge = (1.0 + CONFIG.aiSurgeMax * smoothstep(0.2, 1.0, f)) * hungerAmp;
  
        // Steer heading
        const steerWeight = clamp(turnRate * dt, 0, 1);
        const dirX = mix(this._lastDirX, want.dx, steerWeight);
        const dirY = mix(this._lastDirY, want.dy, steerWeight);
        const dirN = Math.hypot(dirX, dirY) || 1;
        this._lastDirX = dirX / dirN; this._lastDirY = dirY / dirN;
        
        // Update heading angle
        this.heading = Math.atan2(this._lastDirY, this._lastDirX);
  
        // Velocity relaxes to target
        const speed = CONFIG.moveSpeedPxPerSec * surge;
        const targetVx = this._lastDirX * speed;
        const targetVy = this._lastDirY * speed;
        const velLerp = 1 - Math.exp(-6 * dt);
        this.vx = mix(this.vx, targetVx, velLerp);
        this.vy = mix(this.vy, targetVy, velLerp);
      }
  
      draw(ctx) {
        // Skip rendering if not visible
        if (!this.visible) return;
        
        // Get color using dynamic color function
        const color = getAgentColor(this.id, this.alive);

        // sensory ring when extended
        if (this.extendedSensing && this.alive) {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.3;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.currentSensoryRange, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // Controller indicator - glowing circular border when using policy
        if (this.useController && this.controller && this.alive) {
          ctx.save();
          ctx.strokeStyle = "#ffff00"; // yellow for controller
          ctx.globalAlpha = 0.6 + Math.sin(globalTick * 0.2) * 0.3;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size/2 + 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // frustration pulse when high
        if (this.frustration >= 0.9 && this.alive) {
          ctx.save();
          ctx.strokeStyle = "#ff0000";
          ctx.globalAlpha = 0.5 + Math.sin(globalTick * 0.3) * 0.3;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // hunger pulse when starving
        if (this.hunger >= CONFIG.hungerThresholdHigh && this.alive) {
          ctx.save();
          ctx.strokeStyle = "#ff8800";
          ctx.globalAlpha = 0.4 + Math.sin(globalTick * 0.25) * 0.3;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(this.x, this.y, this.size * 0.7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // body (with decay effects if dead) - draw as circle
        ctx.save();
        
        // Apply decay visual effects
        if (!this.alive && CONFIG.decay.enabled && CONFIG.decay.visualFade) {
          // Fade and shrink based on decay progress
          const fade = 1 - this.decayProgress;
          ctx.globalAlpha = fade * 0.7; // Max 70% opacity when fresh
          
          // Change color to brown/gray as it decays
          const decayColorMix = this.decayProgress;
          ctx.fillStyle = `rgba(60, 50, 40, ${fade})`; // Dark brown decay color
        } else {
          ctx.fillStyle = color;
        }
        
        // Shrink size as it decays
        const decayScale = this.alive ? 1.0 : (1.0 - this.decayProgress * 0.6); // Shrink to 40% of original
        const effectiveSize = this.size * decayScale;
        const radius = effectiveSize / 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
        
        // Controller label above agent
        if (this.useController && this.controller) {
          ctx.save();
          ctx.font = "bold 10px ui-mono, monospace";
          ctx.fillStyle = "#ffff00";
          ctx.textAlign = "center";
          const label = this.controller.constructor.name === "LinearPolicyController" ? "POLICY" : "CTRL";
          ctx.fillText(label, this.x, this.y - this.size/2 - 8);
          
          // Show last action values if available (for debugging)
          if (this.lastAction && CONFIG.hud.showActions) {
            ctx.font = "9px ui-mono, monospace";
            ctx.fillStyle = "#ffff00";
            const actionText = `T:${this.lastAction.turn.toFixed(2)} P:${this.lastAction.thrust.toFixed(2)} S:${this.lastAction.senseFrac.toFixed(2)}`;
            ctx.fillText(actionText, this.x, this.y + this.size/2 + 16);
          }
          ctx.restore();
        }
      }
  
      /**
       * Apply action from controller (learned or heuristic)
       * Action: {turn, thrust, senseFrac}
       */
      applyAction(action, dt) {
        if (!this.alive) return 0;

        let chiSpend = 0;

        // Hunger and frustration state (for amplification)
        const f = clamp(this.frustration, 0, 1);
        const h = clamp(this.hunger, 0, 1);

        // Update heading based on turn action
        const turnRate = (CONFIG.aiTurnRateBase + CONFIG.aiTurnRateGain * f) * dt;
        this.heading += action.turn * turnRate;

        // Normalize heading to [-π, π]
        while (this.heading > Math.PI) this.heading -= 2 * Math.PI;
        while (this.heading < -Math.PI) this.heading += 2 * Math.PI;

        // Update direction vector from heading
        this._lastDirX = Math.cos(this.heading);
        this._lastDirY = Math.sin(this.heading);

        // Apply thrust to velocity with hunger-amplified surge (matching heuristic AI)
        const hungerAmp = 1 + (CONFIG.hungerSurgeAmp - 1) * h;
        const surge = (1.0 + CONFIG.aiSurgeMax * smoothstep(0.2, 1.0, f)) * hungerAmp;
        const speed = CONFIG.moveSpeedPxPerSec * action.thrust * surge;
        const targetVx = this._lastDirX * speed;
        const targetVy = this._lastDirY * speed;
        const velLerp = 1 - Math.exp(-6 * dt);
        this.vx = mix(this.vx, targetVx, velLerp);
        this.vy = mix(this.vy, targetVy, velLerp);

        // Integrate motion
        const oldX = this.x, oldY = this.y;
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        const movedDist = Math.hypot(this.x - oldX, this.y - oldY);
        if (movedDist > 0) chiSpend += CONFIG.moveCostPerSecond * dt;

        // Stay inside viewport
        const half = this.size / 2;
        this.x = clamp(this.x, half, innerWidth - half);
        this.y = clamp(this.y, half, innerHeight - half);

        // Apply sensing action
        this.extendedSensing = action.senseFrac > 0.5;
        
        // Deposit trail when moving
        if (movedDist > 0) {
          const health = clamp(this.chi / 20, 0.2, 1.0);
          const dep = CONFIG.depositPerSec * health * dt;
          Trail.deposit(this.x, this.y, dep, this.id);
          // Add subtle radial deposits around the circle for visibility
          const ringR = radius * 0.7;
          for (let k = 0; k < 4; k++) {
            const ang = (k * Math.PI) / 2;
            Trail.deposit(this.x + Math.cos(ang) * ringR, this.y + Math.sin(ang) * ringR, dep * 0.25, this.id);
          }
        }

        // Residual χ reuse
        if (movedDist > 0) {
          const { value, authorId, age } = Trail.sample(this.x, this.y);
          const isDifferentAuthor = authorId !== this.id && authorId !== 0;
          const isOldEnough = age >= CONFIG.trailCooldownTicks;
          
          // Gain from other agents' trails
          if (isDifferentAuthor && isOldEnough) {
            const squashed = Math.sqrt(value);
            const gain = Math.min(CONFIG.residualCapPerTick, CONFIG.residualGainPerSec * squashed * dt);
            this.chi += gain;
            Ledger.credit(authorId, gain);
          }
          
          // Penalty for walking on own fresh trail (discourages circuits)
          if (CONFIG.ownTrailPenalty > 0) {
            const isOwnTrail = authorId === this.id;
            const isFresh = age < CONFIG.ownTrailGraceAge;
            if (isOwnTrail && isFresh && value > 0.1) {
              const penalty = CONFIG.ownTrailPenalty * dt;
              this.chi -= penalty;
            }
          }
        }

        return { chiSpend, movedDist };
      }

      overlapsResource(res) {
        const half = this.size / 2;
        const rx = clamp(res.x, this.x - half, this.x + half);
        const ry = clamp(res.y, this.y - half, this.y + half);
        const dx = res.x - rx, dy = res.y - ry;
        return (dx*dx + dy*dy) <= (res.r * res.r);
      }

      /**
       * Check if this agent can perform mitosis
       */
      meetsPopulationLimits() {
        const aliveCount = World.bundles.filter(b => b.alive).length;
        const aliveLimit = Math.min(
          CONFIG.mitosis.maxAgents,
          CONFIG.mitosis.maxAliveAgents || CONFIG.mitosis.maxAgents
        );
        if (aliveCount >= aliveLimit) return false;

        if (CONFIG.mitosis.respectCarryingCapacity) {
          const maxPopulation = Math.max(
            aliveLimit,
            Math.floor(
              World.resources.length * CONFIG.mitosis.carryingCapacityMultiplier
            )
          );
          if (aliveCount >= maxPopulation) return false;
        }

        return true;
      }

      canMitosis() {
        if (!CONFIG.mitosis.enabled) return false;
        if (!this.alive) return false;
        if (this.chi < CONFIG.mitosis.threshold) return false;

        const ticksSinceLastMitosis = globalTick - this.lastMitosisTick;
        if (ticksSinceLastMitosis < CONFIG.mitosis.cooldown) return false;

        return this.meetsPopulationLimits();
      }

      canBud() {
        if (!CONFIG.mitosis.enabled) return false;
        if (!this.alive) return false;

        const buddingThreshold = CONFIG.mitosis.buddingThreshold || Infinity;
        if (this.chi < buddingThreshold) return false;

        if (CONFIG.mitosis.buddingRespectCooldown !== false) {
          const ticksSinceLastMitosis = globalTick - this.lastMitosisTick;
          if (ticksSinceLastMitosis < CONFIG.mitosis.cooldown) return false;
        }

        return this.meetsPopulationLimits();
      }

      spawnChild(childX, childY, childChi, heading, eventLabel) {
        const childId = World.nextAgentId++;
        const child = new Bundle(
          childX,
          childY,
          this.size,
          childChi,
          childId,
          this.useController
        );

        child.heading = heading;
        child._lastDirX = Math.cos(heading);
        child._lastDirY = Math.sin(heading);
        child.controller = this.controller;
        child.extendedSensing = this.extendedSensing;
        child.generation = this.generation + 1;
        child.parentId = this.id;
        child.lastMitosisTick = globalTick;

        World.bundles.push(child);
        World.totalBirths++;
        
        // Create lineage link
        if (CONFIG.mitosis.showLineage) {
          World.addLineageLink(this.id, childId, globalTick);
        }

        console.log(`🧫 ${eventLabel}! Agent ${this.id} (gen ${this.generation}) → Agent ${child.id} (gen ${child.generation}) | Pop: ${World.bundles.length}`);

        return child;
      }

      /**
       * Perform mitosis - create a child agent
       * Returns the child bundle or null if failed
       */
      doMitosis() {
        if (!this.canMitosis()) return null;
        
        this.chi -= CONFIG.mitosis.cost;

        const angle = CONFIG.mitosis.inheritHeading
          ? this.heading + (Math.random() - 0.5) * CONFIG.mitosis.headingNoise
          : Math.random() * Math.PI * 2;

        const offset = CONFIG.mitosis.spawnOffset;
        const half = this.size / 2;
        const childX = clamp(this.x + Math.cos(angle) * offset, half, innerWidth - half);
        const childY = clamp(this.y + Math.sin(angle) * offset, half, innerHeight - half);

        const child = this.spawnChild(
          childX,
          childY,
          CONFIG.mitosis.childStartChi,
          angle,
          "Mitosis"
        );

        this.lastMitosisTick = globalTick;

        return child;
      }

      doBudding() {
        if (!this.canBud()) return null;

        const share = clamp(
          CONFIG.mitosis.buddingShare ?? 0.5,
          0.05,
          0.95
        );
        const childChi = this.chi * share;
        this.chi *= (1 - share);

        const jitter = CONFIG.mitosis.buddingOffset ?? 20;
        const half = this.size / 2;
        const childX = clamp(this.x + randomRange(-jitter, jitter), half, innerWidth - half);
        const childY = clamp(this.y + randomRange(-jitter, jitter), half, innerHeight - half);

        const angle = CONFIG.mitosis.inheritHeading
          ? this.heading
          : Math.random() * Math.PI * 2;

        const child = this.spawnChild(childX, childY, childChi, angle, "Budding");

        this.lastMitosisTick = globalTick;

        return child;
      }

      /**
       * Attempt mitosis if conditions are met (called each frame)
       */
      attemptMitosis() {
        if (this.canBud()) {
          this.doBudding();
        } else if (this.canMitosis()) {
          this.doMitosis();
        }
      }

      /**
       * Update decay for dead agents
       * Returns true if fully decayed (ready for removal)
       */
      updateDecay(dt, fertilityGrid) {
        if (!CONFIG.decay.enabled) return false;
        if (this.alive) return false;
        
        // Initialize decay tracking if not set (defensive check)
        if (typeof this.deathTick !== 'number') this.deathTick = -1;
        if (typeof this.decayProgress !== 'number') this.decayProgress = 0;
        if (typeof this.chiAtDeath !== 'number') this.chiAtDeath = 0;
        
        // Initialize death tracking if not set
        if (this.deathTick < 0) {
          this.deathTick = globalTick;
        }
        
        // Calculate decay progress (0 to 1)
        const ticksSinceDeath = globalTick - this.deathTick;
        this.decayProgress = Math.min(1, ticksSinceDeath / CONFIG.decay.duration);
        
        // Release chi into fertility grid gradually
        if (fertilityGrid && CONFIG.plantEcology.enabled && ticksSinceDeath % 10 === 0) {
          const chiToRelease = this.chiAtDeath * (0.02); // Release 2% per interval
          if (chiToRelease > 0 && !isNaN(chiToRelease)) {
            const fertilityGain = chiToRelease * CONFIG.decay.fertilityBoost;
            if (fertilityGain > 0 && !isNaN(fertilityGain)) {
              fertilityGrid.addFertilityRadial(
                this.x, 
                this.y, 
                CONFIG.decay.releaseRadius, 
                fertilityGain
              );
              this.chiAtDeath = Math.max(0, this.chiAtDeath - chiToRelease);
            }
          }
        }
        
        // Return true if fully decayed and ready for removal
        return CONFIG.decay.removeAfterDecay && this.decayProgress >= 1.0;
      }
    }
  
    class Resource {
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
      }
      
      draw(ctx) {
        // Don't draw if on cooldown (invisible)
        if (!this.visible) return;
        
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI*2);
        
        // Color based on local fertility if plant ecology enabled
        if (CONFIG.plantEcology.enabled && FertilityField) {
          const fertility = FertilityField.sampleAt(this.x, this.y);
          const brightness = Math.floor(155 + fertility * 100);
          ctx.fillStyle = `rgb(0, ${brightness}, 88)`;
        } else {
          ctx.fillStyle = "#00ff88";
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
          const pulse = (Math.sin(globalTick * 0.05) + 1) / 2; // 0..1

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
        // Use fertility-based spawning if plant ecology enabled
        if (CONFIG.plantEcology.enabled && FertilityField) {
          const location = getResourceSpawnLocation(FertilityField, innerWidth, innerHeight);
          this.x = location.x;
          this.y = location.y;
        } else {
          // Fallback: random spawn
          const margin = 60;
          this.x = margin + Math.random() * (innerWidth  - 2*margin);
          this.y = margin + Math.random() * (innerHeight - 2*margin);
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
        this.cooldownEnd = globalTick + CONFIG.resourceRespawnCooldown;
        this.visible = false; // Hide resource during cooldown
      }
      
      /**
       * Check if cooldown has expired and respawn if ready
       */
      updateCooldown() {
        if (this.cooldownEnd > 0 && globalTick >= this.cooldownEnd) {
          // Cooldown expired, respawn
          this.respawn();
          // Update Z position to terrain height if terrain enabled
          if (typeof getTerrainHeight === 'function') {
            this.z = getTerrainHeight(this.x, this.y);
          }
        }
      }
      
      update(dt) {
        this.age++;
        this.updateCooldown();
      }
    }
  
    // ---------- World ----------
    const World = {
      paused: false,
      bundles: [],
      resources: [],  // Changed from single resource to array
      collected: 0,
      
      // Mitosis tracking
      nextAgentId: 5,  // Start at 5 (after initial 4 agents: 1-4)
      totalBirths: 0,  // Count of all mitosis events
      lineageLinks: [], // Array of {parentId, childId, birthTick} for visual lineage tracking
      
      // === Resource Ecology (carrying capacity model) ===
      carryingCapacity: 0,           // Current max resources (starts high, declines to stable)
      resourcePressure: 0,           // Accumulated depletion pressure (0..1)
      
      // === Adaptive Reward Tracking ===
      avgFindTime: 4.0,              // EMA of time between resource finds (seconds)
      avgAlpha: 0.1,                 // EMA smoothing factor (fallback if not in config)
      lastFindTimestamp: null,       // Timestamp of last resource collection
      rewardStats: {                 // Statistics for monitoring
        totalRewards: 0,
        avgRewardGiven: 0,
        minFindTime: Infinity,
        maxFindTime: 0
      },
      
      reset() {
        Trail.clear();
        globalTick = 0;
        Ledger.credits = {};
        // Clear all links on reset
        Links.length = 0;
        
        // Reset mitosis tracking
        this.nextAgentId = 5;
        this.totalBirths = 0;
        this.lineageLinks = [];
        
        const cx = innerWidth / 2, cy = innerHeight / 2;
        this.bundles = [
          new Bundle(cx - 100, cy - 80, CONFIG.bundleSize, CONFIG.startChi, 1),
          new Bundle(cx + 100, cy + 80, CONFIG.bundleSize, CONFIG.startChi, 2),
          new Bundle(cx - 100, cy + 80, CONFIG.bundleSize, CONFIG.startChi, 3),
          new Bundle(cx + 100, cy - 80, CONFIG.bundleSize, CONFIG.startChi, 4),
        ];
        
        // Initialize resource ecology
        this.resources = [];
        if (CONFIG.resourceDynamicCount) {
          // Calculate initial resource count
          let initialCount;
          
          // If using plant ecology with agent-scaled resources, respect competition
          if (CONFIG.plantEcology.enabled && CONFIG.resourceScaleWithAgents) {
            const startingAgents = this.bundles.length;
            initialCount = Math.floor(
              clamp(
                CONFIG.resourceBaseAbundance - (startingAgents * CONFIG.resourceCompetition),
                CONFIG.resourceScaleMinimum,
                CONFIG.resourceScaleMaximum
              )
            );
            console.log(`🌱 Initial resources: ${initialCount} (${startingAgents} starting agents)`);
          } else {
            // Legacy: start with abundant resources, will decline to stable level
            initialCount = Math.floor(
              CONFIG.resourceInitialMin + 
              Math.random() * (CONFIG.resourceInitialMax - CONFIG.resourceInitialMin + 1)
            );
          }
          
          this.carryingCapacity = initialCount;
          this.resourcePressure = 0; // No depletion pressure at start
          
          for (let i = 0; i < initialCount; i++) {
            const res = new Resource(cx + 120, cy, CONFIG.resourceRadius);
            res.respawn();
            this.resources.push(res);
          }
        } else {
          // Legacy fixed count mode
          const numResources = CONFIG.resourceCount || 1;
          for (let i = 0; i < numResources; i++) {
            const res = new Resource(cx + 120, cy, CONFIG.resourceRadius);
            res.respawn();
            this.resources.push(res);
          }
        }
        
        this.collected = 0;
        
        // Don't reset EMA across episodes during training (tracks long-term difficulty)
        // Only reset timestamp so first find in episode starts fresh
        this.lastFindTimestamp = performance.now() / 1000;
      },
      
      // Add lineage link when mitosis occurs
      addLineageLink(parentId, childId, birthTick) {
        this.lineageLinks.push({
          parentId: parentId,
          childId: childId,
          birthTick: birthTick
        });
      },
      
      // Clean up lineage links (remove expired or invalid links)
      cleanupLineageLinks() {
        if (!CONFIG.mitosis.showLineage) return;
        
        const maxAge = CONFIG.mitosis.lineageFadeDuration || 600;
        const now = globalTick;
        
        // Filter out expired links and links where parent or child no longer exists
        this.lineageLinks = this.lineageLinks.filter(link => {
          const age = now - link.birthTick;
          if (age > maxAge) return false; // Link expired
          
          // Check if parent and child still exist
          const parent = this.bundles.find(b => b.id === link.parentId);
          const child = this.bundles.find(b => b.id === link.childId);
          
          return parent && child; // Keep link if both exist
        });
      },
      
      // Helper function to get nearest resource to a bundle (only visible resources)
      getNearestResource(bundle) {
        const visibleResources = this.resources.filter(res => res.visible);
        if (visibleResources.length === 0) return null;
        
        let nearest = visibleResources[0];
        let minDist = Math.hypot(bundle.x - nearest.x, bundle.y - nearest.y);
        
        for (let i = 1; i < visibleResources.length; i++) {
          const dist = Math.hypot(bundle.x - visibleResources[i].x, bundle.y - visibleResources[i].y);
          if (dist < minDist) {
            minDist = dist;
            nearest = visibleResources[i];
          }
        }
        
        return nearest;
      },

      // Update resource ecology (carrying capacity model)
      updateEcology(dt) {
        // If plant ecology is enabled, it handles all resource management!
        if (CONFIG.plantEcology.enabled) {
          // Plant ecology manages resources via fertility, seed dispersal, etc.
          // Just update carrying capacity for mitosis population limits
          const aliveCount = this.bundles.filter(b => b.alive).length;
          this.carryingCapacity = Math.max(
            CONFIG.resourceStableMin, 
            Math.floor(this.resources.length * 1.2)  // Loose cap based on current resources
          );
          return;
        }
        
        // Legacy system (only used when plant ecology disabled)
        if (!CONFIG.resourceDynamicCount) return; // Skip if using fixed count
        
        // Resource pressure decays slowly over time (ecosystem recovery)
        this.resourcePressure = Math.max(0, this.resourcePressure - 0.001 * dt);
        
        // Calculate current target carrying capacity based on pressure
        // Linearly interpolate from initial abundance to stable minimum
        const targetCapacity = Math.floor(
          CONFIG.resourceStableMin + 
          (CONFIG.resourceInitialMax - CONFIG.resourceStableMin) * (1 - this.resourcePressure)
        );
        
        // Gradually adjust carrying capacity toward target
        this.carryingCapacity = Math.max(CONFIG.resourceStableMin, targetCapacity);
        
        // Random resource spawning (if below stable max and below carrying capacity)
        if (this.resources.length < CONFIG.resourceStableMax && 
            this.resources.length < this.carryingCapacity) {
          const spawnChance = CONFIG.resourceRecoveryChance * dt;
          if (Math.random() < spawnChance) {
            const cx = innerWidth / 2, cy = innerHeight / 2;
            const res = new Resource(cx, cy, CONFIG.resourceRadius);
            res.respawn();
            this.resources.push(res);
          }
        }
        
        // Remove excess resources if carrying capacity dropped
        while (this.resources.length > this.carryingCapacity) {
          this.resources.pop();
        }
      },

      // Handle resource collection with ecology effects
      onResourceCollected() {
        // Plant ecology handles depletion via fertility system
        if (CONFIG.plantEcology.enabled) return;
        
        // Legacy system only
        if (!CONFIG.resourceDynamicCount) return;
        
        // Increase depletion pressure (simulates ecosystem stress from harvesting)
        this.resourcePressure = Math.min(1, this.resourcePressure + CONFIG.resourceDepletionRate);
      }
    };
    World.reset();
  
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
      if (!CONFIG.hud.show) return;
      ctx.save();
      ctx.font = "12px ui-mono, monospace";
      ctx.textAlign = "left";

      const lineHeight = 14;
      const sectionSpacing = 6;
      const writeHudLines = (section, startY) => {
        const lines = section.lines.filter(Boolean);
        if (!lines.length) return startY;
        let y = startY;
        ctx.fillStyle = section.color;
        lines.forEach(line => {
          ctx.fillText(line, 10, y);
          y += lineHeight;
        });
        return y + sectionSpacing;
      };

      const mode = CONFIG.autoMove ? "AUTO" : "MANUAL";
      const diffState = CONFIG.enableDiffusion ? "ON" : "OFF";
      const learningModeDisplay = learningMode === 'train' ? "TRAINING" : "PLAY";
      const mitosisStatus = CONFIG.mitosis.enabled ? "ON" : "OFF";
      const scentStatus = showScentGradient ? "ON" : "OFF";
      const fertilityStatus = showFertility ? "ON" : "OFF";

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
          resourceDetails = `agents ${aliveCount} | pressure ${pressurePct}%`;
        } else {
          resourceSummary = `${World.resources.length}/${World.carryingCapacity}`;
          resourceDetails = `plants ${World.carryingCapacity}`;
        }
      } else if (CONFIG.resourceDynamicCount) {
        resourceSummary = `${World.resources.length}/${World.carryingCapacity}`;
        resourceDetails = `pressure ${(World.resourcePressure * 100).toFixed(0)}%`;
      }

      const hudSections = [];

      hudSections.push({
        color: "#88ffff",
        lines: [
          `📊 agents ${aliveCount}/${totalAgents}`,
          `${"avg χ".padEnd(12)}${avgChi.toFixed(1)}   ${"births".padEnd(12)}${World.totalBirths}`,
          `${"avg F/H".padEnd(12)}${Math.round(avgFrustration * 100)}% / ${Math.round(avgHunger * 100)}%`
        ]
      });

      const generalLines = [
        `${"mode".padEnd(12)}${mode.padEnd(8)}${"learning".padEnd(12)}${learningModeDisplay.padEnd(9)}`,
        `${"tick".padEnd(12)}${globalTick.toString().padEnd(8)}${"χ earned".padEnd(12)}${World.collected.toString().padEnd(8)}`,
        `${"diffusion".padEnd(12)}${diffState.padEnd(4)}${"mitosis".padEnd(12)}${mitosisStatus.padEnd(4)}`,
        `${"🌿 resources".padEnd(14)}${resourceSummary}`
      ];
      if (resourceDetails) {
        generalLines.push(`${"".padEnd(14)}${resourceDetails}`);
      }

      hudSections.push({
        color: "#00ff88",
        lines: generalLines
      });

      if (CONFIG.adaptiveReward?.enabled) {
        const nextReward = calculateAdaptiveReward(World.avgFindTime);
        hudSections.push({
          color: "#ffaa00",
          lines: [
            `${"avg find".padEnd(12)}${World.avgFindTime.toFixed(2)}s`,
            `${"next χ".padEnd(12)}≈${nextReward.toFixed(1)}   ${"avg given".padEnd(12)}${World.rewardStats.avgRewardGiven.toFixed(1)}χ`
          ]
        });
      }

      const controlsLines = [
        `[WASD] move   [Space] pause   [R] reset   [C] +5χ`,
        `[A] auto   [S] extSense   [G] scent(${scentStatus})   [P] fertility(${fertilityStatus})`,
        `[M] mitosis(${mitosisStatus})   [T] trail   [X] clear   [F] diffuse   [L] train`,
        `[H] agents(${showAgentDashboard ? "ON" : "OFF"})   [1-4] agent vis   [V] toggle all`
      ];

      hudSections.push({
        color: "#00ff88",
        lines: controlsLines
      });

      let currentY = 28;
      hudSections.forEach(section => {
        currentY = writeHudLines(section, currentY);
      });

      if (showAgentDashboard) {
        drawAgentDashboardOverlay();
      }

      ctx.restore();
    }

    function drawAgentDashboardOverlay() {
      const agents = World.bundles;
      if (!agents.length) return;

      const viewWidth = canvas.width / dpr;
      const viewHeight = canvas.height / dpr;
      const padding = 12;
      const columnWidth = 240;
      const rowHeight = 16;
      const headerHeight = 20;

      const maxRows = Math.max(1, Math.floor((viewHeight - padding * 2 - headerHeight) / rowHeight));
      const maxColumns = Math.max(1, Math.floor((viewWidth - padding * 2) / columnWidth));

      let columns = 1;
      let rowsPerColumn = Math.ceil(agents.length / columns);
      while (columns < maxColumns && rowsPerColumn > maxRows) {
        columns += 1;
        rowsPerColumn = Math.ceil(agents.length / columns);
      }

      columns = Math.max(1, Math.min(columns, maxColumns, agents.length || 1));
      rowsPerColumn = Math.max(1, Math.ceil(agents.length / columns));

      const panelWidth = Math.min(viewWidth - 20, columns * columnWidth + padding * 2);
      const panelHeight = Math.min(viewHeight - 20, headerHeight + rowsPerColumn * rowHeight + padding * 2);
      const panelX = Math.max(10, viewWidth - panelWidth - 10);
      const panelY = 10;

      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
      ctx.strokeStyle = "rgba(0, 255, 136, 0.6)";
      ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

      ctx.font = "12px ui-mono, monospace";
      ctx.fillStyle = "#00ff88";
      ctx.fillText(`Agent dashboard (${agents.length})`, panelX + padding, panelY + padding);
      ctx.font = "11px ui-mono, monospace";
      ctx.fillStyle = "#d0ffd8";
      ctx.fillText("vis/alive  ID  χ     cr    F    H    sense  controller", panelX + padding, panelY + padding + 12);

      const contentY = panelY + padding + headerHeight;

      agents.forEach((bundle, index) => {
        const column = Math.floor(index / rowsPerColumn);
        const row = index % rowsPerColumn;
        const rowX = panelX + padding + column * columnWidth;
        const rowY = contentY + row * rowHeight;
        if (rowY > panelY + panelHeight - padding) return;

        const aliveIcon = bundle.alive ? "✓" : "✗";
        const visibilityIcon = bundle.visible ? "👁" : "🚫";
        const frustrationPct = Math.round(clamp(bundle.frustration, 0, 1) * 100).toString().padStart(3, " ");
        const hungerPct = Math.round(clamp(bundle.hunger, 0, 1) * 100).toString().padStart(3, " ");
        const chiStr = bundle.chi.toFixed(1).padStart(5, " ");
        const creditStr = Ledger.getCredits(bundle.id).toFixed(1).padStart(5, " ");
        const senseStr = Math.round(bundle.currentSensoryRange || 0).toString().padStart(3, " ");
        let controllerLabel = getControllerBadge(bundle, index);
        if (controllerLabel.length > 18) {
          controllerLabel = `${controllerLabel.slice(0, 17)}…`;
        }
        const idLabel = `A${bundle.id.toString().padStart(2, "0")}`;

        ctx.fillStyle = bundle.alive ? getAgentColor(bundle.id, true) : "#777777";
        ctx.fillText(
          `${visibilityIcon}${aliveIcon}   ${idLabel} χ${chiStr} cr${creditStr} F${frustrationPct}% H${hungerPct}% s${senseStr}  ${controllerLabel}`,
          rowX,
          rowY
        );
      });

      const totalCapacity = rowsPerColumn * columns;
      if (totalCapacity < agents.length) {
        ctx.font = "10px ui-mono, monospace";
        ctx.fillStyle = "#ffaa88";
        ctx.fillText(`showing ${totalCapacity} of ${agents.length} agents`, panelX + padding, panelY + panelHeight - padding);
      }

      ctx.restore();
    }

    // ---------- Main loop ----------
    let last = performance.now();
    function loop(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
  
      if (!World.paused) {
        try {
          Trail.captureSnapshot(); // fair residuals (prev frame)
        
        // Link formation pass (cheap local heuristic)
        for (let i = 0; i < World.bundles.length; i++) {
          for (let j = i + 1; j < World.bundles.length; j++) {
            const a = World.bundles[i];
            const b = World.bundles[j];
            if (!a.alive || !b.alive) continue;
            tryFormLink(a, b);
          }
        }

        // Update each bundle with nearest resource
        World.bundles.forEach(b => {
          const nearestResource = World.getNearestResource(b);
          b.update(dt, nearestResource);
        });
        
        // Link maintenance & decay, use-based strengthening
        maintainLinks(dt);

        Trail.step(dt);
        
        // Trail reinforcement along active links
        reinforceLinks(dt);

        // Update resource ecology (carrying capacity dynamics)
        World.updateEcology(dt);

        // Consumable scent gradient: orbiting erodes, absence recovers
        if (CONFIG.scentGradient.consumable) {
          const orbitBand = CONFIG.scentGradient.orbitBandPx;
          const minStrength = CONFIG.scentGradient.minStrength;
          const minRange = CONFIG.scentGradient.minRange;
          const baseStrength = CONFIG.scentGradient.strength;
          const baseRange = CONFIG.scentGradient.maxRange;
          const consumeRate = CONFIG.scentGradient.consumePerSec * dt;
          const recoverRate = CONFIG.scentGradient.recoverPerSec * dt;

          for (const res of World.resources) {
            if (!res.visible) continue;
            // Find nearest alive agent distance
            let nearest = Infinity;
            for (const b of World.bundles) {
              if (!b.alive) continue;
              const d = Math.hypot(res.x - b.x, res.y - b.y);
              if (d < nearest) nearest = d;
            }
            // Inside orbit band (outside core radius)
            const inner = res.r;
            const outer = res.r + orbitBand;
            if (nearest > inner && nearest <= outer) {
              const t = 1 - (nearest - inner) / Math.max(1e-6, outer - inner); // 0..1 closer => bigger
              const use = t * t; // quadratic for stronger close-in consumption
              res.scentStrength = Math.max(minStrength, res.scentStrength - consumeRate * use);
              // Optionally tie range to strength fraction
              const frac = res.scentStrength / baseStrength;
              const targetRange = Math.max(minRange, baseRange * frac);
              // Smoothly relax toward target
              res.scentRange += (targetRange - res.scentRange) * 0.5;
            } else {
              // Recover when no close orbiters
              res.scentStrength = Math.min(baseStrength, res.scentStrength + recoverRate);
              res.scentRange = Math.min(baseRange, res.scentRange + (baseRange - res.scentRange) * 0.1);
            }
          }
        }
        
        // Clean up expired lineage links
        World.cleanupLineageLinks();

        // Agent collision detection and separation
        if (CONFIG.enableAgentCollision) {
          for (let i = 0; i < World.bundles.length; i++) {
            for (let j = i + 1; j < World.bundles.length; j++) {
              const a = World.bundles[i];
              const b = World.bundles[j];
              
              // Skip if either agent is dead
              if (!a.alive || !b.alive) continue;
              
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const dist = Math.hypot(dx, dy);
              const minDist = a.size; // Both agents same size
              
              if (dist < minDist && dist > 0.001) {
                // Overlapping! Push them apart
                const overlap = minDist - dist;
                const nx = dx / dist; // Normalized direction
                const ny = dy / dist;
                
                // Push each agent away by half the overlap
                const pushStrength = CONFIG.agentCollisionPushback;
                a.x -= nx * overlap * pushStrength;
                a.y -= ny * overlap * pushStrength;
                b.x += nx * overlap * pushStrength;
                b.y += ny * overlap * pushStrength;
                
                // Keep agents in bounds after collision
                const half = a.size / 2;
                a.x = clamp(a.x, half, innerWidth - half);
                a.y = clamp(a.y, half, innerHeight - half);
                b.x = clamp(b.x, half, innerWidth - half);
                b.y = clamp(b.y, half, innerHeight - half);
              }
            }
          }
        }

        // Resource collection - check all resources for each bundle
        World.bundles.forEach(b => {
          if (!b.alive) return;
          
          for (let res of World.resources) {
            // Only collect if resource is visible (not on cooldown)
            if (res.visible && b.overlapsResource(res)) {
              b.chi += CONFIG.rewardChi;
              b.alive = true;
              b.lastCollectTick = globalTick;
              b.frustration = 0;
              // Eating reduces hunger significantly
              b.hunger = Math.max(0, b.hunger - CONFIG.hungerDecayOnCollect);
              // Reset decay state (in case agent was dead/decaying)
              b.deathTick = -1;
              b.decayProgress = 0;
              World.collected += 1;
              World.onResourceCollected(); // Track ecology impact
              
              // Deplete fertility at harvest location (plant ecology)
              if (CONFIG.plantEcology.enabled && FertilityField) {
                FertilityField.depleteAt(res.x, res.y, globalTick);
              }
              
              // Start cooldown instead of immediate respawn
              res.startCooldown();
              break; // Only collect one resource per frame
            }
          }
        });
        
        // Update resources (aging)
        World.resources.forEach(res => res.update(dt));
        
        // Plant Ecology: Seed dispersal and spontaneous growth
        if (CONFIG.plantEcology.enabled && FertilityField) {
          // Calculate dynamic resource limit based on living agents (INVERSE: more agents = less food)
          let maxResources = CONFIG.resourceStableMax;
          const aliveCount = World.bundles.filter(b => b.alive).length;

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
            World.resources.splice(-excess, excess);
            console.log(`🔪 Culled ${excess} excess resources due to competition (${aliveCount} agents)`);
          }

          // Seed dispersal (resources spawn near existing ones)
          const seedLocation = attemptSeedDispersal(World.resources, FertilityField, globalTick, dt, aliveCount);
          if (seedLocation && World.resources.length < maxResources) {
            const newResource = new Resource(seedLocation.x, seedLocation.y, CONFIG.resourceRadius);
            World.resources.push(newResource);
            console.log(`🌱 Seed sprouted at (${Math.round(seedLocation.x)}, ${Math.round(seedLocation.y)}) | Fertility: ${seedLocation.fertility.toFixed(2)}`);
          }

          // Spontaneous growth (resources appear in fertile soil)
          const growthLocation = attemptSpontaneousGrowth(FertilityField, dt, aliveCount);
          if (growthLocation && World.resources.length < maxResources) {
            const newResource = new Resource(growthLocation.x, growthLocation.y, CONFIG.resourceRadius);
            World.resources.push(newResource);
            console.log(`🌿 Spontaneous growth at (${Math.round(growthLocation.x)}, ${Math.round(growthLocation.y)}) | Fertility: ${growthLocation.fertility.toFixed(2)}`);
          }

          // Update fertility grid (recovery + population pressure)
          FertilityField.update(dt, aliveCount, globalTick);
        }

        // Mitosis - agents attempt reproduction (only in play mode, not during training)
        if (learningMode === 'play') {
          // Use traditional for loop to avoid issues with array modification during iteration
          const currentBundles = [...World.bundles]; // Copy array
          currentBundles.forEach(b => {
            if (b.alive) {
              b.attemptMitosis();
            }
          });
        }

        // Decay - dead agents decay and recycle chi into fertility
        if (CONFIG.decay.enabled) {
          try {
            // Update decay for all dead agents and mark fully decayed ones for removal
            const toRemove = [];
            World.bundles.forEach((b, idx) => {
              try {
                const fullyDecayed = b.updateDecay(dt, FertilityField);
                if (fullyDecayed) {
                  toRemove.push(idx);
                }
              } catch (err) {
                console.error(`Error updating decay for agent ${b.id}:`, err);
              }
            });
            
            // Remove fully decayed agents (iterate backwards to avoid index shifts)
            for (let i = toRemove.length - 1; i >= 0; i--) {
              const idx = toRemove[i];
              if (idx >= 0 && idx < World.bundles.length) {
                const removed = World.bundles.splice(idx, 1)[0];
                console.log(`💀 Agent ${removed.id} fully decayed and removed | Pop: ${World.bundles.length}`);
              }
            }
          } catch (err) {
            console.error('Error in decay system:', err);
          }
        }

          globalTick++;
        } catch (err) {
          console.error('Critical error in main loop (tick ' + globalTick + '):', err);
          console.error('Stack trace:', err.stack);
          // Don't pause - let simulation continue
        }
      }
  
      // draw
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw fertility visualization if enabled (below trails)
      if (showFertility && CONFIG.plantEcology.enabled && FertilityField) {
        FertilityField.draw(ctx);
      }
      
      Trail.draw();
      
      // Draw links (debug visualization)
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
      
      // Draw lineage links (parent-child connections)
      if (CONFIG.mitosis.showLineage) {
        drawLineageLinks(ctx);
      }
      
      // Draw all resources (only visible ones)
      World.resources.forEach(res => {
        if (res.visible) {
          res.draw(ctx);
        }
      });
      
      World.bundles.forEach(b => b.draw(ctx));
      drawHUD();
  
      requestAnimationFrame(loop);
    }
    
    // ---------- Training System Integration ----------
    
    /**
     * Run one episode with a given policy
     * Returns total reward (combined from all agents)
     */
    async function runEpisode(policy) {
      // Reset world for fresh episode
      World.reset();
      episodeManager.startEpisode();
      
      // Set ALL bundles to use this policy (shared policy multi-agent learning!)
      World.bundles.forEach(bundle => {
        bundle.controller = policy;
        bundle.useController = true;
        bundle.rewardTracker.reset();
      });
      
      // Reset ledger for provenance tracking
      Ledger.credits = {};
      
      let totalReward = 0;
      let episodeTicks = 0;
      const maxTicks = CONFIG.learning.episodeLength;
      
      // Run episode (continue while ANY agent is alive)
      while (episodeTicks < maxTicks && World.bundles.some(b => b.alive)) {
        const dt = 1/60; // Fixed timestep for training
        
        // Capture snapshot for fair trail sampling
        Trail.captureSnapshot();
        
        // Update BOTH agents
        let totalChiSpent = 0;
        let totalCollected = 0;
        
        for (let i = 0; i < World.bundles.length; i++) {
          const bundle = World.bundles[i];
          if (!bundle.alive) continue; // Skip dead agents
          
          // Track chi before update
          const chiBeforeUpdate = bundle.chi;
          
          // Update bundle with nearest resource
          const nearestResource = World.getNearestResource(bundle);
          bundle.update(dt, nearestResource);
          
          // Calculate chi spent
          const chiSpent = Math.max(0, chiBeforeUpdate - bundle.chi);
          totalChiSpent += chiSpent;
          
          // Check resource collection - check all resources
          let collectedResource = false;
          
          for (let res of World.resources) {
            // Only collect if resource is visible (not on cooldown)
            if (bundle.alive && res.visible && bundle.overlapsResource(res)) {
              // === Adaptive Reward Calculation ===
              let rewardChi;
              
              if (CONFIG.adaptiveReward?.enabled) {
                // Update EMA and get adaptive reward
                const dtFind = updateFindTimeEMA(World);
                rewardChi = calculateAdaptiveReward(World.avgFindTime);
                
                // Update stats
                World.rewardStats.totalRewards += rewardChi;
                World.rewardStats.avgRewardGiven = World.rewardStats.totalRewards / (World.collected + 1);
                
                // Log for debugging (every 10 collections)
                if (World.collected % 10 === 0 && World.collected > 0) {
                  console.log(`[Adaptive Reward] Find #${World.collected}: ` +
                              `dt=${dtFind.toFixed(2)}s, ` +
                              `avgT=${World.avgFindTime.toFixed(2)}s, ` +
                              `reward=${rewardChi.toFixed(2)}χ`);
                }
              } else {
                // Fallback to fixed reward
                rewardChi = CONFIG.rewardChi;
              }
              
              bundle.chi += rewardChi;
              bundle.alive = true;
              bundle.lastCollectTick = globalTick;
              bundle.frustration = 0;
              // Eating reduces hunger significantly
              bundle.hunger = Math.max(0, bundle.hunger - CONFIG.hungerDecayOnCollect);
              // Reset decay state (in case agent was dead/decaying)
              bundle.deathTick = -1;
              bundle.decayProgress = 0;
              World.collected += 1;
              World.onResourceCollected(); // Track ecology impact
              // Start cooldown instead of immediate respawn
              res.startCooldown();
              collectedResource = true;
              totalCollected++;
              break; // Only collect one resource per frame
            }
          }
          
          // Compute reward for this agent
          const provenanceCredit = Ledger.getCredits(bundle.id);
          const stepReward = bundle.rewardTracker.computeStepReward(
            collectedResource,
            chiSpent,
            provenanceCredit,
            World.resources  // Pass resources for gradient climbing reward
          );
          totalReward += stepReward;
        }
        
        // Update trail field (shared environment)
        Trail.step(dt);
        
        globalTick++;
        episodeTicks++;
        
        // Yield to browser occasionally to keep UI responsive
        if (episodeTicks % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      
      // Add death penalties for agents that died
      for (const bundle of World.bundles) {
        if (!bundle.alive && episodeTicks < maxTicks) {
          totalReward += CONFIG.learning.rewards.death;
        }
      }
      
      const summary = episodeManager.endEpisode(World.bundles[0].rewardTracker);
      return totalReward;
    }
    
    /**
     * Initialize Training Manager
     */
    function initializeTrainingManager() {
      trainingManager = new TrainingManager(
        learner,
        () => World.reset(),
        (policy) => runEpisode(policy)
      );
    }
    
    /**
     * Initialize Training UI and callbacks
     */
    function initializeTrainingUI() {
      const ui = new TrainingUI(document.body);
      window.trainingUI = ui; // Make globally accessible
      
      // Mode change
      ui.on('onModeChange', (mode) => {
        learningMode = mode;
        if (mode === 'train') {
          console.log('Switched to Training Mode');
          World.bundles.forEach(b => b.useController = true);
        } else {
          console.log('Switched to Play Mode');
          World.bundles.forEach(b => b.useController = false);
        }
      });
      
      // Start training
      ui.on('onStartTraining', async (numGenerations) => {
        if (!trainingManager) initializeTrainingManager();
        
        stopTrainingFlag = false; // Reset flag
        
        console.log(`🤝 Multi-Agent Training Starting: ALL ${World.bundles.length} agents use shared policy`);
        console.log(`   Episode reward = Sum of all agent rewards`);
        console.log(`   Agents can learn cooperation via trails and provenance credits!`);
        
        ui.updateStats({
          status: 'Multi-Agent Training...',
          generation: learner.generation,
          populationSize: CONFIG.learning.populationSize
        });
        
        World.paused = true; // Pause visualization during training
        
        for (let gen = 0; gen < numGenerations; gen++) {
          // Check stop flag
          if (stopTrainingFlag) {
            console.log('Training stopped by user');
            break;
          }
          
          const result = await trainingManager.runGeneration();
          
          // Update UI
          ui.updateStats({
            status: `Gen ${result.generation}/${numGenerations}`,
            generation: result.generation,
            bestReward: result.bestReward,
            meanReward: result.meanReward,
            currentPolicy: trainingManager.currentPolicy,
            populationSize: CONFIG.learning.populationSize
          });
          
          // Update chart
          const stats = learner.getStats();
          if (stats) {
            ui.drawLearningCurve(stats.history);
          }
          
          console.log(`Gen ${result.generation}: best=${result.bestReward.toFixed(2)}, mean=${result.meanReward.toFixed(2)}`);
        }
        
        ui.updateStats({
          status: stopTrainingFlag ? 'Training Stopped' : 'Training Complete!',
          generation: learner.generation,
          bestReward: learner.bestReward,
          populationSize: CONFIG.learning.populationSize
        });
        
        World.paused = false;
        
        document.getElementById('start-training').disabled = false;
        document.getElementById('stop-training').disabled = true;
      });
      
      // Stop training
      ui.on('onStopTraining', () => {
        stopTrainingFlag = true;
        if (trainingManager) {
          trainingManager.stop();
        }
        World.paused = false;
        console.log('Stop training requested');
      });
      
      // Reset learner
      ui.on('onResetLearner', () => {
        learner.generation = 0;
        learner.bestReward = -Infinity;
        learner.bestWeights = null;
        learner.history = [];
        learner.mu = new Array(learner.weightDims).fill(0);
        learner.sigma = new Array(learner.weightDims).fill(CONFIG.learning.mutationStdDev);
        
        ui.updateStats({
          status: 'Learner Reset',
          generation: 0,
          bestReward: 0,
          meanReward: 0
        });
        
        ui.drawLearningCurve([]);
        
        console.log('Learner reset to initial state');
      });
      
      // Save policy
      ui.on('onSavePolicy', () => {
        const state = learner.save();
        const json = JSON.stringify(state, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `slime-policy-gen${learner.generation}.json`;
        a.click();
        URL.revokeObjectURL(url);
        console.log('Policy saved!');
      });
      
      // Load policy
      ui.on('onLoadPolicy', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                const state = JSON.parse(e.target.result);
                learner.load(state);
                
                // Store loaded policy info
                loadedPolicyInfo = {
                  filename: file.name,
                  generation: learner.generation,
                  bestReward: learner.bestReward,
                  timestamp: new Date().toLocaleString()
                };
                
                // Update UI
                ui.updateStats({
                  status: 'Policy Loaded!',
                  generation: learner.generation,
                  bestReward: learner.bestReward
                });
                ui.drawLearningCurve(learner.history);
                ui.showLoadedPolicyInfo(file.name, learner.generation, learner.bestReward);
                
                console.log(`Policy loaded: ${file.name} (Gen ${learner.generation}, Reward: ${learner.bestReward.toFixed(2)})`);
              } catch (err) {
                console.error('Failed to load policy:', err);
                alert('Failed to load policy file');
              }
            };
            reader.readAsText(file);
          }
        };
        input.click();
      });
      
      // Test best policy
      ui.on('onTestPolicy', () => {
        const bestPolicy = learner.getBestPolicy();
        if (bestPolicy) {
          World.reset();
          // Apply policy to ALL agents
          World.bundles.forEach(bundle => {
            bundle.controller = bestPolicy;
            bundle.useController = true;
          });
          learningMode = 'play';
          const infoStr = loadedPolicyInfo 
            ? `${loadedPolicyInfo.filename} (Gen ${loadedPolicyInfo.generation})`
            : `current best (Gen ${learner.generation})`;
          console.log(`Testing policy (ALL ${World.bundles.length} AGENTS): ${infoStr}`);
        } else {
          alert('No trained policy available yet!');
        }
      });
      
      // Use loaded policy (same as test, but clearer)
      ui.on('onUsePolicy', () => {
        const bestPolicy = learner.getBestPolicy();
        if (bestPolicy) {
          World.reset();
          // Apply policy to ALL agents (multi-agent!)
          World.bundles.forEach(bundle => {
            bundle.controller = bestPolicy;
            bundle.useController = true;
          });
          learningMode = 'play';
          
          // Enable action display for debugging
          CONFIG.hud.showActions = true;
          
          if (loadedPolicyInfo) {
            console.log(`Using loaded policy (ALL ${World.bundles.length} AGENTS): ${loadedPolicyInfo.filename} (Gen ${loadedPolicyInfo.generation}, Reward: ${loadedPolicyInfo.bestReward.toFixed(2)})`);
            console.log(`💡 Tip: Watch all agents' actions (T=turn, P=thrust, S=sense) with yellow borders.`);
            console.log(`🤝 Multi-agent: All agents use the same policy and can learn from each other's trails!`);
          } else {
            console.log(`Using current best policy (ALL ${World.bundles.length} AGENTS, Gen ${learner.generation})`);
          }
        } else {
          alert('No policy loaded yet!');
        }
      });
      
      console.log('Training UI initialized. Press [L] to toggle.');
    }
    
    // Initialize training UI when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeTrainingUI);
    } else {
      initializeTrainingUI();
    }
    
    // Start main loop
    requestAnimationFrame(loop);
  })();
  