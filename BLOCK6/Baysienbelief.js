/**
 * HAKARI v3 — intelligence/BayesianBelief.js
 * ─────────────────────────────────────────────
 * Manages the Bayesian belief intelligence layer.
 * New Hakari module.
 *
 * This module is responsible for:
 *   1. Computing belief confidence B_i per node
 *      (feeds the θ·B term in extended HUIE)
 *   2. Propagating belief updates between nodes
 *      that share strong edges (belief communication)
 *   3. Detecting when the network has reached
 *      collective confidence (emergent belief state)
 *
 * Belief confidence:
 *   B_i = 1 − H(belief_i) / H_max
 *
 * B_i ∈ [0,1]:
 *   0 = maximum uncertainty (uniform belief)
 *   1 = complete certainty (all mass on one hypothesis)
 *
 * Confident nodes receive a positive force in HUIE —
 * "knowing nodes survive better."
 *
 * Note: belief initialization and Bayesian updates
 * are handled by physics/BeliefField.js.
 * This module computes the INTELLIGENCE-layer signals
 * derived from those beliefs.
 * ─────────────────────────────────────────────
 */

import { distributionEntropy, mapEstimate } from '../BLOCK1/probability.js';
import { klDivergence, jsDivergence }       from '../BLOCK1/information.js';
import { isFiniteNum }                       from '../BLOCK1/numerics.js';
import { clamp }                             from '../BLOCK1/math.js';
import { DIAGNOSTICS }                       from '../BLOCK_12/BLOCK_15_UPGRADE/core/config.js';

export class BayesianBelief {

  constructor() {
    this.meanConfidence      = 0;
    this.confidentNodeCount  = 0;
    this.collectiveConfidence = false;  // true when system reaches consensus
    this._history            = [];
    this._bufferSize         = DIAGNOSTICS.CURVE_BUFFER_SIZE;
  }

  // ── UPDATE ──────────────────────────────────

  /**
   * Compute belief confidence B_i for each node.
   * Writes node.beliefConfidence ∈ [0,1] for HUIE.
   *
   * Also detects collective confidence (consensus).
   *
   * Must run AFTER BeliefField.update() and InformationGain.update().
   *
   * @param {Node[]} nodes — all alive nodes
   */
  update(nodes) {
    if (nodes.length === 0) { this.meanConfidence = 0; return; }

    const K    = this._detectK(nodes);
    const hMax = K > 1 ? Math.log(K) : 1;

    let totalConf  = 0;
    let confCount  = 0;

    for (const node of nodes) {
      if (!node.belief) {
        node.beliefConfidence = 0;
        continue;
      }

      const H = isFiniteNum(node.beliefEntropy) ? node.beliefEntropy : hMax;

      // B_i = 1 − H(belief) / H_max
      const B = clamp(1 - H / hMax, 0, 1);
      node.beliefConfidence = B;

      totalConf += B;
      if (B > 0.6) confCount++;
    }

    this.meanConfidence      = totalConf / nodes.length;
    this.confidentNodeCount  = confCount;

    // Collective confidence: majority of nodes are confident
    this.collectiveConfidence = confCount > nodes.length * 0.5;

    this._pushHistory(this.meanConfidence);
  }

  // ── BELIEF COMMUNICATION ─────────────────────

  /**
   * Strong edges transmit belief consensus.
   * If two connected nodes both hold high-confidence beliefs
   * pointing to the same MAP hypothesis, reinforce the edge.
   *
   * Returns array of edges that achieved belief consensus.
   *
   * @param {Node[]}           nodes
   * @param {Graph}            graph
   * @param {Map<string,Node>} nodeMap
   * @param {number}           [threshold=0.7]  — min confidence to trigger
   * @returns {{ idA: string, idB: string, agreement: number }[]}
   */
  consensusEdges(nodes, graph, nodeMap, threshold = 0.7) {
    const agreements = [];

    for (const node of nodes) {
      if (!node.belief || node.beliefConfidence < threshold) continue;

      const mapA = mapEstimate(Array.from(node.belief));
      const neighbors = graph.getNeighbors(node.id);

      for (const { id } of neighbors) {
        const nbr = nodeMap.get(id);
        if (!nbr || !nbr.belief || nbr.beliefConfidence < threshold) continue;

        const mapB = mapEstimate(Array.from(nbr.belief));

        if (mapA === mapB) {
          // Agreement: both most likely believe hypothesis mapA
          const jsd = jsDivergence(
            Array.from(node.belief),
            Array.from(nbr.belief)
          );
          const agreement = 1 - clamp(jsd / Math.log(2), 0, 1);
          agreements.push({ idA: node.id, idB: id, agreement });
        }
      }
    }
    return agreements;
  }

  /**
   * Average KL divergence between connected node pairs.
   * Measures belief coherence across the network.
   * Low value = network has converged toward shared beliefs.
   *
   * @param {Node[]}           nodes
   * @param {Graph}            graph
   * @param {Map<string,Node>} nodeMap
   * @returns {number}
   */
  networkBeliefCoherence(nodes, graph, nodeMap) {
    let total = 0;
    let count = 0;

    for (const { idA, idB } of graph.getAllEdges()) {
      const nA = nodeMap.get(idA);
      const nB = nodeMap.get(idB);
      if (!nA || !nB || !nA.belief || !nB.belief) continue;
      if (nA.belief.length !== nB.belief.length) continue;

      const kl = klDivergence(Array.from(nA.belief), Array.from(nB.belief));
      if (isFiniteNum(kl)) { total += kl; count++; }
    }

    return count > 0 ? total / count : 0;
  }

  // ── QUERIES ─────────────────────────────────

  /**
   * Top-N most confident nodes.
   * @param {Node[]} nodes
   * @param {number} n
   * @returns {Node[]}
   */
  topConfidentNodes(nodes, n = 5) {
    return [...nodes]
      .filter(n => isFiniteNum(n.beliefConfidence))
      .sort((a, b) => (b.beliefConfidence ?? 0) - (a.beliefConfidence ?? 0))
      .slice(0, n);
  }

  getHistory() { return [...this._history]; }

  getState() {
    return {
      meanConfidence:       this.meanConfidence,
      confidentNodeCount:   this.confidentNodeCount,
      collectiveConfidence: this.collectiveConfidence,
    };
  }

  // ── PRIVATE ─────────────────────────────────

  _detectK(nodes) {
    for (const n of nodes) {
      if (n.belief) return n.belief.length;
    }
    return 8;
  }

  _pushHistory(v) {
    this._history.push(v);
    if (this._history.length > this._bufferSize) this._history.shift();
  }
}



