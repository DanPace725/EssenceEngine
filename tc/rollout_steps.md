Kickoff plan: Agent genome TC integration for testing
Nail down the minimal genome contract

Formalize the Phase 1 instruction set (IF_*, SET_*, GOTO) and the agent state it will read/write so it matches the “Agent Genomes” starting point in the TC update plan.

Decide where genomes live in agent data (e.g., controller bundles vs. manifest storage) and capture the decision in docs so later evolutionary phases (mutation/crossover) have clear hooks.

Implement a deterministic genome runtime module

Create a tc/tcGenomeRuntime.js (or similar) that mirrors the existing stepper pattern: normalize inputs, keep buffers in TcStorage, and expose capture/compute/commit so the scheduler can drive one instruction per tick.

Provide helper utilities for seeding and initialization the way the Rule 110 initializers do, so fixture programs remain reproducible when run headlessly or in CI.

Expose scheduler and controller integration

Add a registerAgentGenomeStepper wrapper like the Rule 110/Tape helpers that registers the runtime with TcScheduler, returning an unsubscribe handle for clean resets.

Extend Controller.registerTcHooks usage so controllers (heuristic or learned) can opt into the genome runtime without duplicating scheduler wiring.

Author fixture-based determinism tests

Follow the pattern in test/test-rule110.js and test/test-tape.js: load small genome fixtures, replay them through TcScheduler, and hash observable outputs (e.g., action vectors or manifest snapshots) to ensure deterministic replay.

Add a “TC disabled” regression that runs the same fixtures with the runtime gated off, echoing test/test-tc-disabled.js to prove the rest of the sim remains stable.

Document and monitor the new pathway

Update the TC docs to show how the genome runtime plugs into the existing scheduler/headless tooling so contributors can regenerate fixtures the same way they already do for Rule 110.

Note any signal-field touchpoints or analytics impacts using the channel design guardrails, and capture baseline performance expectations alongside the current TC telemetry notes.

Step one: 
Breakdown of “Nail down the minimal genome contract”
Task 1: Inventory genome-visible agent state
Review the existing bundle fields (chi, hunger, frustration, signal memory, action trackers, etc.) to list which values the genome runtime can safely read and write without breaking the current sim loop.

Cross-reference the observation builder to highlight which perceptual channels (signals, scent, density, trail cues) can be mapped directly into genome inputs, matching the plan’s call for hunger/chi/signal awareness.

Deliverable: a short doc section or table capturing candidate “inputs” and “outputs” for the genome, plus any fields that must remain read-only.

Task 2: Specify the Phase 1 instruction set
Translate the Phase 1 instruction list (IF_*, SET_*, GOTO) into precise opcode definitions: argument types, branching rules, clamped ranges, and which agent fields each opcode updates.

Identify how the proposed outputs (e.g., movement bias/explore rate/bond threshold) map onto existing controller parameters or bundle fields so later tasks know where to write results.

Deliverable: a draft specification (preferably in a new tc/docs/agent_genome_contract.md) detailing opcode semantics, valid arguments, and expected state side effects.

Task 3: Decide genome storage & lifecycle integration
Evaluate whether genomes should be stored directly on each bundle (next to controller state) or in TC storage, referencing current controller hook patterns (registerTcHooks) and scheduler phases (capture → compute → commit).

Document initialization/reset requirements (e.g., how genomes are seeded, how manifests reference them) so later runtime and testing work can rely on a consistent contract.

Deliverable: an update to the new genome contract doc spelling out storage location, reset semantics, and how the scheduler will invoke the runtime.