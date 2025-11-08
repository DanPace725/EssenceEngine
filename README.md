# Essence Engine

Essence Engine is a browser-based sandbox for exploring emergent behavior in swarms of resource-seeking agents ("bundles"). The refactored codebase separates rendering, simulation, and tooling into modular packages so you can iterate on ecology experiments, learning pipelines, or UI instrumentation without wading through a single monolithic script.

## Features

* **Modular Simulation Core:** The runtime is organized into focused modules for the world state, systems, UI wiring, and shared utilities under `src/`, making it easier to extend individual mechanics or replace subsystems without side effects.【F:src/index.js†L1-L23】【F:src/core/world.js†L1-L120】
* **Dynamic Ecology:** Plant fertility, carrying capacity, and residual trail systems work together to produce clustered resources that react to agent pressure.【F:src/core/world.js†L41-L120】
* **Multi-Agent Training:** A dedicated training module orchestrates synchronized episodes for every bundle, captures telemetry, and coordinates the Cross-Entropy Method (CEM) learner alongside the training UI controls.【F:src/core/training.js†L1-L140】【F:src/core/training.js†L175-L248】
* **Interactive Simulation:** Keyboard and UI controls let you toggle sensing, gradients, mitosis, telemetry overlays, and training workflows while the render loop adapts to play vs. train modes.【F:src/core/simulationLoop.js†L1-L101】【F:trainingUI.js†L1-L120】
* **Configurable Systems:** Parameters for ecology, sensing, rewards, HUD overlays, and learning live in `config.js` so experiments can be tuned without touching code.【F:config.js†L1-L260】

## Project Structure

```
src/
  core/         # world assembly, simulation loop orchestration, training coordinator
  systems/      # discrete systems for movement, sensing, metabolism, mitosis, resources
  ui/           # browser input and canvas managers
  utils/        # math helpers and shared utilities
```

Legacy entry points (`app.js`, `controllers.js`, etc.) remain for backward compatibility, but new features should target the modular `src/` packages.

## Controls

| Key(s) | Action |
|---|---|
| `WASD` / `Arrow Keys` | Manually move Agent 1 (when `AUTO` mode is off). |
| `A` | Toggle `AUTO` mode for Agent 1. |
| `S` | Toggle extended sensing for all agents. |
| `G` | Toggle scent gradient visualization. |
| `P` | Toggle fertility visualization. |
| `M` | Toggle mitosis (agent reproduction). |
| `Space` | Pause/resume the simulation. |
| `R` | Reset the simulation to its initial state. |
| `C` | Give all agents +5 chi (energy). |
| `T` | Toggle the trail visualization. |
| `X` | Clear all trails. |
| `F` | Toggle trail diffusion. |
| `1`-`4` | Toggle the visibility of individual agents (1-4). |
| `V` | Toggle the visibility of all agents. |
| `L` | Show/hide the training UI. |

## Configuration

`config.js` exports a single `CONFIG` object that drives ecology, autonomy, UI overlays, and training policies. Highlights:

* **`plantEcology`** – Enables the fertility-based resource system and its carrying-capacity logic.【F:config.js†L74-L145】
* **`adaptiveReward`** – Optional adaptive reward calculations that scale payouts with search difficulty; toggle `enabled` to experiment without committing to the mechanic full-time.【F:config.js†L214-L230】
* **`mitosis`** – Controls reproduction thresholds, lineage overlays, and population caps.【F:config.js†L308-L365】
* **`learning`** – Configures CEM population sizes, mutation schedules, and episode horizons for bundled training runs.【F:config.js†L386-L474】

## Training Workflow

Press `L` to open the training dashboard and manage multi-agent learning sessions. Behind the scenes the training coordinator:

1. Resets the world and assigns the candidate policy to each bundle before an episode.【F:src/core/training.js†L25-L77】
2. Steps every bundle in lock-step while capturing trail/signal telemetry and computing adaptive or fixed rewards per collection.【F:src/core/training.js†L92-L183】
3. Hands reward aggregates back to the learner so CEM can rank elites and evolve the next generation.【F:src/core/training.js†L184-L248】

The UI surface lets you start/stop batches, save or load policies, and swap between play/test/train modes without restarting the simulation.【F:trainingUI.js†L45-L120】

## Documentation

Head to `docs/INDEX.md` for a curated map of maintained guides, experimental write-ups, and notes on legacy material that still references the pre-modular layout or HUD overlays.
