/**
 * HAKARI v3 — knowledge/KnowledgeDiffusion.js
 * ─────────────────────────────────────────────
 * Cognitive knowledge diffusion engine.
 * Spreads activation across a semantic graph of
 * events, concepts, memories, and patterns.
 *
 * Algorithm: Spreading Activation (Collins & Loftus)
 *   activation_next = activation × edge_weight × decay
 *   decay    = 0.85 per hop
 *   max hops = 5
 *   min act  = 0.01
 *
 * Capacity: 3000 nodes, 20000 edges
 * Tick rate: ~30/sec — diffuse() runs in O(E) bounded
 *
 * Integration:
 *   MemoryStore        → activate on new memory add
 *   EventCausalityGraph→ connect linked events
 *   PredictiveMemory   → reinforce predicted patterns
 * ─────────────────────────────────────────────
 */

export class KnowledgeDiffusion {

  constructor(opts = {}) {
    this._decay         = opts.decay         ?? 0.85;
    this._maxDepth      = opts.maxDepth      ?? 5;
    this._minActivation = opts.minActivation ?? 0.01;
    this._maxNodes      = opts.maxNodes      ?? 3000;
    this._maxEdges      = opts.maxEdges      ?? 20000;

    // nodes: id → KnowledgeNode
    this._nodes         = new Map();

    // adjacency: nodeId → Map(neighborId → weight)
    this._edges         = new Map();

    // reverse index: nodeId → Set(neighborId) for bidirectional lookup
    this._reverse       = new Map();

    // Activation queue for this tick: id → pending delta
    this._queue         = new Map();

    // Edge count tracker
    this._edgeCount     = 0;

    // Diffusion history for stabilisation detection
    this._prevTotalAct  = 0;
    this._stableCount   = 0;

    // Stats
    this._totalDiffusions = 0;
    this._totalActivations = 0;
  }

  // ══════════════════════════════════════════════
  // GRAPH CONSTRUCTION
  // ══════════════════════════════════════════════

  /**
   * Add a knowledge node.
   * @param {object} node — { id, type, activation?, strength?, label? }
   */
  addNode(node) {
    if (!node?.id) return;
    if (this._nodes.size >= this._maxNodes) this._evictWeakest();

    const existing = this._nodes.get(node.id);
    if (existing) {
      // Reinforce if already present
      existing.strength   = Math.min(1, existing.strength + 0.05);
      existing.accessCount++;
      return existing;
    }

    const n = {
      id:          node.id,
      type:        node.type       ?? 'concept',
      activation:  node.activation ?? 0,
      strength:    node.strength   ?? 0.5,
      label:       node.label      ?? node.id,
      accessCount: 0,
      createdAt:   Date.now(),
    };
    this._nodes.set(n.id, n);
    this._edges.set(n.id, new Map());
    this._reverse.set(n.id, new Set());
    return n;
  }

  /**
   * Create or strengthen a directed edge A → B.
   * Also creates B → A with half weight (associative).
   * @param {string} nodeA
   * @param {string} nodeB
   * @param {number} weight  0.0 – 1.0
   */
  connect(nodeA, nodeB, weight = 0.5) {
    if (!this._nodes.has(nodeA)) this.addNode({ id: nodeA });
    if (!this._nodes.has(nodeB)) this.addNode({ id: nodeB });
    if (this._edgeCount >= this._maxEdges) this._pruneWeakEdges();

    const w = Math.max(0, Math.min(1, weight));
    this._setEdge(nodeA, nodeB, w);
    // Bidirectional with reduced reverse weight
    const revW = this._getEdge(nodeB, nodeA) ?? 0;
    this._setEdge(nodeB, nodeA, Math.max(revW, w * 0.5));
  }

  // ══════════════════════════════════════════════
  // ACTIVATION
  // ══════════════════════════════════════════════

  /**
   * Activate a node when new knowledge appears.
   * Queues spreading for next diffuse() call.
   * @param {string} nodeId
   * @param {number} strength  initial activation 0–1
   */
  activate(nodeId, strength = 1.0) {
    if (!this._nodes.has(nodeId)) this.addNode({ id: nodeId });
    const node = this._nodes.get(nodeId);
    node.activation = Math.min(1, node.activation + strength);
    this._queue.set(nodeId, (this._queue.get(nodeId) ?? 0) + strength);
    this._totalActivations++;
  }

  /**
   * Reinforce a node's strength (not just activation).
   * @param {string} nodeId
   * @param {number} value  amount to add (0–1)
   */
  reinforce(nodeId, value = 0.1) {
    const node = this._nodes.get(nodeId);
    if (!node) return;
    node.strength    = Math.min(1, node.strength + value * (1 - node.strength));
    node.accessCount++;
    // Reinforcing also fires a small activation
    this.activate(nodeId, value * 0.3);
  }

