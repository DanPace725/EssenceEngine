# Debug Mode Testing Guide

## Overview

This guide explains how to use **debug profiles** to test individual features in isolation. Debug mode helps you verify that specific systems work correctly without interference from other mechanics.

## Why Use Debug Profiles?

When developing or troubleshooting Essence Engine, you often need to answer questions like:

- "Is participation working? Are agents actually responding to my mouse clicks?"
- "Does scent gradient affect navigation, or is something overriding it?"
- "Are trail-following mechanics functioning correctly?"
- "Is mitosis triggering at the right energy threshold?"

Testing these features in a full simulation with all systems enabled makes it hard to isolate what's working and what's not. Debug profiles solve this by:

1. **Disabling interfering systems** - Turn off mechanics that could mask or override the feature you're testing
2. **Simplifying parameters** - Use straightforward values that make behavior predictable
3. **Enhancing visibility** - Enable debug logging and visual indicators for the target feature
4. **Creating reproducible conditions** - Consistent starting states for reliable testing

## Available Debug Profiles

All debug profiles are located in `profiles/debug/` and can be loaded through the config panel.

### Minimal Baseline
**File:** `minimal-baseline.json`

The foundation profile with nearly everything disabled. Use this as:
- A starting point to manually enable one feature at a time
- A baseline to verify core mechanics work (metabolism, movement, resources)
- A clean slate for experimentation

**What's Active:**
- Basic metabolism (agents need energy)
- Simple static resources (no ecology)
- Manual control (auto-move OFF)
- Minimal sensing and wall avoidance
- Trails visible but not diffusing

**What's Disabled:**
- Plant ecology
- Adaptive rewards
- Trail following
- Scent gradients
- Signal fields
- Participation
- Mitosis
- Frustration mechanics
- Hunger system
- TC features

### Test: Participation Only
**File:** `test-participation.json`

Tests if agents respond to mouse/pointer guidance.

**How to Test:**
1. Load this profile
2. Press `O` to verify participation is enabled (should show "ENABLED" in green)
3. Click and drag on the canvas
4. Agents should steer DIRECTLY toward your cursor, overriding resource seeking
5. Try different modes: Left-click (resource), Shift-click (distress), Alt-click (bond)

**Expected Behavior:**
- Agents within ~400px should turn strongly toward cursor
- **Agents should follow cursor even if there's a resource nearby**
- Visual ripples emanate from click points
- Agents navigate directly toward your pointer
- Debug console shows participation events (debugLog enabled)

**Key Settings:**
- `maxForceFraction: 3.0` - Participation overpowers autonomous behavior
- `strength: 10.0` - Very strong attraction
- `radius: 400px` - Wide influence area
- `decay: 0.05` - Long-lasting influence

**If It's Not Working:**
- Check console for errors and "Applied params" count
- Verify `participation.enabled` is true in config panel
- Ensure `maxForceFraction` is high (2.0+)
- Try clicking directly on top of an agent
- Increase `participation.modes.resource.strength` even higher (15-20)

### Test: Scent Gradient Only
**File:** `test-scent-gradient.json`

Tests gradient-based navigation to resources.

**How to Test:**
1. Load this profile
2. Press `G` to verify gradient visualization is visible
3. Watch agents navigate toward resources
4. They should follow gradient lines even when resource isn't directly visible

**Expected Behavior:**
- Colored gradient lines emanate from resources
- Agents steer along gradient flow
- Navigation improves compared to random exploration
- Agents find resources more efficiently

**If It's Not Working:**
- Toggle gradient visualization with `G`
- Check `scentGradient.strength` value (should be > 0)
- Verify agents can sense beyond immediate visibility
- Compare with minimal baseline to see difference

### Test: Trail Following Only
**File:** `test-trail-following.json`

Tests pheromone trail mechanics and diffusion.

**How to Test:**
1. Load this profile
2. Press `T` to ensure trails are visible
3. Watch as agents deposit trails while moving
4. Observe if agents preferentially follow existing trails
5. Press `F` to toggle diffusion on/off and see the difference

**Expected Behavior:**
- Trails form behind moving agents
- Trails diffuse outward over time (if enabled)
- Agents turn to follow high-trail-density areas
- Trails evaporate slowly
- Own-trail penalty prevents tight circling

**If It's Not Working:**
- Check trail visibility with `T`
- Verify `depositPerSec` > 0
- Ensure `aiTrailFollowingNear` and `aiTrailFollowingFar` are > 0
- Watch for several seconds - trails need time to build up
- Press `X` to clear trails and start fresh

### Test: Signal Fields Only
**File:** `test-signal-fields.json`

Tests multi-channel signal field system.

**How to Test:**
1. Load this profile
2. Verify signal rendering is enabled in config
3. Look for colored overlays on the canvas (multi-channel signals)
4. Watch how agents respond to signal gradients

**Expected Behavior:**
- Multiple color channels visible on canvas
- Signals diffuse from emission sources
- Agents show modified behavior in high-signal areas
- Different channels have different effects (steering vs. exploration)

