/**
 * HAKARI v3 — Hakari.js
 * ─────────────────────────────────────────────
 * Master coordinator. Owns every subsystem.
 * Runs the 20-step tick loop in correct order.
 *
 * Tick order (locked):
 *   1.  EntropyField        → S(t)
 *   2.  EnergyField         → Eᵢ, E_total
 *   3.  QueryActivation     → Aᵢ
 *   4.  ReinforcementField  → Rᵢ
 *   5.  HUIE                → dH/dt
 *   6.  EntropyLaw          → clamp H, enforce S bounds
 *   7.  DecayEngine         → Λᵢ, collapse check
 *   8.  Connectivity        → graph update + pruning
 *   8b. AdaptiveConnectivity→ adaptive wiring
 *   8c. ConceptSpace        → semantic positions
 *   8d. ReasoningPatternGraph→ pattern tick
 *   9.  MetaOptimizer       → dθ/dt
 *   10. InformationFlow     → Iᵢ
 *   11. Node ages           → node.tick(dt)
 *   12. MemoryStore         → snapshot
 *   13. TemporalIndex       → index snapshot
 *   14. MemoryCompression   → prune redundant history
 *   15. EventCausalityGraph → record events + links
 *   16. LongTermMemory      → consolidate important states
 *   17. PredictiveMemory    → update velocity model
 *   18. CollapseLog         → record deaths
 *   19. Diagnostics         → update all analysis curves
 *   20. StatsPanel          → DOM update
 *   21. Render              → edges + nodes
 *
 * Public API (used by Controls.js + LLMConnector):
 *   spawnNodes()         reinforceAll()
 *   injectEntropy()      reset()
 *   query(text)          clearQuery()
 *   addNode(node)        aliveNodes()
 *   seedGlobal(seed)     startLogging()
 *   stopLogging()        downloadLog()
 *   whyDidNodeDie(id)    predictNext(horizon)
 *   recurringPatterns()  importantMoments(n)
 *   rewindTo(tick)       memoryReport()
 *   semanticNeighbours() semanticMap()
 *   semanticClusters()   topReasoningPatterns()
 *   tryPatternMatch()    systemReport()
 * ─────────────────────────────────────────────
 */

// ── Core ──────────────────────────────────────
import { PARAMS, NODES, TIMING, PHYSICS } from './core/constants.js';
import { DIAGNOSTICS }            from './core/config.js';
import { GLOBAL_RNG }            from './core/SeededRNG.js';

// ── Physics ───────────────────────────────────
import { EnergyField }           from './physics/EnergyField.js';
import { EntropyLaw }            from './physics/EntropyLaw.js';
import { InformationFlow }       from './physics/InformationFlow.js';

// ── Nodes ─────────────────────────────────────
import { Node }                  from './nodes/Node.js';
import { NodeFactory }           from './nodes/NodeFactory.js';

// ── Network ───────────────────────────────────
import { Graph }                 from './network/Graph.js';
import { Connectivity }          from './network/Connectivity.js';
import { AdaptiveConnectivity }  from './network/AdaptiveConnectivity.js';

// ── Geometry ──────────────────────────────────
import { ConceptSpace }          from './geometry/ConceptSpace.js';

// ── Reasoning ─────────────────────────────────
import { ReasoningPatternGraph } from './reasoning/ReasoningPatternGraph.js';

// ── Engine ────────────────────────────────────
import { EntropyField }          from './engine/EntropyField.js';
import { DecayEngine }           from './engine/DecayEngine.js';

// ── Intelligence ──────────────────────────────
import { HUIE }                  from './intelligence/HUIE.js';
import { ReinforcementField }    from './intelligence/ReinforcementField.js';

// ── Evolution ─────────────────────────────────
import { ObjectiveFunction }     from './evolution/ObjectiveFunction.js';
import { ParameterField }        from './evolution/ParameterField.js';
import { MetaOptimizer }         from './evolution/MetaOptimizer.js';

// ── Knowledge ─────────────────────────────────
import { EmbeddingStore }        from './knowledge/EmbeddingStore.js';
import { QueryActivation }       from './knowledge/QueryActivation.js';
import { RetrievalEngine }       from './knowledge/RetrievalEngine.js';

