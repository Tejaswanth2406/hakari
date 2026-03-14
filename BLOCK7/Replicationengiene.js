/**
 * HAKARI v3 — evolution/ReplicationEngine.js
 * ─────────────────────────────────────────────
 * Nodes with high fitness spawn mutated children.
 * New Hakari ALife module.
 *
 * Replication rules:
 *   - Only nodes with fitness > minFitness replicate
 *   - Stochastic: p(replicate) = replicationRate per tick
 *   - Child inherits parent embedding with Gaussian mutation
 *   - Child strength = parent.strength × noiseScale
 *   - Hard cap: totalNodes < MAX_NODES
 *
 * Mutation introduces variation essential for evolution.
 * Selection (via DecayEngine + ResourceField) removes weak nodes.
 * Together: variation + selection = open-ended adaptation.
 *
 * BLOCK 7 HARDENING vs sketch:
 *   - Hard MAX_NODES cap before creating any child
 *   - Seeded RNG (reproducible evolution)
 *   - Gaussian noise on embedding (not structuredClone corruption)
 *   - Returns new nodes (caller injects into field)
 *   - NaN guard on mutation
 * ─────────────────────────────────────────────
 */

import { isFiniteNum }   from '../BLOCK1/numerics.js';
import { clamp }         from '../BLOCK1/math.js';
import { sampleUniform, sampleGaussian } from '../BLOCK1/random.js';

const MAX_NODES          = 1500;
const MIN_FITNESS        = 0.8;
const REPLICATION_RATE   = 0.05;   // prob per eligible node per step
const MUTATION_STD       = 0.05;   // Gaussian noise std on embedding dims
const STRENGTH_NOISE     = 0.1;    // strength variation ∈ ±10%

export class ReplicationEngine {

  /**
   * @param {NodeFactory} nodeFactory
   * @param {object}      [opts]
   * @param {Function}    opts.rng          — seeded RNG (default: global)
   * @param {number}      opts.maxNodes     — hard cap (default 1500)
   * @param {number}      opts.minFitness   — fitness threshold (default 0.8)
   * @param {number}      opts.rate         — replication probability (default 0.05)
   */
  constructor(nodeFactory, opts = {}) {
    this.nodeFactory  = nodeFactory;
    this._rng         = opts.rng        ?? sampleUniform;
    this._maxNodes    = opts.maxNodes   ?? MAX_NODES;
    this._minFitness  = opts.minFitness ?? MIN_FITNESS;
    this._rate        = opts.rate       ?? REPLICATION_RATE;

    this.totalReplicated = 0;
    this.totalBlocked    = 0;   // blocked by cap
  }

  /**
   * Attempt replication for high-fitness nodes.
   * Returns new child nodes — caller adds to field.
   *
   * @param {Node[]}       nodes
   * @param {FitnessField} fitnessField
   * @param {number}       currentCount — total alive node count
   * @returns {Node[]}
   */
  replicate(nodes, fitnessField, currentCount) {
    const children = [];

    for (const node of nodes) {
      if (!node.alive) continue;
      if (currentCount + children.length >= this._maxNodes) {
        this.totalBlocked++;
        break;
      }

      const fitness = fitnessField.get(node.id);
      if (fitness < this._minFitness) continue;
      if (this._rng() >= this._rate)  continue;

      const child = this._mutate(node);
      if (child) {
        children.push(child);
        this.totalReplicated++;
      }
    }

    return children;
  }

  // ── MUTATION ──────────────────────────────────

  /**
   * Create a mutated child of the given node.
   * - New unique ID
   * - Gaussian-perturbed embedding
   * - Strength with ±10% noise
   * - Source tagged as 'replicated'
   *
   * @param {Node} parent
   * @returns {Node|null}
   */
  _mutate(parent) {
    try {
      // Mutate embedding
      const parentVec = parent.embedding
        ? Array.from(parent.embedding)
        : new Array(128).fill(0);

      const mutatedVec = parentVec.map(v => {
        const noise = sampleGaussian(0, MUTATION_STD, this._rng);
        const out   = v + (isFiniteNum(noise) ? noise : 0);
        return isFiniteNum(out) ? out : v;
      });

      // Mutate strength
      const strengthNoise = (this._rng() - 0.5) * 2 * STRENGTH_NOISE;
      const strength = clamp(
        (isFiniteNum(parent.strength) ? parent.strength : 0.5) * (0.9 + strengthNoise),
        0.05, 1
      );

      const child = this.nodeFactory.fromEmbedding(
        `${parent.label ?? parent.id} [child]`,
        mutatedVec,
        { strength, source: 'replicated' }
      );

      return child;
    } catch (err) {
      console.warn('[ReplicationEngine] Mutation failed:', err.message);
      return null;
    }
  }

  getState() {
    return {
      totalReplicated: this.totalReplicated,
      totalBlocked:    this.totalBlocked,
      maxNodes:        this._maxNodes,
      minFitness:      this._minFitness,
    };
  }
}

