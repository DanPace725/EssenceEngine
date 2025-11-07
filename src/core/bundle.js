import { CONFIG } from '../../config.js';
import { RewardTracker } from '../../rewards.js';
import { buildObservation } from '../../observations.js';
import { SignalResponseAnalytics } from '../../analysis/signalResponseAnalytics.js';
import { SignalField } from '../../signalField.js';
import { TcRandom } from '../../tcStorage.js';
import { computeSensingUpdate } from './sensing.js';
import { computeMetabolicCost } from '../systems/metabolism.js';
import { resolveControllerAction } from '../systems/controllerAction.js';
import { computeSteering } from '../systems/steering.js';
import ParticipationManager from '../systems/participation.js';
import { computeMovement, evaluateResidualEffects } from '../systems/movement.js';
import { createMitosisSystem } from '../systems/mitosis.js';
import { createDecaySystem } from '../systems/decay.js';
import { clamp, mix, smoothstep } from '../utils/math.js';

const SIGNAL_CHANNELS = {
  resource: 0,
  distress: 1,
  bond: 2
};
const SIGNAL_MEMORY_LENGTH = Math.max(3, CONFIG.signal?.memoryLength || 12);
const SIGNAL_DISTRESS_NOISE_GAIN = 1.5;
const SIGNAL_RESOURCE_PULL_GAIN = 2.5;
const SIGNAL_BOND_CONFLICT_DAMP = 0.7;

