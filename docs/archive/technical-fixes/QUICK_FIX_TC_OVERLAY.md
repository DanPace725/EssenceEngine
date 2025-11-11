<!-- ormd:0.1 -->
---
title: "TC Overlay - Quick Fix Reference Card"
authors: ["Essence Engine Team"]
dates:
  created: '2025-11-11T05:40:38.726548Z'
links: []
status: "complete"
description: "Essence Engine documentation"
---

# TC Overlay - Quick Fix Reference Card

## ⚡ One-Line Fix (if overlay is enabled but not visible)

```javascript
(async () => { const { CONFIG } = await import('./config.js'); CONFIG.tcResourceIntegration.showOverlay = true; CONFIG.tcResourceIntegration.overlayOpacity = 0.5; console.log('✅ Overlay visibility boosted!'); })();
```

## 🎯 Complete Setup (from scratch)

```javascript
(async () => {
  // 1. Enable TC
  enableTC('rule110');
  
  // 2. Enable overlay with good visibility
  const { CONFIG } = await import('./config.js');
  CONFIG.tcResourceIntegration.showOverlay = true;
  CONFIG.tcResourceIntegration.overlayOpacity = 0.5;
  
  // 3. Reset world FIRST (clears TC storage)
  World.reset();
  
  // 4. Register stepper AFTER reset
  const { registerRule110Stepper } = await import('./tc/tcRule110.js');
  const { stepper } = registerRule110Stepper({ width: 128, initializer: 'ether' });
  window.rule110Stepper = stepper;
  
  console.log('✅ TC overlay ready!');
  console.log('🟩 Green bars = Rule 110 computing in real-time');
})();
```

## 🔍 Diagnose Issues

```javascript
// Check what's wrong
const { CONFIG } = await import('./config.js');
console.log('Overlay enabled:', CONFIG.tcResourceIntegration?.showOverlay);
console.log('Opacity:', CONFIG.tcResourceIntegration?.overlayOpacity);
console.log('Stepper exists:', !!window.rule110Stepper);
```

## 🎨 Opacity Presets

| Use Case | Opacity | Command |
|----------|---------|---------|
| **Subtle** | 0.2 | `CONFIG.tcResourceIntegration.overlayOpacity = 0.2` |
| **Default** | 0.3 | `CONFIG.tcResourceIntegration.overlayOpacity = 0.3` |
| **Visible** | 0.5 | `CONFIG.tcResourceIntegration.overlayOpacity = 0.5` |
| **Bold** | 0.7 | `CONFIG.tcResourceIntegration.overlayOpacity = 0.7` |

## 🛠️ Toggle Overlay On/Off

```javascript
// Toggle (convenience function)
toggleTcOverlay();  // Flips on/off

// Or manually
const { CONFIG } = await import('./config.js');
CONFIG.tcResourceIntegration.showOverlay = true;   // Show
CONFIG.tcResourceIntegration.showOverlay = false;  // Hide
```

## ✅ What Fixed

1. **Simplified condition** - No longer requires `tcResourceIntegration.enabled`
2. **Better opacity** - Increased from 0.15 to 0.3 (much more visible)
3. **Clear defaults** - `showOverlay: false` by default (enable explicitly)
4. **Label positioning** - Moved percentage below bars (not off-screen)
5. **Setup order** - Register stepper AFTER World.reset() to prevent clearing

## 🟩 What Are The "Flying Bars"?

The green bars moving across the screen are **Rule 110 computing in real-time**! This is:
- ✅ **Expected behavior** - the cellular automaton evolving
- 🧮 **Turing-complete computation** - you're watching universal computation
- 🌊 **Patterns emerging** - gliders, blocks, and chaos forming
- 📊 **Activity changes** - reflected in the activity bar percentage

This is NOT a bug - it's the computational substrate driving your environment!

## 📚 Full Docs

- Detailed guide: `../how-to/TC_RESOURCE_QUICKSTART.md`
- Fix analysis: `TC_OVERLAY_FIX.md`
- Debug tool: `test-tc-overlay-debug.js`

