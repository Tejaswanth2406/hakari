/**
 * HAKARI v3 — ecology/ResourceField.js
 * ─────────────────────────────────────────────
 * Block 0 — Ecological Layer
 *
 * Resource economy: nodes earn and spend energy.
 * Energy is the currency of cognition.
 *
 * Without resources, the positive loop:
 *   activation → reinforcement → growth (forever)
 *
 * With resources:
 *   activation → energy cost → survival pressure
 *
 * This forces the system to evolve efficient pathways
 * and prune nodes that don't justify their existence.
 * Inspired by Karl Friston's free-energy minimization
 * and metabolic constraint models in neuroscience.
 *
 * Per-tick energy equation:
 *   ΔE_i = reward − metabolism − activation_cost + sharing
 *
 *   reward          = reinforcement_i · rewardFactor
 *   metabolism      = metabolicCost                  (fixed baseline)
 *   activation_cost = |A_i| · activationCost         (activity tax)
 *   sharing         = Σ_j (w_ij · R_j · sharingRate) (neighbor gift)
 *
 * Death condition:
 *   node.energy <= 0 → node.pendingCollapse = true
 *   (DecayEngine finalizes collapse next tick)
 *
 * BLOCK 0 HARDENING:
 *   - NaN guard on all inputs
 *   - Energy sharing between neighbors (cooperative clusters)
 *   - Configurable cost/reward parameters
 *   - starvingCount diagnostic (early warning)
 * ─────────────────────────────────────────────
 */

import { isFiniteNum } from '../BLOCK1/numerics.js';
import { clamp }       from '../BLOCK1/math.js';
import { DIAGNOSTICS } from '../../BLOCK_12/BLOCK_15_UPGRADE/core/config.js';

export class ResourceField {

  /**
   * @param {object} [opts]
   * @param {number}  opts.metabolicCost   — energy lost per tick just for existing (default 0.002)
   * @param {number}  opts.activationCost  — energy lost per unit of |activationScore| (default 0.01)
   * @param {number}  opts.rewardFactor    — energy gained per unit of reinforcement (default 0.05)
   * @param {number}  opts.sharingRate     — fraction of neighbor reinforcement shared as energy (default 0.01)
   * @param {boolean} opts.enableSharing   — whether neighbors share energy (default true)
   * @param {number}  opts.energyFloor     — energy below this flags starvation (default 0.05)
   */
  constructor(opts = {}) {
    this.metabolicCost  = opts.metabolicCost  ?? 0.002;
    this.activationCost = opts.activationCost ?? 0.01;
    this.rewardFactor   = opts.rewardFactor   ?? 0.05;
    this.sharingRate    = opts.sharingRate    ?? 0.01;
    this.enableSharing  = opts.enableSharing  ?? true;
    this.energyFloor    = opts.energyFloor    ?? 0.05;

    this.avgEnergy      = 0;
    this.starvingCount  = 0;    // nodes below energyFloor
    this.diedCount      = 0;    // nodes that hit 0 energy this tick
    this._history       = [];
    this._bufferSize    = DIAGNOSTICS.CURVE_BUFFER_SIZE;
  }

  // ── UPDATE ───────────────────────────────────

  /**
   * Apply metabolic energy dynamics to all alive nodes.
   *
   * Must run AFTER ReinforcementField (needs node.reinforcement).
   * Must run AFTER CompetitionField (uses penalized activationScore).
   *
   * @param {Node[]}            nodes
   * @param {Graph}             [graph]   — required for energy sharing
   * @param {Map<string,Node>}  [nodeMap] — required for energy sharing
   */
  update(nodes, graph = null, nodeMap = null) {
    if (nodes.length === 0) return;

    // ── Pass 1: gather sharing contributions ──────
    // Computed before applying costs so we use pre-tick values
    const sharingGains = this.enableSharing && graph && nodeMap
      ? this._computeSharing(nodes, graph, nodeMap)
      : null;

    // ── Pass 2: apply costs and rewards ───────────
    let totalEnergy = 0;
    let starving    = 0;
    let died        = 0;

    for (const node of nodes) {
      if (!node.alive) continue;

      const E = isFiniteNum(node.energy) ? node.energy : 0.5;
      const A = isFiniteNum(node.activationScore) ? Math.abs(node.activationScore) : 0;
      const R = isFiniteNum(node.reinforcement)   ? node.reinforcement              : 0;

      // Costs
      const metabolism      = this.metabolicCost;
      const activationTax   = A * this.activationCost;

      // Rewards
      const reinforcementReward = Math.max(0, R) * this.rewardFactor;
      const shared = sharingGains ? (sharingGains.get(node.id) ?? 0) : 0;

      const dE   = reinforcementReward + shared - metabolism - activationTax;
      const newE = clamp(E + dE, 0, 1);

      node.energy = isFiniteNum(newE) ? newE : 0;

      if (node.energy <= 0) {
        // Flag for collapse — DecayEngine handles actual removal
        node.pendingCollapse = true;
        died++;
      } else if (node.energy < this.energyFloor) {
        starving++;
      }

      totalEnergy += node.energy;
    }

    this.avgEnergy     = totalEnergy / nodes.length;
    this.starvingCount = starving;
    this.diedCount     = died;
    this._pushHistory(this.avgEnergy);
  }

  // ── ENERGY SHARING ────────────────────────────

  /**
   * Compute how much energy each node receives from neighbors.
   * Cooperative clusters sustain each other.
   *
   *   gift_j += w_ij · R_i · sharingRate
   *
   * @param {Node[]}            nodes
   * @param {Graph}             graph
   * @param {Map<string,Node>}  nodeMap
   * @returns {Map<string, number>}
   */
  _computeSharing(nodes, graph, nodeMap) {
    const gains = new Map();

    for (const node of nodes) {
      if (!node.alive) continue;
      const R = isFiniteNum(node.reinforcement) ? Math.max(0, node.reinforcement) : 0;
      if (R < 1e-6) continue;

      for (const { id, weight } of graph.getNeighbors(node.id)) {
        const nbr = nodeMap.get(id);
        if (!nbr || !nbr.alive) continue;
        const w    = isFiniteNum(weight) ? weight : 0;
        const gift = w * R * this.sharingRate;
        if (gift > 0) gains.set(id, (gains.get(id) ?? 0) + gift);
      }
    }

    return gains;
  }

  // ── EMERGENCY INJECTION ───────────────────────

  /**
   * Inject energy into all nodes (emergency stabilization).
   * Use when avgEnergy drops dangerously low.
   * @param {Node[]} nodes
   * @param {number} amount — energy to add (default 0.2)
   */
  injectEnergy(nodes, amount = 0.2) {
    for (const node of nodes) {
      if (!node.alive) continue;
      node.energy = clamp((node.energy ?? 0) + amount, 0, 1);
    }
  }

  // ── DIAGNOSTICS ─────────────────────────────

  /**
   * True if system is in energy crisis (mass starvation).
   * @param {number} threshold — fraction of nodes starving (default 0.5)
   */
  isCrisis(nodes, threshold = 0.5) {
    return nodes.length > 0 && this.starvingCount / nodes.length > threshold;
  }

  getHistory() { return [...this._history]; }

  getState() {
    return {
      avgEnergy:     this.avgEnergy,
      starvingCount: this.starvingCount,
      diedCount:     this.diedCount,
    };
  }

  _pushHistory(v) {
    this._history.push(v);
    if (this._history.length > this._bufferSize) this._history.shift();
  }
}


