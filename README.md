# Essence Engine

A browser-based sandbox for exploring emergent behavior in swarms of intelligent agents. Watch as simple agents learn to navigate, forage for resources, and evolve complex behaviors through reinforcement learning.

## Overview

Essence Engine simulates resource-seeking agents (called "bundles") in a dynamic 2D environment. Agents navigate through a world with regenerating plant-based resources, leave trails, sense their surroundings, and can even reproduce. The simulation includes a built-in training system that uses the Cross-Entropy Method to evolve agent behaviors over multiple generations.

## Key Features

- **Interactive Simulation** - Run the simulation in real-time with keyboard controls to adjust parameters on the fly
- **User Participation** - Click and drag to guide agents with interactive force fields in three modes (resource, distress, bond)
- **Agent Learning** - Built-in reinforcement learning system that trains agents to optimize resource collection
- **Dynamic Ecology** - Plant resources regenerate based on fertility and carrying capacity, creating evolving landscapes
- **Agent Reproduction** - Agents can split (mitosis) when they gather enough energy, creating population dynamics
- **Visualization Tools** - Toggle various overlays to see sensing ranges, scent gradients, fertility maps, and agent trails
- **Modular Architecture** - Clean separation between simulation core, systems, and UI for easy experimentation

## Getting Started

1. Clone this repository
2. Open `index.html` in a modern web browser
3. The simulation will start automatically
4. Use keyboard controls (see below) to interact with the simulation

No build process or dependencies required - it runs entirely in the browser!

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

## Participation Mode

Enable interactive agent guidance by pressing `O` to open the config panel and clicking "Enable" in the Participation section.

**Mouse Controls:**
- **Left Click + Drag** - Guide agents toward resources
- **Shift/Middle Click** - Create urgent distress signals
- **Alt/Right Click** - Gentle cooperative bonding

Click and drag to create influence fields that agents respond to in real-time. Perfect for teaching agents, creating demonstrations, or debugging behavior. See `docs/how-to/PARTICIPATION_GUIDE.md` for detailed usage.

## Configuration

The simulation is highly configurable through `config.js`. Key configuration areas include:

- **Plant Ecology** - Adjust resource regeneration rates, fertility mechanics, and carrying capacity
- **Agent Behavior** - Configure sensing ranges, movement speeds, and energy metabolism
- **Mitosis** - Control reproduction thresholds and population limits
- **Learning** - Tune the reinforcement learning parameters including population size and mutation rates
- **Adaptive Rewards** - Enable dynamic reward scaling based on resource scarcity
- **Participation** - Configure interactive guidance modes, force strength, and decay rates

Edit `config.js` to experiment with different parameters without modifying the core simulation code.

## Training Agents

Press `L` to open the training UI and start evolving agent behaviors:

1. **Start Training** - Runs episodes with the current policy and collects performance data
2. **Evolution** - The Cross-Entropy Method (CEM) selects top-performing policies and generates new candidates
3. **Save/Load** - Export trained policies as JSON files for later use or sharing

The training system runs multiple agents simultaneously, each testing the same policy to get reliable performance metrics. Over generations, agents learn increasingly sophisticated foraging strategies.

## Project Structure

```
src/
  core/         # Core simulation systems (world state, training, simulation loop)
  systems/      # Individual behavior systems (movement, sensing, metabolism, etc.)
  ui/           # Browser interface and canvas rendering
  utils/        # Shared utilities and math helpers

docs/           # Comprehensive guides and architecture documentation
tc/             # Turing machine implementations (experimental)
test/           # Unit tests for core systems
```

## Documentation

Visit `docs/INDEX.md` for detailed guides including:

- **Debug Mode** - Test features in isolation with pre-configured debug profiles
- Architecture documentation
- System-specific guides (resources, sensing, training, etc.)
- How-to guides for common tasks
- Analysis of training runs and experiments

## Contributing

See `CONTRIBUTING.md` for guidelines on contributing to the project.

## License

This project is open source. Feel free to explore, modify, and experiment!
