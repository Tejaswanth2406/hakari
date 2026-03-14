/**
 * HAKARI v3 â€” physics/BeliefField.js
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Bayesian belief state layer. New Hakari module.
 *
 * Each node carries a belief distribution over
 * a fixed hypothesis space. This layer updates
 * those beliefs every N ticks using Bayes rule
 * and computes derived quantities used downstream.
 *
 * Per-node fields written:
 *   node.belief          â€” posterior distribution [K]
 *   node.beliefEntropy   â€” H(belief) âˆˆ [0, ln(K)]
 *   node.beliefConfident â€” bool: entropy below threshold
 *   node.expectedInfoGainâ€” EIG from current belief
 *
 * Used by:
 *   InformationFlow.applyEIGBoost()
 *   InformationForce.compute()
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

import { BAYESIAN, DECISION } from '../BLOCK_12/BLOCK_15_UPGRADE/core/constants.js';
import { BELIEF } from '../BLOCK_12/BLOCK_15_UPGRADE/core/config.js';
import {
  bayesUpdate,
  bayesUpdateLog,
  normalizeDistribution,
  uniformPrior,
  distributionEntropy,
  isConfident,
} from '../BLOCK1/probability.js';
import { informationGain } from '../BLOCK1/information.js';
import { isFiniteNum, allFinite } from '../BLOCK1/numerics.js';

export class BeliefField {

  /**
   * @param {object} [opts]
   * @param {number} opts.hypothesisDim   â€” K: number of hypotheses per node
   * @param {number} opts.updateEveryN    â€” update beliefs every N ticks
   * @param {number} opts.confidenceThreshold â€” entropy below this â†’ confident
   */
  constructor(opts = {}) {
    this._K            = opts.hypothesisDim      ?? BELIEF.HYPOTHESIS_DIM;
    this._updateEveryN = opts.updateEveryN        ?? BELIEF.UPDATE_EVERY_N;
    this._confThresh   = opts.confidenceThreshold ?? Math.log(this._K) * 0.25;
    this._tick         = 0;

    // System-level aggregates
    this.meanBeliefEntropy  = 0;
    this.confidentNodeCount = 0;
  }

  // â”€â”€ INITIALIZATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Initialize belief state on a newly created node.
   * Call from NodeFactory when spawning.
   *
   * @param {Node} node
   */
  initNode(node) {
    node.belief           = uniformPrior(this._K);
    node.beliefEntropy    = Math.log(this._K);   // max entropy for uniform
    node.beliefConfident  = false;
    node.expectedInfoGain = 0;
    node.logBelief        = node.belief.map(p => Math.log(Math.max(p, BAYESIAN.BELIEF_FLOOR)));
  }

  // â”€â”€ UPDATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Update all node beliefs based on evidence.
   * Runs every _updateEveryN ticks to reduce cost.
   *
   * Evidence is derived from each node's information
   * input and activation score â€” nodes in informative
   * regions see stronger likelihood signals.
   *
   * @param {Node[]} nodes â€” all alive nodes
   * @param {number} tick  â€” current simulation tick
   */
  update(nodes, tick) {
    this._tick = tick;
    if (tick % this._updateEveryN !== 0) return;

    let totalEntropy  = 0;
    let confidentCount = 0;

    for (const node of nodes) {
      if (!node.belief) this.initNode(node);

      // Build likelihood from node's information state
      const likelihood = this._buildLikelihood(node);

      // Update in log domain for stability
      if (BAYESIAN.LOG_DOMAIN) {
        const logPrior = node.logBelief ??
          node.belief.map(p => Math.log(Math.max(p, BAYESIAN.BELIEF_FLOOR)));

        const logLike = likelihood.map(l =>
          Math.log(Math.max(l, BAYESIAN.BELIEF_FLOOR))
        );

        const logPost = bayesUpdateLog(logPrior, logLike);
        node.logBelief = logPost;
        node.belief    = logPost.map(lp => Math.exp(lp));
      } else {
        node.belief = bayesUpdate(node.belief, likelihood);
      }

      // Additive smoothing (Laplace)
      if (BAYESIAN.POSTERIOR_SMOOTH > 0) {
        node.belief = normalizeDistribution(
          node.belief.map(p => p + BAYESIAN.POSTERIOR_SMOOTH)
        );
      }

      // Derived quantities
      node.beliefEntropy   = distributionEntropy(node.belief);
      node.beliefConfident = isConfident(node.belief, this._confThresh);
      node.expectedInfoGain = this._computeEIG(node);

      totalEntropy += node.beliefEntropy;
      if (node.beliefConfident) confidentCount++;
    }

    this.meanBeliefEntropy  = nodes.length > 0 ? totalEntropy / nodes.length : 0;
    this.confidentNodeCount = confidentCount;
  }

  // â”€â”€ LIKELIHOOD CONSTRUCTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Build a likelihood vector for the node's hypothesis space
   * from its current information input and activation score.
   *
   * Strategy: concentrate likelihood mass on a subset of
   * hypotheses proportional to the node's current activity.
   * This is a proxy for "which explanations are consistent
   * with the current evidence this node is receiving."
   *
   * @param {Node} node
   * @returns {number[]} likelihood [K]
   */
  _buildLikelihood(node) {
    const K = this._K;
    const baseActivity = isFiniteNum(node.infoInput)     ? node.infoInput     : 0;
    const activation   = isFiniteNum(node.activationScore) ? node.activationScore : 0;

    // Combined evidence signal: stronger signal â†’ sharper likelihood
    const signal = Math.max(baseActivity + activation * 0.5, 0);

    // Build a likelihood array:
    // - If signal is strong: concentrate on first ceil(K/4) hypotheses
    //   using the embedding index as a soft hash of "which hypothesis"
    // - If weak: near-uniform (uninformative evidence)
    const focus = Math.max(1, Math.round(K * (0.25 + 0.5 * Math.min(signal, 1))));
    const like  = new Array(K).fill(1.0 / K);

    // Soft concentration: use node's embedding to pick focus region
    const offset = node.id
      ? (node.id.charCodeAt(0) % K)
      : 0;

    for (let i = 0; i < focus; i++) {
      const idx = (offset + i) % K;
      like[idx] += signal / focus;
    }

    return normalizeDistribution(like);
  }

  // â”€â”€ EXPECTED INFORMATION GAIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * EIG = entropy(prior) âˆ’ expected_entropy(posterior | outcomes)
   *
   * Simplified proxy: KL(belief â€– uniform_prior)
   * Measures how much the belief has moved from uniform.
   * Higher = more information has been absorbed.
   *
   * @param {Node} node
   * @returns {number} EIG proxy âˆˆ [0, ln(K)]
   */
  _computeEIG(node) {
    const uniform = uniformPrior(this._K);
    return Math.max(0, informationGain(uniform, node.belief));
  }

  // â”€â”€ DIAGNOSTICS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  getState() {
    return {
      meanBeliefEntropy:  this.meanBeliefEntropy,
      confidentNodeCount: this.confidentNodeCount,
      hypothesisDim:      this._K,
    };
  }
}



