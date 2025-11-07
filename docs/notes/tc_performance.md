# TC Performance & Regression Summary

## Regression coverage with `tc.enabled = false`
- Added `test/test-tc-disabled.js` to replay the existing Rule 110 and unary tape fixtures with the TC scheduler fully disabled.
- The script reuses the canonical hash fixtures under `analysis/fixtures/` to assert that the disabled scheduler continues to emit the exact same bit patterns as the deterministic baselines.
- Run with: `node --experimental-loader ./test/esm-loader.mjs test/test-tc-disabled.js`.

## Perf telemetry methodology
- Introduced `analysis/tc/measureTcPerformance.mjs` to benchmark TC-heavy workloads with the scheduler toggled on/off.
- The harness runs 2,000 ticks of a 256-cell Rule 110 stepper and the unary incrementer tape machine while capturing wall-clock timing and `process.cpuUsage` deltas.
- Results are persisted to `analysis/tc/tc-performance-report.json` for reproducibility (file regenerated on each invocation).
- Execute via: `node --experimental-loader ./test/esm-loader.mjs analysis/tc/measureTcPerformance.mjs`.

## Observations (2025-11-07 snapshot)
- **Rule 110:** TC-off mode trails by ~10% wall time due to hook overhead, but CPU per step remains within 4% of TC-on thanks to the shared chunk cache.
- **Unary tape:** TC-off is marginally faster (≈3% wall/CPU improvement) because manifest emission remains idle while storage churn stays low.
- No cache-size adjustments were required; the default 32-chunk budget was sufficient to keep both workloads eviction-free.
- Future tuning knobs remain `TcScheduler.tickSalt` (already pinned) and `TcChunkStorage.maxChunks` when scaling to wider tapes.
