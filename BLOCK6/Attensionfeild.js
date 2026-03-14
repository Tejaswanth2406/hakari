/**
 * HAKARI v3 â€” intelligence/AttentionField.js
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Computes query activation and attention scores.
 * New Hakari module.
 *
 * Two attention mechanisms:
 *
 * 1. Query Attention (top-down, goal-directed):
 *    A_i = Ï„ Â· H_i Â· Sim(q, v_i)
 *    Activates nodes semantically similar to a query.
 *
 * 2. Spatial/Structural Attention (bottom-up):
 *    Att_i â† f(connectivity, strength, memoryTrace)
 *    Highlights nodes that are structurally salient.
 *
 * Also records activations on nodes (activationCount,
 * lastActivatedAt, memoryTrace bump) so the memory
 * system can track recency.
 *
 * Feeds:
 *   - node.activationScore â†’ HUIE Ï†Â·A term
 *   - node.attention       â†’ retrieval priority
 *   - ReinforcementField   â†’ which edges to strengthen
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

import { queryActivation, cosineSimilarity, softmax, clamp } from '../BLOCK1/math.js';
import { isFiniteNum }                                         from '../BLOCK1/numerics.js';
import { PARAMS }                                              from '../BLOCK_12/BLOCK_15_UPGRADE/core/constants.js';
import { RETRIEVAL, DIAGNOSTICS }                              from '../BLOCK_12/BLOCK_15_UPGRADE/core/config.js';

export class AttentionField {

  constructor() {
    this.activeQueryVec   = null;   // current query embedding
    this.topActivated     = [];     // top-K nodes from last query
    this.meanActivation   = 0;
    this._history         = [];
    this._bufferSize      = DIAGNOSTICS.CURVE_BUFFER_SIZE;
    this._tick            = 0;
  }

  // â”€â”€ QUERY ACTIVATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Activate nodes based on a query embedding.
   * Writes node.activationScore and calls node.recordActivation().
   *
   * A_i = Ï„ Â· H_i Â· cosineSim(queryVec, node.embedding)
   *
   * Nodes without embeddings get A_i = 0.
   *
   * @param {Node[]}   nodes
   * @param {number[]} queryVec  â€” query embedding (Float32Array or Array)
   * @param {object}   params    â€” live PARAMS (for Ï„)
   * @param {number}   tick      â€” current tick
   * @returns {Node[]}  top-K activated nodes
   */
  activateQuery(nodes, queryVec, params, tick) {
    this._tick            = tick;
    this.activeQueryVec   = queryVec;

    const tau    = isFiniteNum(params?.tau) ? params.tau : PARAMS.tau;
    const minA   = RETRIEVAL.MIN_ACTIVATION;
    const simFloor = RETRIEVAL.SIMILARITY_FLOOR;

    const scored = [];

    for (const node of nodes) {
      if (!node.alive) { node.activationScore = 0; continue; }

      if (!node.embedding) {
        node.activationScore = 0;
        continue;
      }

      const sim = cosineSimilarity(
        Array.from(queryVec),
        Array.from(node.embedding)
      );

      if (!isFiniteNum(sim) || sim < simFloor) {
        node.activationScore = 0;
        continue;
      }

      const A = queryActivation(tau, node.strength, Array.from(queryVec), Array.from(node.embedding));
      node.activationScore = isFiniteNum(A) ? Math.max(0, A) : 0;

      if (node.activationScore >= minA) {
        scored.push(node);
        node.recordActivation(tick, node.activationScore);
      }
    }

    // Sort by activation and take top-K
    scored.sort((a, b) => b.activationScore - a.activationScore);
    this.topActivated = scored.slice(0, RETRIEVAL.TOP_K);

    this.meanActivation = scored.length > 0
      ? scored.reduce((s, n) => s + n.activationScore, 0) / scored.length
      : 0;

    this._pushHistory(this.meanActivation);
    return this.topActivated;
  }

  // â”€â”€ DECAY ACTIVATIONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Gently decay all activation scores each tick.
   * Prevents stale query activations from persisting.
   *
   * @param {Node[]} nodes
   * @param {number} decayRate  â€” per tick (default 0.1)
   */
  decayActivations(nodes, decayRate = 0.1) {
    for (const node of nodes) {
      if (!isFiniteNum(node.activationScore)) { node.activationScore = 0; continue; }
      node.activationScore = Math.max(0, node.activationScore - decayRate);
    }
  }

  // â”€â”€ STRUCTURAL ATTENTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Update bottom-up structural attention.
   * Combines connectivity, strength, and memory trace.
   *
   * Att_i = 0.4Â·C_i + 0.4Â·H_i + 0.2Â·memoryTrace_i
   *
   * Written to node.attention â€” decays toward this target.
   *
   * @param {Node[]} nodes
   */
  updateStructuralAttention(nodes) {
    for (const node of nodes) {
      const C  = isFiniteNum(node.connectivity) ? node.connectivity : 0;
      const H  = isFiniteNum(node.strength)     ? node.strength     : 0;
      const MT = isFiniteNum(node.memoryTrace)  ? node.memoryTrace  : 0;

      const target = clamp(0.4 * C + 0.4 * H + 0.2 * MT, 0, 1);

      // Soft update toward target
      node.attention = clamp(
        node.attention + 0.05 * (target - node.attention),
        0, 1
      );
    }
  }

  // â”€â”€ CLEAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Clear all activation scores (post-retrieval reset).
   * @param {Node[]} nodes
   */
  clearActivations(nodes) {
    for (const node of nodes) node.activationScore = 0;
    this.activeQueryVec = null;
    this.topActivated   = [];
  }

  // â”€â”€ QUERIES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  getTopActivated()  { return this.topActivated; }
  hasActiveQuery()   { return this.activeQueryVec !== null; }
  getHistory()       { return [...this._history]; }

  getState() {
    return {
      meanActivation: this.meanActivation,
      topCount:       this.topActivated.length,
      hasQuery:       this.hasActiveQuery(),
    };
  }

  _pushHistory(v) {
    this._history.push(v);
    if (this._history.length > this._bufferSize) this._history.shift();
  }
}



