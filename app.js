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
import { FertilityGrid, attemptSeedDispersal, attemptSpontaneousGrowth, getResourceSpawnLocation } from './plantEcology.js';

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
    let showScentGradient = false; // Toggle for scent gradient visualization
    let showFertility = false; // Toggle for fertility grid visualization
    
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
          const color = authorId !== 0 ? getAgentColorRGB(authorId) : { r: 0, g: 255, b: 0 };
          
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

        // (3) trail following (reduced near walls to prevent corner traps)
        let trailStrength = resourceVisible ? CONFIG.aiTrailFollowingNear
                                             : CONFIG.aiTrailFollowingFar;
        
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
  
        // (4) exploration noise scales with frustration AND hunger
        const f = clamp(this.frustration, 0, 1);
        const h = clamp(this.hunger, 0, 1);
        // Hunger amplifies exploration - hungry agents explore more desperately
        const hungerAmp = 1 + (CONFIG.hungerExplorationAmp - 1) * h;
        const noise = (CONFIG.aiExploreNoiseBase + CONFIG.aiExploreNoiseGain * f) * hungerAmp;
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
        }
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

        // Controller indicator - glowing border when using policy
        if (this.useController && this.controller && this.alive) {
          ctx.save();
          ctx.strokeStyle = "#ffff00"; // yellow for controller
          ctx.globalAlpha = 0.6 + Math.sin(globalTick * 0.2) * 0.3;
          ctx.lineWidth = 3;
          ctx.strokeRect(this.x - this.size/2 - 3, this.y - this.size/2 - 3, this.size + 6, this.size + 6);
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

        // body (with decay effects if dead)
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
        const half = effectiveSize / 2;
        ctx.fillRect(this.x - half, this.y - half, effectiveSize, effectiveSize);
        
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
      canMitosis() {
        if (!CONFIG.mitosis.enabled) return false;
        if (!this.alive) return false;
        if (this.chi < CONFIG.mitosis.threshold) return false;
        
        // Check cooldown
        const ticksSinceLastMitosis = globalTick - this.lastMitosisTick;
        if (ticksSinceLastMitosis < CONFIG.mitosis.cooldown) return false;
        
        // Check population cap (count only ALIVE agents, not dead ones!)
        const aliveCount = World.bundles.filter(b => b.alive).length;
        if (aliveCount >= CONFIG.mitosis.maxAgents) return false;
        
        // Check carrying capacity (if enabled)
        if (CONFIG.mitosis.respectCarryingCapacity) {
          const maxPopulation = Math.floor(
            World.resources.length * CONFIG.mitosis.carryingCapacityMultiplier
          );
          if (aliveCount >= maxPopulation) return false;
        }
        
        return true;
      }

      /**
       * Perform mitosis - create a child agent
       * Returns the child bundle or null if failed
       */
      doMitosis() {
        if (!this.canMitosis()) return null;
        
        // Pay reproduction cost
        this.chi -= CONFIG.mitosis.cost;
        
        // Calculate spawn position (offset from parent)
        const angle = CONFIG.mitosis.inheritHeading 
          ? this.heading + (Math.random() - 0.5) * CONFIG.mitosis.headingNoise
          : Math.random() * Math.PI * 2;
        
        const offset = CONFIG.mitosis.spawnOffset;
        let childX = this.x + Math.cos(angle) * offset;
        let childY = this.y + Math.sin(angle) * offset;
        
        // Keep child in bounds
        const half = this.size / 2;
        childX = clamp(childX, half, innerWidth - half);
        childY = clamp(childY, half, innerHeight - half);
        
        // Generate new ID (use next available)
        const childId = World.nextAgentId++;
        
        // Create child
        const child = new Bundle(
          childX, childY,
          this.size,
          CONFIG.mitosis.childStartChi,
          childId,
          this.useController
        );
        
        // Inherit properties from parent
        child.heading = angle;
        child._lastDirX = Math.cos(angle);
        child._lastDirY = Math.sin(angle);
        child.controller = this.controller; // Share policy (if any)
        child.extendedSensing = this.extendedSensing;
        child.generation = this.generation + 1;
        child.parentId = this.id;
        child.lastMitosisTick = globalTick; // Prevent immediate re-mitosis
        
        // Update parent's mitosis tracking
        this.lastMitosisTick = globalTick;
        
        // Add child to world
        World.bundles.push(child);
        World.totalBirths++;
        
        console.log(`🧫 Mitosis! Agent ${this.id} (gen ${this.generation}) → Agent ${child.id} (gen ${child.generation}) | Pop: ${World.bundles.length}`);
        
        return child;
      }

      /**
       * Attempt mitosis if conditions are met (called each frame)
       */
      attemptMitosis() {
        if (this.canMitosis()) {
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
      }
      
      draw(ctx) {
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
      }
      
      update(dt) {
        this.age++;
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
        
        // Reset mitosis tracking
        this.nextAgentId = 5;
        this.totalBirths = 0;
        
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
      
      // Helper function to get nearest resource to a bundle
      getNearestResource(bundle) {
        if (this.resources.length === 0) return null;
        
        let nearest = this.resources[0];
        let minDist = Math.hypot(bundle.x - nearest.x, bundle.y - nearest.y);
        
        for (let i = 1; i < this.resources.length; i++) {
          const dist = Math.hypot(bundle.x - this.resources[i].x, bundle.y - this.resources[i].y);
          if (dist < minDist) {
            minDist = dist;
            nearest = this.resources[i];
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
  
    // ---------- HUD ----------
    function drawHUD() {
      if (!CONFIG.hud.show) return;
      ctx.save();
      ctx.font = "12px ui-mono, monospace";
  
      const bar = (x,y,w,h,f,color)=>{
        ctx.save();
        ctx.strokeStyle = "#444"; ctx.strokeRect(x,y,w,h);
        ctx.fillStyle = color; ctx.fillRect(x,y, w*clamp(f,0,1), h);
        ctx.restore();
      };

      // HUD Header with bar legend
      ctx.fillStyle = "#888";
      ctx.font = "10px ui-mono, monospace";
      ctx.fillText("Frustration │ Hunger", 145, 12);
      ctx.font = "12px ui-mono, monospace";

      // Agent 1
      const b1 = World.bundles[0];
      ctx.fillStyle = "#00ffff";
      let controller1 = b1.useController && b1.controller 
        ? (loadedPolicyInfo ? `🤖 ${loadedPolicyInfo.filename.replace('.json', '').substring(0, 12)}` 
                            : (b1.controller.constructor.name === "LinearPolicyController" ? "🤖 POLICY" : "🎮 CTRL"))
        : "🧠 AI";
      const vis1 = b1.visible ? "👁" : "🚫";
      ctx.fillText(
        `${vis1} A1[1]: χ${b1.chi.toFixed(1)} ${b1.alive ? "✓" : "✗"} sense:${Math.round(b1.currentSensoryRange)} ${controller1} cr:${Ledger.getCredits(1).toFixed(1)}`,
        10, 18
      );
      bar(10, 22, 60, 4, b1.frustration, "#ff5555");
      bar(73, 22, 60, 4, b1.hunger, "#ff8800");

      // Agent 2
      const b2 = World.bundles[1];
      ctx.fillStyle = "#ff00ff";
      const controller2 = b2.useController && b2.controller 
        ? (b2.controller.constructor.name === "LinearPolicyController" ? "🤖 POLICY" : "🎮 CTRL")
        : "🧠 AI";
      const vis2 = b2.visible ? "👁" : "🚫";
      ctx.fillText(
        `${vis2} A2[2]: χ${b2.chi.toFixed(1)} ${b2.alive ? "✓" : "✗"} sense:${Math.round(b2.currentSensoryRange)} ${controller2} cr:${Ledger.getCredits(2).toFixed(1)}`,
        10, 36
      );
      bar(10, 40, 60, 4, b2.frustration, "#ff55ff");
      bar(73, 40, 60, 4, b2.hunger, "#ff8800");

      // Agent 3
      const b3 = World.bundles[2];
      ctx.fillStyle = "#ffff00";
      const controller3 = b3.useController && b3.controller 
        ? (b3.controller.constructor.name === "LinearPolicyController" ? "🤖 POLICY" : "🎮 CTRL")
        : "🧠 AI";
      const vis3 = b3.visible ? "👁" : "🚫";
      ctx.fillText(
        `${vis3} A3[3]: χ${b3.chi.toFixed(1)} ${b3.alive ? "✓" : "✗"} sense:${Math.round(b3.currentSensoryRange)} ${controller3} cr:${Ledger.getCredits(3).toFixed(1)}`,
        10, 54
      );
      bar(10, 58, 60, 4, b3.frustration, "#ffff55");
      bar(73, 58, 60, 4, b3.hunger, "#ff8800");

      // Agent 4
      const b4 = World.bundles[3];
      ctx.fillStyle = "#ff8800";
      const controller4 = b4.useController && b4.controller 
        ? (b4.controller.constructor.name === "LinearPolicyController" ? "🤖 POLICY" : "🎮 CTRL")
        : "🧠 AI";
      const vis4 = b4.visible ? "👁" : "🚫";
      ctx.fillText(
        `${vis4} A4[4]: χ${b4.chi.toFixed(1)} ${b4.alive ? "✓" : "✗"} sense:${Math.round(b4.currentSensoryRange)} ${controller4} cr:${Ledger.getCredits(4).toFixed(1)}`,
        10, 72
      );
      bar(10, 76, 60, 4, b4.frustration, "#ff8855");
      bar(73, 76, 60, 4, b4.hunger, "#ff8800");
  
      // Population summary (if more than 4 agents)
      if (World.bundles.length > 4) {
        ctx.fillStyle = "#88ffff";
        const aliveCount = World.bundles.filter(b => b.alive).length;
        const totalChi = World.bundles.reduce((sum, b) => sum + b.chi, 0);
        const avgChi = totalChi / World.bundles.length;
        ctx.fillText(`📊 Population: ${aliveCount}/${World.bundles.length} alive | Avg χ: ${avgChi.toFixed(1)} | Births: ${World.totalBirths}`, 10, 94);
      }
      
      // General info
      ctx.fillStyle = "#00ff88";
      const mode = CONFIG.autoMove ? "AUTO" : "MANUAL";
      const diffState = CONFIG.enableDiffusion ? "ON" : "OFF";
      const learningModeDisplay = learningMode === 'train' ? "TRAINING" : "PLAY";
      const mitosisStatus = CONFIG.mitosis.enabled ? "ON" : "OFF";
      
      // Resource ecology info
      let resourceInfo = `resources: ${World.resources.length}`;
      if (CONFIG.plantEcology.enabled) {
        // Plant ecology: show resource count with dynamic limit if enabled
        if (CONFIG.resourceScaleWithAgents) {
          const aliveCount = World.bundles.filter(b => b.alive).length;
          const maxResources = Math.floor(
            clamp(
              CONFIG.resourceBaseAbundance - (aliveCount * CONFIG.resourceCompetition),
              CONFIG.resourceScaleMinimum,
              CONFIG.resourceScaleMaximum
            )
          );
          const competition = (aliveCount * CONFIG.resourceCompetition).toFixed(1);
          resourceInfo = `🌿 resources: ${World.resources.length}/${maxResources} (${aliveCount} agents | -${competition} competition)`;
        } else {
          resourceInfo = `🌿 resources: ${World.resources.length} | plants: ${World.carryingCapacity}`;
        }
      } else if (CONFIG.resourceDynamicCount) {
        // Legacy system: show pressure
        resourceInfo = `🌿 resources: ${World.resources.length}/${World.carryingCapacity} (pressure: ${(World.resourcePressure * 100).toFixed(0)}%)`;
      }
      
      const yOffset = World.bundles.length > 4 ? 110 : 94;
      ctx.fillText(`${mode} | ${learningModeDisplay} | collected: ${World.collected} | ${resourceInfo} | tick: ${globalTick} | diffusion: ${diffState} | mitosis: ${mitosisStatus}`, 10, yOffset);
      
      // Adaptive Reward Stats (if enabled)
      const scentStatus = showScentGradient ? "ON" : "OFF";
      const fertilityStatus = showFertility ? "ON" : "OFF";
      let controlsY1, controlsY2, controlsY3;
      
      if (CONFIG.adaptiveReward?.enabled) {
        ctx.fillStyle = "#ffaa00";
        const nextReward = calculateAdaptiveReward(World.avgFindTime);
        const adaptiveY = World.bundles.length > 4 ? 126 : 110;
        ctx.fillText(
          `Adaptive Reward: avgFind=${World.avgFindTime.toFixed(2)}s | nextReward≈${nextReward.toFixed(1)}χ | avgGiven=${World.rewardStats.avgRewardGiven.toFixed(1)}χ`,
          10, adaptiveY
        );
        ctx.fillStyle = "#00ff88";
        controlsY1 = World.bundles.length > 4 ? 142 : 126;
        controlsY2 = World.bundles.length > 4 ? 158 : 142;
        controlsY3 = World.bundles.length > 4 ? 174 : 158;
        ctx.fillText(`[WASD]=move [A]=auto [S]=extSense [G]=scent(${scentStatus}) [P]=fertility(${fertilityStatus}) [M]=mitosis(${mitosisStatus}) [Space]=pause [R]=reset [C]=+5χ`, 10, controlsY1);
        ctx.fillText(`[T]=trail [X]=clear [F]=diffuse [L]=train | [1-4]=toggle agent [V]=toggle all`, 10, controlsY2);
      } else {
        controlsY1 = World.bundles.length > 4 ? 126 : 110;
        controlsY2 = World.bundles.length > 4 ? 142 : 126;
        ctx.fillText(`[WASD]=move [A]=auto [S]=extSense [G]=scent(${scentStatus}) [P]=fertility(${fertilityStatus}) [M]=mitosis(${mitosisStatus}) [Space]=pause [R]=reset [C]=+5χ`, 10, controlsY1);
        ctx.fillText(`[T]=trail [X]=clear [F]=diffuse [L]=train | [1-4]=toggle agent [V]=toggle all`, 10, controlsY2);
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
        
        // Update each bundle with nearest resource
        World.bundles.forEach(b => {
          const nearestResource = World.getNearestResource(b);
          b.update(dt, nearestResource);
        });
        
        Trail.step(dt);
        
        // Update resource ecology (carrying capacity dynamics)
        World.updateEcology(dt);

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
            if (b.overlapsResource(res)) {
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
              
              res.respawn();
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
          if (CONFIG.resourceScaleWithAgents) {
            const aliveCount = World.bundles.filter(b => b.alive).length;
            // Inverse relationship: start with base abundance, reduce per agent
            maxResources = Math.floor(
              clamp(
                CONFIG.resourceBaseAbundance - (aliveCount * CONFIG.resourceCompetition),
                CONFIG.resourceScaleMinimum,
                CONFIG.resourceScaleMaximum
              )
            );
            
            // Cull excess resources if population has grown (competition increases)
            if (World.resources.length > maxResources) {
              const excess = World.resources.length - maxResources;
              // Remove oldest/least fertile resources
              World.resources.splice(-excess, excess);
              console.log(`🔪 Culled ${excess} excess resources due to competition (${aliveCount} agents)`);
            }
          }
          
          // Seed dispersal (resources spawn near existing ones)
          const seedLocation = attemptSeedDispersal(World.resources, FertilityField, globalTick, dt);
          if (seedLocation && World.resources.length < maxResources) {
            const newResource = new Resource(seedLocation.x, seedLocation.y, CONFIG.resourceRadius);
            World.resources.push(newResource);
            console.log(`🌱 Seed sprouted at (${Math.round(seedLocation.x)}, ${Math.round(seedLocation.y)}) | Fertility: ${seedLocation.fertility.toFixed(2)}`);
          }
          
          // Spontaneous growth (resources appear in fertile soil)
          const growthLocation = attemptSpontaneousGrowth(FertilityField, dt);
          if (growthLocation && World.resources.length < maxResources) {
            const newResource = new Resource(growthLocation.x, growthLocation.y, CONFIG.resourceRadius);
            World.resources.push(newResource);
            console.log(`🌿 Spontaneous growth at (${Math.round(growthLocation.x)}, ${Math.round(growthLocation.y)}) | Fertility: ${growthLocation.fertility.toFixed(2)}`);
          }
          
          // Update fertility grid (recovery + population pressure)
          const aliveCount = World.bundles.filter(b => b.alive).length;
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
      
      // Draw scent gradient visualization if enabled
      if (showScentGradient && CONFIG.scentGradient.enabled) {
        visualizeScentHeatmap(ctx, World.resources, 40);
        visualizeScentGradient(ctx, World.resources, 80);
      }
      
      // Draw all resources
      World.resources.forEach(res => res.draw(ctx));
      
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
            if (bundle.alive && bundle.overlapsResource(res)) {
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
              res.respawn();
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
  