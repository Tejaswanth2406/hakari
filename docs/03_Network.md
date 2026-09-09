# 03 - Network Evolution

HAKARI's graph topology is highly dynamic. The network is not static; it evolves through natural decay, adaptive rewiring, and semantic clustering.

## Node Lifecycle (Decay Engine)
Every node $i$ has a strength $H_i$ and a temporal decay rate $\Lambda_i$.
In every tick, $H_i$ decays:
$$H_i(t) = H_i(t-1) - \Lambda_i \cdot dt$$

If $H_i \le 0$, the node undergoes **collapse** (death).
The `DecayEngine` modulates $\Lambda_i$ based on:
- Global energy availability.
- Entropy phase ($S$).
- Parameter drift ($\theta$).

## Connectivity
Edges in the `Graph` represent semantic or structural links between nodes.
- **Auto-Connect**: New nodes are automatically wired to their nearest semantic neighbors (based on Vector Embeddings).
- **Decay**: Edge weights decay over time unless reinforced.
- **Pruning**: `Connectivity` removes edges when their weight drops below a minimum threshold, or when a connected node collapses.

## Adaptive Connectivity (Hebbian Rewiring)
"Nodes that fire together, wire together."
When multiple nodes are highly active simultaneously (e.g., during an LLM Query Activation burst), `AdaptiveConnectivity` increases the edge weights between them, permanently altering the topology to favor frequently used conceptual pathways.