// ── LLM ───────────────────────────────────────
import { Embedder }              from './llm/Embedder.js';
import { ContextBuilder }        from './llm/ContextBuilder.js';
import { LLMConnector }          from './llm/LLMConnector.js';

// ── Memory ────────────────────────────────────
import { MemoryStore }           from './memory/MemoryStore.js';
import { CollapseLog }           from './memory/CollapseLog.js';
import { TemporalIndex }         from './memory/TemporalIndex.js';
import { MemoryCompression }     from './memory/MemoryCompression.js';
import { EventCausalityGraph }   from './memory/EventCausalityGraph.js';
import { LongTermMemory }        from './memory/LongTermMemory.js';
import { PredictiveMemory }      from './memory/PredictiveMemory.js';

// ── Viz ───────────────────────────────────────
import { Canvas }                from './viz/Canvas.js';
import { NodeRenderer }          from './viz/NodeRenderer.js';
import { EdgeRenderer }          from './viz/EdgeRenderer.js';

// ── UI ────────────────────────────────────────
import { StatsPanel }            from './ui/StatsPanel.js';

// ── Debug ─────────────────────────────────────
import { Diagnostics }               from './debug/Diagnostics.js';
import { SystemStabilityAnalyzer }   from './debug/SystemStabilityAnalyzer.js';
import { CognitivePhaseDetector }    from './debug/CognitivePhaseDetector.js';
import { LearningCurveAnalyzer }     from './debug/LearningCurveAnalyzer.js';
import { ExperimentLogger }          from './debug/ExperimentLogger.js';

// ── Block 15 ──────────────────────────────────
import { MetaLearningEngine }    from './intelligence/MetaLearningEngine.js';
import { MetricsEngine }         from './diagnostics/MetricsEngine.js';

// ✅ FIXED: was './BLOCK1/math.js' (wrong path) with '{ math }' (wrong syntax)
// Hakari.js lives at BLOCK_15_UPGRADE/Hakari.js → need ../../BLOCK1/math.js
import * as math from '../../BLOCK1/math.js';

export class Hakari {

  /**
   * @param {object} opts
   *   opts.canvasEl   — HTMLCanvasElement
   *   opts.statsIds   — DOM id map for StatsPanel
   *   opts.llm        — { apiKey, provider, model }
   *   opts.embedder   — { apiKey, mode }
   *   opts.seed       — RNG seed (default 42)
   */
  constructor(opts = {}) {

    // ── Seed RNG first so everything is reproducible ──
    this._activeSeed = opts.seed ?? 42;
    GLOBAL_RNG.seed(this._activeSeed);

    // ── Physics ───────────────────────────────────────
    this.energyField     = new EnergyField();
    this.entropyLaw      = new EntropyLaw();
    this.informationFlow = new InformationFlow();

    // ── Nodes ─────────────────────────────────────────
    this.nodeFactory = new NodeFactory(800, 500);
    this._nodes      = [];
    this._nodeMap    = new Map();

    // ── Network ───────────────────────────────────────
    this.graph                = new Graph();
    this.connectivity         = new Connectivity();
    this.adaptiveConnectivity = new AdaptiveConnectivity();

    // ── Engine ────────────────────────────────────────
    this.entropyField = new EntropyField();
    this.decayEngine  = new DecayEngine({
      rng: () => GLOBAL_RNG.random(),
      physics: PHYSICS,
      diagnostics: DIAGNOSTICS
    });

    // ── Intelligence ──────────────────────────────────
    this.huie               = new HUIE();
    this.reinforcementField = new ReinforcementField();

    // ── Evolution ─────────────────────────────────────
    this.objectiveFunction = new ObjectiveFunction();
    this.parameterField    = new ParameterField();
    this.metaOptimizer     = new MetaOptimizer(
      this.objectiveFunction,
      this.parameterField
    );

    // ── Geometry ──────────────────────────────────────
    this.conceptSpace = new ConceptSpace();

    // ── Reasoning ─────────────────────────────────────
    this.reasoningGraph  = new ReasoningPatternGraph();
    this.embeddingStore  = new EmbeddingStore();
    this.queryActivation = new QueryActivation();
    this.retrievalEngine = new RetrievalEngine();

    // ── LLM ───────────────────────────────────────────
    this.embedder       = new Embedder(opts.embedder ?? {});
    this.contextBuilder = new ContextBuilder();
    this.llmConnector   = new LLMConnector(opts.llm ?? {});

    // ── Memory ────────────────────────────────────────
    this.memoryStore       = new MemoryStore();
    this.collapseLog       = new CollapseLog();
    this.temporalIndex     = new TemporalIndex();
    this.memoryCompression = new MemoryCompression();
    this.causalGraph       = new EventCausalityGraph();
    this.longTermMemory    = new LongTermMemory();
    this.predictiveMemory  = new PredictiveMemory(
      this.temporalIndex,
      this.longTermMemory
    );

    // ── Viz ───────────────────────────────────────────
    if (opts.canvasEl) {
      this.canvas = new Canvas(opts.canvasEl, {
        onResize: (w, h) => this.nodeFactory.setCanvasSize(w, h),
      });
      this.nodeRenderer = new NodeRenderer(this.canvas);
      this.edgeRenderer = new EdgeRenderer(this.canvas);
    }

    // ── UI ────────────────────────────────────────────
    this.statsPanel = new StatsPanel(opts.statsIds ?? {});

    // ── Debug + Analysis ──────────────────────────────
    this.diagnostics       = new Diagnostics();
    this.stabilityAnalyzer = new SystemStabilityAnalyzer();
    this.phaseDetector     = new CognitivePhaseDetector();
    this.learningCurve     = new LearningCurveAnalyzer();
    this.logger            = new ExperimentLogger();

    // ── Block 15 ──────────────────────────────────────
    this.metaLearningEngine = new MetaLearningEngine(this.parameterField);
    this.metricsEngine      = new MetricsEngine();

    // ── Internal state ────────────────────────────────
    this.tick    = 0;
    this.running = false;
    this._prevJ          = 0;
    this._birthsThisTick = 0;
    this._lastRegime     = 'STABLE';
    this._plateauLogged  = false;

    this._boot();
  }

