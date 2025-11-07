# Slime-Bundle

Slime-Bundle is a browser-based simulation that explores the emergent behavior of simple, resource-seeking agents ("bundles") in a dynamic 2D environment. It combines elements of plant ecology, reinforcement learning, and agent-based modeling to create a rich, interactive world.

## Features

*   **Complex Agent Behavior:** Agents exhibit a range of behaviors including foraging, trail-laying, and responding to environmental cues.
*   **Dynamic Plant Ecology:** A fertility-based system governs resource distribution, creating a more natural and clustered environment.
*   **Reinforcement Learning:** Agents can be trained using the Cross-Entropy Method (CEM) to learn effective foraging strategies.
*   **Interactive Simulation:** A wide range of keyboard controls allow you to manipulate the simulation, toggle visualizations, and interact with the agents.
*   **Highly Configurable:** The simulation's parameters are exposed in `config.js`, allowing you to experiment with different scenarios.
*   **TC Snapshot Mode:** Load `profiles/universality/casual_universality_flex.json` to enable the deterministic Rule 110 runner and stream `tc.rule110.snapshot` manifests for manifest validation and headless reproductions.

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

The simulation's behavior is controlled by a central configuration file, `config.js`. This file exports a `CONFIG` object containing numerous parameters that you can modify to alter the simulation.

### Key Configuration Areas:

*   **`plantEcology`**: Controls the fertility-based resource system. You can enable/disable it, change fertility parameters, and adjust seed dispersal mechanics.
*   **`adaptiveReward`**: Manages the adaptive reward system. You can enable/disable it and tweak the parameters that determine how rewards are calculated.
*   **`mitosis`**: Governs agent reproduction. You can set the energy threshold for mitosis, the cost, and the population limits.
*   **`ai`**: A collection of parameters that control the agents' AI, including their sensory range, exploration behavior, and frustration mechanics.
*   **`learning`**: Contains settings for the reinforcement learning system, such as the population size, mutation rate, and episode length.

## Learning System

The simulation includes a reinforcement learning system based on the **Cross-Entropy Method (CEM)**. This is a simple evolutionary algorithm that trains a linear policy for the agents.

### Training UI

You can access the training UI by pressing the `L` key. The UI provides the following controls:

*   **Start Training:** Begins the training process. The simulation will run many episodes in the background to evaluate and improve the agents' policies.
*   **Stop Training:** Halts the training process.
*   **Save Policy:** Saves the current best policy to a JSON file.
*   **Load Policy:** Loads a previously saved policy from a JSON file.
*   **Test Best Policy:** Resets the simulation and applies the current best policy to the agents.
*   **Reset Learner:** Resets the learning system to its initial state.
