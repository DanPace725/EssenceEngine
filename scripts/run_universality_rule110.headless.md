# Headless Rule 110 Run Guide

This helper explains how to invoke the Rule 110 headless generator (`tc/rule110Headless.js`), which reproduces the hashes used by the determinism tests and casual universality profile.

## Prerequisites

* Node.js 18+
* Repository dependencies are vendored; no `npm install` required.

## Basic Invocation

```bash
node tc/rule110Headless.js \
  --initializer ether \
  --width 128 \
  --steps 128 \
  --seedBase 0 \
  --output out/rule110-ether.ndjson
```

Options:

| Flag | Description | Default |
| --- | --- | --- |
| `--initializer` | One of `ether`, `glider`, `random`. Selects the initializer resolved by `tc/tcInitializers.js`. | `ether` |
| `--width` | Number of cells tracked per frame. | `128` |
| `--steps` | How many ticks to simulate before exiting. | `128` |
| `--seedBase` | Base seed forwarded to `TcScheduler.configure({ baseSeed })`. | `0` |
| `--phase`, `--offset`, `--seed`, `--density` | Extra initializer-specific knobs (phase wrapping, glider offset, PRNG seed, random fill density). | initializer dependent |
| `--output` | Path to the NDJSON file. Created if missing; defaults to `./tc/rule110.ndjson`. | `tc/rule110.ndjson` |

The script clears `TcStorage`, enables the scheduler, runs `capture → compute → commit` for the requested number of steps, and writes one NDJSON line per tick containing the tick index, SHA-256 hash, initializer descriptor, and metadata payload (including `metadata.rule = 110`).  Output lines comply with `schemas/tc_rule110_snapshot.schema.json`.

## Expected Hashes

With the default arguments shown above, the first four ticks should hash to:

| Tick | Hash |
| --- | --- |
| 0 | `891a2789bc80d79458b0a9d4f76926ce31f1d715bbda1c8374cb360e84355114` |
| 1 | `0b49a919668b09d85a8de9b50e78ff230e92a4b802a6c60bc9ee1f616e5306ce` |
| 2 | `a46e45b06124acf082b378489d45cf5b5262d09b8cb122203a62dc2b02de73fc` |
| 3 | `f96aac398729343db910db9160774773753f50d93dae95dca652b9740c489db5` |

To mirror the determinism fixtures in `analysis/fixtures/rule110-hashes.json`, change the parameters as follows:

| Fixture | Command adjustments |
| --- | --- |
| Ether phase 0 | `--width 64 --steps 32 --initializer ether --phase 0` |
| Glider center | `--width 64 --steps 32 --initializer glider --phase 0 --offset 20` |
| Random seed 12345 | `--width 64 --steps 32 --initializer random --seed 12345 --density 0.55` |

Running `node test/test-rule110.js` should produce matching hashes for each case.

## Troubleshooting

* **`Rule110 headless run failed`** – Indicates an exception thrown during initialization or stepping. Re-run with `--steps 1` to isolate initializer issues, or verify that the output directory exists when using a custom `--output` path.
* **Hashes diverge** – Ensure you are using the same initializer options as the fixture. Even a different `--phase` for the ether initializer will alter every subsequent hash because the state buffer diverges from tick 0.
* **Large NDJSON** – Use `--steps` to cap output or pipe the file through `head` when inspecting. Each NDJSON line is independent and can be validated against `schemas/tc_rule110_snapshot.schema.json` using any JSON Schema validator.
