# 10 - Benchmark Methodology

The HAKARI benchmark suite is designed to evaluate computational performance, architectural ablation, and theoretical scalability under rigorous, reproducible conditions.

## Headless Execution
All benchmarks are run via `benchmark/harness.js`. This executes the HAKARI engine in a Node.js environment with the UI rendering layer completely detached. This isolates the computational cost of the physics, memory, and entropy subsystems from DOM/Canvas overhead.

## Statistical Rigor
- **Multi-Trial Execution**: Experiments are repeated across multiple trials (e.g., 20 trials for perturbation).
- **Deterministic Seeds**: The Random Number Generator (`SeededRNG.js`) is strictly seeded (`seed = 42 + trial_index`) to guarantee exact repeatability.
- **Output Artifacts**: Results are exported as both JSON (for programmatic ingestion) and CSV (for spreadsheet analysis). Python scripts generate PNG plots.

## The Experiments
1. **Experiment 1 (Perturbation)**: Evaluates stability when graph connections are artificially eroded.
2. **Experiment 2 (Information)**: Logs entropy gradients during continuous execution.
3. **Experiment 3 (Learning)**: Evaluates the Meta-Optimizer's recovery time after parameter shocks.
4. **Experiment 4 (Scalability)**: Benchmarks tick-time overhead from $N=100$ to $N=25,000$ nodes.
5. **Experiment 5 (Edge Cases)**: Tests system resilience against 0-entropy, empty graphs, and NaN injection.
6. **Ablation Study**: Compares the Full System against Physics-only, No-Learning, and No-Info variations to isolate component overhead.