  // ══════════════════════════════════════════════
  // DIFFUSION  — call once per tick
  // ══════════════════════════════════════════════

  /**
   * Run one full diffusion pass across queued activations.
   * BFS-bounded to maxDepth hops.
   */
  diffuse() {
    if (!this._queue.size) return;

    const frontier = new Map(this._queue);
    this._queue.clear();

    // BFS spreading
    for (let depth = 0; depth < this._maxDepth; depth++) {
      if (!frontier.size) break;
      const next = new Map();

      for (const [nodeId, act] of frontier) {
        if (act < this._minActivation) continue;
        const outEdges = this._edges.get(nodeId);
        if (!outEdges?.size) continue;

        for (const [neighborId, weight] of outEdges) {
          const spreadAct = act * weight * this._decay;
          if (spreadAct < this._minActivation) continue;

          const neighbor = this._nodes.get(neighborId);
          if (!neighbor) continue;

          // Apply activation
          neighbor.activation = Math.min(1, neighbor.activation + spreadAct);

          // Accumulate for next frontier
          next.set(neighborId, (next.get(neighborId) ?? 0) + spreadAct);

          // Reinforce edge weight slightly when activation flows through
          const currentW = this._getEdge(nodeId, neighborId) ?? weight;
          this._setEdge(nodeId, neighborId, Math.min(1, currentW + spreadAct * 0.002));
        }
      }

      // Replace frontier with next layer
      frontier.clear();
      for (const [id, act] of next) frontier.set(id, act);
    }

    this._totalDiffusions++;
    this._checkStabilisation();
  }

  /**
   * Spread activation outward from a single node.
   * Useful for targeted queries or event injection.
   * @param {string} nodeId
   * @param {number} initialAct
   */
  spreadFrom(nodeId, initialAct = 1.0) {
    this.activate(nodeId, initialAct);
    this.diffuse();
  }

  // ══════════════════════════════════════════════
  // DECAY  — call every N ticks to cool the graph
  // ══════════════════════════════════════════════

  /**
   * Decay all node activations toward zero.
   * Call less frequently than diffuse() — e.g. every 3 ticks.
   * @param {number} rate  multiplier per call (default 0.92)
   */
  decay(rate = 0.92) {
    for (const node of this._nodes.values()) {
      node.activation *= rate;
      if (node.activation < this._minActivation) node.activation = 0;
    }
  }

  // ══════════════════════════════════════════════
  // QUERY
  // ══════════════════════════════════════════════

  /**
   * Returns all nodes with activation >= threshold,
   * sorted by activation descending.
   */
  getActiveNodes(threshold = 0.1) {
    return [...this._nodes.values()]
      .filter(n => n.activation >= threshold)
      .sort((a, b) => b.activation - a.activation);
  }

  /**
   * Get top-N most activated nodes.
   */
  topActive(n = 10) {
    return this.getActiveNodes(0).slice(0, n);
  }

  /**
   * Get all direct neighbors of a node, sorted by edge weight.
   */
  neighbors(nodeId, minWeight = 0.05) {
    const edges = this._edges.get(nodeId);
    if (!edges) return [];
    return [...edges.entries()]
      .filter(([, w]) => w >= minWeight)
      .sort((a, b) => b[1] - a[1])
      .map(([id, weight]) => ({ node: this._nodes.get(id), weight }))
      .filter(e => e.node != null);
  }

