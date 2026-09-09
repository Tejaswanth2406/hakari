# 02 - Physics and Entropy Dynamics

The physics layer models nodes as masses subject to forces, bounded by information-theoretic limits.

## Energy Field
The system maintains a `totalEnergy` pool.
- **Influx**: Each tick adds basal energy.
- **Consumption**: Active nodes consume energy proportional to their strength.
- **Overload**: If consumption exceeds supply, an `energyOverload` occurs, drastically increasing the decay rate ($\Lambda$) for all nodes.

## Shannon Entropy ($S$)
Entropy is a core governing metric, continuously monitored to detect regime changes (Phase Transitions).

The entropy of the network is computed as:
$$S = -\sum_{i=1}^{N} P_i \log_2(P_i)$$
Where $P_i$ is the normalized strength of node $i$:
$$P_i = \frac{H_i}{\sum H_j}$$

- **High Entropy**: Node strengths are uniformly distributed (high uncertainty/fluidity).
- **Low Entropy**: A few nodes dominate the network (crystallized structure).

## The Entropy Law
The `EntropyLaw` subsystem ensures that the system's structural complexity does not exceed its energetic capacity. It acts as a clamping mechanism, forcing node strengths down if the global entropy $S$ crosses critical upper bounds without sufficient energy backing.

## Information Flow
System Information ($I_{sys}$) measures the total structural capacity of the network, factoring in both the node count $N$ and the current entropy $S$:
$$I_{sys} = N \cdot (1 - \frac{S}{S_{max}})$$
This metric is fed directly into the `MetaOptimizer` to drive online learning.
