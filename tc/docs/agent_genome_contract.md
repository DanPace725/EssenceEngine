# Phase 1 Agent Genome Instruction Contract

## Overview
Phase 1 genomes execute a compact, single-pass instruction list to steer each agent's heuristics before the heuristic steering code computes the final velocity. The initial opcode palette consists of two conditional jumps, two state mutators, and an unconditional jump.【F:tc/update_plan.md†L192-L207】 Instructions operate on `Bundle` instances, which already expose hunger, chi, interpretation bias caches, and other control hooks that can be safely read or written by a genome runtime.【F:src/core/bundle.js†L264-L326】【F:docs/architecture/GENOME_AGENT_STATE_INVENTORY.md†L12-L43】 The interpreter runs after `captureSignalContext()` refreshes perception but before `computeAIDirection()` is used, so genome outputs immediately influence the same-tick steering pass.【F:src/core/bundle.js†L618-L640】

## Execution model
- Programs are arrays of `{ op, args }` objects evaluated with a zero-based instruction pointer (`ip`). The pointer starts at 0 and advances by 1 after each instruction unless a branch or jump overwrites it.
- Arguments are read positionally from `args`. Missing entries default to `0`. Non-finite numeric inputs are treated as `0` before clamping.
- Threshold arguments expressed as percentages are clamped to `[0, 1]` because hunger, frustration, and interpretation biases are normalized drives.【F:src/core/bundle.js†L281-L299】【F:src/core/bundle.js†L881-L919】
- Jump targets are clamped to the valid instruction index range `[0, program.length - 1]`. When the pointer leaves the range, execution halts for the tick.
- Mutators stage their results directly on the live `Bundle` fields listed in the opcode reference. The engine's own decay/update routines will continue to blend toward their targets, so genomes should reassert intents each tick when a sustained effect is desired.【F:src/core/bundle.js†L848-L879】【F:docs/architecture/GENOME_AGENT_STATE_INVENTORY.md†L35-L43】

## Opcode reference

| Opcode | Arguments | Validation & clamping | Effect | Updated fields |
| --- | --- | --- | --- | --- |
| `IF_HUNGER_GT` | `[threshold, target]` | `threshold` → clamp to `[0,1]`; `target` → clamp to `[0, n-1]` and floor to integer. | If `bundle.hunger > threshold`, set `ip = target`; otherwise continue to next instruction.【F:src/core/bundle.js†L285-L286】【F:src/core/bundle.js†L881-L889】 | None |
| `IF_CHI_LT` | `[thresholdChi, target]` | `thresholdChi` → clamp to `[0, CONFIG.startChi * 4]` to keep comparisons within realistic per-agent energy bands (default spawn is 15 χ, mitosis caps below ~60 χ).【F:config.js†L100-L109】【F:src/core/bundle.js†L593-L600】 `target` handled as above. | If `bundle.chi < thresholdChi`, jump to `target`; else fall through.【F:src/core/bundle.js†L264-L270】 | None |
| `SET_EXPLORE` | `[intensity]` | Clamp `intensity` to `[0,1]`. | Treats the value as a desired exploration-noise bias and writes it into the distress interpretation cache. The noise term inside `computeAIDirection` multiplies by `distressBias`, so this directly scales random walk strength for the tick.【F:src/core/bundle.js†L383-L389】【F:src/core/bundle.js†L555-L583】 | `bundle.interpretation_bias.distress` |
| `SET_BOND_THRESHOLD` | `[threshold]` | Clamp `threshold` to `[0,1]`. Convert to a conflict bias using `bias = clamp(1 - threshold, 0, 1)` before writing so that low thresholds make the agent perceive high conflict (and thus damp link guidance) while high thresholds keep the bias low and bonds stable.【F:src/core/bundle.js†L383-L389】【F:src/core/bundle.js†L520-L553】 | Sets `bundle.interpretation_bias.bond = bias` |
| `GOTO` | `[target]` | Clamp `target` to `[0, n-1]`, floor to integer. | Set `ip = target`. No state mutation. | None |

### Branching behavior
- Conditional opcodes perform their jump after reading the live bundle value. If the condition is not met, execution simply advances to the next instruction index.
- `GOTO` is unconditional. To prevent infinite loops during Phase 1, interpreters should cap the number of executed instructions per tick to `program.length` evaluations; exceeding this budget aborts the tick with a safety log.

## Output mapping

| Genome output | Storage site | Why it fits |
| --- | --- | --- |
| **Movement bias (future Phase 1 programs may expose this explicitly)** | `bundle.interpretation_bias.resource`, `bundle.interpretation_bias.distress`, and `bundle.interpretation_bias.bond` | These caches already steer heuristic motion: resource bias strengthens gradient pulls, distress bias inflates exploration noise, and bond bias damps cooperative guidance.【F:src/core/bundle.js†L383-L553】 They are safe to overwrite with normalized values each tick, and the engine blends them against sensor-derived targets automatically.【F:docs/architecture/GENOME_AGENT_STATE_INVENTORY.md†L35-L43】 |
| **Explore rate (Phase 1 `SET_EXPLORE`)** | `bundle.interpretation_bias.distress` | Exploration noise multiplies by the distress bias before contributing to steering randomness. Writing the genome’s desired intensity directly into this bias gives deterministic control without introducing new fields.【F:src/core/bundle.js†L383-L389】【F:src/core/bundle.js†L555-L583】 |
| **Bond threshold (Phase 1 `SET_BOND_THRESHOLD`)** | `bundle.interpretation_bias.bond` | Link guidance scales by the `bondConflict` term, which is the max of the current bias and live wave samples. Raising the stored bias simulates a low tolerance (easy to disengage), while lowering it lets the agent hold the bond unless participation waves signal trouble.【F:src/core/bundle.js†L383-L389】【F:src/core/bundle.js†L520-L553】 |

