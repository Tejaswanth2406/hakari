/**
 * HAKARI v3 â€” intelligence/UtilityField.js
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Computes expected utility scores for nodes.
 * New Hakari module.
 *
 * This feeds the Î¼Â·U term in the extended HUIE equation.
 *
 * Utility score U_i measures how useful a node is
 * for achieving the current system goal:
 *
 *   U_i = EU(node) = Î£ P(outcome | node) Â· V(outcome)
 *
 * In the cognitive field context:
 *   - "outcomes" are neighbor nodes that could be reached
 *   - V(outcome) is the neighbor's current strength
 *   - P(outcome | node) is proportional to edge weight
 *
 * This creates goal-directed cognition:
 *   nodes that lead toward strong, activated regions
 *   get positive utility â†’ grow stronger via HUIE
 *
 * Also supports:
 *   - Risk-adjusted utility (CRRA)
 *   - Query-context utility (boost nodes relevant to active query)
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

import { expectedUtility, riskAdjustedEU } from '../BLOCK1/decisionmath.js';
import { normalizeDistribution }            from '../BLOCK1/probability.js';
import { isFiniteNum }                      from '../BLOCK1/numerics.js';
import { clamp }                            from '../BLOCK1/math.js';
import { DECISION }                         from '../BLOCK_12/BLOCK_15_UPGRADE/core/constants.js';
import { DIAGNOSTICS }                      from '../BLOCK_12/BLOCK_15_UPGRADE/core/config.js';

export class UtilityField {

  /**
   * @param {object} [opts]
   * @param {number}  opts.riskAversion  â€” CRRA parameter (default: DECISION.RISK_AVERSION)
   * @param {boolean} opts.useRiskAdj    â€” use CRRA utility (default true)
   * @param {number}  opts.queryBoost    â€” multiplier when query is active (default 1.5)
   */
  constructor(opts = {}) {
    this.riskAversion = opts.riskAversion ?? DECISION.RISK_AVERSION;
    this.useRiskAdj   = opts.useRiskAdj   ?? true;
    this.queryBoost   = opts.queryBoost   ?? 1.5;

    this.meanUtility  = 0;
    this.maxUtility   = 0;
    this._history     = [];
    this._bufferSize  = DIAGNOSTICS.CURVE_BUFFER_SIZE;
    this._queryActive = false;
  }

  // â”€â”€ UPDATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Compute utility score for each node.
   * Writes node.utilityScore âˆˆ [0,1] for HUIE.
   *
   * @param {Node[]}           nodes
   * @param {Graph}            graph
   * @param {Map<string,Node>} nodeMap
   */
  update(nodes, graph, nodeMap) {
    if (nodes.length === 0) { this.meanUtility = 0; return; }

    let totalU = 0;
    let maxU   = 0;

    for (const node of nodes) {
      const neighbors = graph.getNeighbors(node.id);
      let U = 0;

      if (neighbors.length > 0) {
        // Build probability distribution over neighbors (by edge weight)
        const weights = neighbors.map(({ weight }) =>
          isFiniteNum(weight) ? Math.max(weight, 0) : 0
        );
        const probs = normalizeDistribution(weights);

        // Utilities = neighbor strengths (value of reaching each neighbor)
        const values = neighbors.map(({ id }) => {
          const nbr = nodeMap.get(id);
          return (nbr && nbr.alive && isFiniteNum(nbr.strength))
            ? nbr.strength
            : 0;
        });

        // Compute EU or risk-adjusted EU
        const rawEU = this.useRiskAdj
          ? riskAdjustedEU(probs, values, this.riskAversion)
          : expectedUtility(probs, values);

        U = isFiniteNum(rawEU) ? clamp(rawEU, 0, 2) : 0;
      }

      // Query boost: nodes already activated get utility amplified
      if (this._queryActive && isFiniteNum(node.activationScore) && node.activationScore > 0.1) {
        U *= this.queryBoost;
      }

      node.utilityScore = clamp(U, 0, 2);
      totalU += node.utilityScore;
      if (node.utilityScore > maxU) maxU = node.utilityScore;
    }

    this.meanUtility = totalU / nodes.length;
    this.maxUtility  = maxU;
    this._pushHistory(this.meanUtility);
  }

  // â”€â”€ QUERY CONTEXT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Signal that a query is active â€” boosts utility of relevant nodes. */
  activateQuery() { this._queryActive = true; }

  /** Clear query context. */
  clearQuery()    { this._queryActive = false; }

  // â”€â”€ QUERIES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Top-N highest utility nodes.
   * Useful for attention routing and retrieval.
   * @param {Node[]} nodes
   * @param {number} n
   * @returns {Node[]}
   */
  topUtilityNodes(nodes, n = 5) {
    return [...nodes]
      .filter(n => isFiniteNum(n.utilityScore))
      .sort((a, b) => (b.utilityScore ?? 0) - (a.utilityScore ?? 0))
      .slice(0, n);
  }

  getHistory() { return [...this._history]; }

  getState() {
    return {
      meanUtility: this.meanUtility,
      maxUtility:  this.maxUtility,
      queryActive: this._queryActive,
    };
  }

  _pushHistory(v) {
    this._history.push(v);
    if (this._history.length > this._bufferSize) this._history.shift();
  }
}