  /**
   * Find the activation path between two nodes (BFS).
   * Returns array of node ids or null if not reachable.
   */
  findPath(fromId, toId, maxHops = 5) {
    if (!this._nodes.has(fromId) || !this._nodes.has(toId)) return null;
    const visited = new Set([fromId]);
    const queue   = [{ id: fromId, path: [fromId] }];

    while (queue.length) {
      const { id, path } = queue.shift();
      if (path.length > maxHops) continue;
      const edges = this._edges.get(id);
      if (!edges) continue;
      for (const [neighborId] of edges) {
        if (neighborId === toId) return [...path, toId];
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push({ id: neighborId, path: [...path, neighborId] });
        }
      }
    }
    return null;
  }

  getNode(id) { return this._nodes.get(id) ?? null; }

  // ══════════════════════════════════════════════
  // INTEGRATION HELPERS
  // ══════════════════════════════════════════════

  /**
   * Called by MemoryStore when a new memory is added.
   * Activates matching knowledge node and connects
   * to recent related nodes.
   */
  onMemoryAdded(memory) {
    if (!memory?.id) return;
    const nodeId = `mem:${memory.type ?? 'generic'}`;
    if (!this._nodes.has(nodeId)) {
      this.addNode({ id: nodeId, type: 'concept', label: memory.type });
    }
    this.activate(nodeId, memory.importance ?? 0.5);

    // Connect to specific memory node
    this.addNode({ id: memory.id, type: 'event', label: memory.type });
    this.connect(nodeId, memory.id, memory.importance ?? 0.5);
  }

  /**
   * Called by EventCausalityGraph when a causal link is found.
   * Connects and reinforces the two concept nodes.
   */
  onCausalLink(causeType, effectType, weight) {
    const cId = `concept:${causeType}`;
    const eId = `concept:${effectType}`;
    this.addNode({ id: cId, type: 'concept', label: causeType });
    this.addNode({ id: eId, type: 'concept', label: effectType });
    this.connect(cId, eId, weight);
    this.reinforce(cId, weight * 0.1);
  }

  /**
   * Called by PredictiveMemory when a pattern is learned.
   */
  onPatternLearned(patternKey, confidence) {
    const id = `pattern:${patternKey}`;
    this.addNode({ id, type: 'pattern', label: patternKey, strength: confidence });
    this.activate(id, confidence * 0.5);
  }

  // ══════════════════════════════════════════════
  // STABILISATION
  // ══════════════════════════════════════════════

  _checkStabilisation() {
    let totalAct = 0;
    for (const n of this._nodes.values()) totalAct += n.activation;
    const delta = Math.abs(totalAct - this._prevTotalAct);
    this._stableCount = delta < 0.01 ? this._stableCount + 1 : 0;
    this._prevTotalAct = totalAct;
  }

  /** True if the graph has reached activation equilibrium */
  isStable() { return this._stableCount >= 5; }

  // ══════════════════════════════════════════════
  // STATS
  // ══════════════════════════════════════════════

  stats() {
    const active = this.getActiveNodes(this._minActivation);
    let totalAct = 0;
    for (const n of this._nodes.values()) totalAct += n.activation;
    return {
      nodeCount:         this._nodes.size,
      edgeCount:         this._edgeCount,
      activeNodes:       active.length,
      averageActivation: this._nodes.size > 0
        ? (totalAct / this._nodes.size).toFixed(4) : '0',
      totalDiffusions:   this._totalDiffusions,
      totalActivations:  this._totalActivations,
      stable:            this.isStable(),
      queueSize:         this._queue.size,
    };
  }

  getState() { return this.stats(); }

  clear() {
    this._nodes.clear();
    this._edges.clear();
    this._reverse.clear();
    this._queue.clear();
    this._edgeCount      = 0;
    this._stableCount    = 0;
    this._prevTotalAct   = 0;
    this._totalDiffusions   = 0;
    this._totalActivations  = 0;
  }

  // ══════════════════════════════════════════════
  // PRIVATE
  // ══════════════════════════════════════════════

  _setEdge(a, b, w) {
    const edges = this._edges.get(a);
    if (!edges) return;
    const isNew = !edges.has(b);
    edges.set(b, w);
    this._reverse.get(b)?.add(a);
    if (isNew) this._edgeCount++;
  }

  _getEdge(a, b) {
    return this._edges.get(a)?.get(b) ?? null;
  }

  _pruneWeakEdges() {
    // Remove the weakest 5% of all edges
    const all = [];
    for (const [fromId, edges] of this._edges) {
      for (const [toId, w] of edges) all.push({ fromId, toId, w });
    }
    all.sort((a, b) => a.w - b.w);
    const remove = Math.ceil(all.length * 0.05);
    for (let i = 0; i < remove; i++) {
      const { fromId, toId } = all[i];
      this._edges.get(fromId)?.delete(toId);
      this._reverse.get(toId)?.delete(fromId);
      this._edgeCount--;
    }
  }

  _evictWeakest() {
    // Remove weakest 5% of nodes
    const sorted = [...this._nodes.values()]
      .sort((a, b) => (a.strength * a.activation) - (b.strength * b.activation));
    const remove = Math.ceil(sorted.length * 0.05);
    for (let i = 0; i < remove; i++) {
      const id = sorted[i].id;
      // Remove all edges for this node
      const out = this._edges.get(id);
      if (out) {
        for (const toId of out.keys()) {
          this._reverse.get(toId)?.delete(id);
          this._edgeCount--;
        }
      }
      const rev = this._reverse.get(id);
      if (rev) {
        for (const fromId of rev) {
          this._edges.get(fromId)?.delete(id);
          this._edgeCount--;
        }
      }
      this._nodes.delete(id);
      this._edges.delete(id);
      this._reverse.delete(id);
    }
  }
}