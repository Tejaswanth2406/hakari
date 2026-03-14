/**
 * HAKARI v3 — network/ClusterEntropy.js
 * ─────────────────────────────────────────────
 * Computes structural entropy of the network topology.
 * New Hakari module.
 *
 * Measures how "organized" the knowledge graph is:
 *
 *   S_struct = −Σ pᵢ · log(pᵢ)
 *
 * where pᵢ = size of cluster i / total nodes
 *
 * Low S_struct  → highly organized (few large clusters)
 *              → concept emergence
 * High S_struct → fragmented (many small clusters)
 *              → pre-collapse state
 *
 * Also detects:
 *   - Phase transitions (rapid entropy change)
 *   - Dominant cluster emergence
 *   - Network fragmentation
 * ─────────────────────────────────────────────
 */

import { clamp }       from '../BLOCK1/math.js';
import { isFiniteNum } from '../BLOCK1/numerics.js';

export class ClusterEntropy {

  constructor() {
    this.structuralEntropy     = 0;   // S_struct
    this.structuralEntropyNorm = 0;   // S_struct / ln(N)
    this.clusterCount          = 0;
    this.dominantClusterSize   = 0;   // size of largest cluster
    this.dominantClusterRatio  = 0;   // largest cluster / N

    this._prevEntropy          = 0;
    this.entropyGradient       = 0;   // ΔS per tick
    this.phaseTransitionFlag   = false;
    this._history              = [];
    this._bufferSize           = 100;
  }

  // ── UPDATE ──────────────────────────────────

  /**
   * Compute structural entropy from current cluster structure.
   *
   * @param {Node[]}  nodes
   * @param {Graph}   graph
   * @param {Connectivity} connectivity  — for cluster data
   */
  update(nodes, graph, connectivity) {
    const N = nodes.length;
    if (N === 0) {
      this._zero(); return;
    }

    // Get clusters from Connectivity
    const clusters = connectivity.findClusters(nodes, graph);
    this.clusterCount = clusters.length;

    // Cluster size distribution
    const sizes = clusters.map(c => c.length);
    const largest = sizes[0] ?? 0;   // sorted largest first

    this.dominantClusterSize  = largest;
    this.dominantClusterRatio = largest / N;

    // Structural entropy: H = -Σ pᵢ log(pᵢ) over cluster sizes
    let S = 0;
    for (const size of sizes) {
      const p = size / N;
      if (p > 1e-12) S -= p * Math.log(p);
    }

    this._prevEntropy         = this.structuralEntropy;
    this.structuralEntropy    = isFiniteNum(S) ? S : 0;
    this.structuralEntropyNorm = N > 1
      ? this.structuralEntropy / Math.log(N)
      : 0;

    this.entropyGradient = this.structuralEntropy - this._prevEntropy;

    // Phase transition: rapid entropy shift
    this.phaseTransitionFlag = Math.abs(this.entropyGradient) > 0.05;

    // History buffer
    this._history.push(this.structuralEntropy);
    if (this._history.length > this._bufferSize) this._history.shift();
  }

  // ── DETECTION SIGNALS ───────────────────────

  /**
   * True if the network is consolidating into large clusters.
   * (entropy falling + large dominant cluster)
   */
  isConsolidating() {
    return this.entropyGradient < -0.02 && this.dominantClusterRatio > 0.4;
  }

  /**
   * True if the network is fragmenting (entropy rising sharply).
   */
  isFragmenting() {
    return this.entropyGradient > 0.03 && this.dominantClusterRatio < 0.3;
  }

  /**
   * Network health score ∈ [0,1].
   * High score = organized, connected network.
   * 0 = fully fragmented.
   */
  healthScore() {
    // Healthy: low structural entropy + high dominant ratio
    const entropyPenalty  = clamp(this.structuralEntropyNorm, 0, 1);
    const connectedness   = this.dominantClusterRatio;
    return clamp(connectedness * (1 - 0.5 * entropyPenalty), 0, 1);
  }

  /**
   * Recent trend in structural entropy.
   * @param {number} [window=20]
   * @returns {'rising'|'falling'|'stable'}
   */
  entropyTrend(window = 20) {
    const h = this._history;
    if (h.length < window) return 'stable';
    const half  = Math.floor(window / 2);
    const slice = h.slice(-window);
    const early = slice.slice(0, half).reduce((s, v) => s + v, 0) / half;
    const late  = slice.slice(half).reduce((s, v) => s + v, 0) / (window - half);
    const delta = late - early;
    if (delta >  0.02) return 'rising';
    if (delta < -0.02) return 'falling';
    return 'stable';
  }

  _zero() {
    this.structuralEntropy     = 0;
    this.structuralEntropyNorm = 0;
    this.clusterCount          = 0;
    this.dominantClusterSize   = 0;
    this.dominantClusterRatio  = 0;
    this.entropyGradient       = 0;
    this.phaseTransitionFlag   = false;
  }

  // ── DIAGNOSTICS ─────────────────────────────

  getState() {
    return {
      structuralEntropy:     this.structuralEntropy,
      structuralEntropyNorm: this.structuralEntropyNorm,
      clusterCount:          this.clusterCount,
      dominantClusterRatio:  this.dominantClusterRatio,
      entropyGradient:       this.entropyGradient,
      phaseTransition:       this.phaseTransitionFlag,
      consolidating:         this.isConsolidating(),
      fragmenting:           this.isFragmenting(),
      healthScore:           this.healthScore(),
      trend:                 this.entropyTrend(),
    };
  }
}

