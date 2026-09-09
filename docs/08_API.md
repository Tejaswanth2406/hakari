# 08 - API Reference

The HAKARI engine exposes a rich API accessible via `window.__hakari` (in browser) or the `Hakari` instance (in Node.js).

## Core Controls
- `engine.spawnNodes(count)`: Instantiates `count` new nodes and wires them into the semantic graph.
- `engine.reset()`: Purges all state, resets the graph, and re-initializes memory banks.
- `engine.update(dt)`: Advances the simulation by `dt` milliseconds.
- `engine.seedGlobal(seed)`: Sets the deterministic RNG seed.

## Simulation API
- `engine.reinforceAll()`: Boosts the activation strength of all currently active nodes.
- `engine.injectEntropy()`: Forces a stochastic perturbation on node decay rates, used for stress testing.

## Memory & Diagnostics API
- `engine.whyDidNodeDie(id)`: Returns the causal chain leading to a specific node's collapse.
- `engine.recurringPatterns()`: Returns a list of the most frequent semantic graph configurations.
- `engine.predictNext(horizon)`: Projects the state vector `horizon` steps into the future.
- `engine.importantMoments(n)`: Retrieves the top `n` memory snapshots ranked by entropy gradient magnitude.
- `engine.rewindTo(tick)`: Extracts the historical state slice at the specified simulation tick.

## Concept Space API
- `engine.semanticNeighbours(nodeId, k)`: Returns the `k` closest nodes in the embedding space.
- `engine.semanticMap()`: Projects the high-dimensional node embeddings into a 2D layout for visualization.