  // ══════════════════════════════════════════════
  // BOOT
  // ══════════════════════════════════════════════

  _boot() {
    const initial = this.nodeFactory.batch(NODES.INITIAL_SPAWN, 0);
    for (const node of initial) this._registerNode(node);

    const bootState = this._buildSystemState();
    this.memoryStore.forceSnapshot?.(bootState);
    const bootSnap = this.memoryStore.latest?.();
    if (bootSnap) {
      this.temporalIndex.ingest(bootSnap);
      this.longTermMemory.forceConsolidate(bootSnap, 'boot');
    }
    this._birthsThisTick = 0;
  }

  // ══════════════════════════════════════════════
  // TICK LOOP  — called by Scheduler every frame
  // ══════════════════════════════════════════════

  update(dt) {
    this.tick++;
    const alive  = this.aliveNodes();
    const params = this.parameterField.current;

    // 1. Entropy
    const rawS = this.entropyField.compute(alive);

    // 2. Energy
    this.energyField.update(alive, params);

    // 3. Query Activation
    this.queryActivation.update(alive, this.embeddingStore, params);

    // 4. Reinforcement
    this.reinforcementField.update(alive, this.graph, this._nodeMap);

    // 5. HUIE differential
    this.huie.update(alive, rawS, this.energyField, this.graph, this._nodeMap, params, dt);

    // 6. Clamp strengths + enforce S bounds
    const S = this.entropyLaw.enforce(alive, rawS);

    // 7. Decay + collapse
    const collapsed = this.decayEngine.update(alive, S, params);
    this.decayEngine.recoverErrorRates?.(alive, dt);
    this._removeCollapsed(collapsed);

    // 8. Connectivity
    const aliveAfter = this.aliveNodes();
    this.connectivity.update(aliveAfter, this.graph, this._nodeMap);
    this.graph.totalNodes = aliveAfter.length;
    this.graph.decayWeights(dt);
    this.graph.pruneDeadEdges(new Set(aliveAfter.map(n => n.id)));

    // 8b. Adaptive pruning
    this.adaptiveConnectivity.tick(aliveAfter, this.graph, this.tick);

    // 8c. ConceptSpace
    this.conceptSpace.update(aliveAfter, this.graph, this._nodeMap, dt);

    // 8d. ReasoningPatternGraph
    this.reasoningGraph.tick();

    // 9. MetaOptimizer
    const systemState = this._buildSystemState();
    const J = this.objectiveFunction.evaluate({
      information:  this.informationFlow.systemInformation,
      entropy:      this.entropyField.normalized,
      collapseRate: this.collapseLog.recentRate(),
    });
    this.metaOptimizer.tick(systemState, dt);

    // 10. Information flow
    this.informationFlow.update(aliveAfter, S);

    // 11. Node ages
    for (const node of aliveAfter) node.tick(dt);

    // 12. Memory snapshot
    const snapshot = {
      ...systemState, objective: J,
      avgStrength: aliveAfter.length > 0
        ? aliveAfter.reduce((s, n) => s + n.strength, 0) / aliveAfter.length : 0,
    };
    this.memoryStore.tick(snapshot);

    // 13. Temporal index
    const latest = this.memoryStore.latest?.();
    if (latest) this.temporalIndex.ingest(latest);

    // 14. Memory compression
    this.memoryCompression.onNewSnapshot(this.memoryStore.all?.(), this.temporalIndex);

    // 15. Causal graph — record events
    this.causalGraph.recordEntropySpike(this.tick, this.entropyField.S_delta ?? 0, S);
    for (const node of collapsed) {
      this.causalGraph.recordCollapse(
        node.id, node.label, this.tick,
        node.collapseBy ?? 'unknown',
        node.adaptiveLambda ?? node.lambda
      );
    }
    if (this.energyField.overload) {
      this.causalGraph.recordEnergyOverload(this.tick, this.energyField.totalEnergy);
    }
    if (this.queryActivation.isActive) {
      this.causalGraph.recordActivationBurst(
        this.tick, this.queryActivation.queryText, this.queryActivation.maxActivation
      );
    }
    this.causalGraph.recordObjectiveJump(this.tick, J - (this._prevJ ?? J), J);
    this._prevJ = J;

    // 16. Long-term memory consolidation
    if (latest) this.longTermMemory.evaluate(latest, this._birthsThisTick ?? 0);
    this._birthsThisTick = 0;

    // 17. Predictive memory
    if (latest) {
      this.predictiveMemory.update(latest);
      this.predictiveMemory.resolvePredictions(this.tick);
    }

    // 18. Collapse log
    this.collapseLog.record(collapsed, this.tick, S);

    // 19. Diagnostics
    const diagState = {
      entropy:        S,
      collapseCount:  collapsed.length,
      totalEnergy:    this.energyField.totalEnergy,
      objective:      J,
      avgStrength:    aliveAfter.length > 0
        ? aliveAfter.reduce((s, n) => s + n.strength, 0) / aliveAfter.length : 0,
      energyOverload: this.energyField.overload,
      paramDrifts:    this.parameterField.allDrifts?.(),
      runawayParams:  this.parameterField.runawayParams?.(),
    };
    this.diagnostics.update(diagState);

    this.stabilityAnalyzer.update({
      entropy:      S,
      collapseRate: this.collapseLog.recentRate(),
      objective:    J,
      avgStrength:  diagState.avgStrength,
    }, this.tick);

    this.phaseDetector.update({
      entropy:     S,
      avgStrength: diagState.avgStrength,
      nodes:       aliveAfter,
    }, this.tick);

    this.learningCurve.update({
      objective:    J,
      information:  this.informationFlow.systemInformation,
      collapseRate: this.collapseLog.recentRate(),
      avgStrength:  diagState.avgStrength,
    }, this.tick);

    // 19b. Block 15 meta-learning + metrics
    this.metaLearningEngine?.update?.(systemState, diagState, dt);
    this.metricsEngine?.update?.(aliveAfter, this.graph, this.conceptSpace,
      this.reasoningGraph, S, J, this.tick);

    // 19c. Experiment logger
    if (this.logger.isRecording) {
      this.logger.logTick(
        { ...snapshot, nodeCount: aliveAfter.length },
        {
          phase:          this.phaseDetector.phase,
          stabilityScore: this.stabilityAnalyzer.stabilityScore,
          learningRate:   this.learningCurve.learningRate,
        }
      );
      if (this.stabilityAnalyzer.regime !== this._lastRegime) {
        this.logger.logRegimeChange(this.tick, this._lastRegime, this.stabilityAnalyzer.regime);
        this._lastRegime = this.stabilityAnalyzer.regime;
      }
      if (this.learningCurve.plateauDetected && !this._plateauLogged) {
        this.logger.logPlateau(this.tick, this.learningCurve.plateauSince);
        this._plateauLogged = true;
      } else if (!this.learningCurve.plateauDetected) {
        this._plateauLogged = false;
      }
      for (const node of collapsed) {
        this.logger.logCollapse(this.tick, node.id, node.label ?? '', node.collapseBy ?? 'unknown');
      }
    }

    // 20. Stats panel
    this.statsPanel.update(this._buildStatsState(S, J, aliveAfter));

    // 21. Render
    if (this.canvas) {
      this.canvas.clear(0.25);
      this.canvas.drawGrid();
      this.edgeRenderer.render(aliveAfter, this.graph, this._nodeMap);
      this.nodeRenderer.render(aliveAfter);
    }
  }

