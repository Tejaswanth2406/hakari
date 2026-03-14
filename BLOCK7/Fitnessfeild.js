/**
 * HAKARI v3 — evolution/FitnessField.js (Advanced)
 * ---------------------------------------------
 * Evaluates per-node fitness for evolutionary selection.
 * Features:
 *  - NaN-safe calculations
 *  - Optional weighting via node importance
 *  - Rolling mean & history for diagnostics
 *  - Configurable clamping
 *  - Energy & information contributions
 * ---------------------------------------------
 */

import { isFiniteNum } from '../BLOCK1/numerics.js';
import { clamp }       from '../BLOCK1/math.js';
import { DIAGNOSTICS } from '../BLOCK_12/BLOCK_15_UPGRADE/core/config.js';

export class FitnessField {

  constructor(opts = {}) {
    this.fitness     = new Map();  // nodeId ? fitness score
    this.meanFitness = 0;
    this.totalFitness = 0;
    this._history    = [];
    this._bufferSize = opts.bufferSize ?? DIAGNOSTICS.CURVE_BUFFER_SIZE;
    this._clampRange = opts.clampRange ?? [-2, 2];
  }

  /**
   * Evaluate fitness for all alive nodes.
   * @param {Node[]}          nodes
   * @param {SurpriseField}   surpriseField
   * @param {InformationFlow} [infoFlow] — optional signal for infoInput weighting
   * @param {Map<string,number>} [weights] — optional per-node importance weights
   */
  update(nodes, surpriseField, infoFlow = null, weights = new Map()) {
    this.fitness.clear();
    let sum = 0;
    let weightedSum = 0;
    let totalWeight = 0;
    let count = 0;

    for (const node of nodes) {
      if (!node.alive) continue;

      const H      = isFiniteNum(node.strength)    ? node.strength    : 0;
      const errAbs = Math.abs(surpriseField.nodeErrors.get(node.id) ?? 0);
      const E      = isFiniteNum(node.energy)      ? node.energy      : 0.5;
      const eRate  = isFiniteNum(node.errorRate)   ? node.errorRate   : 0;
      const info   = isFiniteNum(node.infoInput)   ? node.infoInput   : 0;
      const weight = isFiniteNum(weights.get(node.id)) ? weights.get(node.id) : 1;

      // Base fitness formula
      let f = info + H - errAbs + 0.3 * E - 0.5 * eRate;

      // Clamp to configurable range
      f = clamp(f, this._clampRange[0], this._clampRange[1]);
      f = isFiniteNum(f) ? f : 0;

      this.fitness.set(node.id, f);
      sum += f;
      weightedSum += f * weight;
      totalWeight += weight;
      count++;
    }

    this.meanFitness  = count > 0 ? sum / count : 0;
    this.totalFitness = totalWeight > 0 ? weightedSum / totalWeight : this.meanFitness;

    // Update rolling history
    this._history.push(this.meanFitness);
    if (this._history.length > this._bufferSize) this._history.shift();
  }

  get(nodeId)          { return this.fitness.get(nodeId) ?? 0; }
  getHistory()         { return [...this._history]; }
  getMeanFitness()     { return this.meanFitness; }
  getWeightedFitness() { return this.totalFitness; }

  getState() {
    return {
      meanFitness:     this.meanFitness,
      weightedFitness: this.totalFitness,
      nodeCount:       this.fitness.size,
      historyLength:   this._history.length
    };
  }
}
