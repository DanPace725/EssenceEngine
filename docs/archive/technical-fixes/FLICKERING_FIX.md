<!-- ormd:0.1 -->
---
title: "Resource Flickering Fix"
authors: ["Essence Engine Team"]
dates:
  created: '2025-11-11T05:40:38.724682Z'
links: []
status: "complete"
description: "Essence Engine documentation"
---

# Resource Flickering Fix

## 🐛 The Problem

Resources were appearing and disappearing rapidly, causing visual "flickering" or "popping". 

### Root Causes Identified

**1. Dual System Conflict** 
- **Old System** (`updateEcology()`): Random resource spawning based on carrying capacity
- **New System** (plant ecology): Fertility-based spawning via seed dispersal and growth
- **Conflict**: Plant ecology would add resources → old system would remove them → flicker!

**2. Indiscriminate Removal**
```javascript
while (resources.length > carryingCapacity) {
  resources.pop();  // ❌ Removes newest resources first!
}
```
- Plant ecology spawns new resource
- Old system immediately removes it (it's at end of array)
- Result: resource appears for 1 frame then disappears

**3. Reduced Sensing Range (Partial Fix)**
- Reduced base range: 220px → 160px
- Reduced max range: 560px → 360px
- Helped reduce edge-of-vision popping, but didn't fix the core issue

---

## ✅ The Solution

**Disable old random resource system when plant ecology is enabled.**

### Changes Made

**1. `updateEcology()` - Skip random spawning**
```javascript
updateEcology(dt) {
  // If plant ecology is enabled, it handles all resource management!
  if (CONFIG.plantEcology.enabled) {
    // Just update carrying capacity for mitosis population limits
    this.carryingCapacity = Math.max(
      CONFIG.resourceStableMin, 
      Math.floor(this.resources.length * 1.2)
    );
    return;  // ← Exit early!
  }
  
  // Legacy system only runs when plant ecology disabled
  // ...
}
```

**2. `onResourceCollected()` - Skip pressure tracking**
```javascript
onResourceCollected() {
  // Plant ecology handles depletion via fertility system
  if (CONFIG.plantEcology.enabled) return;
  
  // Legacy pressure system only
  // ...
}
```

**3. HUD Display - Show appropriate info**
```javascript
if (CONFIG.plantEcology.enabled) {
  resourceInfo = `🌿 resources: ${count} | plants: ${capacity}`;
} else if (CONFIG.resourceDynamicCount) {
  resourceInfo = `🌿 resources: ${count}/${capacity} (pressure: ${pressure}%)`;
}
```

---

## 🎯 Result

### Before
- ❌ Resources spawn (plant ecology) then instantly vanish (old system)
- ❌ Flickering at edge of vision
- ❌ Two systems fighting each other
- ❌ Unpredictable resource behavior

### After
- ✅ Plant ecology is sole resource manager
- ✅ No conflicting spawning/removal
- ✅ Stable resource appearance
- ✅ Clean separation of systems

---

## 🌿 How Resources Work Now

**With Plant Ecology Enabled:**

1. **Initial Spawn**: 3 fertile patches with clustered resources
2. **Seed Dispersal**: Existing resources spawn seeds nearby (2% chance/sec)
3. **Spontaneous Growth**: Resources appear in fertile soil (15% chance/sec)
4. **Harvest**: Resource collected → fertility depletes → respawns in fertile area
5. **No Random Spawning**: Old system completely bypassed
6. **No Random Removal**: Old carrying capacity system disabled

**Population Control:**
- Plant ecology's own population pressure (>6 agents = global soil degradation)
- Fertility threshold (resources won't grow in depleted soil <0.3 fertility)
- Natural limits via soil quality, not arbitrary caps

---

## 🔄 Backwards Compatibility

**Plant Ecology Disabled:**
- Old random resource system still works
- Carrying capacity pressure mechanics active
- Legacy behavior preserved

**Toggle in config.js:**
```javascript
plantEcology: {
  enabled: false,  // ← Set to false for old system
}
```

---

## 📊 System Comparison

| Feature | Old System | Plant Ecology |
|---------|-----------|---------------|
| **Spawning** | Random location | Fertility-based patches |
| **Growth** | Random chance | Seeds + spontaneous |
| **Limits** | Carrying capacity | Soil fertility |
| **Depletion** | Pressure counter | Local fertility loss |
| **Recovery** | Time-based | Soil recovery |
| **Clustering** | None | Natural patches |
| **Flickering** | Yes (conflict) | No (unified) |

---

## 🎮 Expected Behavior

### Stable Resources
- Resources stay in place (no flickering)
- Clear visual stability
- Resources only disappear when collected

### Plant-Like Dynamics
- Grow in fertile patches
- Spread via seeds
- Die off in depleted soil
- Recover in abandoned areas

### Visual Feedback
- Press **[P]** to see fertility overlay
- Bright green = fertile (resources grow)
- Dark/no color = depleted (no growth)
- Young resources glow (just sprouted)

---

## 🧪 Testing Results

**Before Fix:**
- Resources visible for 1-2 frames then disappearing
- Constant flickering at vision edge
- Console spam: seed sprouted → immediately gone
- Frustrating gameplay

**After Fix:**
- Resources stable and predictable
- No flickering or popping
- Clean console output
- Smooth gameplay

---

## 💡 Additional Benefits

Beyond fixing flickering, this change:

1. **Cleaner Code**: One system, not two
2. **Better Performance**: No redundant spawning/removal
3. **More Realistic**: Plants don't randomly appear/disappear
4. **Emergent Behavior**: Resources migrate naturally via succession
5. **Strategic Depth**: Agents must follow plant dynamics

---

## 🔧 Future Enhancements

Now that we have clean plant ecology, could add:

- **Resource Types**: Different plants with different growth patterns
- **Seasonal Cycles**: Fertility varies over time
- **Succession Stages**: Pioneer → mature → old growth
- **Fire/Disturbance**: Reset fertility events
- **Symbiosis**: Resources that help each other grow

---

## 📝 Summary

**Problem:** Two resource systems fighting → flickering  
**Solution:** Disable old system when plant ecology active  
**Result:** Clean, stable, plant-like resource dynamics  

**The flickering is fixed!** 🎉

