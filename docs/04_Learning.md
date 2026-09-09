# 04 - Adaptive Learning

HAKARI operates an online, unsupervised learning layer that continuously adjusts the system's global physical parameters ($\theta$) to optimize a meta-objective.

## Objective Function ($J$)
The system seeks to maximize structural information while minimizing catastrophic collapses.
$$J = \omega_1 I_{sys} - \omega_2 C_{rate} + \omega_3 \Delta S$$
Where:
- $I_{sys}$ = Total system information
- $C_{rate}$ = Recent node collapse rate
- $\Delta S$ = Entropy gradient (seeking moderate fluidity, avoiding stagnation)

## Meta-Optimizer
The `MetaOptimizer` continuously tracks $J$. It employs a stochastic gradient descent approach in the parameter space of $\theta$ (which includes factors like base decay rate $\alpha$, coupling strength $\gamma$, and entropy noise $\sigma$).

### Regression Detection
The `LearningCurveAnalyzer` monitors the derivative $dJ/dt$.
- **Convergence**: $J$ stabilizes at a local maximum.
- **Regression**: $J$ drops sharply (often due to environmental perturbation).
- **Plateau**: $J$ remains unchanged for extended periods.

When regression is detected, the `MetaOptimizer` automatically increases its learning rate $\eta$ and injects parameter noise $\sigma$ to "bump" the system out of the local minimum, allowing it to adapt to the new topology.