  // ══════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════

  spawnNodes(count = NODES.SPAWN_BATCH) {
    const batch = this.nodeFactory.batch(count, this.aliveNodes().length);
    for (const node of batch) this._registerNode(node);
  }

  reinforceAll() {
    this.reinforcementField.boost(this.aliveNodes(), 0.4);
  }

  injectEntropy() {
    this.decayEngine.injectEntropy(this.aliveNodes(), 0.35);
  }

  async query(text) {
    return this.llmConnector.query(text, this);
  }

  clearQuery() {
    this.queryActivation.clearQuery();
    this.nodeRenderer?.clearHighlight();
  }

  addNode(node) {
    if (this.aliveNodes().length >= NODES.MAX) return;
    this._registerNode(node);
  }

  aliveNodes() {
    return this._nodes.filter(n => n.alive);
  }

  reset() {
    this._nodes   = [];
    this._nodeMap = new Map();
    for (const id of this.graph.nodeIds()) this.graph.removeNode(id);

    this.memoryStore.clear();
    this.collapseLog.clear();
    this.temporalIndex.clear();
    this.causalGraph.clear();
    this.longTermMemory.clear();
    this.predictiveMemory.clear();
    this.conceptSpace.clear?.();
    this.reasoningGraph.clear();
    this.adaptiveConnectivity.clear();
    this.stabilityAnalyzer.clear();
    this.phaseDetector.clear();
    this.learningCurve.clear();
    this.metaOptimizer.reset();
    this.clearQuery();
    this.embeddingStore.clear();
    this.metaLearningEngine?.reset?.();
    this.metricsEngine?.reset?.();

    this.tick            = 0;
    this._prevJ          = 0;
    this._birthsThisTick = 0;
    this._lastRegime     = 'STABLE';
    this._plateauLogged  = false;
    Node.resetIdCounter?.();

    GLOBAL_RNG.seed(this._activeSeed);
    this._boot();
  }

