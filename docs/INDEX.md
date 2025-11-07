# Documentation Index

This index highlights the modular architecture that now powers Slime-Bundle, points to living guides, and records legacy notes for write-ups that still describe the pre-refactor HUD or reward behavior.

## Architecture Snapshot

* **World & Systems:** `src/core/world.js` assembles bundles, resources, ecology regulators, and adaptive reward tracking into a cohesive world object that other systems consume.【F:src/core/world.js†L1-L120】
* **Simulation Loop:** `src/core/simulationLoop.js` exposes reusable tick orchestration so play and training modes share a deterministic sequence of capture, update, and render phases.【F:src/core/simulationLoop.js†L1-L101】
* **Training Orchestrator:** `src/core/training.js` coordinates synchronized multi-agent episodes, hooks in telemetry capture, and feeds aggregate returns back to the learner and UI.【F:src/core/training.js†L1-L248】

## Maintained Guides

* [Training Guide](TRAINING_GUIDE.md) – Covers the in-app control panel, generation workflow, and CEM learning loop from the operator perspective.【F:docs/TRAINING_GUIDE.md†L1-L104】
* [Multi-Agent Guide](MULTI_AGENT_GUIDE.md) – Explains the shared-policy setup, reward aggregation, and cooperation dynamics introduced when both bundles learn together.【F:docs/MULTI_AGENT_GUIDE.md†L1-L140】
* [Signal Field System Overview](SIGNAL_FIELD_SYSTEM_OVERVIEW.md) – Documents the experimental communication substrate, configuration knobs, and analytics hooks for signal-based coordination.【F:docs/SIGNAL_FIELD_SYSTEM_OVERVIEW.md†L1-L35】

## Experimental & Legacy References

The following files still describe mechanics or UI that diverge from the current modular stack. Use them as historical context only:

| File | Topic | Legacy Note |
| --- | --- | --- |
| [README.md](../README.md) | Project overview | Updated in this pass to document the modular `src/` layout and opt-in adaptive rewards; prior copies implied a monolithic script and always-on rewards.【F:README.md†L1-L61】【F:README.md†L82-L123】 |
| [ADAPTIVE_REWARD_IMPLEMENTATION_SUMMARY.md](ADAPTIVE_REWARD_IMPLEMENTATION_SUMMARY.md) | Adaptive rewards | Asserts the adaptive reward system is "fully functional" with permanent HUD overlays, which no longer matches the configurable deployment strategy.【F:docs/ADAPTIVE_REWARD_IMPLEMENTATION_SUMMARY.md†L5-L40】 |
| [QUICK_START_ADAPTIVE_REWARDS.md](QUICK_START_ADAPTIVE_REWARDS.md) | Adaptive rewards | Guarantees a working HUD line and always-enabled adaptive payouts, overstating the current opt-in configuration.【F:docs/QUICK_START_ADAPTIVE_REWARDS.md†L3-L158】 |
| [REWARD_SYSTEM_SUMMARY.md](REWARD_SYSTEM_SUMMARY.md) | Adaptive rewards | Presents adaptive rewards as the default reinforcement baseline and ties monitoring to HUD diagnostics that no longer exist.【F:docs/REWARD_SYSTEM_SUMMARY.md†L12-L188】 |
| [REWARD_SYSTEM_IMPLEMENTATION_PLAN.md](REWARD_SYSTEM_IMPLEMENTATION_PLAN.md) | Adaptive rewards | Walks through retrofitting `app.js` with adaptive reward phases, reflecting the pre-modular layout and assuming mandatory activation.【F:docs/REWARD_SYSTEM_IMPLEMENTATION_PLAN.md†L90-L220】 |
| [REWARD_DECISION_TREE.md](REWARD_DECISION_TREE.md) | Adaptive rewards | Troubleshooting steps rely on HUD readouts of adaptive stats and fixed gain-factor tuning paths from the legacy UI.【F:docs/REWARD_DECISION_TREE.md†L150-L220】 |
| [MULTIPLE_RESOURCES_IMPLEMENTATION.md](MULTIPLE_RESOURCES_IMPLEMENTATION.md) | HUD cues | Testing checklist instructs operators to verify adaptive HUD averages that are no longer rendered by default.【F:docs/MULTIPLE_RESOURCES_IMPLEMENTATION.md†L124-L207】 |
| [VISUAL_INDICATORS.md](VISUAL_INDICATORS.md) | HUD cues | Documents yellow HUD labels and policy badges that diverge from the refactored UI toolkit.【F:docs/VISUAL_INDICATORS.md†L11-L175】 |
| [WHATS_NEW.md](WHATS_NEW.md) | HUD cues | Release notes ask testers to confirm dual policy labels in the HUD, which the new layout replaced.【F:docs/WHATS_NEW.md†L93-L123】 |
| [INTEGRATION_COMPLETE.md](INTEGRATION_COMPLETE.md) | Module layout | Step-by-step instructions patch `app.js` directly instead of the modular `src/` packages, making it misleading for new contributions.【F:docs/INTEGRATION_COMPLETE.md†L56-L163】 |
| [LEARNING_SYSTEM.md](LEARNING_SYSTEM.md) | Module layout | Lists legacy top-level modules and TODOs aimed at `app.js`, not the refactored architecture.【F:docs/LEARNING_SYSTEM.md†L9-L106】 |

