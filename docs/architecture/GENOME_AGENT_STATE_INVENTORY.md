# Genome-Visible Agent State Inventory

This reference captures the agent-facing state exposed by the `Bundle` class so a genome runtime can safely introspect and (where reasonable) mutate the live simulation without derailing the current loop. The fields below come directly from `createBundleClass` in `src/core/bundle.js`; the notes column calls out which subsystems currently own updates so the genome layer can avoid fighting the engine.

## Legend

- **Safe read** – The genome can freely read the value every tick.
- **Safe write** – The genome can set the value without upsetting engine invariants. Use the constraints in the notes column (e.g. keep values finite or inside `[0,1]`).
- **Avoid direct writes** – Leave these to the engine; writing them risks breaking rendering, controller routing, or lifecycle bookkeeping.

## Core physical state

| Field | Type | Safe read | Safe write | Notes |
| --- | --- | --- | --- | --- |
| `x`, `y` | number | ✔ | ✔ (keep within playfield bounds) | World position, updated by movement helpers and clamps after controller actions.【F:src/core/bundle.js†L265-L681】【F:src/core/bundle.js†L1091-L1140】 |
| `visualX`, `visualY` | number | ✔ | ⚠ (cosmetic only) | Render smoothing targets updated in `draw`; writes only affect interpolation.【F:src/core/bundle.js†L265-L266】【F:src/core/bundle.js†L972-L984】 |
| `vx`, `vy` | number | ✔ | ✔ | Velocity caches refreshed by steering/controller paths; genome can inject desired momentum before physics step.【F:src/core/bundle.js†L267】【F:src/core/bundle.js†L657-L663】【F:src/core/bundle.js†L1096-L1122】 |
| `heading`, `_lastDirX`, `_lastDirY` | number | ✔ | ✔ (normalize to unit heading) | Orientation caches used by steering and signal bias logic; keep `_lastDir*` normalized to avoid bias artifacts.【F:src/core/bundle.js†L303-L304】【F:src/core/bundle.js†L656-L663】【F:src/core/bundle.js†L1098-L1108】 |
| `size` | number | ✔ | Avoid direct writes | Radius couples to collision, render sizes, and mitosis—changing it bypasses allocation assumptions.【F:src/core/bundle.js†L268】【F:src/core/bundle.js†L1016-L1039】 |
| `id` | number | ✔ | Avoid direct writes | Unique agent identifier used throughout world registries.【F:src/core/bundle.js†L271】 |

## Energetics & drives

| Field | Type | Safe read | Safe write | Notes |
| --- | --- | --- | --- | --- |
| `chi` | number | ✔ | ✔ (keep finite, ≥0) | Core energy pool consumed by metabolism and movement; resource collection also mutates it.【F:src/core/bundle.js†L269】【F:src/core/bundle.js†L596-L723】【F:src/systems/resourceSystem.js†L57-L104】 |
| `alive` | boolean | ✔ | ✔ | Halts `update` when false; decay system will take over. Setting true revives instantly (engine already supports this in debug tooling).【F:src/core/bundle.js†L270】【F:src/core/bundle.js†L594-L602】【F:src/systems/resourceSystem.js†L57-L91】 |
| `hunger` | number (0–1) | ✔ | ✔ (stay in [0,1]) | Biological drive updated every tick and reset on resource collect; other systems assume normalized range.【F:src/core/bundle.js†L286】【F:src/core/bundle.js†L884-L889】【F:src/systems/resourceSystem.js†L84-L100】 |
| `frustration` | number (0–1) | ✔ | ✔ (stay in [0,1]) | Exploration pressure modulated by hunger and trail context; decays when the agent succeeds.【F:src/core/bundle.js†L282】【F:src/core/bundle.js†L888-L943】 |
| `lastCollectTick` | number | ✔ | ✔ | Used to detect stagnation; resource system overwrites it when something is collected.【F:src/core/bundle.js†L283】【F:src/core/bundle.js†L888-L893】【F:src/systems/resourceSystem.js†L73-L88】 |
| `bereavementBoostTicks` | number | ✔ | ✔ | Exploration boost timer consumed each update; safe to toggle for genome-driven morale effects.【F:src/core/bundle.js†L326】【F:src/core/bundle.js†L720-L723】 |

## Sensing & signal context

