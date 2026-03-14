/**
 * HAKARI v3 — network/GraphEnergy.js
 * ─────────────────────────────────────────────
 * Computes the structural energy of the knowledge graph.
 * New Hakari module.
 *
 * Graph energy measures cognitive coherence:
 *   E_graph = Σ_{(i,j)∈E} wᵢⱼ · Hᵢ · Hⱼ
 *
 * High E_graph → strongly connected high-strength nodes
 *               → coherent knowledge structure
 * Low E_graph  → fragmented / weak network
 *               → knowledge collapse risk
 *
 * Normalized graph energy:
 *   E_norm = E_graph / (N · max_H²)
 *          = E_graph / N   (since H ∈ [0,1])
 *
 * Also computes:
 *   - Per-node energy contribution Kᵢ
 *   - Energy gradient (change per tick) for instability detection
 * ─────────────────────────────────────────────
 */

import { isFiniteNum } from '../BLOCK1/numerics.js';
import { clamp }       from '../BLOCK1/math.js';

export class GraphEnergy {

  constructor() {
    this.graphEnergy     = 0;   // E_graph = Σ wᵢⱼ·Hᵢ·Hⱼ
    this.graphEnergyNorm = 0;   // E_graph / N
    this.prevEnergy      = 0;
    this.energyGradient  = 0;   // ΔE per tick
    this.coherence       = 0;   // normalized ∈ [0,1]
  }

  // ── UPDATE ──────────────────────────────────

  /**
   * Compute graph energy from all edges.
   * Optionally writes per-node energy contribution Kᵢ to nodes.
   *
   * @param {Node[]}           nodes
   * @param {Graph}            graph
   * @param {Map<string,Node>} nodeMap
   * @param {boolean}          [writeNodeEnergy=true]
   */
  update(nodes, graph, nodeMap, writeNodeEnergy = true) {
    const N = nodes.length;
    if (N === 0) {
      this.graphEnergy     = 0;
      this.graphEnergyNorm = 0;
      this.coherence       = 0;
      this.energyGradient  = 0;
      return;
    }

    this.prevEnergy = this.graphEnergy;

    // Zero per-node contribution accumulators
    if (writeNodeEnergy) {
      for (const node of nodes) node._graphEnergyK = 0;
    }

    let total = 0;

    // Iterate unique edges once via generator
    for (const { idA, idB, weight } of graph.getAllEdges()) {
      const nA = nodeMap.get(idA);
      const nB = nodeMap.get(idB);
      if (!nA || !nB || !nA.alive || !nB.alive) continue;

      const Hi = isFiniteNum(nA.strength) ? nA.strength : 0;
      const Hj = isFiniteNum(nB.strength) ? nB.strength : 0;
      const w  = isFiniteNum(weight)      ? weight      : 0;

      const contrib = w * Hi * Hj;
      if (!isFiniteNum(contrib)) continue;

      total += contrib;

      if (writeNodeEnergy) {
        nA._graphEnergyK = (nA._graphEnergyK ?? 0) + contrib;
        nB._graphEnergyK = (nB._graphEnergyK ?? 0) + contrib;
      }
    }

    this.graphEnergy     = total;
    this.graphEnergyNorm = total / N;
    this.energyGradient  = total - this.prevEnergy;

    // Coherence: normalized to theoretical maximum
    // Max E_graph = Σ w_ij (all H=1) = number of edges
    const edgeCount = graph.edgeCount;
    this.coherence = edgeCount > 0
      ? clamp(total / edgeCount, 0, 1)
      : 0;
  }

  // ── PER-NODE CONTRIBUTION ────────────────────

  /**
   * Get top-N nodes by graph energy contribution.
   * Identifies "hub" nodes that anchor the knowledge structure.
   *
   * @param {Node[]} nodes
   * @param {number} n
   * @returns {Node[]}
   */
  topEnergyNodes(nodes, n = 5) {
    return [...nodes]
      .filter(node => isFiniteNum(node._graphEnergyK))
      .sort((a, b) => (b._graphEnergyK ?? 0) - (a._graphEnergyK ?? 0))
      .slice(0, n);
  }

  // ── INSTABILITY DETECTION ────────────────────

  /**
   * True if graph energy dropped sharply this tick.
   * Can indicate imminent knowledge collapse.
   *
   * @param {number} threshold  — gradient magnitude to flag (default 0.5)
   * @returns {boolean}
   */
  isCollapseRisk(threshold = 0.5) {
    return this.energyGradient < -threshold;
  }

  /**
   * True if graph is growing in coherence (emergence signal).
   * @param {number} threshold
   * @returns {boolean}
   */
  isEmerging(threshold = 0.1) {
    return this.energyGradient > threshold && this.coherence > 0.3;
  }

  // ── DIAGNOSTICS ─────────────────────────────

  getState() {
    return {
      graphEnergy:     this.graphEnergy,
      graphEnergyNorm: this.graphEnergyNorm,
      coherence:       this.coherence,
      energyGradient:  this.energyGradient,
      collapseRisk:    this.isCollapseRisk(),
      emerging:        this.isEmerging(),
    };
  }
}

