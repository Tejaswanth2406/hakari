/**
 * HAKARI v3 — memory/EventCausalityGraph.js
 * ─────────────────────────────────────────────
 * Tracks cause-effect relationships between events.
 * Detects, reinforces, and decays causal chains.
 *
 * Graph structure:
 *   nodes = event records
 *   edges = { causeId → effectId → weight (0–1) }
 *
 * Features:
 *   - Automatic causal link detection via
 *     temporal proximity + type co-occurrence
 *   - Weight reinforcement on repeated patterns
 *   - Exponential decay on unused links
 *   - Causal chain traversal (multi-hop)
 *   - Node birth / collapse / spike recording
 *   - Strong link extraction for reporting
 * ─────────────────────────────────────────────
 */

export class EventCausalityGraph {

  constructor(opts = {}) {
    // nodes: id → event record
    this._nodes      = new Map();

    // edges: causeId → Map(effectId → weight)
    this._edges      = new Map();

    // Reverse index: effectId → Set(causeIds)
    this._reverse    = new Map();

    // Recent event buffer for auto-linking (sliding window)
    this._recent     = [];
    this._windowMs   = opts.windowMs   ?? 500;   // auto-link window
    this._decayRate  = opts.decayRate  ?? 0.995; // per decay() call
    this._minWeight  = opts.minWeight  ?? 0.02;  // prune below this
    this._maxNodes   = opts.maxNodes   ?? 2000;

    // Event counter
    this._eventCount = 0;
  }

  // ══════════════════════════════════════════════
  // RECORDING  (called by Hakari tick loop)
  // ══════════════════════════════════════════════

  recordNodeBirth(id, label, tick) {
    this._addEvent({ id: `birth:${id}`, type: 'birth', nodeId: id, label, tick });
  }

  recordCollapse(id, label, tick, reason, lambda) {
    const eid = `collapse:${id}:${tick}`;
    this._addEvent({ id: eid, type: 'collapse', nodeId: id, label, tick, reason, lambda });
    // Auto-link to recent birth of same node
    const birthId = `birth:${id}`;
    if (this._nodes.has(birthId)) {
      this.reinforce(birthId, eid, 0.6);
    }
  }

  recordEntropySpike(tick, delta, S) {
    if (Math.abs(delta) < 0.02) return;
    this._addEvent({ id: `entropy:${tick}`, type: 'entropySpike', tick, delta, S });
  }

  recordEnergyOverload(tick, totalEnergy) {
    this._addEvent({ id: `energy:${tick}`, type: 'energyOverload', tick, totalEnergy });
  }

  recordActivationBurst(tick, queryText, maxActivation) {
    this._addEvent({ id: `query:${tick}`, type: 'query', tick, queryText, maxActivation });
  }

  recordObjectiveJump(tick, delta, J) {
    if (Math.abs(delta) < 0.005) return;
    this._addEvent({ id: `obj:${tick}`, type: 'objectiveJump', tick, delta, J });
  }

  // ══════════════════════════════════════════════
  // GRAPH OPERATIONS
  // ══════════════════════════════════════════════

  addEvent(event) {
    this._addEvent(event);
  }

  linkCause(causeId, effectId, weight = 0.5) {
    if (!this._nodes.has(causeId) || !this._nodes.has(effectId)) return;
    this._setEdge(causeId, effectId, weight);
  }

  reinforce(causeId, effectId, amount = 0.1) {
    const current = this._getEdge(causeId, effectId) ?? 0;
    const next    = Math.min(1, current + amount * (1 - current)); // asymptotic
    this._setEdge(causeId, effectId, next);
  }

  getCauses(effectId, minWeight = 0.1) {
    const causes = this._reverse.get(effectId);
    if (!causes) return [];
    return [...causes]
      .map(causeId => ({ causeId, weight: this._getEdge(causeId, effectId) ?? 0 }))
      .filter(e => e.weight >= minWeight)
      .sort((a, b) => b.weight - a.weight);
  }

  getEffects(causeId, minWeight = 0.1) {
    const effects = this._edges.get(causeId);
    if (!effects) return [];
    return [...effects.entries()]
      .map(([effectId, weight]) => ({ effectId, weight }))
      .filter(e => e.weight >= minWeight)
      .sort((a, b) => b.weight - a.weight);
  }

