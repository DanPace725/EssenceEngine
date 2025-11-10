import { clamp, mix, smoothstep } from '../utils/math.js';
import ParticipationManager from './participation.js';

const normalizeVector = ({ dx, dy }, fallback) => {
  const mag = Math.hypot(dx, dy);
  if (mag > 1e-6) {
    return { dx: dx / mag, dy: dy / mag };
  }
  return fallback;
};

/**
 * Computes the steering behavior for an agent (bundle).
 * This function determines the agent's desired direction and then smoothly
 * turns the agent towards that direction, resulting in natural-looking movement.
 *
 * The process involves several steps:
 * 1. Determine the 'desired' direction based on AI logic, manual input, or participation forces.
 * 2. Calculate the agent's turn rate and speed, which can be amplified by frustration and hunger.
 * 3. Smoothly interpolate the agent's current direction towards the desired direction.
 * 4. Convert the final direction into a target velocity.
 * 5. Smoothly interpolate the agent's current velocity towards the target velocity.
 *
 * @param {object} params - The parameters for the steering calculation.
 * @returns {object} The new steering state, including direction, heading, and velocity.
 */
export function computeSteering({
  bundle,
  dt,
  resource,
  config,
  clamp: clampFn = clamp,
  mix: mixFn = mix,
  smoothstep: smoothFn = smoothstep,
  held
}) {
  let desired = { dx: 0, dy: 0 };

  // 1. Determine the desired direction.
  // This can come from the agent's AI, manual controls, or external forces.
  if (config.autoMove || bundle.id !== 1) {
    // AI-controlled agents compute their direction based on their goals (e.g., finding resources).
    desired = bundle.computeAIDirection(resource);
  } else if (held) {
    // Manual control for player 1.
    const manual = { dx: 0, dy: 0 };
    if (held.has('w') || held.has('arrowup')) manual.dy -= 1;
    if (held.has('s') || held.has('arrowdown')) manual.dy += 1;
    if (held.has('a') || held.has('arrowleft')) manual.dx -= 1;
    if (held.has('d') || held.has('arrowright')) manual.dx += 1;
    desired = normalizeVector(manual, { dx: bundle._lastDirX, dy: bundle._lastDirY });
  } else {
    // If there's no input, the agent continues in its last direction.
    desired = { dx: bundle._lastDirX, dy: bundle._lastDirY };
  }

  // Apply forces from the ParticipationManager (e.g., user mouse interaction).
  let participationForce = { ax: 0, ay: 0 };
  if (ParticipationManager && typeof ParticipationManager.applyForce === 'function') {
    const desiredBeforeForce = { ...desired };
    participationForce = ParticipationManager.applyForce({
      bundle,
      dt,
      desired: desiredBeforeForce,
      baseSpeed: config.moveSpeedPxPerSec
    }) || participationForce;

    if (typeof bundle?.onParticipationForce === 'function') {
      try {
        bundle.onParticipationForce(participationForce, {
          desired: desiredBeforeForce,
          dt,
          resource,
          config
        });
      } catch (error) {
        if (config?.participation?.debugLog && typeof console !== 'undefined' && console.debug) {
          console.debug('[Steering] participation hook error:', error);
        }
      }
    }
  }

  // Add the participation force to the desired direction.
  if (participationForce.ax !== 0 || participationForce.ay !== 0) {
    desired = {
      dx: desired.dx + participationForce.ax,
      dy: desired.dy + participationForce.ay
    };
  }

  // 2. Calculate agent-specific movement parameters.
  // Frustration and hunger can make the agent turn faster and move with more "surge".
  const f = clampFn(bundle.frustration, 0, 1);
  const h = clampFn(bundle.hunger, 0, 1);
  const turnRate = config.aiTurnRateBase + config.aiTurnRateGain * f;
  const hungerAmp = 1 + (config.hungerSurgeAmp - 1) * h;
  const surge = (1.0 + config.aiSurgeMax * smoothFn(0.2, 1.0, f)) * hungerAmp;

  // 3. Smoothly steer towards the desired direction.
  // We use a weighted mix to gradually change the agent's direction,
  // creating a smooth turning motion instead of an instantaneous snap.
  const steerWeight = clampFn(turnRate * dt, 0, 1);
  const dirX = mixFn(bundle._lastDirX, desired.dx, steerWeight);
  const dirY = mixFn(bundle._lastDirY, desired.dy, steerWeight);
  const normalized = normalizeVector({ dx: dirX, dy: dirY }, { dx: bundle._lastDirX, dy: bundle._lastDirY });

  // 4. Calculate the target velocity based on the new direction and speed.
  const heading = Math.atan2(normalized.dy, normalized.dx);
  const speed = config.moveSpeedPxPerSec * surge;
  const targetVx = normalized.dx * speed;
  const targetVy = normalized.dy * speed;

  // 5. Smoothly interpolate the current velocity towards the target velocity.
  // This adds a bit of "weight" or inertia to the agent's movement.
  const velLerp = 1 - Math.exp(-6 * dt);

  return {
    lastDirX: normalized.dx,
    lastDirY: normalized.dy,
    heading,
    vx: mixFn(bundle.vx, targetVx, velLerp),
    vy: mixFn(bundle.vy, targetVy, velLerp)
  };
}
