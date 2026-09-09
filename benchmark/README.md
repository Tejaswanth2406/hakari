# HAKARI Benchmark Suite & Reproducibility Package

This directory contains the headless execution harnesses, experiment scripts, and plotting utilities required to reproduce the empirical benchmarks for the HAKARI framework.

## Structure
- `scripts/`: Node.js scripts for running the experiments and Python scripts for generating plots.
- `results/`: Output directory where JSON, CSV, and PNG/SVG files are saved.
- `harness.js`: The core headless benchmarking framework that monkey-patches HAKARI for profiling.

## Prerequisites
- Node.js v18+
- Python 3.8+
- `pip install pandas matplotlib`

## Running Experiments
To reproduce an experiment, run the script from the root of the `hakari` repository:

```bash
# Run Scalability Experiment (Exp 4)
node benchmark/scripts/exp4_scalability.js

# Run Ablation Study
node benchmark/scripts/ablation.js

# Generate Plots (from the benchmark/scripts directory)
cd benchmark/scripts
python plot_results.py
```

## Results Format
Each experiment generates a highly detailed JSON file containing tick-by-tick metrics (entropy, objectives, stability, memory profiles), and a simplified CSV summary. The plotting script reads these outputs to generate publishable PNG figures.