  seedGlobal(seed) {
    GLOBAL_RNG.seed(seed);
    this._activeSeed = seed;
  }

  startLogging(config = {}) {
    return this.logger.beginRun(
      { ...config, params: this.parameterField?.current ?? {} },
      this._activeSeed ?? 42
    );
  }

  stopLogging()  { return this.logger.endRun(this.systemReport()); }
  downloadLog()  { this.logger.downloadJSON(); }

  // ── Cognitive memory API ──────────────────────
  whyDidNodeDie(nodeId)       { return this.causalGraph.findCollapseCause(nodeId); }
  predictNext(horizon = 10)   { return this.predictiveMemory.predictAll(horizon); }
  recurringPatterns()         { return this.longTermMemory.recurringStates(); }
  importantMoments(n = 10)    { return this.longTermMemory.topN(n); }
  rewindTo(tick, radius = 30) { return this.temporalIndex.window(tick, radius); }

  memoryReport() {
    return {
      shortTerm:   this.memoryStore.getState(),
      temporal:    this.temporalIndex.getState(),
      compression: this.memoryCompression.getState(),
      causal:      this.causalGraph.getState(),
      longTerm:    this.longTermMemory.getState(),
      predictive:  this.predictiveMemory.getState(),
      collapseLog: this.collapseLog.getState(),
    };
  }

