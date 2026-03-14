/**
 * HAKARI v3 — intelligence/InformationGain.js
 * ─────────────────────────────────────────────
 * Computes the information gain learning signal
 * for each node. New Hakari module.
 *
 * This feeds the ψ·IG term in the extended HUIE equation.
 *
 * Information gain measures how much a node has
 * reduced uncertainty by absorbing evidence:
 *
 *   IG_i = KL(belief_posterior ‖ belief_prior)
 *         = H(prior) − H(posterior)
 *
 * High IG → node has learned something meaningful this tick
 *          → positive force on node.strength via HUIE
 *
 * Also computes:
 *   - System-wide mean IG (diagnostic)
 *   - Top-IG nodes (for retrieval prioritization)
 *   - IG history for MetaOptimizer
 * ─────────────────────────────────────────────
 */

import { informationGain, entropyReduction } from '../BLOCK1/information.js';
import { isFiniteNum }                        from '../BLOCK1/numerics.js';
import { clamp }                              from '../BLOCK1/math.js';
import { DIAGNOSTICS }                        from '../BLOCK_12/BLOCK_15_UPGRADE/core/config.js';

export class InformationGain {

  constructor() {
    this.meanIG      = 0;
    this.maxIG       = 0;
    this._history    = [];
    this._bufferSize = DIAGNOSTICS.CURVE_BUFFER_SIZE;

    // Store prior beliefs between ticks for delta computation
    this._priorBeliefs = new Map();   // nodeId → Float32Array
  }

  // ── UPDATE ──────────────────────────────────

  /**
   * Compute IG for each node by comparing prior belief
   * (from previous tick) to current posterior (from BeliefField).
   *
   * Writes node.expectedInfoGain (also used by InformationForce).
   *
   * Must be called AFTER BeliefField.update() so beliefs are fresh.
   *
   * @param {Node[]} nodes — all alive nodes
   */
  update(nodes) {
    if (nodes.length === 0) { this.meanIG = 0; return; }

    let totalIG = 0;
    let maxIG   = 0;

    for (const node of nodes) {
      if (!node.belief) {
        node.expectedInfoGain = 0;
        continue;
      }

      const prior     = this._priorBeliefs.get(node.id);
      const posterior = Array.from(node.belief);

      let ig = 0;

      if (prior && prior.length === posterior.length) {
        // True IG: KL(posterior ‖ prior)
        const priorArr = Array.from(prior);
        const raw = informationGain(priorArr, posterior);
        ig = isFiniteNum(raw) ? clamp(raw, 0, 5) : 0;  // cap at 5 nats
      } else {
        // First tick or dimension mismatch: use entropy reduction proxy
        // IG ≈ H_max − H_current (how far from maximum uncertainty)
        const hCurrent = isFiniteNum(node.beliefEntropy) ? node.beliefEntropy : 0;
        const hMax     = Math.log(node.belief.length);
        ig = clamp(hMax - hCurrent, 0, hMax);
      }

      node.expectedInfoGain = ig;
      totalIG += ig;
      if (ig > maxIG) maxIG = ig;

      // Store this tick's belief as next tick's prior
      this._priorBeliefs.set(node.id, new Float32Array(node.belief));
    }

    // Clean up priors for collapsed nodes
    for (const id of this._priorBeliefs.keys()) {
      if (!nodes.some(n => n.id === id)) {
        this._priorBeliefs.delete(id);
      }
    }

    this.meanIG = totalIG / nodes.length;
    this.maxIG  = maxIG;
    this._pushHistory(this.meanIG);
  }

  // ── QUERIES ─────────────────────────────────

  /**
   * Top-N nodes by information gain this tick.
   * Used for retrieval boost: high-IG nodes are most "newsworthy."
   * @param {Node[]} nodes
   * @param {number} n
   * @returns {Node[]}
   */
  topIGNodes(nodes, n = 5) {
    return [...nodes]
      .filter(node => isFiniteNum(node.expectedInfoGain))
      .sort((a, b) => (b.expectedInfoGain ?? 0) - (a.expectedInfoGain ?? 0))
      .slice(0, n);
  }

  getHistory() { return [...this._history]; }

  getState() {
    return { meanIG: this.meanIG, maxIG: this.maxIG };
  }

  _pushHistory(v) {
    this._history.push(v);
    if (this._history.length > this._bufferSize) this._history.shift();
  }
}



