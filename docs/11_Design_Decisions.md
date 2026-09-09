# 11 - Architecture Design Decisions (ADR)

This document records the engineering rationale behind HAKARI's major architectural choices.

## 1. The Monolithic Tick Loop
**Decision:** All subsystem updates are coordinated in a strict, sequential 20-step loop inside `Hakari.js`.
**Rationale:** In a complex adaptive system, order of operations matters. If node decay occurs before energy consumption, the system enters a physically impossible state. The strict loop prevents race conditions and ensures deterministic reproducibility across seeds.
**Alternatives Considered:** Event-driven architecture (rejected due to unpredictability of cascading events and difficulty in time-travel indexing).

## 2. Headless Portability
**Decision:** The engine is fully decoupled from the `Canvas` and DOM.
**Rationale:** To serve as a serious research framework, HAKARI must run on remote compute clusters or CLI environments to perform massive parallel parameter sweeps (like the benchmark suite).

## 3. Shannon Entropy as a Core Metric
**Decision:** We use Shannon Entropy ($S$) to measure network fluidity rather than just relying on mean edge weights.
**Rationale:** Edge weights indicate strength, but entropy indicates *distribution*. A network can be strong but highly crystallized (brittle). Entropy provides a continuous metric for structural complexity, which serves as an early-warning signal for phase transitions.

## 4. Sub-symbolic Concept Embeddings
**Decision:** Nodes represent concepts via high-dimensional embeddings rather than strict symbolic labels.
**Rationale:** This allows the system to compute continuous semantic distance and automatically cluster nodes without hard-coded ontologies.
