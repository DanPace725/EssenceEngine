# Casual Universality Flex Profile

The **casual universality flex** profile packages a deterministic Rule 110 harness together with the headless export path so we can demonstrate Turing-complete behavior without rebuilding the full browser UI each time. The profile toggles the TC runtime on, primes the manifest schema bindings, and ships with reproduction steps that mirror the acceptance tests used in CI. This note records the design intent, how the major pieces fit together, and the commands required to regenerate the published hashes.

## Intent

* Provide a one-click preset (`profiles/universality/casual_universality_flex.json`) that enables the Rule 110 stepper, pre-wires the snapshot schema (`tc.rule110.snapshot`), and keeps the tape machinery available for follow-up experiments.  
* Keep manifests conformant with the final schema names so downstream tooling can validate snapshots directly against `schemas/tc_rule110_snapshot.schema.json` and `schemas/tc_tape_snapshot.schema.json` without translation layers.  
* Make the headless Rule 110 script (`tc/rule110Headless.js`) the canonical way to re-derive hashes, mirroring the determinism checks in `test/test-rule110.js` so analysts can trust that the exported NDJSON stream matches what the learner saw.  
* Document the scheduler phases and storage hand-offs so new contributors can extend the TC stack (for example, by adding new manifest fields) without regressing the existing snapshots.

## Implementation Overview

### Profile wiring

The `casual_universality_flex` profile flips `tc.enabled` to `true`, pins the seed/tick salt, and raises `updateCadence` to `1` so Rule 110 runs every tick alongside the organism sim. It registers two schemas: `tc.rule110.snapshot` stays active while the `tc.turing_tape.snapshot` schema remains documented but disabled, which lets us stage tape experiments without touching the manifest pipeline.  When the profile is loaded through the config panel (press **L** to open the training UI and choose the preset loader), `applyTcConfig` replays the TC configuration and resizes caches as needed.

### Scheduler, storage, and steppers

`TcScheduler` governs the `capture → compute → commit` phase order and seeds each tick deterministically using `mixSeed`. Registering the Rule 110 stepper attaches callbacks to all three phases, ensuring that captures publish a fresh `tc.rule110.snapshot` payload before compute mutates any buffers.  The scheduler keeps the RNG deterministic whenever `tc.enabled` is true by pushing a tick-specific seed before execution and popping it during `endTick`. Storage is handled by `TcChunkStorage`, which creates or reuses typed-array chunks per `stateKey`/`bufferKey`, avoiding GC churn while still supporting reinitialization on profile swaps.

The Rule 110 stepper accepts initializers from `tc/tcInitializers.js`. Ether, glider, and pseudo-random starts each return a `{ cells, origin, metadata }` bundle, guaranteeing that metadata like `origin: 'ether+glider'` and the fixed `rule: 110` flag survive the snapshot pipeline. `createRule110Stepper` normalizes any initializer into deterministic arrays, emits snapshots before each compute pass, and rehydrates metadata on reloads.

### Headless export path

`tc/rule110Headless.js` mirrors the scheduler phases used in the browser: it resets storage, enables the scheduler, registers the stepper, runs `capture/compute/commit`, and writes one NDJSON line per tick. Each entry includes the tick number, SHA-256 hash of the binary cell string, the initializer signature, origin tag, and merged metadata (including the preserved rule ID).  The script defaults to `128` cells, `128` steps, and the ether initializer, but exposes CLI flags for width, seed, density, phase, and offset so you can recreate every fixture in `analysis/fixtures/rule110-hashes.json`.

`test/test-rule110.js` consumes the same scheduler to verify determinism. Each fixture uses the corresponding initializer and asserts that the hash sequence matches the fixture. Because both the headless script and the tests share the hashing helper (`computeHash`), the documentation below can quote hashes directly from the fixtures and stay authoritative.

### Visualizing the flow

Two Mermaid diagrams capture how the pieces align. The flowchart stored in [`docs/notes/figures/casual_universality_flex_flow.mmd`](figures/casual_universality_flex_flow.mmd) shows profile loading flowing through `applyTcConfig`, the scheduler, the stepper, and finally to the headless emitter and training UI. The sequence diagram in [`docs/notes/figures/casual_universality_flex_phases.mmd`](figures/casual_universality_flex_phases.mmd) walks through one tick, emphasizing that snapshots are emitted during `capture` before any state mutation occurs.