  // ── Conceptual space API ──────────────────────
  semanticNeighbours(nodeId, k = 8) {
    return this.conceptSpace.nearestNeighbours(nodeId, this.aliveNodes(), k);
  }
  semanticMap()      { return this.conceptSpace.project2D(this.aliveNodes()); }
  semanticClusters() { return this.conceptSpace.clusteredNodes(this.aliveNodes()); }

  // ── Reasoning API ─────────────────────────────
  topReasoningPatterns() { return this.reasoningGraph.patternSummaries(); }
  tryPatternMatch(queryText) {
    return this.reasoningGraph.tryFastPath(
      queryText,
      this.aliveNodes().filter(n => n.activationScore > 0.1)
    );
  }

  systemReport() {
    return {
      graph:        { nodes: this.aliveNodes().length, tick: this.tick },
      memory:       this.memoryReport(),
      geometry:     this.conceptSpace.getState(),
      reasoning:    this.reasoningGraph.getState(),
      connectivity: this.adaptiveConnectivity.getState(this.graph),
      diagnostics:  this.diagnostics.snapshot(),
      prediction:   this.predictiveMemory.getState(),
      stability:    this.stabilityAnalyzer.report(),
      phase:        this.phaseDetector.report(),
      learning:     this.learningCurve.report(),
      logger:       this.logger.getState(),
      metrics:      this.metricsEngine?.getMetrics?.() ?? {},
    };
  }

  // ══════════════════════════════════════════════
  // NODE REGISTRATION
  // ══════════════════════════════════════════════

  _registerNode(node) {
    this._nodes.push(node);
    this._nodeMap.set(node.id, node);
    this.graph.addNode(node.id);
    this.graph.autoConnect(node, this.aliveNodes());
    if (!this.embeddingStore.has(node.id)) {
      node.embedding
        ? this.embeddingStore.set(node.id, node.embedding)
        : this.embeddingStore.setRandom(node.id);
    }
    this._birthsThisTick = (this._birthsThisTick ?? 0) + 1;
    this.causalGraph?.recordNodeBirth(node.id, node.label ?? '', this.tick ?? 0);
    this.conceptSpace?.register(node.id, node.embedding ?? null);
  }

  _removeCollapsed(collapsed) {
    for (const node of collapsed) {
      this._nodeMap.delete(node.id);
      this.graph.removeNode(node.id);
      this.embeddingStore.remove(node.id);
      this.conceptSpace.remove(node.id);
    }
    if (this._nodes.filter(n => !n.alive).length > 20) {
      this._nodes = this._nodes.filter(n => n.alive);
    }
  }

  // ══════════════════════════════════════════════
  // STATE BUILDERS
  // ══════════════════════════════════════════════

  _buildSystemState() {
    const alive = this.aliveNodes();
    return {
      tick:         this.tick,
      nodes:        alive,
      entropy:      this.entropyField.S,
      totalEnergy:  this.energyField.totalEnergy,
      collapseRate: this.collapseLog.recentRate(),
      information:  this.informationFlow.systemInformation,
    };
  }

  _buildStatsState(S, J, alive) {
    const topNode = this.retrievalEngine.lastResults?.[0]?.node;
    return {
      nodeCount:      alive.length,
      entropy:        S,
      entropyRegime:  this.entropyField.regime,
      tick:           this.tick,
      collapseRate:   this.collapseLog.recentRate(),
      avgStrength:    alive.length > 0
        ? alive.reduce((s, n) => s + n.strength, 0) / alive.length : 0,
      objective:      J,
      topNodeLabel:   topNode?.label || topNode?.id || '—',
      queryActive:    this.queryActivation.isActive,
      queryText:      this.queryActivation.queryText,
      evoEnabled:     this.metaOptimizer.enabled,
      evoStepCount:   this.metaOptimizer.stepCount,
      energyOverload: this.energyField.overload,
      params:         this.parameterField.current,
      metrics:        this.metricsEngine?.getMetrics?.() ?? {},
    };
  }
}