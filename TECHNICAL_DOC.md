# Slime-Bundle Technical Documentation

This document provides a technical breakdown of the core mechanics of the Slime-Bundle simulation.

## Core Simulation Loop

The main simulation loop is located in the `loop` function within `app.js`. It orchestrates the entire simulation, updating the state of the world and rendering it to the canvas on each frame. The loop is driven by `requestAnimationFrame` for smooth animation.

Here is a high-level overview of the operations performed in each tick of the simulation (when not paused):

1.  **State Snapshot:** The current state of the chemical trail map is captured. This ensures that all agents in the current tick react to the same trail information, preventing race conditions.
2.  **Agent Updates:** Each agent's (`Bundle`) `update` method is called. This is the heart of the agent's behavior, where it senses the environment, makes decisions, and moves.
3.  **Trail System Update:** The trail map is updated. This involves:
    *   **Evaporation:** Trails slowly fade over time.
    *   **Diffusion:** Trails spread out to neighboring cells.
4.  **Ecology Update:** The resource ecology is updated. This includes the dynamics of the plant-based fertility system, resource respawning, and population-based pressure on the environment.
5.  **Resource Collection:** The simulation checks for overlaps between agents and resources. If an agent is on a resource, it collects it, gains energy (`chi`), and the resource begins its respawn cooldown.
6.  **Agent Reproduction (Mitosis):** Agents with sufficient energy may reproduce, creating new agents.
7.  **Decay:** Dead agents undergo a decay process, gradually releasing their stored energy back into the environment.
8.  **Rendering:** Once the world state has been updated, all the visual elements are drawn to the canvas in the following order:
    *   Background
    *   Fertility Grid (if enabled)
    *   Chemical Trails
    *   Agent-to-Agent Links
    *   Resources
    *   Agents
    *   HUD (Heads-Up Display)

## Agent Mechanics

The core logic for the agents is defined in the `Bundle` class in `app.js`. Each agent is an autonomous entity with its own internal state and a set of behaviors that govern its actions.

### Chi (χ) - The Energy System

Chi is the fundamental energy currency for the agents. It is consumed and gained as follows:

*   **Consumption:**
    *   **Base Metabolism:** A constant drain over time (`baseDecayPerSecond`).
    *   **Movement:** Moving costs energy (`moveCostPerSecond`).
    *   **Sensing:** Expanding the sensory range beyond its base level has a dynamic energy cost.
*   **Gain:**
    *   **Resource Collection:** The primary way agents gain Chi is by consuming resources. The amount of Chi gained can be fixed or determined by an adaptive reward system.
    *   **Residual Reuse:** Agents can absorb a small amount of Chi by following trails left by other agents, promoting cooperative behavior.

If an agent's Chi drops to zero, it dies and begins the decay process.

### Movement and Steering

Agent movement is governed by a steering model. The agent's AI (or manual input) determines a `want` direction. The agent then smoothly turns towards this direction at a rate determined by its `turnRate`. This creates more natural, flowing movement.

Several factors influence the agent's speed and agility:

*   **Surge:** Agents can get a temporary speed boost when their frustration level is high.
*   **Hunger Amplification:** Hunger acts as a multiplier, increasing the speed surge and making agents move faster when they are desperate.

### Sensing

Agents perceive the world through a circular sensory range. This range is dynamic and costs Chi to maintain beyond its base size.

*   **Expansion:** The sensory range expands when an agent is frustrated, allowing it to "see" further when it's struggling to find resources.
*   **Hunger Amplification:** Hunger amplifies the effect of frustration on the sensory range, making desperate agents even more perceptive.

### Frustration

Frustration is an internal state (represented as a value from 0 to 1) that models the agent's "anxiety" or "stress" level.

*   **Buildup:** Frustration increases when an agent hasn't collected a resource recently and is in an area with low chemical trail density (i.e., it's "lost").
*   **Decay:** Frustration decreases when the agent can see a resource or has recently collected one.
*   **Effects:** High frustration leads to:
    *   Increased exploration (more random noise in movement).
    *   Faster turning.
    *   Higher maximum speed (surge).
    *   Expanded sensory range.

### Hunger

Hunger is a biological drive (0 to 1) that builds up over time and represents the agent's need for energy. It acts as an amplifier for other behaviors.

*   **Buildup:** Hunger steadily increases over time.
*   **Decay:** Collecting a resource significantly reduces hunger.
*   **Effects:** High hunger:
    *   Amplifies the exploration noise, sensory range expansion, and speed surge caused by frustration.
    *   Makes agents more desperate and willing to take risks.

## The Trail System

The trail system is a core component of the simulation, enabling indirect communication and coordination between agents. It's managed by the `Trail` object in `app.js` and operates on a downsampled grid for performance.

### Trail Deposition

As agents move, they deposit a chemical trail onto the grid. The amount of trail deposited is influenced by the agent's "health" (a function of its current Chi level). This means that healthier, more successful agents leave stronger trails, providing a more attractive path for others to follow.

Each deposit is also tagged with the `authorId` of the agent that created it. This allows for more complex behaviors, such as penalizing agents for following their own fresh trails.