## Reproduction Steps

### 1. Load the profile

1. Launch the browser build (open `index.html` in a modern browser).
2. Press **L** to reveal the training/config panel.
3. Click the profile dropdown and load `profiles/universality/casual_universality_flex.json`. The loader applies `tc.enabled = true`, `mode = 'rule110'`, and turns on Rule 110 snapshot capture while leaving the tape schema reference in place for later use.
4. Confirm that the TC indicator in the panel is green and that the snapshot schema references in the UI point to `schemas/tc_rule110_snapshot.schema.json`.

> **Tip:** Because the profile keeps `updateCadence` at `1`, Rule 110 advances on every world tick. If you need to slow it down for visualization, adjust `tc.updateCadence` in the panel—`TcScheduler` will still preserve determinism because the seed is derived from `tick` regardless of cadence.

### 2. Run the determinism tests

*From the repository root:* `node test/test-rule110.js`. This verifies the ether, glider, and seeded random fixtures (32 steps each). Expect console output ending with `Rule110 determinism tests passed.`  The fixture hashes published in `analysis/fixtures/rule110-hashes.json` are authoritative; for example, ether phase 0 step 0 must hash to `d5f7dfec2b1699bc843418f910a9c3f0ab0dc322069a64d44d86bc596f279b1d`.

### 3. Regenerate the headless manifest

Run the headless script with the same parameters used in the profile:

```bash
node tc/rule110Headless.js \
  --initializer ether \
  --width 128 \
  --steps 128 \
  --seedBase 0 \
  --output out/rule110-ether.ndjson
```

The command writes 128 NDJSON records. The first four hashes for the default ether initializer should be:

| Tick | Hash |
| --- | --- |
| 0 | `891a2789bc80d79458b0a9d4f76926ce31f1d715bbda1c8374cb360e84355114` |
| 1 | `0b49a919668b09d85a8de9b50e78ff230e92a4b802a6c60bc9ee1f616e5306ce` |
| 2 | `a46e45b06124acf082b378489d45cf5b5262d09b8cb122203a62dc2b02de73fc` |
| 3 | `f96aac398729343db910db9160774773753f50d93dae95dca652b9740c489db5` |

The output file keeps every manifest entry compliant with `schemas/tc_rule110_snapshot.schema.json` and preserves `metadata.rule = 110`, ensuring consumers can validate using JSON Schema tooling out of the box.  To recreate the glider and random fixtures, tweak `--initializer glider --offset 20` or `--initializer random --seed 12345 --density 0.55` and shrink `--width`/`--steps` to `64`/`32` to match the fixture dimensions.

### 4. Inspect the live manifest in the UI

With the profile loaded, open the training panel and toggle the TC manifest overlay. `TcScheduler` will keep writing snapshots into the buffer referenced by `stateKey = 'tc.rule110.state'`, and the panel will surface the manifest type (`tc.rule110.snapshot`) alongside origin metadata. Because the manifest pipeline shares the storage backend with the headless script, hashes generated in the UI will match the headless NDJSON stream provided the initializers align.

## Troubleshooting

* **Hashes drift between runs.** Ensure `tc.seed` remains at `0` (or your chosen seed) in the panel. Any manual edit to the state buffer or RNG seeding path will change the hash stream. If you need to reinitialize without reloading the page, call `TcScheduler.reset()` from the console and reload the profile.
* **NDJSON file is empty.** Confirm the output directory exists or let the script create it. The script writes once after all steps; a crash mid-run leaves the file untouched, so rerun after fixing the error.
* **Schema validation fails.** Double-check that the manifest consumer expects `tc.rule110.snapshot`. Older tooling may still reference `tc.rule110.frame`; update them to use the schema IDs bundled here.

By anchoring the profile, scheduler, schema, and scripts around the same deterministic primitives, this package gives analysts a self-contained way to demonstrate Rule 110 universality and share reproducible manifests without touching the rest of the simulation stack.
