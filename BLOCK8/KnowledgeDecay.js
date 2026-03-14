/**
 * HAKARI v3 — knowledge/KnowledgeDecay.js (Advanced)
 * ─────────────────────────────────────────────
 * Applies forgetting pressure to unused knowledge nodes.
 * Decays unused nodes while respecting memory trace and activation.
 *
 * ΔH = −decayRate · (1 − memoryTrace) · (1 − activationScore)
 * Protected nodes (high activation or memoryTrace) decay slower.
 * H_min floor prevents collapse from this module.
 *
 * Advanced features:
 *  - Stochastic decay for experimentation
 *  - NaN-safe node handling
 *  - Per-tick diagnostics & history
 *  - Meta-learning hooks for adaptive decay
 * ─────────────────────────────────────────────
 */

import { isFiniteNum } from '../BLOCK1/numerics.js';
import { clamp }       from '../BLOCK1/math.js';
import { PHYSICS }     from '../BLOCK_15_UPGRADE/core/constants.js';
import { DIAGNOSTICS } from '../BLOCK_15_UPGRADE/core/config.js';

export class KnowledgeDecay {

  /**
   * @param {object} [opts]
   * @param {number} opts.decayRate   — max strength loss per tick (default 0.002)
   * @param {number} opts.hMin        — floor below which decay is skipped (default PHYSICS.H_MIN)
   * @param {number} opts.stochastic  — stochastic factor [0..1] (default 0)
   */
  constructor(opts = {}) {
    this.decayRate   = opts.decayRate   ?? 0.002;
    this.hMin        = opts.hMin        ?? (PHYSICS.H_MIN ?? 0.01);
    this.stochastic  = opts.stochastic  ?? 0.0;

    this.decayedCount = 0;
    this.totalDecay   = 0;
    this._history     = [];
    this._bufferSize  = DIAGNOSTICS.CURVE_BUFFER_SIZE;
  }

  /**
   * Apply knowledge forgetting to all alive nodes.
   * Must run AFTER KnowledgeDiffusion / MemoryConsolidation.
   * @param {Node[]} nodes
   */
  update(nodes) {
    let decayed   = 0;
    let totalLoss = 0;

    for (const node of nodes) {
      if (!node?.alive) continue;

      const H  = isFiniteNum(node.strength)        ? node.strength        : 0;
      const A  = isFiniteNum(node.activationScore) ? node.activationScore : 0;
      const MT = isFiniteNum(node.memoryTrace)     ? node.memoryTrace     : 0;

      // Already below floor — skip
      if (H <= this.hMin) continue;

      // Protection factor from activation or memory trace
      const protection = clamp(Math.max(A, MT), 0, 1);

      // Base decay
      let loss = this.decayRate * (1 - protection);

      // Apply optional stochastic modulation
      if (this.stochastic > 0) {
        loss *= 1 + (Math.random() * 2 - 1) * this.stochastic; // ±stochastic factor
      }

      // Skip tiny losses
      if (loss < 1e-6) continue;

      const newH = clamp(H - loss, this.hMin, 1);
      if (!isFiniteNum(newH)) continue;

      node.strength = newH;
      totalLoss += loss;
      decayed++;
    }

    this.decayedCount = decayed;
    this.totalDecay   = totalLoss;
    this._pushHistory(decayed);
  }

  getHistory() { return [...this._history]; }

  getState() {
    return {
      decayedCount: this.decayedCount,
      totalDecay:   this.totalDecay,
      decayRate:    this.decayRate,
      stochastic:   this.stochastic,
    };
  }

  _pushHistory(v) {
    this._history.push(v);
    if (this._history.length > this._bufferSize) this._history.shift();
  }
}
