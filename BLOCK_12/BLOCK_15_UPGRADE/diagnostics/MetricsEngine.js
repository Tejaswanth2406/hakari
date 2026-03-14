/**
 * HAKARI v3 â€” diagnostics/MetricsEngine.js
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Block 15 â€” Research-Grade Evaluation Metrics.
 *
 * Computes seven cognitive graph metrics periodically
 * (default every 200 ticks) to avoid per-tick overhead.
 *
 * All metrics âˆˆ [0, 1] unless stated otherwise.
 * All safe for graphs up to 1500 nodes.
 *
 * Metrics:
 *   1. Concept Stability Index (CSI)
 *      Mean coefficient of variation of node strength
 *      over a rolling window. High = stable concepts.
 *
 *   2. Reasoning Efficiency (RE)
 *      Ratio of high-activation retrievals to total
 *      activations. High = effective query routing.
 *
 *   3. Knowledge Density (KD)
 *      Mean edge weight per alive node, normalised
 *      to graph capacity. High = rich interconnection.
 *
 *   4. Semantic Coherence Score (SCS)
 *      Mean cosine similarity between connected node
 *      embedding pairs. High = semantically meaningful edges.
 *      Sampled (max 300 edges) for performance.
 *
 *   5. Cognitive Energy Distribution (CED)
 *      1 âˆ’ Gini coefficient of node energy values.
 *      High = balanced energy distribution (healthy ecology).
 *
 *   6. Exploration Ratio (ER)
 *      Fraction of nodes activated at least once in
 *      the last compute window. High = broad exploration.
 *
 *   7. Graph Plasticity Score (GPS)
 *      Rate of edge weight change per tick over the
 *      window. High = rapidly reconfiguring topology.
 *
 * Public API:
 *   metricsEngine.tick(hakari)   â€” call every tick
 *   metricsEngine.getMetrics()   â€” returns all 7 metrics + meta
 *   metricsEngine.getHistory(k)  â€” rolling history for metric k
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

import { isFiniteNum }      from '../../../BLOCK1/numerics.js';
import { cosineSimilarity } from '../../../BLOCK1/math.js';
import { DIAGNOSTICS }      from '../core/config.js';

const MAX_SIMILARITY_SAMPLE = 300;

export class MetricsEngine {

  /**
   * @param {object} [opts]
   * @param {number}  opts.computeEvery   â€” ticks between full recompute (default 200)
   * @param {number}  opts.historyBuffer  â€” rolling history length per metric (default same as DIAGNOSTICS)
   */
  constructor(opts = {}) {
    this.computeEvery = opts.computeEvery  ?? 200;
    this._bufferSize  = opts.historyBuffer ?? DIAGNOSTICS.CURVE_BUFFER_SIZE;

    this._tickCount  = 0;
    this._lastTick   = 0;   // hakari.tick when metrics were last computed

    // Current metric values
    this._metrics = {
      conceptStabilityIndex:       0,
      reasoningEfficiency:         0,
      knowledgeDensity:            0,
      semanticCoherenceScore:      0,
      cognitiveEnergyDistribution: 0,
      explorationRatio:            0,
      graphPlasticityScore:        0,
    };

    // Rolling history per metric
    this._history = {};
    for (const k of Object.keys(this._metrics)) {
      this._history[k] = [];
    }

    // Internal state for windowed metrics
    this._prevEdgeWeightSum  = 0;
    this._prevEdgeCount      = 0;
    this._activatedThisWindow = new Set();

    // Per-node strength history for CSI (Map<nodeId, number[]>)
    this._strengthHistory = new Map();
  }

  // â”€â”€ TICK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Call every tick. Only recomputes metrics every
   * this.computeEvery ticks.
   *
   * @param {object} hakari â€” Hakari master instance
   */
  tick(hakari) {
    this._tickCount++;
    this._trackWindow(hakari);

    if (this._tickCount % this.computeEvery !== 0) return;

    this._compute(hakari);
    this._lastTick = hakari.tick ?? this._tickCount;
  }

  // â”€â”€ PUBLIC API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Returns all 7 metrics + metadata.
   * @returns {object}
   */
  getMetrics() {
    return {
      ...this._metrics,
      lastComputedTick: this._lastTick,
      computeEvery:     this.computeEvery,
    };
  }

  /**
   * Rolling history array for a single metric key.
   * @param {string} key â€” e.g. 'conceptStabilityIndex'
   * @returns {number[]}
   */
  getHistory(key) {
    return [...(this._history[key] ?? [])];
  }

  /**
   * All histories as a plain object (for diagnostics panel).
   * @returns {object}
   */
  getAllHistories() {
    const out = {};
    for (const k of Object.keys(this._history)) out[k] = this.getHistory(k);
    return out;
  }

  // â”€â”€ WINDOWED TRACKING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Called every tick to accumulate data for windowed metrics.
   * Lightweight: only tracks activation and edge deltas.
   */
  _trackWindow(hakari) {
    const nodes = hakari.aliveNodes?.() ?? [];

    // Exploration: track nodes that activated above floor
    for (const node of nodes) {
      if (isFiniteNum(node.activationScore) && node.activationScore > 0.05) {
        this._activatedThisWindow.add(node.id);
      }
    }

    // Strength history for CSI (downsample: only sample 1/5 nodes per tick)
    const step = Math.max(1, Math.floor(nodes.length / 100));
    for (let i = 0; i < nodes.length; i += step) {
      const node = nodes[i];
      if (!node || !node.alive) continue;
      if (!this._strengthHistory.has(node.id)) {
        this._strengthHistory.set(node.id, []);
      }
      const buf = this._strengthHistory.get(node.id);
      buf.push(isFiniteNum(node.strength) ? node.strength : 0);
      if (buf.length > this.computeEvery) buf.shift();
    }
  }

  // â”€â”€ COMPUTE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _compute(hakari) {
    const nodes   = hakari.aliveNodes?.() ?? [];
    const graph   = hakari.networkEngine?.graph ?? null;
    const store   = hakari.knowledgeEngine?.embeddingStore ?? null;
    const qState  = hakari.knowledgeEngine?.queryActivation?.getState?.() ?? {};

    if (nodes.length === 0) return;

    // 1. Concept Stability Index
    this._metrics.conceptStabilityIndex = this._computeCSI(nodes);

    // 2. Reasoning Efficiency
    this._metrics.reasoningEfficiency = this._computeRE(qState, nodes);

    // 3. Knowledge Density
    this._metrics.knowledgeDensity = this._computeKD(nodes, graph);

    // 4. Semantic Coherence Score
    this._metrics.semanticCoherenceScore = this._computeSCS(nodes, graph, store);

    // 5. Cognitive Energy Distribution
    this._metrics.cognitiveEnergyDistribution = this._computeCED(nodes);

    // 6. Exploration Ratio
    this._metrics.explorationRatio = this._computeER(nodes);

    // 7. Graph Plasticity Score
    this._metrics.graphPlasticityScore = this._computeGPS(nodes, graph);

    // Record histories
    for (const k of Object.keys(this._metrics)) {
      const buf = this._history[k];
      buf.push(this._metrics[k]);
      if (buf.length > this._bufferSize) buf.shift();
    }

    // Reset window accumulators
    this._activatedThisWindow.clear();
    this._strengthHistory.clear();
  }

  // â”€â”€ METRIC IMPLEMENTATIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * 1. Concept Stability Index
   * 1 âˆ’ mean(CoV) where CoV = std/mean of recent strength history.
   * Low CoV â†’ stable concept. Returns 1 if no history yet.
   */
  _computeCSI(nodes) {
    const covs = [];
    for (const [, buf] of this._strengthHistory.entries()) {
      if (buf.length < 3) continue;
      const mean = buf.reduce((s, v) => s + v, 0) / buf.length;
      if (mean < 1e-9) continue;
      const variance = buf.reduce((s, v) => s + (v - mean) ** 2, 0) / buf.length;
      covs.push(Math.sqrt(variance) / mean);
    }
    if (covs.length === 0) return 0.5;
    const meanCoV = covs.reduce((s, v) => s + v, 0) / covs.length;
    return Math.min(1, Math.max(0, 1 - meanCoV));
  }

  /**
   * 2. Reasoning Efficiency
   * activatedCount / aliveCount, normalised and smoothed.
   * High = a query activates a meaningful fraction of the graph.
   */
  _computeRE(qState, nodes) {
    if (!qState.isActive || nodes.length === 0) return 0;
    const activated = isFiniteNum(qState.activatedCount) ? qState.activatedCount : 0;
    // Efficient reasoning = 10â€“30% activation. Peak at 20%.
    const ratio     = activated / nodes.length;
    // Bell curve centered at 0.2
    const peak = Math.exp(-((ratio - 0.2) ** 2) / (2 * 0.1 ** 2));
    return Math.min(1, Math.max(0, peak));
  }

  /**
   * 3. Knowledge Density
   * Mean edge weight per node, normalised to [0,1] via
   * expected max (âˆšN Â· avgWeight).
   */
  _computeKD(nodes, graph) {
    if (!graph || nodes.length === 0) return 0;
    let totalWeight = 0;
    let edgeCount   = 0;

    for (const edge of graph.getAllEdges?.() ?? []) {
      const w = isFiniteNum(edge.weight) ? edge.weight : 0;
      totalWeight += w;
      edgeCount++;
    }

    if (edgeCount === 0) return 0;
    const avgWeight = totalWeight / edgeCount;
    // Normalise: expected edges â‰ˆ âˆšN per node (autoConnect cap)
    const expectedEdges = Math.sqrt(nodes.length) * nodes.length / 2;
    const densityRaw    = (edgeCount * avgWeight) / Math.max(expectedEdges, 1);
    return Math.min(1, Math.max(0, densityRaw));
  }

  /**
   * 4. Semantic Coherence Score
   * Mean cosine similarity of connected node embedding pairs.
   * Sampled for performance (max MAX_SIMILARITY_SAMPLE edges).
   */
  _computeSCS(nodes, graph, store) {
    if (!graph || !store || nodes.length === 0) return 0;

    let sum   = 0;
    let count = 0;

    const edges = [];
    if (graph.getAllEdges) {
      for (const e of graph.getAllEdges()) {
        edges.push(e);
        if (edges.length >= MAX_SIMILARITY_SAMPLE) break;
      }
    }

    if (edges.length === 0) return 0;

    for (const { a, b } of edges) {
      if (!store.has(a) || !store.has(b)) continue;
      const sim = cosineSimilarity(
        Array.from(store.get(a)),
        Array.from(store.get(b))
      );
      if (!isFiniteNum(sim)) continue;
      // Shift from [-1,1] â†’ [0,1]
      sum += (sim + 1) / 2;
      count++;
    }

    return count > 0 ? sum / count : 0;
  }

  /**
   * 5. Cognitive Energy Distribution
   * 1 âˆ’ Gini(energy values). Gini=0 â†’ perfect equality.
   * High CED = balanced energy = healthy ecology.
   */
  _computeCED(nodes) {
    const energies = nodes
      .filter(n => n.alive)
      .map(n => isFiniteNum(n.energy) ? n.energy : 0)
      .sort((a, b) => a - b);

    if (energies.length === 0) return 0;
    const n    = energies.length;
    const sum  = energies.reduce((s, v) => s + v, 0);
    if (sum < 1e-9) return 0;

    // Gini = (2 Î£ iÂ·xáµ¢) / (nÂ·Î£xáµ¢) âˆ’ (n+1)/n
    let weightedSum = 0;
    for (let i = 0; i < n; i++) weightedSum += (i + 1) * energies[i];
    const gini = (2 * weightedSum) / (n * sum) - (n + 1) / n;
    return Math.min(1, Math.max(0, 1 - gini));
  }

  /**
   * 6. Exploration Ratio
   * Fraction of alive nodes activated at least once
   * during the last compute window.
   */
  _computeER(nodes) {
    if (nodes.length === 0) return 0;
    const alive    = nodes.filter(n => n.alive).length;
    const explored = nodes.filter(n => n.alive && this._activatedThisWindow.has(n.id)).length;
    return alive > 0 ? explored / alive : 0;
  }

  /**
   * 7. Graph Plasticity Score
   * Fractional change in total edge weight since last window.
   * Normalised to [0,1] via tanh.
   */
  _computeGPS(nodes, graph) {
    if (!graph) return 0;

    let totalWeight = 0;
    let edgeCount   = 0;

    for (const edge of graph.getAllEdges?.() ?? []) {
      totalWeight += isFiniteNum(edge.weight) ? edge.weight : 0;
      edgeCount++;
    }

    const prevSum   = this._prevEdgeWeightSum;
    const delta     = Math.abs(totalWeight - prevSum);
    const base      = Math.max(prevSum, totalWeight, 1e-9);
    const rawChange = delta / (base * this.computeEvery);  // per-tick rate

    this._prevEdgeWeightSum = totalWeight;
    this._prevEdgeCount     = edgeCount;

    return Math.min(1, Math.max(0, Math.tanh(rawChange * 50)));
  }
}

