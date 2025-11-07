# Contributing to Slime-Bundle

This guide captures the agreed upon coding conventions, the refactored module layout, and the test suite expectations for the modular Slime-Bundle stack. Use it as the checklist before opening a pull request or shipping new systems.

## Architecture at a Glance

| Area | Purpose | Key Entry Points |
| --- | --- | --- |
| Simulation core | World assembly, tick orchestration, and learner integration now live under `src/core/`. `createWorld` wires bundles, ecology, mitosis tracking, and adaptive reward bookkeeping, while the simulation loop and training module provide deterministic stepping for both play and train modes.【F:src/core/world.js†L15-L147】【F:src/core/simulationLoop.js†L1-L160】【F:src/core/training.js†L1-L200】 |
| Systems | Self-contained mechanics (movement, metabolism, resource rewards, etc.) should live in `src/systems/` as pure utilities that depend only on their arguments.【F:src/systems/movement.js†L3-L89】【F:src/systems/metabolism.js†L1-L5】 |
| UI bridge | Browser-only wiring such as keyboard handling and DPR-aware canvas sizing stays in `src/ui/`, keeping DOM logic away from core systems.【F:src/ui/inputManager.js†L12-L160】【F:src/ui/canvasManager.js†L1-L61】 |
| Shared utilities | Math helpers and other shared stateless code belong in `src/utils/`. Reuse helpers like `clamp` instead of re-implementing them per module.【F:src/utils/math.js†L1-L12】 |
| Legacy bridge | `src/index.js` re-exports globals from the legacy `app.js` entry point to keep backwards compatibility while new work targets the modular packages. Avoid adding new logic here—migrate features into `src/` modules instead.【F:src/index.js†L1-L11】 |
| Configuration | Global tuning knobs reside in `config.js`; keep new toggles and defaults centralized so both the browser build and Node-based tests stay in sync.【F:config.js†L1-L200】 |
| Documentation | `docs/INDEX.md` is the authoritative map for maintained guides and legacy references. Update it whenever you add or deprecate docs so downstream readers know which guides reflect the refactored stack.【F:docs/INDEX.md†L1-L42】 |

## Coding Conventions

* **Prefer ES modules and named exports.** Define modules with `export function` / `export const` so bundlers and tests can tree-shake and mock functions easily.【F:src/systems/metabolism.js†L1-L5】【F:src/systems/movement.js†L3-L54】
* **Inject dependencies instead of importing singletons.** Factories such as `createWorld` and `createTrainingModule` accept a context bag so tests can supply fakes; follow the same pattern for new modules that need shared services.【F:src/core/world.js†L15-L126】【F:src/core/training.js†L4-L73】
* **Keep systems pure and data-oriented.** Movement, metabolism, and residual evaluation return plain objects and avoid DOM access; new systems should follow the same functional style to keep determinism and testability.【F:src/systems/movement.js†L3-L89】
* **Isolate browser concerns.** Only UI modules should touch `window`, canvas APIs, or DOM manipulation. Use hooks similar to `initializeInputManager` / `initializeCanvasManager` for resize and keyboard wiring.【F:src/ui/inputManager.js†L29-L146】【F:src/ui/canvasManager.js†L1-L61】
* **Centralize tunables in `config.js`.** When adding new mechanics, expose toggles or numeric parameters through the shared `CONFIG` object so training scripts, Node tests, and the UI stay consistent.【F:config.js†L92-L200】
* **Respect compatibility shims.** If you must touch the legacy bridge, confine changes to exporting modular APIs—do not add new feature logic to `app.js` or `src/index.js`; instead, port code into `src/core`, `src/systems`, or `src/ui` and call it from the bridge.【F:src/index.js†L1-L11】

## Testing Expectations

Run the relevant Node-based checks before submitting a PR. All `.js` modules are treated as ES modules, so invoke Node with the custom loader:

```bash
node --loader ./test/esm-loader.mjs test/<file>.js
```

Required suites:

1. **System unit tests** – Cover the pure mechanics under `src/systems/`. At minimum run the existing metabolism and movement suites (and add new ones next to your modules).【F:test/metabolism.test.js†L1-L23】【F:test/movement.test.js†L1-L68】
2. **Determinism tests for TC integrations** – Rule 110 and Turing tape harnesses ensure scheduler/tape behavior remains stable across refactors. Execute `test/test-rule110.js` and `test/test-tape.js` when touching `tc/`, `analysis/`, or `config` TC toggles.【F:test/test-rule110.js†L1-L91】【F:test/test-tape.js†L1-L82】
3. **Adaptive reward smoke** – If you modify rewards or training heuristics, run the console harness to confirm math and logging: `node --loader ./test/esm-loader.mjs test-adaptive-rewards.js` (or `node test-adaptive-rewards.js` when using a module-aware Node build).【F:test-adaptive-rewards.js†L1-L104】
4. **Browser sanity** – Manual, but required for UI changes: load `index.html`, verify hotkeys via `initializeInputManager`, and confirm overlays/settings respond as expected.【F:src/ui/inputManager.js†L29-L146】

Document any skipped suite (with rationale) in the PR description so reviewers know what still needs coverage.

## Checklist for Adding a New System or Module

- [ ] Place the implementation under the appropriate package (`src/systems/` for mechanics, `src/core/` for orchestration, `src/ui/` for DOM bindings) and export named entry points.【F:README.md†L15-L23】【F:src/systems/metabolism.js†L1-L5】
- [ ] Inject shared dependencies through function arguments or factory context objects instead of importing global singletons.【F:src/core/world.js†L15-L126】
- [ ] Add or update configuration flags/defaults in `config.js`, including optional toggles for experimental behavior.【F:config.js†L92-L200】
- [ ] Create or extend a matching test in `test/`, runnable via the ESM loader, that exercises success paths and error handling.【F:test/movement.test.js†L1-L68】【F:test/esm-loader.mjs†L1-L14】
- [ ] Update docs (`docs/INDEX.md`, targeted guides, and any quickstarts) so instructions match the new behavior; call out legacy guides that now diverge.【F:docs/INDEX.md†L1-L42】
- [ ] Note the change in the PR checklist/description, including which tests ran and which docs were touched, so reviewers can cross-check behavior.

## Keeping Documentation in Sync

* **Treat docs as part of the feature.** Whenever behavior or configuration changes, update `docs/INDEX.md` plus any affected guide (e.g., ecology, rewards, UI) in the same branch.【F:docs/INDEX.md†L1-L42】
* **Flag legacy drift.** If a guide now contradicts runtime behavior, either refresh it or mark it as legacy in the “Experimental & Legacy References” table so readers do not follow stale steps.【F:docs/INDEX.md†L17-L34】
* **PR hygiene.** Reference the doc updates in your PR description (“Docs: updated TRAINING_GUIDE.md for new slider”) and link to any screenshots if UI changes were made. If your change requires future doc work, open a follow-up issue before merging.
* **Template integration.** When a PR template is added, include explicit checkboxes for “Updated docs” and “Docs not required (explain)” plus a field linking to the touched guides. Until then, replicate the checklist manually in your PR body so reviewers enforce doc parity.

Following this guide keeps the refactored modules cohesive, the deterministic tests green, and the documentation aligned with the sandbox’s actual behavior. Welcome aboard!
