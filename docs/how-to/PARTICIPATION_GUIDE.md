# Participation System Guide

## Overview

The Participation system enables **interactive user guidance** of agents through mouse/pointer input. When enabled, you can click and drag on the canvas to create influence fields that attract agents, allowing you to guide their behavior in real-time. This creates a cooperative experience where you can help agents find resources, avoid danger, or explore specific areas.

## What is Participation?

Participation is a force-field system that lets you "participate" in the simulation by creating zones of influence that agents respond to. Think of it as placing invisible beacons that agents are drawn toward, with the strength of attraction falling off with distance and fading over time.

The system supports three distinct modes, each representing a different type of guidance:

- **Resource Mode** - Guide agents toward food/resources
- **Distress Mode** - Alert agents to danger or redirect them urgently  
- **Bond Mode** - Create gentle cooperative guidance for exploration

## Getting Started

### Enabling Participation

1. **Via Configuration Panel**: Press `O` to open the config panel, then click the "Enable" button in the Participation status section at the top
2. **Via config.js**: Set `participation.enabled` to `true`

```javascript
participation: {
  enabled: true,
  // ... other settings
}
```

### Basic Usage

Once enabled, interact with the canvas using your mouse:

| Input | Mode | Effect |
|-------|------|--------|
| **Left Click + Drag** | Resource | Attracts agents as if there's food nearby |
| **Shift + Click** or **Middle Click** | Distress | Creates urgent steering with higher strength |
| **Alt + Click** or **Right Click** | Bond | Gentle cooperative guidance |

As you click and drag, you'll see:
- Visual ripples emanating from your cursor
- Agents gradually steering toward your pointer location
- The influence fading over time after you release

## How It Works

### Force Field Mechanics

When you click, the system creates an **active field** at that location with:

1. **Radius** - The distance over which the influence extends (default ~220-280px depending on mode)
2. **Strength** - The maximum force applied to agents (scaled 0-1.35 depending on mode)
3. **Decay** - How quickly the influence fades over time (exponential decay)

Agents within the radius experience a force pulling them toward the field center. The force magnitude is calculated as:

```
force = strength × falloff × fade
```

Where:
- **falloff** = `1 - (distance / radius)` - Linear decrease with distance
- **fade** = `exp(-decay × age)` - Exponential time decay

### Signal Waves

In addition to direct forces, clicking spawns **signal waves** that propagate outward:
- Waves grow at ~320 px/second
- Create visual ripples showing the participation area
- Can be sensed by agents through the signal field system
- Multiple waves spawn as you drag (every 36px or 0.28s)

### Multi-Touch Support

The system supports multiple simultaneous pointers (for touch devices):
- Each pointer creates an independent field
- Fields combine additively
- Each pointer can be in a different mode

## Configuration

### Mode Settings

Each mode has three key parameters you can tune in `config.js`:

```javascript
participation: {
  enabled: false,
  modes: {
    resource: {
      strength: 1.0,    // Base attraction strength
      decay: 0.12,      // Per-second decay rate
      radius: 220,      // Influence radius in pixels
      signalChannel: 0  // Signal field channel (optional)
    },
    distress: {
      strength: 1.35,   // Stronger pull for urgent situations
      decay: 0.18,      // Faster decay - urgent but brief
      radius: 280       // Wider influence area
    },
    bond: {
      strength: 0.85,   // Gentler guidance
      decay: 0.1,       // Slower decay - persistent influence
      radius: 200       // Moderate radius
    }
  }
}
```

### Tuning Guidelines

**Increasing Strength:**
- Agents respond more quickly and directly
- Risk of overpowering agents' autonomous behavior
- Recommended range: 0.5 - 2.0

**Adjusting Decay:**
- Lower values = longer-lasting influence
- Higher values = more responsive to new clicks
- Recommended range: 0.05 - 0.3

**Modifying Radius:**
- Larger radius = broader area of effect
- Smaller radius = more precise targeting
- Must balance with agent sensing range
- Recommended range: 100 - 500px

### Advanced Configuration

```javascript
participation: {
  enabled: true,
  debugLog: false,           // Enable console logging for debugging
  maxForceFraction: 0.35,    // Max participation force as fraction of agent speed
                             // Default 0.35 = gentle nudge
                             // Set to 2.0-3.0 for strong override in debug mode
  visualRadiusScale: 1.0,    // Scale factor for visual circles (0.2 = 20% size)
                             // Affects visuals only, not actual influence area
  waveInterval: 0.28,        // Seconds between wave spawns when dragging
  waveDistance: 36,          // Pixels moved before spawning next wave
  waveGrowthRate: 320        // Pixels per second wave expansion
}
```

**Key Parameter: `maxForceFraction`**

This is the most important tuning parameter:
- **0.35 (default)** - Participation is a gentle nudge, agents still prioritize their own goals
- **1.0** - Participation force equals agent's normal movement force
- **2.0-3.0** - Participation strongly overrides autonomous behavior (good for debug/demonstration)
- **Higher** - Near-total control, agents ignore resources and follow cursor precisely

For testing/debugging, set this high (2.0+) along with high strength values.

## Integration with Other Systems

### Agent Steering

Participation forces integrate into the agent steering system through the `applyForce()` method. The force is:
- Combined with autonomous navigation
- Capped at `maxForceFraction` of agent base speed
- Applied additively to other steering forces