## Interpreter safety checks
- Revalidate after each write that `interpretation_bias` entries remain finite. Fall back to `0` when the incoming value is `NaN` or infinite to avoid corrupting steering math.
- Execute genomes only for living agents; dead bundles skip updates elsewhere in the loop.【F:src/core/bundle.js†L593-L603】
- When mutating biases, perform updates *after* `updateInterpretationBias()` runs so genome writes are not immediately overwritten, but before `computeAIDirection()` consumes them. In the current bundle loop, that window sits between `captureSignalContext()` and the steering call, just before the conditional `resolveControllerAction` branch.【F:src/core/bundle.js†L618-L640】 If the interpreter lives outside this window, it should explicitly rerun `captureSignalContext()` to keep gradients fresh.

## Storage and lifecycle integration

### Storage location decision
- **Per-bundle storage (preferred).** Each `Bundle` already carries controller configuration (`useController`, `controller`, `rewardTracker`, and HUD caches) so adding a `genomePhase1` slot keeps behavior programs co-located with the state they influence.【F:src/core/bundle.js†L307-L312】 Bundles are rebuilt on world reset, which naturally discards stale genomes when agents despawn.【F:src/core/world.js†L75-L130】 The interpreter can keep a small scratch object (`{ program, ip, lastTick }`) beside the bundle without touching global caches.
- **TC storage (deprioritized).** `TcStorage` is optimized for large, shared chunks (Rule 110 tapes, manifests) with eviction policies and dirty tracking, making it better suited for manifests and debug exports than per-agent programs.【F:tcStorage.js†L1-L160】 Storing Phase 1 genomes there would require indirection on every tick and explicit cleanup hooks when bundles die, with little benefit because genomes are small and agent-local.

The contract therefore stores Phase 1 genomes directly on the bundle as:

```ts
bundle.genomePhase1 = {
  program: Array<Instruction>,      // validated instruction list
  manifestKey: string | null,       // optional reference back to TC manifest
  lastAppliedTick: number,          // guard so we only run once per scheduler tick
  scratch: { ... }                  // interpreter-private temps (optional)
};
```

### Initialization and reset
- **Seeding.** When a bundle is constructed (spawn, mitosis, or world bootstrap), the controller layer pulls the genome descriptor from the active manifest entry and installs it into `bundle.genomePhase1`. The manifest should expose a deterministic identifier (`manifestKey`) so later metrics can attribute outcomes to the exact genome revision.【F:tc/docs/casual_universality_flex.md†L3-L30】
- **Profile / manifest updates.** Loading a new TC profile or swapping manifests clears `TcStorage`, resets the scheduler, and rebuilds bundles, so installers must rehydrate `genomePhase1` before the next tick runs.【F:src/core/world.js†L75-L130】【F:tcStorage.js†L303-L360】 If a manifest references multiple genomes (species roster), the loader assigns the correct genome during bundle creation and persists that mapping in the manifest metadata so replays stay deterministic.
- **Reset semantics.** `World.reset()` already tears down bundles, clears TC storage, and resets the scheduler, guaranteeing that no genome survives across episodes unless the orchestrator intentionally reassigns it.【F:src/core/world.js†L75-L130】 Controllers calling `reset()` must also drop their TC hooks so a stale interpreter cannot run after the bundle loses its genome.【F:controllers.js†L13-L66】

### Scheduler invocation contract
- **Hook registration.** The runtime registers its interpreter via `Controller.registerTcHooks`, binding optional `capture`, `compute`, and `commit` handlers under the controller instance so teardown happens automatically.【F:controllers.js†L13-L66】
- **Phase usage.** The capture phase pulls any external inputs (manifests, shared fields) needed before mutating bundle state. The compute phase executes the Phase 1 program with the instruction pointer budget defined above, writing any staged bias updates directly to the bundle. Commit emits manifests or telemetry derived from the new bundle state (e.g., genome hash + resulting bias snapshot) and clears scratchpads as needed. `TcScheduler` enforces this ordering and seeds the interpreter deterministically each tick, so handlers must remain pure within their respective phases.【F:tcStorage.js†L267-L360】
- **Runtime contract.** The interpreter tracks `bundle.genomePhase1.lastAppliedTick`; if it matches the scheduler tick the compute handler exits early to avoid double-running when multiple controllers share a bundle. When `bundle.genomePhase1` is `null`, hooks should no-op so dead agents or genome-free bundles skip the interpreter without extra branching.
