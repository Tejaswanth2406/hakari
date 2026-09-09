# 01 - Architecture & Tick Loop

HAKARI v3 operates on a strictly ordered, persistent tick-loop architecture. Unlike request-response frameworks, HAKARI maintains continuous state. Every "tick" (simulation step) progresses the entire system.

## The 20-Step Tick Loop
The tick loop runs in `Hakari.js#update(dt)` in the following sequence:

1. **EntropyField** ($S$): Computes global Shannon entropy from the node distribution.
2. **EnergyField**: Updates global energy and checks for energy overloads.
3. **QueryActivation**: Propagates semantic activation if an LLM query is active.
4. **ReinforcementField**: Boosts node connectivity based on user feedback.
5. **HUIE (Hakari Unified Intelligence Equation)**: Computes the differential change in node strengths ($dH/dt$) combining physics, entropy, and intelligence.
6. **EntropyLaw**: Clamps node strengths and enforces thermodynamic boundaries.
7. **DecayEngine**: Applies temporal decay to all nodes. Flags collapsed nodes.
8. **Connectivity**: Updates the graph topology, pruning dead edges.
   - *8b. AdaptiveConnectivity*: Rewires the graph based on node usage.
   - *8c. ConceptSpace*: Updates the 2D semantic embedding map.
   - *8d. ReasoningPatternGraph*: Extracts frequent reasoning subgraphs.
9. **MetaOptimizer**: Computes the learning objective ($J$) and adjusts global parameters ($\theta$).
10. **InformationFlow**: Calculates total system information.
11. **Node Aging**: Increments temporal age for all active nodes.
12. **MemoryStore**: Captures a rolling snapshot of the entire system state.
13. **TemporalIndex**: Indexes the snapshot for fast time-travel lookups.
14. **MemoryCompression**: Prunes redundant snapshots to manage heap size.
15. **EventCausalityGraph**: Records distinct events (collapse, entropy spikes, query bursts).
16. **LongTermMemory**: Consolidates important snapshots into persistent storage.
17. **PredictiveMemory**: Projects current state vectors forward to predict future topologies.
18. **CollapseLog**: Logs mortality rates for Critical Slowing Down (CSD) analysis.
19. **Diagnostics**: Updates phase detectors, stability scores, and learning curves.
20. **Render/Stats**: Emits the final computed state to the UI (if not headless).

## Subsystem Synchronization
Because HAKARI integrates multiple layers (physics, intelligence, topology), the strict ordering is crucial. For instance, **HUIE** (Step 5) requires the entropy computed in Step 1, while **Connectivity** (Step 8) must operate *after* the **DecayEngine** (Step 7) has pruned dead nodes.
