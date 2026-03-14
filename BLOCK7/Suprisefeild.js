/**
 * HAKARI v3 — evolution/SurpriseField.js (Advanced)
 * ---------------------------------------------
 * Aggregates per-node prediction errors into
 * system-level surprise.
 * Advanced features:
 *  - Node weighting
 *  - Rolling history
 *  - Diagnostics-ready
 * ---------------------------------------------
 */

import { isFiniteNum } from '../BLOCK1/numerics.js';
import { DIAGNOSTICS } from '../BLOCK_12/BLOCK_15_UPGRADE/core/config.js';

export class SurpriseField {

  constructor(opts = {}) {
    this.nodeErrors  = new Map();  // nodeId ? raw prediction error
    this.totalError  = 0;          // mean |e| across nodes
    this.maxError    = 0;          // max |e|
    this.weightedError = 0;        // weighted mean error
    this._history    = [];
    this._bufferSize = opts.bufferSize ?? DIAGNOSTICS.CURVE_BUFFER_SIZE;
  }

  /**
   * Update surprise from node prediction errors
   * @param {Node[]} nodes
   * @param {Map<string,number>} [weights] — optional importance per node
   */
  update(nodes, weights = new Map()) {
    this.nodeErrors.clear();

    let sum = 0;
    let weightedSum = 0;
    let maxErr = 0;
    let totalWeight = 0;
    let count = 0;

    for (const node of nodes) {
      if (!node.alive) continue;

      const err = isFiniteNum(node._predictionError) ? node._predictionError : 0;
      const absErr = Math.abs(err);

      const weight = isFiniteNum(weights.get(node.id)) ? weights.get(node.id) : 1;

      this.nodeErrors.set(node.id, err);
      sum += absErr;
      weightedSum += absErr * weight;
      totalWeight += weight;
      if (absErr > maxErr) maxErr = absErr;

      count++;
    }

    this.totalError    = count > 0 ? sum / count : 0;
    this.weightedError = totalWeight > 0 ? weightedSum / totalWeight : 0;
    this.maxError      = maxErr;

    this._history.push(this.totalError);
    if (this._history.length > this._bufferSize) this._history.shift();
  }

  getSurprise()       { return this.totalError; }
  getWeightedSurprise(){ return this.weightedError; }
  getMaxError()       { return this.maxError; }
  getHistory()        { return [...this._history]; }

  getState() {
    return {
      totalError:    this.totalError,
      weightedError: this.weightedError,
      maxError:      this.maxError,
      historyLength: this._history.length,
      nodeCount:     this.nodeErrors.size
    };
  }
}