### Signal Fields

Participation can write to the signal field system, allowing agents to:
- Sense participation waves through their signal receptors
- Learn associations between signal patterns and rewards
- Develop strategies that anticipate user guidance

Configure signal channels per mode:

```javascript
modes: {
  resource: {
    signalChannel: 0,  // Uses channel 0 for resource signals
    // ...
  }
}
```

### Training Integration

During training episodes:
- Participation can be used to provide demonstration trajectories
- Agents may learn to expect or rely on user guidance
- Consider disabling during autonomous evaluation

## Visual Feedback

When participation is active, you'll see:

1. **Mode Indicator** - In the config panel, shows current mode and state
2. **Cursor Trails** - Visual feedback following your pointer
3. **Signal Waves** - Expanding circles showing influence propagation
4. **Force Vectors** (if enabled) - Arrows showing applied forces

## Use Cases

### Teaching Agents

Use participation to "show" agents productive behaviors:
- Guide them to resources during early training
- Demonstrate efficient paths between resource patches
- Help them escape local minima or dead ends

### Experimental Control

Create controlled scenarios:
- Test agent responsiveness to external signals
- Measure learning rates with and without guidance
- Study emergent cooperation between user and AI

### Interactive Demonstrations

Make the simulation more engaging:
- Show visitors how agents respond to input
- Demonstrate swarm coordination
- Create emergent patterns through guided steering

### Debugging Agents

Use participation to:
- Force agents into specific situations
- Test edge cases (e.g., wall avoidance with external force)
- Verify sensing and response systems

## Performance Considerations

The participation system is optimized for real-time interaction:
- Fields are pruned when faded below threshold (< 0.001)
- Force calculations only run for active pointers
- Signal waves are culled when intensity drops
- Debug telemetry is optional

For best performance:
- Limit simultaneous active fields
- Use appropriate decay rates to auto-cleanup
- Disable debug logging in production

## Troubleshooting

**Agents don't respond to clicks:**
- Verify `participation.enabled` is `true`
- Check that strength > 0 for the active mode
- Ensure agents are within the influence radius
- Confirm no other systems are overriding steering

**Influence too strong/weak:**
- Adjust the `strength` parameter for the mode
- Modify `maxForceFraction` to cap total influence
- Consider agent base speed - slower agents need less force

**Effects linger too long:**
- Increase `decay` rate for faster fade-out
- Reduce `radius` for more localized effects
- Clear fields manually by toggling participation off/on

**Visual feedback missing:**
- Check that canvas drawing is enabled
- Verify signal field rendering is active
- Enable debug mode for diagnostic overlays

## Advanced: Custom Pointer Handlers

You can override the default pointer behavior by registering custom handlers:

```javascript
import participation from './src/systems/participation.js';

participation.setPointerHandlers({
  onPointerDown(state, config, payload) {
    // Custom click handling
    console.log('Custom pointer down at', payload.x, payload.y);
  },
  onPointerMove(state, config, payload) {
    // Custom drag handling
  },
  onPointerUp(state, config, payload) {
    // Custom release handling
  }
});
```

## API Reference

### Key Methods

**`participation.setActive(isActive)`**
- Enable/disable participation system runtime

**`participation.setMode(mode)`**
- Set current mode: 'resource', 'distress', 'bond', or 'idle'

**`participation.applyForce(context)`**
- Calculate participation force for an agent
- Context: `{ bundle, baseSpeed, maxFraction }`

**`participation.update(dt)`**
- Update signal waves and decay fields
- Call once per frame with delta time

**`participation.resetState(options)`**
- Clear all active fields and reset state
- Options: `{ clearEvents, clearSummary, resetMode, resetCursor }`

## Schema

The participation configuration is validated against `schemas/participation.schema.json`, which defines the full structure and constraints for all settings.

## Examples

### Minimal Setup

```javascript
// In config.js
participation: {
  enabled: true,
  modes: {
    resource: { strength: 1.0, decay: 0.12, radius: 220 }
  }
}
```

### Training Assistant

```javascript
// Help agents during early training generations
participation: {
  enabled: true,
  modes: {
    resource: {
      strength: 0.6,    // Gentle guidance
      decay: 0.15,      // Moderate persistence
      radius: 300       // Wide helper area
    }
  },
  maxForceFraction: 0.25  // Don't overpower learning
}
```

### Interactive Demo Mode

```javascript
// Responsive, visually engaging settings
participation: {
  enabled: true,
  modes: {
    resource: { strength: 1.2, decay: 0.2, radius: 250 },
    distress: { strength: 1.5, decay: 0.25, radius: 300 },
    bond: { strength: 0.9, decay: 0.08, radius: 200 }
  },
  debugLog: false
}
```

## Related Documentation

- **Signal Fields** - See `SIGNAL_FIELD_GUIDE.md` for signal integration
- **Steering** - See architecture docs for how forces combine
- **Training** - See `TRAINING_GUIDE.md` for using participation in learning

## Future Enhancements

Potential extensions to the participation system:

- Agent-initiated participation (agents "ask" for help)
- Recorded participation patterns for replay
- Machine learning from user demonstrations
- Multi-agent coordination through shared fields
- Repulsion modes (push agents away)
- Path drawing for waypoint following