### Trail Following

When in AI mode, agents sample the trail map at a distance in various directions to determine which way to go. They are attracted to stronger trail concentrations, but with some caveats:

*   **Proximity to Resources:** When an agent can see a resource, its tendency to follow trails is reduced, as it will prioritize direct pursuit.
*   **Wall Avoidance:** The influence of trails is diminished near walls to prevent agents from getting stuck in corners.
*   **Trail Cooldown:** Agents ignore trails that are too "fresh" (a few ticks old) to prevent them from being influenced by their own recent movements. They also gain more "residual" Chi from older trails, incentivizing the reuse of established paths.

### Evaporation and Diffusion

To keep the environment dynamic, the trail map is constantly evolving:

*   **Evaporation:** Trails gradually lose their strength over time, controlled by the `evapPerSec` parameter. This ensures that old, unused paths eventually disappear.
*   **Diffusion:** If enabled (`enableDiffusion`), trails will spread to neighboring cells on the grid, controlled by `diffusePerSec`. This creates smoother, more organic-looking trail patterns.

## Resource Ecology

The simulation features a sophisticated resource ecology system, defined in `plantEcology.js`, which moves beyond simple random resource placement. This system is designed to create a more natural, dynamic, and challenging environment for the agents.

### The Fertility Grid

The foundation of the plant ecology system is the `FertilityGrid`. This is a low-resolution grid that represents the quality or "richness" of the soil across the simulation world.

*   **Initialization:** The grid is initialized with several fertile "patches," creating resource clusters. The rest of the map has a base level of fertility with some random variation.
*   **Depletion and Recovery:**
    *   When an agent collects a resource, the fertility of the surrounding area is depleted.
    *   Over time, depleted areas slowly recover their fertility.
*   **Population Pressure:** If the agent population grows too large, it can cause a slow, global degradation of fertility, simulating the effects of over-foraging.

### Resource Spawning

Resource spawning is directly tied to the fertility grid:

*   **Seed Dispersal:** Existing resources have a chance to "spawn a seed" in their vicinity. This seed will only grow into a new resource if it lands in a sufficiently fertile cell. This mechanic leads to the formation of resource clusters.
*   **Spontaneous Growth:** There is also a small chance for new resources to grow spontaneously in any fertile cell, even if there are no other resources nearby. This allows for the emergence of new resource patches over time.

This system creates a feedback loop: agents are drawn to fertile areas where resources are plentiful. Over-foraging in these areas depletes fertility, forcing the agents to seek out new patches. This dynamic prevents the simulation from becoming static and encourages more complex exploration strategies.

## Agent Reproduction

Agents can reproduce asexually, allowing the population to grow if conditions are favorable. This system is governed by the `mitosis` object in `config.js`.

### Mitosis

Mitosis is the standard form of reproduction. It occurs when an agent meets the following criteria:

*   **Energy Threshold:** The agent's Chi must be above the `mitosis.threshold`.
*   **Cooldown:** A sufficient amount of time must have passed since the agent's last reproduction.
*   **Population Limits:** The total number of agents must be below the configured `maxAgents` and `maxAliveAgents`.
*   **Carrying Capacity:** The population must be within the limits determined by the resource ecology (if `respectCarryingCapacity` is enabled).

When an agent undergoes mitosis, it pays a Chi cost (`mitosis.cost`), and a new child agent is created nearby. The child starts with a fixed amount of Chi (`mitosis.childStartChi`).

### Budding

Budding is a special form of reproduction that occurs when an agent accumulates a very high amount of Chi (above `mitosis.buddingThreshold`).

Instead of a fixed cost, the parent agent shares a fraction of its Chi with the child (`mitosis.buddingShare`). This allows for more rapid population growth when an agent is particularly successful.

## The Learning System

The simulation includes a machine learning component that allows agents to learn and optimize their foraging strategies. The core of this system is the `CEMLearner` class in `learner.js`.

### Cross-Entropy Method (CEM)

CEM is a type of evolutionary algorithm that is well-suited for this kind of optimization problem. It works as follows:

1.  **Initialization:** The learner starts with a population of "policies" (agent brains) that are randomly generated from a statistical distribution (a Gaussian distribution with a mean `μ` and a standard deviation `σ`). Each policy is essentially a set of weights for a simple neural network.
2.  **Evaluation:** Each policy in the population is evaluated by running a full simulation episode. The "fitness" of a policy is determined by the total reward its agent accumulates during the episode.
3.  **Selection:** The learner selects the top-performing policies from the population (the "elites"). The number of elites is determined by the `eliteCount` parameter in `config.js`.
4.  **Update:** The learner updates its statistical distribution (`μ` and `σ`) based on the weights of the elite policies. In simple terms, the "average" of the best policies becomes the new center of the distribution for the next generation.
5.  **Iteration:** The process repeats from step 2. Over many generations, the population of policies converges towards high-performing solutions.

### Training UI

The Training UI (toggled with the `L` key) provides a convenient way to interact with the CEM learner. You can start and stop the training process, save and load policies, and test the performance of the best policy found so far. This allows you to experiment with different simulation parameters and train specialized agents for those conditions.