# TC Channel Design Note

## Toggle surface
- **Config defaults** – `CONFIG.signal` defines the master enable along with cell size, decay/diffusion rates, channel count, memory length, activation threshold, and per-channel sensitivity/decay/weight multipliers. These settings are serialized with the rest of the config and drive both runtime behavior and panel presets.【F:config.js†L300-L324】
- **Operator controls** – The configuration schema exposes the signal toggles to the UI (`signal.enabled`, grid sizing, decay/diffusion, channel count, memory length, threshold, and each per-channel gain/weight), so panel updates flow back into `CONFIG` and trigger resize hooks via `onConfigChanged`.【F:config.js†L566-L582】【F:config.js†L889-L912】
- **Runtime gating** – Emission, sampling, stepping, drawing, and stats generation in `SignalField` all early-return when `CONFIG.signal.enabled` is false, ensuring that simply toggling the flag disables channel plumbing without additional guards in caller code.【F:signalField.js†L118-L215】【F:signalField.js†L273-L335】
- **Agent setup** – `Bundle` constructors iterate `SIGNAL_CHANNELS` to allocate ring buffers and interpretation biases for every logical channel, so changing the enumeration automatically reinitializes bundle memory on spawn/reset. Keyboard toggles live in `app.js` for other systems, but channel participation is driven purely through the config surface and controller wiring.【F:app.js†L173-L210】【F:app.js†L566-L629】

## Tick ordering & data flow
- **Live loop (play/test)** – Each frame the simulation captures trail and signal snapshots before agents move, preserving last-tick emissions for perception. Link formation, bundle updates, and link maintenance run next, followed by `Trail.step`/`SignalField.step` to apply decay and diffusion. Reinforcement, ecology updates, scent gradient consumption, and HUD rendering follow before the next `requestAnimationFrame`. Signal stats are sampled every 30 ticks and forwarded to the training UI alongside analytics summaries.【F:app.js†L2352-L2638】
- **Training episodes** – `runEpisode` mirrors the same ordering with a fixed `dt`: capture snapshots, update each bundle (including adaptive reward signaling), accumulate rewards, then step the shared fields. This keeps learned-policy rollouts consistent with play mode and guarantees that manifest data (stats + analytics) reflect the decisions the policy saw.【F:app.js†L2688-L2788】

## Channel manifest fields
- **Field statistics** – `SignalField._computeStats` produces a manifest-style object containing channel count, per-channel total power, mean, variance (also reused as local variance), SNR, and a coarse diversity count based on non-trivial totals. Callers retrieve this via `getStats`, which transparently returns empty arrays when the system is disabled.【F:signalField.js†L273-L335】
- **Response analytics** – `SignalResponseAnalytics.getSummary` aggregates stimuli/responses per channel, reporting totals, average latency, per-channel latency/coherence, and an overall coherence score. It also suppresses duplicate per-tick responses to keep manifest data clean.【F:analysis/signalResponseAnalytics.js†L1-L140】
- **UI projection** – The training panel’s `updateSignalStats` consumes the merged manifest (stats + analytics) to display diversity/channel count, coherence, per-channel SNR, and total power strings, giving operators quick visibility into channel health while training or testing policies.【F:trainingUI.js†L206-L242】

## Integration guardrails
- **Enumeration discipline** – New semantic channels must be added to `SIGNAL_CHANNELS` *and* given config sensitivities/weights. Because constructors, perception, emission, and analytics all iterate the enumeration, omitting a config entry leads to default gains but no runtime failures; documenting the expectation prevents silent mis-weighting.【F:app.js†L173-L210】【F:config.js†L300-L324】【F:config.js†L566-L582】
- **Snapshot contract** – Perception assumes snapshots are captured before bundle updates. Any new system that mutates `SignalField` mid-tick must either respect this ordering or explicitly recapture snapshots to avoid agents seeing partially updated fields.【F:app.js†L2352-L2387】【F:signalField.js†L151-L200】
- **Resize hooks** – Config panel mutations call `onConfigChanged`, which resizes the signal field when cell size or channel count changes. Extensions should route resize-triggering toggles through this hook to keep buffer dimensions aligned and prevent stale manifests.【F:config.js†L891-L912】
- **Analytics cadence** – The 30-tick sampling cadence balances insight and cost. New telemetry should either piggyback on this cadence or justify a different interval to avoid UI thrash and analytics bloat.【F:app.js†L2601-L2617】

## Traceability
| Requirement | Location(s) |
| --- | --- |
| Toggle visibility & propagation | `config.js` signal defaults and schema expose runtime and UI toggles.【F:config.js†L300-L324】【F:config.js†L566-L582】 |
| Tick sequencing consistency | Main loop and training episode maintain shared capture/update/step order.【F:app.js†L2352-L2638】【F:app.js†L2688-L2788】 |
| Manifest field composition | Stats manifest computed in `signalField.js`; analytics manifest in `analysis/signalResponseAnalytics.js`; UI consumption in `trainingUI.js`.【F:signalField.js†L273-L335】【F:analysis/signalResponseAnalytics.js†L1-L140】【F:trainingUI.js†L206-L242】 |
| Integration safeguards | Enumeration/config alignment plus resize/snapshot guardrails documented from `app.js` and `config.js`.【F:app.js†L173-L210】【F:app.js†L566-L629】【F:config.js†L889-L912】 |
