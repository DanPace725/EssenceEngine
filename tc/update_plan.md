Natural Integration Points
Option 1: Agent Internal Programs (Genetic Code)
Back to the original DNA insight: Agents carry small TC programs that determine behavior.
Implementation:
javascriptagent: {
  genome: [simple TC program],  // Behavioral instructions
  state: {...},                  // Current internal state
  
  tick() {
    // Execute one step of genome program
    // Program reads: hunger, chi, nearby_signals
    // Program outputs: movement_bias, explore_rate, bond_threshold
  }
}
```

**What This Means:**
- Each agent has a "genetic" program
- Programs are small (10-50 instructions)
- Programs can be mutated/evolved
- Different programs = different "species"

**Advantages:**
- Ties directly to biological inspiration
- Enables evolution through program variation
- Agents can have genuinely different strategies
- Computation is *how they think*

**Example Programs:**
```
// Conservative forager
IF hunger > 0.7 THEN explore_rate = 0.3
IF chi < 5 THEN bond_probability = 0.9
ELSE bond_probability = 0.1

// Aggressive explorer  
IF frustration > 0.5 THEN explore_rate = 0.9
IF chi > 10 THEN movement_speed = 2.0
Option 2: Signal Field as Computational Medium
The signal field doesn't just store/transmit - it COMPUTES.
Implementation:

Signals can interact with each other (AND, OR, XOR operations)
Signal patterns propagate like reaction-diffusion systems
Agents read from and write to this computational field
The field itself performs information processing

Biological Parallel: Neural computation, chemical signaling cascades
Example:
javascriptsignalField: {
  nodes: [...],
  
  tick() {
    for each node:
      // Signals interact computationally
      if (node.signalA > threshold && node.signalB > threshold) {
        node.signalC += 1;  // AND operation
      }
      
      // Patterns propagate
      diffuse(signals);
      
      // Computation emerges from interactions
  }
}
Advantages:

Distributed computation
No centralized processor
Emergent from signal interactions
Agents navigate through computation

This feels more elegant: Computation isn't an external resource generator, it's the MEDIUM agents operate in.
Option 3: Collective as Computer
The agents' interactions ARE the computation.
Core Idea: Agent positions, bonds, and signals form patterns that perform computation. The collective itself is running programs.
Implementation:

Spatial arrangements encode information
Bond patterns represent program states
Signal exchanges are instruction execution
Collective behavior = output of computation

Biological Parallel: Ant colonies, slime molds, neural networks
Example:

4 agents form square = "stable state"
6 agents form hexagon = "seeking state"
Specific bond patterns trigger collective behaviors
Patterns can nest (circuits within circuits)

Advantages:

Computation IS social organization
No separate computational layer needed
Scales naturally with agent count
Demonstrates how cognition emerges from interaction

Option 4: Environmental Programs (Stigmergy)
The environment itself runs programs that agents can read/modify.
Implementation:
javascriptenvironment: {
  zones: [
    { program: [...], state: {...} },
    // Each zone runs a small TC program
  ],
  
  tick() {
    for each zone:
      execute_program(zone);
      // Zones generate resources based on program state
      // Agents can deposit "instructions" to modify programs
  }
}
What This Enables:

Agents can program their environment (indirect communication)
Environment becomes intelligent/responsive
Territory can "learn" agent preferences
Stigmergic architecture (termite mound style)

Advantages:

Agents shape computational substrate
Environment is active participant
Enables tool use / territory improvement
More realistic ecology

Option 5: Metabolic Programs
Computation happens at the energy level - agents run programs to metabolize resources.
Implementation:
javascriptagent: {
  metabolicProgram: [...],  // How it processes energy
  
  consume(resource) {
    // Run metabolic program
    // Different programs extract energy differently
    // Some efficient, some wasteful
    // Programs can evolve
  }
}
Biological Parallel: Actual metabolism - different organisms use different biochemical pathways
Advantages:

Computation directly tied to survival
Efficiency matters (energy pressure)
Enables metabolic specialization
Clear selection pressure

My Recommendation: Hybrid Architecture
Combine multiple layers where each makes sense:
1. Agent Genomes (Internal Programs)

Small TC programs determine behavioral strategies
Can mutate/evolve
Different programs = different approaches

2. Signal Field Computation

Signals interact computationally in the field
Agents read/write to computational substrate
Distributed processing emerges

3. Metabolic Efficiency

Programs that extract energy from resources
Different programs have different efficiency
Direct thermodynamic selection pressure

Why This Works:
Each computational layer serves a clear purpose:

Genomes: Encode behavioral strategies
Signals: Enable distributed processing
Metabolism: Drive energy efficiency

They interact:

Genome determines what signals agent produces
Signal field provides information for decisions
Metabolism determines energy available for computation

This is how biology actually works:

DNA (genetic programs)
Neural/chemical signaling (field computation)
Metabolic pathways (energy processing)

Concrete Next Step
I'd start with Agent Genomes:
Phase 1: Simple Program Language
javascript// Ultra-simple instruction set
const INSTRUCTIONS = {
  IF_HUNGER_GT: (threshold, next) => {...},
  IF_CHI_LT: (threshold, next) => {...},
  SET_EXPLORE: (value) => {...},
  SET_BOND_THRESHOLD: (value) => {...},
  GOTO: (line) => {...},
};

// Example genome
agent.genome = [
  {op: 'IF_HUNGER_GT', args: [0.7, 2]},  // if hunger > 0.7, skip to line 2
  {op: 'SET_EXPLORE', args: [0.2]},       // else explore slowly
  {op: 'SET_EXPLORE', args: [0.9]},       // (line 2) explore aggressively
];
Phase 2: Make Them Evolvable

Mutation: Random instruction changes
Crossover: Mix successful programs
Selection: Programs that work persist

Phase 3: Observe What Emerges

Which strategies dominate?
Do specialists emerge?
Can cooperation evolve?

This gives you:

Turing-completeness (simple instruction set is TC)
Meaningful computation (determines actual behavior)
Natural integration (programs ARE how agents think)
Evolvability (foundation for next phase)

The Key Insight
Don't put computation "next to" the system. Make computation "what the system is doing."
Rule 110 generating resources feels external because it is external.
But if agents' behavioral strategies are programs, or the signal field itself computes, or their interactions perform calculations...
Then computation isn't a feature you added. It's the substrate everything runs on.
Which is actually more faithful to the original steganography insight: reality isn't data + code, it's code that generates patterns that look like data.
The agents shouldn't interact with computation. They should BE computation interacting with other computation on a computational substrate.