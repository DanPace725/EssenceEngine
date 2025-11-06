# Signal Field System Overview

The signal architecture turns agent communication into a continuous field that any bundle can read or write. This document explains how the shared substrate is built, which events inject energy into it, and how agents interpret those gradients when deciding their next move.

## Field substrate

`SignalField` maintains a downsampled grid for multiple channels, mirroring the trail renderer while adding per-channel statistics. `resize` reinitializes channel buffers, offscreen canvases, and caches whenever the viewport or configuration changes, keeping statistics in sync with the allocated grid.【F:signalField.js†L28-L88】 Deposits clamp incoming energy and keep running totals/sums of squares so diffusion and analytics stay numerically stable.【F:signalField.js†L118-L138】 Each tick the field decays and optionally diffuses toward its neighbors before recomputing per-channel totals, variance, and signal-to-noise ratios for analytics.【F:signalField.js†L159-L215】【F:signalField.js†L273-L336】 A snapshot copy is captured prior to agent updates so perception queries observe the previous frame, and drawing composites all active channels back onto the main canvas with additive blending.【F:signalField.js†L151-L270】

## Configuration surface

The signal system is fully parameterized from `CONFIG.signal`. Defaults expose the grid cell size, decay/diffusion rates, active channel count, memory length, activation thresholds, and per-channel sensitivity/decay/weight multipliers that both heuristic logic and controllers consume.【F:config.js†L300-L323】【F:config.js†L565-L582】 Tooltips in the config hints describe how each control affects propagation, sampling, and behavioral weighting so tuners and the meta-AI know which knob to mutate.【F:config.js†L808-L823】

## Simulation lifecycle integration

The main loop captures a snapshot of both the trail and signal fields before bundles update so perception aligns with last-frame emissions.【F:app.js†L2360-L2363】 After agents, links, and ecology advance, the field steps forward to apply decay/diffusion and is drawn only when the signal feature flag is enabled.【F:app.js†L2384-L2387】【F:app.js†L2635-L2638】 Aggregated power/SNR metrics feed into the training UI every 30 ticks alongside response coherence computed from the analytics module, keeping instrumentation lightweight but timely.【F:app.js†L2601-L2617】

## Emission channels

Signals are authored through `Bundle.emitSignal`, which normalizes amplitudes per tick and deposits into the correct channel while supporting optional absolute writes or alternate coordinates for remote pulses.【F:app.js†L951-L979】 Key mechanics hook into this helper:

- **Resource success** – harvesting χ normalizes reward strength and emits a resource attractor at the collector’s location, whether in free play or training episodes.【F:app.js†L2476-L2505】【F:app.js†L2718-L2760】
- **Bond maintenance** – live links leak a low, strength-scaled bond resonance as they update, helping neighbors sense cooperative coherence.【F:app.js†L360-L386】
- **Bereavement distress** – when a bonded partner dies the survivors emit a capped distress pulse at both their position and the death site, ensuring nearby allies sense the loss even if the body is removed immediately.【F:app.js†L300-L317】

Because `SignalField.deposit` respects the global enable toggle, all of these emissions safely no-op when the feature is disabled.【F:signalField.js†L118-L138】

## Agent perception pipeline

Each bundle preallocates per-channel ring buffers and interpretation biases when constructed so sampling costs stay constant.【F:app.js†L566-L629】 At the start of every update, `captureSignalContext` samples the latest snapshot at the agent’s coordinates, applies per-channel sensitivities, records history, estimates gradients, and logs any stimuli that cross amplitude or gradient thresholds for analytics.【F:app.js†L1007-L1036】 Gradient estimation samples opposing offsets to recover a normalized direction vector and scaled magnitude suitable for steering.【F:app.js†L1045-L1066】 Biases then evolve toward channel-specific targets—distress tracks instantaneous amplitude, resource targets grow when hunger is high and gradients are strong, and bond bias measures conflict with the agent’s current heading.【F:app.js†L1068-L1099】

These biases shape heuristic motion. Distress boosts exploration noise, resource gradients pull hungry agents toward attractors, and bond conflict damps link guidance when partners pull in opposing directions, with every response logged for latency/coherence tracking.【F:app.js†L679-L856】【F:app.js†L780-L843】 The resulting perception state is also exposed to learning policies: `observations.js` appends mean amplitudes and bias values into the 29-dimensional observation vector, pulling smoothed history from the bundle’s ring buffers.【F:observations.js†L69-L108】【F:observations.js†L224-L249】

## Analytics and operator feedback

`SignalResponseAnalytics` stores stimulus/response histories per channel, computes moving average latency and coherence, and prevents duplicate per-tick events to keep statistics robust during high-frequency updates.【F:analysis/signalResponseAnalytics.js†L1-L140】 The training panel renders diversity, coherence, SNR, and per-channel power using the aggregated data pushed from the main loop, letting human operators or auto-tuners monitor communication quality in real time.【F:trainingUI.js†L70-L102】【F:trainingUI.js†L218-L242】

## Extending the field

Adding a new semantic channel involves increasing `CONFIG.signal.channels`, defining its weight/sensitivity entries, and wiring new emitters that call `emitSignal` with the desired channel name. Because the perception loop iterates `SIGNAL_CHANNELS`, new channels automatically gain memory buffers, gradient sampling, observation exports, and analytics logging once assigned an index, making the architecture ready for richer proto-language experiments with minimal plumbing changes.【F:app.js†L173-L188】【F:app.js†L1007-L1036】
