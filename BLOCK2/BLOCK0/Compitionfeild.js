/**
 * HAKARI v3 — ecology/CompetitionField.js
 * ─────────────────────────────────────────────
 * Block 0 — Ecological Layer
 *
 * Negative feedback preventing runaway reinforcement.
 *
 * Without competition, the positive feedback loop:
 *   activation → reinforcement → edge weight → activation
 * converges the network into one dominant attractor cluster,
 * killing emergent diversity.
 *
 * CompetitionField introduces activation bandwidth pressure:
 *   - Nodes compete for a fixed share of total activation
 *   - High-activation nodes pay a proportional strength penalty
 *   - Diversity pressure repels semantically-similar node pairs
 *
 * Competition pressure formula:
 *   share_i   = |A_i| / Σ|A_j|
 *   penalty_i = share_i · pressure · competitionStrength
 *   H_i      -= penalty_i
 *
 * Three protection mechanisms (all optional):
 *   1. Bandwidth competition  — high-share nodes pay more
 *   2. Activation saturation  — tanh() cap on A_i
 *   3. Diversity pressure     — similar node pairs repel
 * ─────────────────────────────────────────────
 */

import { isFiniteNum }      from '../BLOCK1/numerics.js';
import { clamp }            from '../BLOCK1/math.js';
import { cosineSimilarity } from '../BLOCK1/math.js';
import { DIAGNOSTICS }      from '../../BLOCK_12/BLOCK_15_UPGRADE/core/config.js';

export class CompetitionField {

  /**
   * @param {object} [opts]
   * @param {number}  opts.pressure           — bandwidth penalty rate (default 0.15)
   * @param {boolean} opts.enableSaturation   — tanh cap on activationScore (default true)
   * @param {boolean} opts.enableDiversity    — repel semantically similar nodes (default true)
   * @param {number}  opts.diversityThreshold — cosine similarity above this triggers repel (default 0.95)
   * @param {number}  opts.diversityPenalty   — reinforcement multiplier when too similar (default 0.5)
   */
  constructor(opts = {}) {
    this.pressure           = opts.pressure           ?? 0.15;
    this.enableSaturation   = opts.enableSaturation   ?? true;
    this.enableDiversity    = opts.enableDiversity    ?? true;
    this.diversityThreshold = opts.diversityThreshold ?? 0.95;
    this.diversityPenalty   = opts.diversityPenalty   ?? 0.5;

    this.avgPenalty     = 0;
    this.competedCount  = 0;   // nodes that paid a penalty this tick
    this._history       = [];
    this._bufferSize    = DIAGNOSTICS.CURVE_BUFFER_SIZE;
  }

  // ── UPDATE ───────────────────────────────────

  /**
   * Apply competition pressure to all alive nodes.
   *
   * Must run AFTER ReinforcementField so activationScores
   * and reinforcement values are current.
   * Must run BEFORE HUIE so the penalized strength is
   * used in the next differential.
   *
   * @param {Node[]}            nodes
   * @param {Graph}             [graph]    — required for diversity pressure
   * @param {Map<string,Node>}  [nodeMap]  — required for diversity pressure
   */
  update(nodes, graph = null, nodeMap = null) {
    if (nodes.length === 0) return;

    // ── 1. Activation saturation ──────────────
    if (this.enableSaturation) {
      this._applySaturation(nodes);
    }

    // ── 2. Bandwidth competition ──────────────
    const totalActivation = nodes.reduce((sum, n) => {
      const A = isFiniteNum(n.activationScore) ? Math.abs(n.activationScore) : 0;
      return sum + A;
    }, 0);

    let totalPenalty = 0;
    let competed     = 0;

    if (totalActivation > 1e-9) {
      for (const node of nodes) {
        if (!node.alive) continue;

        const A     = isFiniteNum(node.activationScore) ? Math.abs(node.activationScore) : 0;
        const share = A / totalActivation;

        // Penalty proportional to activation dominance
        const penalty = share * this.pressure;
        if (penalty < 1e-6) continue;

        const H = isFiniteNum(node.strength) ? node.strength : 0;
        node.strength = clamp(H - penalty, 0, 1);
        totalPenalty += penalty;
        competed++;
      }
    }

    this.avgPenalty    = competed > 0 ? totalPenalty / competed : 0;
    this.competedCount = competed;

    // ── 3. Diversity pressure ──────────────────
    if (this.enableDiversity && graph && nodeMap) {
      this._applyDiversityPressure(nodes, graph, nodeMap);
    }

    this._pushHistory(this.avgPenalty);
  }

  // ── ACTIVATION SATURATION ─────────────────────

  /**
   * Apply tanh() to all activationScores.
   * Prevents infinite activation growth — output ∈ (−1, 1).
   * @param {Node[]} nodes
   */
  _applySaturation(nodes) {
    for (const node of nodes) {
      if (!node.alive) continue;
      const A = isFiniteNum(node.activationScore) ? node.activationScore : 0;
      node.activationScore = Math.tanh(A);
    }
  }

  // ── DIVERSITY PRESSURE ────────────────────────

  /**
   * Repel reinforcement between nodes that are semantically
   * near-identical (cosine similarity > diversityThreshold).
   *
   * If two connected nodes have near-identical embeddings,
   * their mutual reinforcement is damped — preventing
   * concept collapse into a single dominant representation.
   *
   * @param {Node[]}            nodes
   * @param {Graph}             graph
   * @param {Map<string,Node>}  nodeMap
   */
  _applyDiversityPressure(nodes, graph, nodeMap) {
    for (const node of nodes) {
      if (!node.alive || !node.embedding) continue;

      const nodeVec    = Array.from(node.embedding);
      const neighbors  = graph.getNeighbors(node.id);

      for (const { id } of neighbors) {
        const nbr = nodeMap.get(id);
        if (!nbr || !nbr.alive || !nbr.embedding) continue;

        const sim = cosineSimilarity(nodeVec, Array.from(nbr.embedding));
        if (!isFiniteNum(sim) || sim < this.diversityThreshold) continue;

        // Both nodes are near-duplicates: damp their reinforcement
        const currentR   = isFiniteNum(node.reinforcement) ? node.reinforcement : 0;
        node.reinforcement = currentR * this.diversityPenalty;
      }
    }
  }

  // ── MANUAL COMPETITION BOOST ─────────────────

  /**
   * Temporarily increase competition pressure.
   * Useful when the system is converging toward monopoly.
   * @param {number} multiplier
   * @param {number} [ticks=10]  — not auto-reset; caller must reset
   */
  setPressure(multiplier) {
    this.pressure = clamp(multiplier, 0, 1);
  }

  // ── QUERIES ─────────────────────────────────

  getHistory() { return [...this._history]; }

  getState() {
    return {
      avgPenalty:    this.avgPenalty,
      competedCount: this.competedCount,
      pressure:      this.pressure,
    };
  }

  _pushHistory(v) {
    this._history.push(v);
    if (this._history.length > this._bufferSize) this._history.shift();
  }
}