**If It's Not Working:**
- Check console for signal field initialization
- Verify `signal.enabled` is true
- Adjust `signal.renderAlpha` for visibility
- Ensure agents are in areas with active signals

### Test: Mitosis Only
**File:** `test-mitosis.json`

Tests agent reproduction mechanics.

**How to Test:**
1. Load this profile (starts with 4 agents)
2. Wait for agents to collect resources
3. Watch energy (chi) levels in HUD
4. When agent reaches ~80 chi, it should split
5. Watch population grow

**Expected Behavior:**
- Agents split when reaching threshold energy
- Child agents inherit momentum and heading
- Population grows over time
- Lineage lines connect parent/child
- Population caps at configured maximum
- Agent collision enabled to handle crowding

**If It's Not Working:**
- Check HUD - are agents gaining energy?
- Verify `mitosis.threshold` isn't too high
- Ensure `mitosis.enabled` is true
- Check console for mitosis events
- Verify `rewardChi` is high enough to reach threshold

### Test: Plant Ecology Only
**File:** `test-plant-ecology.json`

Tests fertility-based resource generation and depletion.

**How to Test:**
1. Load this profile
2. Press `P` to toggle fertility visualization
3. Watch colored patches showing fertility levels
4. Observe resources spawning in high-fertility areas
5. Watch fertility deplete near harvested resources
6. See fertility recover over time

**Expected Behavior:**
- Fertility map shows varied terrain (green = fertile, red = depleted)
- Resources cluster in fertile patches
- Harvesting depletes local fertility
- Resources respawn more in high-fertility zones
- Fertility gradually recovers
- Resource count varies dynamically

**If It's Not Working:**
- Toggle fertility view with `P`
- Wait 30+ seconds for ecology to develop
- Check `plantEcology.enabled` is true
- Verify `seedChance` and `growthChance` > 0
- Watch fertility map for changes over time

## General Testing Workflow

### 1. Start with Minimal Baseline
```
1. Load "Debug: Minimal Baseline"
2. Verify basic functionality:
   - Agents exist and are visible
   - Manual control works (WASD/arrows)
   - Resources exist
   - Picking up resource increases energy
   - Movement depletes energy
3. This confirms core systems work
```

### 2. Load Target Feature Profile
```
1. Press O to open config panel
2. Click "Import" button
3. Navigate to profiles/debug/ folder
4. Select the test profile you want (e.g., test-participation.json)
5. Click Open
6. Confirm you want to save it to your list when prompted
7. Now it's in the dropdown for quick access
```

### 3. Observe Behavior
```
1. Watch for 30-60 seconds minimum
2. Use visualization toggles (G, P, T, etc.)
3. Enable debug mode in config panel if needed
4. Check browser console for debug messages
```

### 4. Compare Against Baseline
```
1. Note differences from minimal baseline
2. Verify behavior matches expectations
3. If unclear, toggle the feature off and compare
```

### 5. Modify Parameters
```
1. Open config panel (O)
2. Adjust parameters for the feature under test
3. Save as new profile if you find good settings
4. Document what changed and why
```

## Creating Custom Debug Profiles

You can create your own debug profiles for specific test scenarios:

### Method 1: Modify Existing Profile

1. Load a debug profile (e.g., "Debug: Participation Only")
2. Press `O` to open config panel
3. Adjust parameters as needed
4. Enter a new name: "Debug: My Custom Test"
5. Click "Save"
6. Your profile is now in the dropdown

### Method 2: Start from Minimal Baseline

1. Load "Debug: Minimal Baseline"
2. Manually enable ONE feature you want to test
3. Set that feature's parameters to reasonable values
4. Test and verify it works
5. Save with descriptive name

### Method 3: Create JSON File

Create a new `.json` file in `profiles/debug/`:

```json
{
  "name": "Debug: Your Feature Name",
  "description": "What this profile tests and expected behavior",
  "snapshot": {
    "version": 1,
    "ts": 1699564800000,
    "params": {
      "debug": true,
      
      "_comment": "Comments (keys starting with _ are ignored)",
      
      "startChi": 50,
      "autoMove": true,
      "yourFeature.enabled": true,
      
      "_comment_disable_others": "Turn off interference",
      "otherFeature.enabled": false
    }
  }
}
```

## Tips for Effective Testing

### Use Debug Mode
Enable `debug: true` in all test profiles to get:
- Console logging of system events
- Additional visualization overlays
- Telemetry data for analysis

### Watch Multiple Cycles
Don't judge after 5 seconds:
- Some features need time to build up (trails, ecology)
- Others have cooldowns or thresholds
- Watch for at least 30-60 seconds

### Isolate One Thing at a Time
- Test ONE feature per session
- If testing combinations, add features incrementally
- Document what you changed

### Use Visualization Toggles
- `G` - Scent gradient
- `P` - Fertility map
- `T` - Trails
- `S` - Extended sensing rings
- `V` - Hide/show all agents
- `1-4` - Toggle individual agents

