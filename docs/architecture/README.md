<!-- ormd:0.1 -->
---
title: "Architecture Documentation"
authors: ["Essence Engine Team"]
dates:
  created: '2025-11-11T00:00:00Z'
links:
  - id: technical-doc
    rel: references
    to: "TECHNICAL_DOC.md"
  - id: learning-system
    rel: references
    to: "LEARNING_SYSTEM.md"
  - id: signal-field
    rel: references
    to: "SIGNAL_FIELD_SYSTEM_OVERVIEW.md"
  - id: how-to-docs
    rel: references
    to: "../how-to/README.md"
status: "complete"
description: "Technical documentation explaining system architecture, design decisions, implementation details, and developer troubleshooting guides"
---

# Architecture Documentation

This directory contains technical documentation that explains **how things work under the hood** in Essence Engine.

These documents focus on:
- System architecture and design decisions
- Implementation details and code structure
- Technical summaries and integration notes
- Troubleshooting guides for developers

## Core Architecture

- [Technical Documentation](TECHNICAL_DOC.md) - Core mechanics breakdown
- [Learning System](LEARNING_SYSTEM.md) - Learning system architecture (`src/core/training.js`, `learner.js`)
- [Signal Field System Overview](SIGNAL_FIELD_SYSTEM_OVERVIEW.md) - Signal-based coordination (`signalField.js`)

## Implementation Summaries

- [Gradient Implementation Summary](GRADIENT_IMPLEMENTATION_SUMMARY.md) - Scent gradient system (`scentGradient.js`)
- [Adaptive Reward Implementation Summary](ADAPTIVE_REWARD_IMPLEMENTATION_SUMMARY.md) - Adaptive reward system (`rewards.js`, `src/core/training.js`)
- [Mitosis Implementation](MITOSIS_IMPLEMENTATION.md) - Reproduction system
- [Multiple Resources Implementation](MULTIPLE_RESOURCES_IMPLEMENTATION.md) - Multi-resource system

## System Details

- [Decay System](DECAY_SYSTEM.md) - Decay mechanics
- [Sensing Rebalance](SENSING_REBALANCE.md) - Sensing system details (`src/core/sensing.js`)
- [Reward System Summary](REWARD_SYSTEM_SUMMARY.md) - Reward system overview (`rewards.js`)
- [Reward Decision Tree](REWARD_DECISION_TREE.md) - Technical troubleshooting
- [State Export/Import System](STATE_EXPORT_IMPORT.md) - State snapshot system (`src/core/stateIO.js`)

## Analysis Tools

- [Analyzer Summary](ANALYZER_SUMMARY.md) - Policy analyzer technical details (`policyAnalyzer.js`, `policyBatchAnalyzer.js`)
- [Analyzer Tools Summary](ANALYZER_TOOLS_SUMMARY.md) - Analysis tools overview

## TC Integration

- [TC Resource Integration](TC_RESOURCE_INTEGRATION.md) - TC integration details (`tcResourceBridge.js`)

---

## 📁 Historical Documentation

Archived technical fixes, historical implementation notes, and integration logs are available under [`archive/`](../archive/). These include:
- Specific bug fixes and their resolutions
- Historical integration notes
- Implementation plans and retrospectives

See [`archive/README.md`](../archive/README.md) for the full index of archived documents.

