# State Export/Import System

This document describes the simulation state export and import functionality that allows saving and restoring the complete state of the Essence Engine simulation.

## Overview

The state export/import system enables:
- Saving the complete simulation state to a file
- Loading and restoring a previously saved state
- Preserving all critical simulation components including trails, signals, RNG state, and configuration

## Components

### StateIO Module (`src/core/stateIO.js`)

The central module responsible for building and applying state snapshots. Key functions:

- `buildStateSnapshot()`: Assembles a complete snapshot including:
  - Trail system buffers
  - Signal field state
  - Current configuration
  - RNG state
  - Bundle/resource state

- `applyStateSnapshot()`: Restores simulation state from a snapshot by:
  - Applying trail system buffers
  - Restoring signal field state
  - Setting configuration values
  - Reseeding RNG
  - Restoring bundle/resource state

### Integration Points

1. **Trail System** (`app/trails.js`)
   - Added `applySnapshot()` method to restore trail buffers
   - Preserves trail positions, decay state, and intensity values

2. **Signal Field** (`signalField.js`) 
   - Added `applySnapshot()` method to restore signal grid state
   - Preserves signal strengths and gradients

3. **Training UI** (`trainingUI.js`)
   - Export/Import buttons in the training panel
   - File-based snapshot storage and loading

4. **RNG Management** (`app/initialization.js`)
   - Exposes TcRandom and TcStorage to browser context
   - Enables consistent RNG state preservation

## Usage

Users can export/import simulation states through the Training panel in the UI:

1. **Exporting State**
   - Click "Export Simulation State" button
   - Choose save location for the snapshot file
   - Current state will be saved including all buffers and RNG

2. **Importing State**  
   - Click "Import Simulation State" button
   - Select a previously saved snapshot file
   - Simulation will restore to the saved state

## Technical Details

Snapshot Format:
```json
{
  "version": 1,
  "trails": {
    "buffers": [...],
    "decayState": [...]
  },
  "signalField": {
    "grid": [...],
    "gradients": [...]
  },
  "config": {
    // Current configuration values
  },
  "rng": {
    "seed": "...",
    "state": [...]
  },
  "resources": {
    // Bundle/resource state
  }
}
```

## Implementation Notes

- State snapshots are JSON-serializable for easy storage/transmission
- RNG state preservation ensures deterministic replay
- Snapshot version field allows for future format evolution
- Direct configuration object manipulation avoids external dependencies