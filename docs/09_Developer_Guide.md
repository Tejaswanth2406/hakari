# 09 - Developer Guide

## Project Structure
HAKARI is built on a modular, block-based architecture.

- **`BLOCK_12/main.js`**: The frontend bootloader.
- **`BLOCK_12/BLOCK_15_UPGRADE/Hakari.js`**: The master Engine class. It instantiates and coordinates all subsystems.
- **`engine/`**: Core tick-loop mechanics (`DecayEngine`, `EntropyField`).
- **`physics/`**: Mathematical boundaries (`EnergyField`, `InformationFlow`).
- **`network/`**: Graph topology and rewiring (`Graph`, `Connectivity`).
- **`memory/`**: The persistent storage and indexing layer.
- **`diagnostics/`**: Real-time analysis of the running simulation.
- **`benchmark/`**: Headless testing and scalability harnesses.

## Extension Points

### 1. Adding a new Metric
To track a new system property:
1. Compute it inside the `Hakari.js#update()` loop.
2. Add it to the snapshot payload in `_buildSystemState()`.
3. Update `Diagnostics.js` to ingest and process the new metric.

### 2. Modifying Node Physics
Node state differentials ($dH/dt$) are calculated in `HUIE.js`. If you want to introduce new physics (e.g., node mass, inertia, or specific gravity), modify `HUIE.update()`.

### 3. Customizing the Objective Function
To change how HAKARI learns, edit `ObjectiveFunction.evaluate()` in `evolution/ObjectiveFunction.js`. Change the weights ($\omega$) or introduce entirely new penalties.
