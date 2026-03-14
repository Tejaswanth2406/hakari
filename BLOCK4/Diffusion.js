/**
 * HAKARI v3 — network/Diffusion.js
 * ─────────────────────────────────────────────
 * Implements belief and information diffusion
 * across the knowledge graph.
 * New Hakari module.
 *
 * Two diffusion processes:
 *
 * 1. Strength diffusion (soft pull toward neighbors):
 *    ΔHᵢ += α_diff · Σ wᵢⱼ · (Hⱼ − Hᵢ)
 *    Applied as additive impulse to node.infoInput
 *    (feeds into HUIE α·Iᵢ term naturally).
 *
 * 2. Belief diffusion (Bayesian spreading):
 *    belief_i += α_belief · Σ wᵢⱼ · (belief_j − belief_i)
 *    Normalised after each step.
 *
 * Both processes run at controlled rates and are
 * numerically stabilized against NaN propagation.
 *
 * Physical interpretation:
 *   Diffusion = idea spreading through association network
 *   High wᵢⱼ → fast spreading between concepts
 * ─────────────────────────────────────────────
 */

import { clamp }               from '../BLOCK1/math.js';
import { normalizeDistribution } from '../BLOCK1/probability.js';
import { isFiniteNum, allFinite } from '../BLOCK1/numerics.js';

export class Diffusion {

  /**
   * @param {object} [opts]
   * @param {number} opts.strengthAlpha  — strength diffusion rate (default 0.05)
   * @param {number} opts.beliefAlpha    — belief diffusion rate (default 0.08)
   * @param {boolean} opts.enableStrength — toggle strength diffusion (default true)
   * @param {boolean} opts.enableBelief  — toggle belief diffusion (default true)
   */
  constructor(opts = {}) {
    this.strengthAlpha  = opts.strengthAlpha  ?? 0.05;
    this.beliefAlpha    = opts.beliefAlpha    ?? 0.08;
    this.enableStrength = opts.enableStrength ?? true;
    this.enableBelief   = opts.enableBelief   ?? true;

    this.totalStrengthFlux = 0;  // Σ |ΔHᵢ| last tick (diagnostic)
    this.totalBeliefFlux   = 0;  // Σ KL(post‖prior) last tick
  }

  // ── MAIN UPDATE ─────────────────────────────

  /**
   * Run one diffusion step across all nodes.
   * Strength diffusion writes to node.infoInput (additive).
   * Belief diffusion writes to node.belief (normalized).
   *
   * @param {Node[]}           nodes
   * @param {Graph}            graph
   * @param {Map<string,Node>} nodeMap
   * @param {number}           dt  — time step
   */
  update(nodes, graph, nodeMap, dt) {
    this.totalStrengthFlux = 0;
    this.totalBeliefFlux   = 0;

    if (this.enableStrength) {
      this._diffuseStrength(nodes, graph, nodeMap, dt);
    }
    if (this.enableBelief) {
      this._diffuseBelief(nodes, graph, nodeMap, dt);
    }
  }

  // ── STRENGTH DIFFUSION ───────────────────────

  /**
   * Heat-equation style strength diffusion.
   *
   * ΔHᵢ = α_diff · Σ wᵢⱼ · (Hⱼ − Hᵢ)
   *
   * Written to node.infoInput as additive impulse,
   * capped to prevent amplification of HUIE.
   *
   * @param {Node[]}           nodes
   * @param {Graph}            graph
   * @param {Map<string,Node>} nodeMap
   * @param {number}           dt
   */
  _diffuseStrength(nodes, graph, nodeMap, dt) {
    const alpha = this.strengthAlpha * dt;
    let flux = 0;

    for (const node of nodes) {
      const neighbors = graph.getNeighbors(node.id);
      if (neighbors.length === 0) continue;

      const Hi = isFiniteNum(node.strength) ? node.strength : 0;
      let delta = 0;

      for (const { id, weight } of neighbors) {
        const nbr = nodeMap.get(id);
        if (!nbr || !nbr.alive) continue;

        const Hj = isFiniteNum(nbr.strength) ? nbr.strength : 0;
        const w  = isFiniteNum(weight)        ? weight       : 0;
        const d  = w * (Hj - Hi);
        if (isFiniteNum(d)) delta += d;
      }

      const impulse = clamp(alpha * delta, -0.1, 0.1);
      node.infoInput = clamp(
        (isFiniteNum(node.infoInput) ? node.infoInput : 0) + impulse,
        0,
        4.0
      );
      flux += Math.abs(impulse);
    }

    this.totalStrengthFlux = flux;
  }

  // ── BELIEF DIFFUSION ─────────────────────────

  /**
   * Belief diffusion: each node's belief is pulled
   * toward a weighted average of neighbor beliefs.
   *
   * belief_i(t+1) ∝ belief_i + α_belief · Σ wᵢⱼ · (belief_j − belief_i)
   *
   * Normalised after update.
   * Only runs if BeliefField has initialized beliefs on nodes.
   *
   * @param {Node[]}           nodes
   * @param {Graph}            graph
   * @param {Map<string,Node>} nodeMap
   * @param {number}           dt
   */
  _diffuseBelief(nodes, graph, nodeMap, dt) {
    const alpha = this.beliefAlpha * dt;
    let flux = 0;

    for (const node of nodes) {
      if (!node.belief) continue;
      const K = node.belief.length;

      const neighbors = graph.getNeighbors(node.id);
      if (neighbors.length === 0) continue;

      // Accumulate weighted belief delta
      const delta = new Float32Array(K);
      let totalW  = 0;

      for (const { id, weight } of neighbors) {
        const nbr = nodeMap.get(id);
        if (!nbr || !nbr.alive || !nbr.belief) continue;
        if (nbr.belief.length !== K) continue;

        const w = isFiniteNum(weight) ? weight : 0;
        totalW += w;

        for (let k = 0; k < K; k++) {
          const d = nbr.belief[k] - node.belief[k];
          if (isFiniteNum(d)) delta[k] += w * d;
        }
      }

      if (totalW < 1e-9) continue;

      // Apply delta
      let kl = 0;
      const updated = new Float32Array(K);
      for (let k = 0; k < K; k++) {
        const prev = node.belief[k];
        updated[k] = Math.max(0, prev + alpha * delta[k]);
        kl += Math.abs(updated[k] - prev);
      }

      // Normalize to valid distribution
      const normalized = normalizeDistribution(Array.from(updated));
      for (let k = 0; k < K; k++) node.belief[k] = normalized[k];

      flux += kl;
    }

    this.totalBeliefFlux = flux;
  }

  // ── DIAGNOSTICS ─────────────────────────────

  getState() {
    return {
      totalStrengthFlux: this.totalStrengthFlux,
      totalBeliefFlux:   this.totalBeliefFlux,
      strengthAlpha:     this.strengthAlpha,
      beliefAlpha:       this.beliefAlpha,
    };
  }
}

