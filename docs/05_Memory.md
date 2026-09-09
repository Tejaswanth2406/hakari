# 05 - Memory and Diagnostics

Because HAKARI executes persistently, understanding "how we got here" is as important as "where we are."

## Causal Event Graph
The `EventCausalityGraph` records non-linear events:
- Entropy spikes.
- Energy overloads.
- Node collapses.
- Query bursts.

When a node collapses, the `whyDidNodeDie(id)` API traces back through the Causal Graph to determine if the death was caused by natural decay, an energy overload, or a cascading failure from a neighbor.

## Temporal Indexing
The `MemoryStore` captures a complete snapshot of the system state every tick. To prevent memory leaks, `MemoryCompression` prunes redundant frames (where $\Delta S \approx 0$).
The `TemporalIndex` allows the engine to "rewind" to specific regimes, enabling time-travel queries.

## Critical Slowing Down (CSD)
HAKARI detects impending structural collapses *before* they happen using two statistical indicators of Critical Slowing Down:
1. **AR(1) Autocorrelation**: As a system approaches a tipping point, its recovery from small perturbations slows down, increasing the lag-1 autocorrelation of its state (tracked via `collapseRate`).
2. **Variance Acceleration**: The variance of the entropy signal increases exponentially near a bifurcation.

The `SystemStabilityAnalyzer` flags `TIPPING_POINT_RISK` when both signals rise concurrently.