| Field | Type | Safe read | Safe write | Notes |
| --- | --- | --- | --- | --- |
| `extendedSensing` | boolean | ✔ | ✔ | Toggles larger sensory radius; also wired to controller action’s `senseFrac`.【F:src/core/bundle.js†L274-L279】【F:src/core/bundle.js†L1135-L1140】 |
| `currentSensoryRange`, `_targetSensoryRange` | number | ✔ | ✔ (keep positive) | Managed by `computeSensingUpdate`; genome can bias range but expect engine to re-blend toward target each tick.【F:src/core/bundle.js†L278-L279】【F:src/core/bundle.js†L604-L617】 |
| `signal_memory[channel]` | ring buffer | ✔ | Avoid direct writes (use `recordSignalSample`) | Stores recent channel amplitudes for averages; replacing structure breaks sampling helpers.【F:src/core/bundle.js†L289-L307】【F:src/core/bundle.js†L768-L787】 |
| `interpretation_bias[channel]` | number | ✔ | ✔ (clamp to [0,1]) | Bias cache influences steering; engine decays it every tick so genome nudges will be blended.【F:src/core/bundle.js†L289-L307】【F:src/core/bundle.js†L807-L836】 |
| `signalContext` | object | ✔ | ⚠ (short-lived) | Cached per-tick signal snapshot; genome may overwrite for experimentation but engine will refresh next `captureSignalContext` call.【F:src/core/bundle.js†L291-L299】【F:src/core/bundle.js†L788-L821】 |
| `_signalContextTick` | number | ✔ | Avoid direct writes | Internal guard preventing duplicate captures per tick.【F:src/core/bundle.js†L292】【F:src/core/bundle.js†L788-L804】 |
| `signal_profile` | object | ✔ | Avoid direct writes | Engine tracks per-channel emissions to enforce caps; altering shape breaks signal accumulation.【F:src/core/bundle.js†L329】【F:src/core/bundle.js†L724-L751】 |
| `participationWaveSample` | object or null | ✔ | ⚠ (clear or replace with same shape) | Holds participation field sampling used by frustration math; null or `{resource, bond, distress}` tuples are safe.【F:src/core/bundle.js†L335】【F:src/core/bundle.js†L900-L943】 |

## Control & action interfaces

| Field | Type | Safe read | Safe write | Notes |
| --- | --- | --- | --- | --- |
| `useController` | boolean | ✔ | ⚠ (coordinate with trainer) | Tells the loop to route actions through a policy; toggled globally by training code so genomes should only change it intentionally.【F:src/core/bundle.js†L307-L310】【F:src/systems/controllerAction.js†L1-L18】 |
| `controller` | object or null | ✔ | ⚠ (assign callable policy) | Must expose `act()` per controller contract; training orchestrator installs controllers here.【F:src/core/bundle.js†L307-L312】【F:src/core/training.js†L366-L370】【F:src/systems/controllerAction.js†L1-L18】 |
| `lastAction` | object or null | ✔ | ✔ | Pure UI telemetry for HUD; safe to store genome-decided actions for debugging.【F:src/core/bundle.js†L309-L312】【F:src/core/bundle.js†L640-L646】 |
| `rewardTracker` | `RewardTracker` | ✔ | Avoid direct writes (use methods) | Tracks episodic reward; mutate via tracker API instead of replacing the instance.【F:src/core/bundle.js†L309-L310】 |

## Lifecycle bookkeeping

| Field | Type | Safe read | Safe write | Notes |
| --- | --- | --- | --- | --- |
| `generation`, `parentId`, `lastMitosisTick` | number / number or null | ✔ | ⚠ (ensure lineage consistency) | Used by mitosis system to form lineage links; genome may annotate but world uses these for reports and reproduction cooldowns.【F:src/core/bundle.js†L316-L320】【F:src/core/bundle.js†L720-L733】【F:src/core/world.js†L200-L207】 |
| `_mitosisState` | object | ✔ | Avoid direct writes | Populated by mitosis system each update; shape is implementation-defined.【F:src/core/bundle.js†L332】【F:src/core/bundle.js†L720-L724】 |
| `deathTick`, `decayProgress`, `chiAtDeath` | number | ✔ | ⚠ (respect decay flow) | Decay system depends on these when fading corpses; safe to reset when reviving, mirroring resource collection logic.【F:src/core/bundle.js†L321-L325】【F:src/core/bundle.js†L594-L602】【F:src/systems/resourceSystem.js†L92-L105】 |

## Rendering & handles

| Field | Type | Safe read | Safe write | Notes |
| --- | --- | --- | --- | --- |
| `visible` | boolean | ✔ | ✔ | UI toggle for HUD/debug; genome can hide agents with no side effects.【F:src/core/bundle.js†L313-L315】【F:src/core/bundle.js†L964-L971】 |
| `graphics`, `trailRenderer` | PIXI objects | ✔ | Avoid direct writes | Managed by rendering subsystem; replacing them leaks GPU handles.【F:src/core/bundle.js†L342-L356】【F:src/core/bundle.js†L998-L1039】【F:src/core/bundle.js†L1211-L1218】 |

## Additional guidance

- **Use helpers when present.** Methods like `emitSignal`, `recordSignalSample`, `applyAction`, and `updateHeuristicMovement` expose safe hooks for genomes to interact with signals or motion without rebuilding low-level bookkeeping.【F:src/core/bundle.js†L724-L870】【F:src/core/bundle.js†L930-L971】
- **Treat complex objects as opaque.** `rewardTracker`, `graphics`, `trailRenderer`, and `_mitosisState` hold engine-managed state. Read them for insight but mutate only through provided APIs or by coordinating with their owning systems.
- **Lifecycle coordination matters.** When forcing revival or death, mirror what the resource system does: reset `alive`, `chi`, `deathTick`, `decayProgress`, and optionally `chiAtDeath` to maintain decay invariants.【F:src/systems/resourceSystem.js†L57-L105】