export function createBundleClass(context) {
  const {
    Trail,
    getGlobalTick,
    getCanvasWidth,
    getCanvasHeight,
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
    getWorld
  } = context;

  if (!Trail) throw new Error('Trail dependency is required');
  if (typeof getGlobalTick !== 'function') throw new Error('getGlobalTick dependency is required');
  if (typeof getCanvasWidth !== 'function') throw new Error('getCanvasWidth dependency is required');
  if (typeof getCanvasHeight !== 'function') throw new Error('getCanvasHeight dependency is required');
  if (!Ledger) throw new Error('Ledger dependency is required');
  if (typeof getSignalWeight !== 'function') throw new Error('getSignalWeight dependency is required');
  if (typeof getSignalSensitivity !== 'function') throw new Error('getSignalSensitivity dependency is required');
  if (typeof getSignalDecayRate !== 'function') throw new Error('getSignalDecayRate dependency is required');
  if (typeof getSignalActivationThreshold !== 'function') throw new Error('getSignalActivationThreshold dependency is required');
  if (typeof linksForAgent !== 'function') throw new Error('linksForAgent dependency is required');
  if (typeof otherId !== 'function') throw new Error('otherId dependency is required');
  if (typeof getBundleById !== 'function') throw new Error('getBundleById dependency is required');
  if (!held) throw new Error('held dependency is required');
  if (typeof provokeBondedExploration !== 'function') throw new Error('provokeBondedExploration dependency is required');
  if (typeof getAgentColor !== 'function') throw new Error('getAgentColor dependency is required');
  if (typeof getAgentColorRGB !== 'function') throw new Error('getAgentColorRGB dependency is required');
  if (typeof getWorld !== 'function') throw new Error('getWorld dependency is required');

  const currentTick = () => getGlobalTick();
  const width = () => getCanvasWidth();
  const height = () => getCanvasHeight();
  const worldRef = () => getWorld();

  const decaySystem = createDecaySystem({ getGlobalTick, config: CONFIG });
  let mitosisSystem;

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

      // signal perception history and interpretations
      this.signal_memory = {};
      this.interpretation_bias = {};
      this.signalContext = {};
      this._signalContextTick = -1;
      for (const channel of Object.keys(SIGNAL_CHANNELS)) {
        this.signal_memory[channel] = {
          values: new Array(SIGNAL_MEMORY_LENGTH).fill(0),
          index: 0,
          sum: 0
        };
        this.interpretation_bias[channel] = 0;
      }

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

      // Signal emission bookkeeping (per-channel amplitudes per tick)
      this.signal_profile = {};

      // Cached mitosis readiness (updated each frame)
      this._mitosisState = { mitosisReady: false, buddingReady: false };

      // Participation wave context sampled from ParticipationManager
      this.participationWaveSample = null;
    }

    computeSensoryRange(dt) {
      const result = computeSensingUpdate({
        extendedSensing: this.extendedSensing,
        alive: this.alive,
        frustration: this.frustration,
        hunger: this.hunger,
        currentSensoryRange: this.currentSensoryRange,
        targetSensoryRange: this._targetSensoryRange,
        chi: this.chi
      }, dt, CONFIG);

      this._targetSensoryRange = result.targetRange;
      this.currentSensoryRange = result.currentSensoryRange;

      return result.cost;
    }

    computeAIDirection(resource) {
      let dx = 0, dy = 0;
      let resourceVisible = false;
      const signals = this.signalContext || {};
      const waveSample = this.participationWaveSample || {};
      const waveResource = clamp(waveSample.resource ?? 0, 0, 1);
      const waveDistress = clamp(waveSample.distress ?? 0, 0, 1);
      const waveBond = clamp(waveSample.bond ?? 0, 0, 1);
      const distressBias = Math.max(clamp(this.interpretation_bias?.distress ?? 0, 0, 1), waveDistress);
      const resourceBias = Math.max(clamp(this.interpretation_bias?.resource ?? 0, 0, 1), waveResource);
      const bondConflict = Math.max(clamp(this.interpretation_bias?.bond ?? 0, 0, 1), waveBond);
      const resourceWeight = getSignalWeight('resource');
      const distressWeight = getSignalWeight('distress');
      const bondWeight = getSignalWeight('bond');

      // (1) Wall avoidance - repulsion from ALL nearby walls (handles corners!)
      const wallMargin = CONFIG.aiWallAvoidMargin;
      const wallStrength = CONFIG.aiWallAvoidStrength;

      const canvasW = width();
      const canvasH = height();
      const dLeft = this.x;
      const dRight = canvasW - this.x;
      const dTop = this.y;
      const dBottom = canvasH - this.y;

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

      // Resource signal pull - activate earlier (at low hunger threshold instead of high)
      if (resourceBias > 0 && this.hunger >= CONFIG.hungerThresholdLow) {
        const grad = signals.resource?.gradient;
        if (grad && (grad.dx !== 0 || grad.dy !== 0)) {
          // Scale pull strength with hunger - stronger when more desperate
          const hungerScale = smoothstep(CONFIG.hungerThresholdLow, 1.0, this.hunger);
          const pull = resourceBias * SIGNAL_RESOURCE_PULL_GAIN * resourceWeight * (0.3 + hungerScale * 0.7);
          if (pull > 0) {
            dx += grad.dx * pull;
            dy += grad.dy * pull;
            SignalResponseAnalytics.logResponse('resource', currentTick(), this.id, {
              alignment: Math.min(1, grad.mag),
              magnitude: pull,
              mode: 'gradient-pull'
            });
          }
        }
      }

      // (3.5) Link guidance and spring (when no resource visible)
      if (!resourceVisible) {
        const h = clamp(this.hunger, 0, 1);
        // Escape factor grows as hunger exceeds high threshold
        const escape = ((th, hv) => {
          const t0 = th; // hungerThresholdHigh from config
          const x = Math.max(0, hv - t0) / Math.max(1e-6, 1 - t0);
          return Math.min(1, x * x); // quadratic ramp for decisiveness
        })(CONFIG.hungerThresholdHigh, h);
        const hungerDamp = 1 - CONFIG.link.hungerEscape * escape;
        const conflictGain = SIGNAL_BOND_CONFLICT_DAMP * bondWeight;
        const conflictDamp = 1 - bondConflict * conflictGain;
        if (bondConflict > 1e-3 && conflictGain !== 0) {
          const dampAmount = clamp(1 - conflictDamp, 0, 1);
          if (dampAmount > 0) {
            SignalResponseAnalytics.logResponse('bond', currentTick(), this.id, {
              alignment: dampAmount,
              magnitude: dampAmount,
              mode: 'bond-damp'
            });
          }
        }
        const damp = Math.max(0, hungerDamp * conflictDamp);
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
      const distressGain = SIGNAL_DISTRESS_NOISE_GAIN * distressWeight;
      const distressMul = 1 + distressBias * distressGain;
      if (distressBias > 1e-3 && distressGain !== 0) {
        SignalResponseAnalytics.logResponse('distress', currentTick(), this.id, {
          alignment: Math.min(1, distressBias * Math.abs(distressGain)),
          magnitude: Math.max(0, distressMul - 1),
          mode: 'exploration-noise'
        });
      }
      const baseNoise = (CONFIG.aiExploreNoiseBase + CONFIG.aiExploreNoiseGain * f) * hungerAmp * bereaveMul;
      const waveNoiseBoost = 1 + waveDistress * 0.5;
      const waveNoiseDamp = Math.max(0.25, 1 - (waveResource * 0.45 + waveBond * 0.35));
      const noise = baseNoise * distressMul * waveNoiseBoost * waveNoiseDamp;
      const resourceVisibleFactor = resourceVisible ? 1.0 : 1.8;
      dx += (TcRandom.random() - 0.5) * noise * resourceVisibleFactor;
      dy += (TcRandom.random() - 0.5) * noise * resourceVisibleFactor;

      // normalize
      const mag = Math.hypot(dx, dy);
      if (mag > 1e-6) { dx /= mag; dy /= mag; }
      else { dx = this._lastDirX; dy = this._lastDirY; }

      return { dx, dy };
    }

    update(dt, resource) {
      if (!this.alive) return;

      const metabolicCost = computeMetabolicCost({
        baseRate: CONFIG.baseDecayPerSecond,
        dt
      });
      let chiSpend = metabolicCost;

      const sensingResult = computeSensingUpdate({
        extendedSensing: this.extendedSensing,
        alive: this.alive,
        frustration: this.frustration,
        hunger: this.hunger,
        currentSensoryRange: this.currentSensoryRange,
        targetSensoryRange: this._targetSensoryRange,
        chi: this.chi
      }, dt, CONFIG);
      this._targetSensoryRange = sensingResult.targetRange;
      this.currentSensoryRange = sensingResult.currentSensoryRange;
      chiSpend += sensingResult.cost;

      // Refresh signal perception once per tick before decisions
      this.captureSignalContext();

      // Update hunger (biological drive)
      this.updateHunger(dt);

      // Update frustration (progress vs lost, amplified by hunger)
      this.updateFrustration(dt, resource);

      const tick = currentTick();
      const world = worldRef();

      // === ROUTING: Controller vs Heuristic AI ===
      const controlDecision = resolveControllerAction({
        useController: this.useController,
        controller: this.controller,
        buildObservation,
        observationArgs: [this, resource, Trail, tick, world?.resources ?? []]
      });

      if (controlDecision.mode === 'controller') {
        const action = controlDecision.action;
        this.lastAction = action;
        const result = this.applyAction(action, dt) || {};
        if (Number.isFinite(result.chiSpend)) {
          chiSpend += result.chiSpend;
        }
      } else {
        const steering = computeSteering({
          bundle: this,
          dt,
          resource,
          config: CONFIG,
          clamp,
          mix,
          smoothstep,
          held
        });

        this._lastDirX = steering.lastDirX;
        this._lastDirY = steering.lastDirY;
        this.heading = steering.heading;
        this.vx = steering.vx;
        this.vy = steering.vy;

        const movement = computeMovement({
          position: { x: this.x, y: this.y },
          velocity: { vx: this.vx, vy: this.vy },
          dt,
          size: this.size,
          canvasWidth: width(),
          canvasHeight: height(),
          moveCostPerSecond: CONFIG.moveCostPerSecond,
          depositPerSec: CONFIG.depositPerSec,
          chi: this.chi,
          agentId: this.id
        });

        this.x = movement.position.x;
        this.y = movement.position.y;
        if (movement.chiCost > 0) chiSpend += movement.chiCost;

        for (const deposit of movement.deposits) {
          Trail.deposit(deposit.x, deposit.y, deposit.amount, deposit.authorId);
        }

        if (movement.movedDist > 0) {
          const sample = Trail.sample(this.x, this.y) || { value: 0, authorId: 0, age: Infinity };
          const residual = evaluateResidualEffects({
            movedDist: movement.movedDist,
            sample,
            dt,
            config: {
              residualCapPerTick: CONFIG.residualCapPerTick,
              residualGainPerSec: CONFIG.residualGainPerSec,
              trailCooldownTicks: CONFIG.trailCooldownTicks,
              ownTrailPenalty: CONFIG.ownTrailPenalty,
              ownTrailGraceAge: CONFIG.ownTrailGraceAge
            },
            agentId: this.id
          });

          if (residual.chiGain > 0) {
            this.chi += residual.chiGain;
            if (residual.creditAuthorId !== null) {
              Ledger.credit(residual.creditAuthorId, residual.chiGain);
            }
          }

          if (residual.chiPenalty > 0) {
            this.chi -= residual.chiPenalty;
          }
        }
      }

      const decayResult = decaySystem.applyLifecycleTransition(this, { chiSpend });

      if (decayResult.shouldProvokeBondedExploration) {
        provokeBondedExploration(this.id);
      }

      this._mitosisState = mitosisSystem.evaluateReadiness(this);

      // Decay bereavement boost (per tick)
      if (this.bereavementBoostTicks > 0) this.bereavementBoostTicks--;
    }

    emitSignal(channel, amount, options = {}) {
      if (!CONFIG.signal?.enabled) return;
      if (!SignalField || typeof SignalField.deposit !== 'function') return;
      const channelIndex = SIGNAL_CHANNELS[channel];
      if (channelIndex === undefined) return;

      const cap = Number.isFinite(options.cap) ? options.cap : 1;
      const normalized = clamp(amount, 0, cap);
      if (normalized <= 0) return;

      if (!this.signal_profile[channel]) {
        this.signal_profile[channel] = { tick: -1, amplitude: 0 };
      }
      const profile = this.signal_profile[channel];
      const tick = currentTick();
      if (profile.tick !== tick) {
        profile.tick = tick;
        profile.amplitude = 0;
      }

      const absolute = options.absolute === true;
      const target = absolute ? normalized : Math.min(cap, profile.amplitude + normalized);
      const delta = target - profile.amplitude;
      if (delta <= 0) return;

      profile.amplitude = target;
      const px = Number.isFinite(options.x) ? options.x : this.x;
      const py = Number.isFinite(options.y) ? options.y : this.y;
      SignalField.deposit(px, py, delta, channelIndex);
    }

    recordSignalSample(channel, amplitude) {
      if (!this.signal_memory[channel]) {
        this.signal_memory[channel] = {
          values: new Array(SIGNAL_MEMORY_LENGTH).fill(0),
          index: 0,
          sum: 0
        };
      }
      const buffer = this.signal_memory[channel];
      const len = buffer.values.length;
      if (len === 0) return;
      const idx = buffer.index % len;
      const prev = buffer.values[idx];
      buffer.sum -= prev;
      const clamped = clamp(amplitude ?? 0, 0, 1);
      buffer.values[idx] = clamped;
      buffer.sum += clamped;
      buffer.index = (idx + 1) % len;
    }

    getSignalAverage(channel) {
      const buffer = this.signal_memory?.[channel];
      if (!buffer || !buffer.values.length) return 0;
      return buffer.sum / buffer.values.length;
    }

    captureSignalContext(force = false) {
      const tick = currentTick();
      if (!force && this._signalContextTick === tick) {
        return this.signalContext;
      }

      if (!CONFIG.signal?.enabled || !SignalField || typeof SignalField.sample !== 'function') {
        this.signalContext = {};
        this._signalContextTick = tick;
        for (const key of Object.keys(this.interpretation_bias)) {
          this.interpretation_bias[key] = 0;
        }
        return this.signalContext;
      }

      const context = {};
      const sampleRadius = Math.max(4, (SignalField.cell || CONFIG.signal.cell || 8));
      const activationThreshold = getSignalActivationThreshold();
      for (const [name, index] of Object.entries(SIGNAL_CHANNELS)) {
        const rawAmp = clamp(SignalField.sample(this.x, this.y, index) || 0, 0, 1);
        const sensitivity = getSignalSensitivity(name);
        const amp = clamp(rawAmp * sensitivity, 0, 1);
        this.recordSignalSample(name, amp);
        const gradient = this.computeSignalGradient(index, sampleRadius, sensitivity);
        if (amp >= activationThreshold || (gradient?.mag ?? 0) >= activationThreshold) {
          SignalResponseAnalytics.logStimulus(name, tick, this.id, {
            amplitude: amp,
            gradient: gradient?.mag ?? 0
          });
        }
        context[name] = { amplitude: amp, gradient };
      }

      this.signalContext = context;
      this._signalContextTick = tick;
      this.updateInterpretationBias(context);
      return context;
    }

    computeSignalGradient(channelIndex, radius, gain = 1) {
      if (!CONFIG.signal?.enabled || !SignalField || typeof SignalField.sample !== 'function') {
        return { dx: 0, dy: 0, mag: 0 };
      }
      const step = Math.max(1, radius || 1);
      const cx = this.x;
      const cy = this.y;
      const sample = (px, py) => clamp(SignalField.sample(px, py, channelIndex) || 0, 0, 1);
      const left = sample(cx - step, cy);
      const right = sample(cx + step, cy);
      const up = sample(cx, cy - step);
      const down = sample(cx, cy + step);
      const gradX = (right - left) * 0.5;
      const gradY = (down - up) * 0.5;
      const mag = Math.hypot(gradX, gradY);
      if (mag <= 1e-6) {
        return { dx: 0, dy: 0, mag: 0 };
      }
      const norm = Math.min(1, mag);
      const scaledMag = Math.min(1, norm * Math.max(0, gain));
      return { dx: gradX / mag, dy: gradY / mag, mag: scaledMag };
    }

    updateInterpretationBias(context = this.signalContext) {
      const applyBias = (channel, target) => {
        const prev = clamp(this.interpretation_bias[channel] ?? 0, 0, 1);
        const decay = getSignalDecayRate(channel);
        const decayed = prev * (1 - decay);
        const next = target >= prev ? target : Math.max(target, decayed);
        this.interpretation_bias[channel] = clamp(next, 0, 1);
      };

      const distressAmp = clamp(context?.distress?.amplitude ?? 0, 0, 1);
      applyBias('distress', distressAmp);

      const resourceGrad = context?.resource?.gradient;
      let resourceTarget = 0;
      if (resourceGrad && this.hunger >= CONFIG.hungerThresholdHigh) {
        const hungerSpan = Math.max(1e-6, 1 - CONFIG.hungerThresholdHigh);
        const hungerFactor = clamp((this.hunger - CONFIG.hungerThresholdHigh) / hungerSpan, 0, 1);
        resourceTarget = clamp(resourceGrad.mag * hungerFactor, 0, 1);
      }
      applyBias('resource', resourceTarget);

      const bondGrad = context?.bond?.gradient;
      let bondTarget = 0;
      if (bondGrad) {
        const dirX = this._lastDirX;
        const dirY = this._lastDirY;
        const dot = dirX * bondGrad.dx + dirY * bondGrad.dy;
        const conflict = Math.max(0, -dot) * bondGrad.mag;
        bondTarget = clamp(conflict, 0, 1);
      }
      applyBias('bond', bondTarget);
    }

    updateHunger(dt) {
      // Hunger increases over time - biological drive
      this.hunger = Math.min(1, this.hunger + CONFIG.hungerBuildRate * dt);
    }

    updateFrustration(dt, resource) {
      const tick = currentTick();
      const ticksSinceCollect = tick - this.lastCollectTick;
      const { value: localTrailPrev } = Trail.sample(this.x, this.y);
      const lowTrail = localTrailPrev < CONFIG.aiFrustrationLowTrail;
      const canSeeResource = resource
        ? Math.hypot(resource.x - this.x, resource.y - this.y) <= this.currentSensoryRange
        : false;

      let waveSample = null;
      if (ParticipationManager && typeof ParticipationManager.sampleWaveStrengths === 'function') {
        waveSample = ParticipationManager.sampleWaveStrengths({
          x: this.x,
          y: this.y,
          radius: this.currentSensoryRange
        });
      }
      this.participationWaveSample = waveSample;

      if (canSeeResource || ticksSinceCollect <= CONFIG.aiFrustrationSightGrace) {
        this.frustration = Math.max(0, this.frustration - CONFIG.aiFrustrationDecayRate * dt);
      } else if (lowTrail) {
        // Hunger amplifies frustration build rate - hungry agents get frustrated faster!
        const h = clamp(this.hunger, 0, 1);
        const hungerAmp = 1 + (CONFIG.hungerFrustrationAmp - 1) * h;
        this.frustration = Math.min(1, this.frustration + CONFIG.aiFrustrationBuildRate * hungerAmp * dt);
      }

      if (waveSample) {
        const resourceRelief = clamp(waveSample.resource ?? 0, 0, 1);
        const bondRelief = clamp(waveSample.bond ?? 0, 0, 1);
        const distressPressure = clamp(waveSample.distress ?? 0, 0, 1);

        if (resourceRelief > 0) {
          const hungerFactor = 0.5 + 0.5 * clamp(this.hunger, 0, 1);
          const reliefRate = CONFIG.aiFrustrationDecayRate * hungerFactor;
          this.frustration = Math.max(0, this.frustration - reliefRate * resourceRelief * dt);
        }

        if (bondRelief > 0) {
          const reliefRate = CONFIG.aiFrustrationDecayRate * 0.35;
          this.frustration = Math.max(0, this.frustration - reliefRate * bondRelief * dt);
        }

        if (distressPressure > 0 && !canSeeResource) {
          const pressureGain = CONFIG.aiFrustrationBuildRate * (0.4 + 0.6 * clamp(this.hunger, 0, 1));
          this.frustration = Math.min(1, this.frustration + pressureGain * distressPressure * dt);
        }
      } else {
        this.participationWaveSample = null;
      }
    }

    updateHeuristicMovement(dt, resource) {
      this.captureSignalContext();
      const steering = computeSteering({
        bundle: this,
        dt,
        resource,
        config: CONFIG,
        clamp,
        mix,
        smoothstep,
        held
      });

      this._lastDirX = steering.lastDirX;
      this._lastDirY = steering.lastDirY;
      this.heading = steering.heading;
      this.vx = steering.vx;
      this.vy = steering.vy;
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
        ctx.globalAlpha = 0.6 + Math.sin(currentTick() * 0.2) * 0.3;
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
        ctx.globalAlpha = 0.5 + Math.sin(currentTick() * 0.3) * 0.3;
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
        ctx.globalAlpha = 0.4 + Math.sin(currentTick() * 0.25) * 0.3;
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
      if (!this.alive) return { chiSpend: 0, movedDist: 0 };

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
      const canvasW = width();
      const canvasH = height();
      this.x = clamp(this.x, half, canvasW - half);
      this.y = clamp(this.y, half, canvasH - half);

      // Apply sensing action
      this.extendedSensing = action.senseFrac > 0.5;

      // Deposit trail when moving
      if (movedDist > 0) {
        const health = clamp(this.chi / 20, 0.2, 1.0);
        const dep = CONFIG.depositPerSec * health * dt;
        const radius = this.size / 2;
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

    canMitosis() {
      return mitosisSystem.canMitosis(this);
    }

    canBud() {
      return mitosisSystem.canBud(this);
    }

    attemptMitosis() {
      return mitosisSystem.attemptReproduction(this);
    }

    /**
     * Update decay for dead agents
     * Returns true if fully decayed (ready for removal)
     */
    updateDecay(dt, fertilityGrid) {
      return decaySystem.updateCorpseDecay(this, dt, fertilityGrid);
    }
  }

  mitosisSystem = createMitosisSystem({
    getGlobalTick,
    getCanvasWidth,
    getCanvasHeight,
    getWorld,
    random: TcRandom,
    config: CONFIG,
    createChildBundle: ({ parent, x, y, chi, heading, eventLabel }) => {
      const world = worldRef();
      if (!world) return null;

      const childId = world.nextAgentId++;
      const parentGeneration = parent.generation ?? 0;
      const child = new Bundle(
        x,
        y,
        parent.size,
        chi,
        childId,
        parent.useController
      );

      child.heading = heading;
      child._lastDirX = Math.cos(heading);
      child._lastDirY = Math.sin(heading);
      child.controller = parent.controller;
      child.extendedSensing = parent.extendedSensing;
      child.generation = parentGeneration + 1;
      child.parentId = parent.id;
      child.lastMitosisTick = getGlobalTick();

      world.bundles.push(child);
      world.totalBirths++;

      if (CONFIG.mitosis.showLineage) {
        world.addLineageLink(parent.id, childId, getGlobalTick());
      }

      console.log(
        `🧫 ${eventLabel}! Agent ${parent.id} (gen ${parentGeneration}) → Agent ${child.id} (gen ${child.generation}) | Pop: ${world.bundles.length}`
      );

      return child;
    }
  });

  return Bundle;
}