### Read Console Output
With debug enabled, the console shows:
- Feature initialization
- Events and state changes
- Errors and warnings
- Performance metrics

### Compare Behaviors
1. Run with feature enabled for 1 minute
2. Reset (`R`)
3. Toggle feature off
4. Run again for 1 minute
5. Note the difference

### Document Your Findings
After testing, note:
- What worked as expected
- What didn't work
- What parameters you changed
- Unexpected behaviors
- Ideas for improvement

## Common Issues

### "Can't find debug profiles in dropdown"
- Debug profiles are **files**, not automatically in the dropdown!
- You must **Import** them first:
  1. Click "Import" button in config panel
  2. Navigate to `profiles/debug/` folder
  3. Select the `.json` file
  4. Choose "OK" when asked to save to your list
- After importing once, they'll appear in dropdown for quick access
- Alternative: Load via console (see "Loading Profiles Programmatically" below)

### "Import button shows success but nothing changed"
- Check that you imported the right file
- Enable `debug: true` and check console for confirmation
- Look at the config panel sliders - they should update
- Try toggling a visualization (G, P, T) to see if settings applied
- If profile name appeared in the name field, it loaded successfully

### "Nothing is happening"
- Verify `autoMove` is true for autonomous testing
- Check that agents have enough energy
- Ensure the feature is actually enabled
- Look for console errors

### "Too much happening - can't tell what's what"
- Load a more minimal profile
- Disable visualization overlays you don't need
- Test with fewer agents (manually hide agents 2-4)
- Reduce simulation speed to observe better

### "Feature seems weak/ineffective"
- Increase the feature's strength parameter
- Decrease competing influences
- Check that the feature's inputs are valid (e.g., trails exist for trail-following)

### "Agents behaving erratically"
- Check for conflicting forces
- Verify wall avoidance isn't too strong
- Ensure exploration noise isn't overwhelming
- Look for NaN/Infinity in console

### "Can't reproduce behavior"
- Save your current config as a profile
- Note the seed value if using randomization
- Document the exact steps you took
- Reset between tests for consistency

## UI Feedback

The config panel now provides visual confirmation when you perform actions:

- **Load** - Button shows "✓ Loaded!" in green
- **Save** - Button shows "✓ Saved!" in green
- **Import** - Button shows "✓ Imported!" in green and updates the profile name field
- **Export** - Button shows "✓ Exported!" in green and uses your profile name as filename
- **Delete** - Asks for confirmation, then shows "✓ Deleted" in red

All feedback messages display for 1.5-2 seconds before returning to normal.

## Loading Profiles Programmatically

For automated testing or scripts:

```javascript
// Load from localStorage
const profiles = JSON.parse(localStorage.getItem('slime.presets.v1') || '[]');

// Find specific profile
const testProfile = profiles.find(p => p.name === 'Debug: Participation Only');

// Apply it
if (testProfile) {
  ConfigIO.apply(testProfile.snapshot);
}
```

## Quick Reference

| Profile | Tests | Key Parameters | Visualization |
|---------|-------|----------------|---------------|
| Minimal Baseline | Core systems | All minimal | Trails only |
| Participation | Mouse guidance | `participation.*` | `O` panel status |
| Scent Gradient | Gradient nav | `scentGradient.*` | Press `G` |
| Trail Following | Pheromone trails | `aiTrailFollowing*`, `depositPerSec` | Press `T` |
| Signal Fields | Multi-channel signals | `signal.*` | Signal overlay |
| Mitosis | Reproduction | `mitosis.*` | Lineage lines |
| Plant Ecology | Resource dynamics | `plantEcology.*` | Press `P` |

## Advanced: Comparative Testing

To test feature interactions:

1. **Baseline Test**
   - Load minimal baseline
   - Measure agent performance (resources collected, distance traveled)
   - Note behavior patterns

2. **Single Feature Test**
   - Load test profile for feature A
   - Measure same metrics
   - Calculate improvement

3. **Combined Features Test**
   - Load profile with features A + B
   - Measure metrics
   - Check if they enhance or interfere with each other

4. **Full Simulation Test**
   - Load default config
   - Measure metrics
   - Compare against isolated tests

## Related Documentation

- [Participation Guide](PARTICIPATION_GUIDE.md) - Detailed participation system docs
- [Scent Gradient Guide](SCENT_GRADIENT_GUIDE.md) - Gradient mechanics
- [Plant Ecology Guide](PLANT_ECOLOGY_GUIDE.md) - Ecology system
- [Resource Ecology Guide](RESOURCE_ECOLOGY_GUIDE.md) - Resource management

## Contributing Debug Profiles

If you create useful debug profiles:

1. Save them in `profiles/debug/`
2. Use clear naming: `test-[feature-name].json`
3. Include good description and comments
4. Document expected behavior
5. Share via pull request

Good debug profiles help everyone test and develop features more effectively!