  /**
   * Find causal chain for a collapsed node.
   * Traverses reverse edges up to depth 4.
   */
  findCollapseCause(nodeId, depth = 4) {
    const collapseKey = [...this._nodes.keys()]
      .filter(k => k.startsWith(`collapse:${nodeId}:`))
      .sort()
      .pop();
    if (!collapseKey) return [];
    return this._traceBack(collapseKey, depth);
  }

  _traceBack(id, depth, visited = new Set()) {
    if (depth === 0 || visited.has(id)) return [];
    visited.add(id);
    const causes = this.getCauses(id, 0.05);
    const chain  = [{ id, event: this._nodes.get(id) }];
    for (const { causeId } of causes.slice(0, 3)) {
      chain.push(...this._traceBack(causeId, depth - 1, visited));
    }
    return chain;
  }

  // ══════════════════════════════════════════════
  // DECAY
  // ══════════════════════════════════════════════

  decay() {
    const toPrune = [];
    for (const [causeId, effects] of this._edges) {
      for (const [effectId, weight] of effects) {
        const next = weight * this._decayRate;
        if (next < this._minWeight) {
          toPrune.push([causeId, effectId]);
        } else {
          effects.set(effectId, next);
        }
      }
    }
    for (const [c, e] of toPrune) this._removeEdge(c, e);
  }

  // ══════════════════════════════════════════════
  // STATS
  // ══════════════════════════════════════════════

  strongestLinks(n = 10) {
    const links = [];
    for (const [causeId, effects] of this._edges) {
      for (const [effectId, weight] of effects) {
        links.push({ causeId, effectId, weight });
      }
    }
    return links.sort((a, b) => b.weight - a.weight).slice(0, n);
  }

  clear() {
    this._nodes.clear();
    this._edges.clear();
    this._reverse.clear();
    this._recent  = [];
    this._eventCount = 0;
  }

  getState() {
    let edgeCount = 0;
    for (const effects of this._edges.values()) edgeCount += effects.size;
    return {
      nodes:  this._nodes.size,
      edges:  edgeCount,
      events: this._eventCount,
    };
  }

  // ══════════════════════════════════════════════
  // PRIVATE
  // ══════════════════════════════════════════════

  _addEvent(event) {
    if (!event?.id) return;
    this._nodes.set(event.id, { ...event, addedAt: Date.now() });
    this._eventCount++;

    // Auto-link to recent events in window
    const now    = Date.now();
    const cutoff = now - this._windowMs;
    this._recent = this._recent.filter(e => e.ts >= cutoff);

    for (const recent of this._recent) {
      const w = this._autoLinkWeight(recent.event, event);
      if (w > 0) this.reinforce(recent.event.id, event.id, w);
    }
    this._recent.push({ ts: now, event });

    // Prune if over capacity
    if (this._nodes.size > this._maxNodes) {
      const oldest = this._nodes.keys().next().value;
      this._nodes.delete(oldest);
      this._edges.delete(oldest);
      this._reverse.delete(oldest);
    }
  }

  _autoLinkWeight(cause, effect) {
    // Same-type events rarely cause each other
    if (cause.type === effect.type) return 0.05;
    // Known causal patterns
    const PATTERNS = {
      'entropySpike→collapse':    0.35,
      'energyOverload→collapse':  0.40,
      'query→entropySpike':       0.20,
      'objectiveJump→collapse':   0.15,
      'birth→collapse':           0.10,
    };
    const key = `${cause.type}→${effect.type}`;
    return PATTERNS[key] ?? 0.03;
  }

  _setEdge(causeId, effectId, weight) {
    if (!this._edges.has(causeId)) this._edges.set(causeId, new Map());
    this._edges.get(causeId).set(effectId, weight);
    if (!this._reverse.has(effectId)) this._reverse.set(effectId, new Set());
    this._reverse.get(effectId).add(causeId);
  }

  _getEdge(causeId, effectId) {
    return this._edges.get(causeId)?.get(effectId) ?? null;
  }

  _removeEdge(causeId, effectId) {
    this._edges.get(causeId)?.delete(effectId);
    this._reverse.get(effectId)?.delete(causeId);
  }
}