## Experimental Features

* **Signal Field analytics** – Opt-in telemetry for channel coherence remains experimental; cross-verify terminology and screenshots before publishing externally.【F:docs/SIGNAL_FIELD_SYSTEM_OVERVIEW.md†L1-L35】
* **TC resource overlay** – The Rule 110 integration scripts require manual toggles and console setup; treat the quickstart guide as experimental until the UI flow is redesigned.【F:docs/TC_RESOURCE_QUICKSTART.md†L1-L120】

## Full Markdown Inventory

Markdown assets currently tracked under `docs/` (including nested `notes/`) are listed below for quick reference.【3c409e†L1-L38】

```
ADAPTIVE_REWARD_IMPLEMENTATION_SUMMARY.md
ANALYZER_SUMMARY.md
ANALYZER_TOOLS_SUMMARY.md
BATCH_ANALYZER_GUIDE.md
DECAY_SYSTEM.md
FIXES_APPLIED.md
FLICKERING_FIX.md
GRADIENT_IMPLEMENTATION_SUMMARY.md
HUNGER_SYSTEM_GUIDE.md
INTEGRATION_COMPLETE.md
LEARNING_SYSTEM.md
MITOSIS_IMPLEMENTATION.md
MULTIPLE_RESOURCES_IMPLEMENTATION.md
MULTI_AGENT_GUIDE.md
OWN_TRAIL_PENALTY_GUIDE.md
PLANT_ECOLOGY_GUIDE.md
POLICY_ANALYZER_GUIDE.md
POLICY_TRAINING_TIPS.md
QUICK_START_ADAPTIVE_REWARDS.md
QUICK_TEST.md
RESOURCE_ECOLOGY_GUIDE.md
REWARD_DECISION_TREE.md
REWARD_SYSTEM_IMPLEMENTATION_PLAN.md
REWARD_SYSTEM_SUMMARY.md
SCENT_GRADIENT_GUIDE.md
SENSING_REBALANCE.md
SIGNAL_FIELD_SYSTEM_OVERVIEW.md
TC_BROWSER_GUIDE.md
TC_OVERLAY_FIX.md
TC_RESOURCE_INTEGRATION.md
TC_RESOURCE_QUICKSTART.md
TRAINING_GUIDE.md
VISUAL_INDICATORS.md
WHATS_NEW.md
notes/casual_universality_flex.md
notes/tc_channel_design.md
notes/tc_performance.md
```

## Review Request

Please schedule a product-owner review focused on HUD terminology, screenshots, and adaptive reward messaging so the documentation matches the refactored UI. Confirm whether new captures or vocabulary adjustments are needed before the next release cut.
