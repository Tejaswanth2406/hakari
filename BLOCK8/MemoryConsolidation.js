/**
 * HAKARI v3 — knowledge/MemoryConsolidation.js (Advanced)
 * ---------------------------------------------
 * Long-term memory consolidation for nodes.
 * Implements:
 *   - Activation-threshold boost (logarithmic)
 *   - Recency-weighted memory trace
 *   - Meta-learning influence
 *   - Stochastic modulation
 *   - NaN-safe updates
 * ---------------------------------------------
 */

import { isFiniteNum } from '../BLOCK1/numerics.js';
import { clamp }       from '../BLOCK1/math.js';
import { DIAGNOSTICS } from '../BLOCK_15_UPGRADE/core/config.js'; // corrected import path

export class MemoryConsolidation {

  /**
   * @param {object} [opts]
   * @param {number} opts.threshold       — activation threshold to trigger boost
   * @param {number} opts.strengthBoost   — max strength increase per tick
   * @param {number} opts.traceAlpha      — trace integration rate
   * @param {number} opts.traceDecay      — trace decay per tick
   * @param {number} opts.maxTrace        — max memoryTrace
   * @param {number} opts.stochasticScale — scales random modulation (default 0.01)
   */
  constructor(opts = {}) {
    this.threshold       = opts.threshold       ?? 0.7;
    this.strengthBoost   = opts.strengthBoost   ?? 0.008;
    this.traceAlpha      = opts.traceAlpha      ?? 0.1;
    this.traceDecay      = opts.traceDecay      ?? 0.02;
    this.maxTrace        = opts.maxTrace        ?? 1.0;
    this.stochasticScale = opts.stochasticScale ?? 0.01;

    this.consolidatedCount = 0;   // nodes boosted this tick
    this._history          = [];
    this._bufferSize       = DIAGNOSTICS?.CURVE_BUFFER_SIZE ?? 100; // fallback
  }

  /**
   * Update memory consolidation for all alive nodes
   * Must run AFTER QueryActivation + KnowledgeDiffusion
   *
   * @param {Array<Node>} nodes
   */
  update(nodes) {
    let consolidated = 0;

    for (const node of nodes) {
      if (!node.alive) continue;

      // Safety checks
      const A  = isFiniteNum(node.activationScore) ? node.activationScore : 0;
      const H  = isFiniteNum(node.strength)        ? node.strength        : 0;
      const MT = isFiniteNum(node.memoryTrace)     ? node.memoryTrace     : 0;

      // -- 1. Trace update -----------------------------
      // Recency-weighted integration with decay
      let newTrace = MT * (1 - this.traceDecay) + this.traceAlpha * A;

      // Apply soft stochastic modulation
      newTrace += (Math.random() - 0.5) * this.stochasticScale;

      // Clamp & NaN guard
      node.memoryTrace = clamp(newTrace, 0, this.maxTrace);

      // -- 2. Strength boost ---------------------------
      if (A > this.threshold) {
        // Logarithmic soft boost diminishes as strength ? 1
        const headroom = Math.max(0, 1 - H);
        const boost = this.strengthBoost * Math.sqrt(headroom);

        // Meta-learning / adaptive modulation (if node has psi)
        const adaptiveBoost = (node.psi ?? 1.0) * boost;

        node.strength = clamp(H + adaptiveBoost, 0, 1);
        consolidated++;
      }
    }

    this.consolidatedCount = consolidated;
    this._pushHistory(consolidated);
  }

  /** Returns recent consolidation history */
  getHistory() { return [...this._history]; }

  /** Returns current consolidation state */
  getState() {
    return {
      consolidatedCount: this.consolidatedCount,
      threshold:         this.threshold,
      bufferSize:        this._bufferSize,
    };
  }

  /** Internal: push value to history buffer */
  _pushHistory(v) {
    this._history.push(v);
    if (this._history.length > this._bufferSize) this._history.shift();
  }
}
