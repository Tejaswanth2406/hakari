/**
 * HAKARI v3 â€” physics/InformationForce.js
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Computes and applies exploration pressure to nodes.
 * New Hakari module.
 *
 * Nodes with high belief uncertainty and high expected
 * information gain receive a positive force on their
 * strength â€” pulling them toward more active states.
 *
 * Force formula:
 *   Fáµ¢ = Î»â‚ Â· H_belief_i   (uncertainty drive)
 *       + Î»â‚‚ Â· EIG_i        (information seek)
 *       âˆ’ Î»â‚ƒ Â· H_system     (global entropy damping)
 *
 * This force is added to node.infoInput BEFORE HUIE,
 * so it feeds naturally into the Î±Â·Iáµ¢ term.
 *
 * Optionally also applies mutual information coupling:
 *   MI boost = Î»_mi Â· MI(node_i, best_neighbor_j)
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

import { INFORMATION } from '../BLOCK_12/BLOCK_15_UPGRADE/core/constants.js';
import { clamp } from '../BLOCK1/math.js';
import { isFiniteNum } from '../BLOCK1/numerics.js';
import { mutualInformation } from '../BLOCK1/information.js';

export class InformationForce {

  /**
   * @param {object} [opts]
   * @param {number} opts.lambda1  â€” uncertainty drive weight
   * @param {number} opts.lambda2  â€” EIG seek weight
   * @param {number} opts.lambda3  â€” entropy damping weight
   * @param {number} opts.lambdaMI â€” mutual information coupling weight
   */
  constructor(opts = {}) {
    this.lambda1   = opts.lambda1   ?? 0.4;   // belief entropy â†’ drive
    this.lambda2   = opts.lambda2   ?? 0.6;   // EIG â†’ seek
    this.lambda3   = opts.lambda3   ?? 0.2;   // system entropy â†’ damp
    this.lambdaMI  = opts.lambdaMI  ?? 0.15;  // MI coupling

    this.totalForce    = 0;   // Î£ |Fáµ¢| last tick (diagnostic)
    this.activeCount   = 0;   // nodes with non-zero force last tick
  }

  // â”€â”€ COMPUTE & APPLY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Compute information force for each node and apply
   * it to node.infoInput.
   *
   * Must be called AFTER BeliefField.update() so that
   * node.beliefEntropy and node.expectedInfoGain are fresh.
   *
   * @param {Node[]} nodes    â€” all alive nodes
   * @param {number} S        â€” current system entropy (clamped)
   */
  compute(nodes, S) {
    const systemEntropy = isFiniteNum(S) ? S : 0;
    let totalForce = 0;
    let activeCount = 0;

    for (const node of nodes) {
      const beliefH = isFiniteNum(node.beliefEntropy)    ? node.beliefEntropy    : 0;
      const eig     = isFiniteNum(node.expectedInfoGain) ? node.expectedInfoGain : 0;

      // Core force: uncertainty + information-seeking âˆ’ global damping
      const force =
          this.lambda1 * beliefH
        + this.lambda2 * eig
        - this.lambda3 * systemEntropy;

      if (force <= 1e-9) continue;  // no net boost â€” skip

      // Apply force as additional info input
      node.infoInput = clamp(
        (isFiniteNum(node.infoInput) ? node.infoInput : 0) + force,
        0,
        4.0   // generous headroom â€” HUIE and EntropyLaw will regulate
      );

      totalForce += Math.abs(force);
      activeCount++;
    }

    this.totalForce  = totalForce;
    this.activeCount = activeCount;
  }

  // â”€â”€ MUTUAL INFORMATION COUPLING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Apply mutual information coupling between neighboring nodes.
   *
   * For each pair (i, j) connected by an edge:
   *   if MI(beliefáµ¢, beliefâ±¼) is high â†’ boost both nodes' infoInput
   *
   * This rewards correlated belief states â€” "resonance" between nodes.
   *
   * @param {Node[]}           nodes
   * @param {Graph}            graph
   * @param {Map<string,Node>} nodeMap
   */
  applyMICoupling(nodes, graph, nodeMap) {
    if (this.lambdaMI <= 0) return;

    for (const node of nodes) {
      if (!node.belief) continue;

      const neighbors = graph.getNeighbors(node.id);
      if (!neighbors || neighbors.length === 0) continue;

      let bestMI = 0;

      for (const { id } of neighbors) {
        const nbr = nodeMap.get(id);
        if (!nbr || !nbr.alive || !nbr.belief) continue;
        if (node.belief.length !== nbr.belief.length) continue;

        // Build a 2Ã—K joint distribution proxy:
        // joint[i][j] = belief_node[i] * belief_nbr[j]
        // This is the independence baseline â€” MI > 0 means
        // the beliefs are correlated beyond independence.
        const K = node.belief.length;
        const joint = node.belief.map(pi =>
          nbr.belief.map(pj => pi * pj)
        );

        const mi = mutualInformation(joint);
        if (mi > bestMI) bestMI = mi;
      }

      if (bestMI > INFORMATION.MI_FLOOR) {
        node.infoInput = clamp(
          (isFiniteNum(node.infoInput) ? node.infoInput : 0)
            + this.lambdaMI * bestMI,
          0,
          4.0
        );
      }
    }
  }

  // â”€â”€ DIAGNOSTICS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  getState() {
    return {
      totalForce:  this.totalForce,
      activeCount: this.activeCount,
      lambda1:     this.lambda1,
      lambda2:     this.lambda2,
      lambda3:     this.lambda3,
    };
  }
}



