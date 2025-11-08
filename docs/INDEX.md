# Documentation Index

This index provides an overview of the Essence Engine documentation structure. Documentation is organized into two main categories:

- **[How-To Guides](how-to/README.md)** - User-facing guides ("How do I use this?")
- **[Architecture Documentation](architecture/README.md)** - Technical/implementation docs ("How does this work under the hood?")

## Quick Navigation

### User Guides (How-To)
- [Training Guide](how-to/TRAINING_GUIDE.md) – Covers the in-app control panel, generation workflow, and CEM learning loop from the operator perspective
- [Multi-Agent Guide](how-to/MULTI_AGENT_GUIDE.md) – Explains the shared-policy setup, reward aggregation, and cooperation dynamics
- [Policy Analyzer Guide](how-to/POLICY_ANALYZER_GUIDE.md) – How to analyze and compare trained policies
- [Participation Guide](how-to/PARTICIPATION_GUIDE.md) – Interactive agent guidance with mouse/pointer input
- [Scent Gradient Guide](how-to/SCENT_GRADIENT_GUIDE.md) – Using scent gradients for navigation
- [Plant Ecology Guide](how-to/PLANT_ECOLOGY_GUIDE.md) – Understanding the plant ecology system
- [TC Browser Guide](how-to/TC_BROWSER_GUIDE.md) – Using Turing Complete features in the browser

See the [how-to directory](how-to/README.md) for a complete list of user guides.

### Technical Documentation (Architecture)
- [Technical Documentation](architecture/TECHNICAL_DOC.md) – Core mechanics breakdown
- [Learning System](architecture/LEARNING_SYSTEM.md) – Learning system architecture
- [Signal Field System Overview](architecture/SIGNAL_FIELD_SYSTEM_OVERVIEW.md) – Signal-based coordination system
- [Gradient Implementation Summary](architecture/GRADIENT_IMPLEMENTATION_SUMMARY.md) – Scent gradient implementation details
- [Adaptive Reward Implementation Summary](architecture/ADAPTIVE_REWARD_IMPLEMENTATION_SUMMARY.md) – Adaptive reward system details

See the [architecture directory](architecture/README.md) for a complete list of technical documentation.

## Architecture Snapshot

* **World & Systems:** `src/core/world.js` assembles bundles, resources, ecology regulators, and adaptive reward tracking into a cohesive world object that other systems consume.
* **Simulation Loop:** `src/core/simulationLoop.js` exposes reusable tick orchestration so play and training modes share a deterministic sequence of capture, update, and render phases.
* **Training Orchestrator:** `src/core/training.js` coordinates synchronized multi-agent episodes, hooks in telemetry capture, and feeds aggregate returns back to the learner and UI.

## Legacy & Archive

Outdated documentation has been moved to the [archive directory](archive/README.md) for historical reference. These documents may not reflect the current state of Essence Engine.

## TC Documentation

Turing Complete (TC) related documentation and notes are located in [`tc/docs/`](../tc/docs/README.md).

## Experimental Features

* **Signal Field analytics** – Opt-in telemetry for channel coherence remains experimental; cross-verify terminology and screenshots before publishing externally.
* **TC resource overlay** – The Rule 110 integration scripts require manual toggles and console setup; treat the quickstart guide as experimental until the UI flow is redesigned.
