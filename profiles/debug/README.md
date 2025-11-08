# Debug Profiles

This directory contains pre-configured test profiles for isolated feature testing.

## Purpose

Debug profiles help you test individual features by:
- **Disabling interfering systems** that could mask the feature's behavior
- **Setting predictable parameters** for reproducible tests
- **Enabling debug logging** for detailed diagnostics
- **Providing clear baselines** to compare against

## Quick Start

1. Open Essence Engine in your browser
2. Press `O` to open the config panel
3. Click the profile dropdown
4. Look for profiles starting with "Debug:"
5. Load one and observe the isolated feature

## Available Profiles

### `minimal-baseline.json`
**Purpose:** Clean slate with nearly everything disabled  
**Use for:** Verifying core systems work, starting point for custom tests

### `test-participation.json`
**Purpose:** Test mouse/pointer guidance of agents  
**How to test:** Click and drag, watch agents follow cursor  
**Key setting:** `participation.enabled: true`

### `test-scent-gradient.json`
**Purpose:** Test gradient-based navigation  
**How to test:** Press `G` to see gradients, watch navigation  
**Key setting:** `scentGradient.enabled: true`

### `test-trail-following.json`
**Purpose:** Test pheromone trail mechanics  
**How to test:** Press `T`, watch trail formation and following  
**Key settings:** `aiTrailFollowing*`, `diffusePerSec`

### `test-signal-fields.json`
**Purpose:** Test multi-channel signal system  
**How to test:** Watch for colored signal overlays  
**Key setting:** `signal.enabled: true`

### `test-mitosis.json`
**Purpose:** Test agent reproduction  
**How to test:** Wait for agents to reach 80 chi, watch splits  
**Key setting:** `mitosis.enabled: true`

### `test-plant-ecology.json`
**Purpose:** Test fertility and resource dynamics  
**How to test:** Press `P` to see fertility map  
**Key setting:** `plantEcology.enabled: true`

## Loading Profiles

### First Time Setup

The debug profiles are **files** in `profiles/debug/`, not automatically in the dropdown. To use them:

1. Press `O` to open Config Panel
2. Click "Import" button
3. Navigate to `profiles/debug/` folder
4. Select a profile (e.g., `test-participation.json`)
5. Click Open
6. You'll see "✓ Imported!" feedback
7. A dialog will ask if you want to save it to your profiles list
8. Click "OK" to save it for quick access later

### After Saving Once

Once you've imported and saved a profile:
1. Press `O` → Config Panel
2. Select it from the dropdown (e.g., "Debug: Participation Only")
3. Click "Load"
4. Button shows "✓ Loaded!" to confirm

### Programmatically
```javascript
// In browser console
const response = await fetch('profiles/debug/test-participation.json');
const profile = await response.json();
ConfigIO.apply(profile.snapshot);
```

### From localStorage
If you've saved profiles in the config panel, they're in localStorage:
```javascript
const profiles = JSON.parse(localStorage.getItem('slime.presets.v1') || '[]');
```

## Creating Custom Debug Profiles

1. Start with `minimal-baseline.json`
2. Enable the feature(s) you want to test
3. Set reasonable parameters
4. Test thoroughly
5. Save with descriptive name
6. Optional: Export and save as `.json` file

## Profile Structure

```json
{
  "name": "Debug: Feature Name",
  "description": "What this tests and how",
  "snapshot": {
    "version": 1,
    "ts": 1699564800000,
    "params": {
      "debug": true,
      "yourFeature.enabled": true,
      "interfering.feature": false,
      "_comment": "Comments start with _"
    }
  }
}
```

## Best Practices

### ✅ Do
- Test ONE feature at a time
- Watch for at least 30-60 seconds
- Use visualization toggles (G, P, T, S)
- Check console with debug enabled
- Compare against minimal baseline
- Save good configurations

### ❌ Don't
- Enable too many features at once
- Judge behavior after 5 seconds
- Ignore console warnings/errors
- Skip baseline comparisons
- Forget to reset (R) between tests

## Common Test Patterns

### Pattern 1: Feature Works Yes/No
```
1. Load test profile
2. Observe for 1 minute
3. Does it work as described? Yes/No
4. Check console for errors
```

### Pattern 2: Compare With/Without
```
1. Load test profile (feature ON)
2. Observe and note behavior
3. Toggle feature OFF in config panel
4. Observe again
5. Compare the difference
```

### Pattern 3: Parameter Tuning
```
1. Load test profile
2. Adjust ONE parameter
3. Observe change
4. Repeat with different values
5. Document optimal settings
```

### Pattern 4: Interference Check
```
1. Load minimal baseline
2. Enable feature A → observe
3. Enable feature B → observe
4. Do they interfere? Enhance each other?
```

## Troubleshooting

**"Can't find debug profiles in dropdown"**
- Profiles are loaded on startup
- Refresh page if you just added a file
- Check that JSON is valid
- Try loading via fetch in console

**"Feature seems broken in test profile"**
- Verify it's actually enabled (`debug: true` helps)
- Check console for errors
- Compare with minimal baseline
- Try toggling the feature off/on

**"Behavior is confusing"**
- Load minimal baseline first
- Add features incrementally
- Use visualization toggles
- Slow down and observe longer

## Related Documentation

See the full [Debug Mode Guide](../../docs/how-to/DEBUG_MODE_GUIDE.md) for:
- Detailed testing workflows
- Expected behaviors for each profile
- Tips for effective testing
- How to create custom profiles
- Troubleshooting guide

## Contributing

To contribute a debug profile:

1. Create it and test thoroughly
2. Use clear, descriptive name
3. Include helpful comments in JSON
4. Document expected behavior
5. Submit PR with profile + description

Good debug profiles make development easier for everyone!

