/**
 * HAKARI v3 — ecology/EcologyEngine.js
 * ─────────────────────────────────────────────
 * Block 0 — master coordinator for the ecological layer.
 *
 * The ecology layer adds the third balancing system:
 *
 *   Physics Layer    → HUIE, entropy, energy field
 *   Cognitive Layer  → activation, reinforcement, memory
 *   Ecological Layer → competition, resource economy, survival
 *
 * Tick pipeline (runs inside the main HAKARI tick,
 * AFTER ReinforcementField, BEFORE HUIE):
 *
 *   1. competitionField.update()   — bandwidth competition + saturation + diversity
 *   2. resourceField.update()      — metabolic costs + reward + energy sharing
 *
 * The pipeline order is critical:
 *   - Competition runs first to apply tanh saturation
 *     so ResourceField sees bounded activation costs.
 *   - ResourceField flags dying nodes (pendingCollapse)
 *     which DecayEngine processes next tick.
 *
 * Full hardened HAKARI tick order (reference):
 *
 *   1.  QueryActivation
 *   2.  KnowledgeDiffusion
 *   3.  ReinforcementField
 *   [4. EcologyEngine.update()]
 *       4a. CompetitionField    ← saturation + bandwidth + diversity
 *       4b. ResourceField       ← metabolism + reward + sharing
 *   5.  HUIE differential
 *   6.  EntropyLaw clamp
 *   7.  MemoryConsolidation
 *   8.  KnowledgeDecay
 *   9.  ThermodynamicEngine (entropy, T, F, decay, phase)
 *   10. NetworkEngine (connectivity, graph energy, diffusion)
 *   11. Retrieval
 *   12. MetaOptimizer
 * ─────────────────────────────────────────────
 */

import { CompetitionField } from './CompetitionField.js';
import { ResourceField }    from './ResourceField.js';

export class EcologyEngine {

  /**
   * @param {object}   [opts]
   * @param {boolean}  opts.enableCompetition  — default true
   * @param {boolean}  opts.enableResources    — default true
   * @param {object}   opts.competitionOpts    — passed to CompetitionField
   * @param {object}   opts.resourceOpts       — passed to ResourceField
   */
  constructor(opts = {}) {
    this.competitionField = new CompetitionField(opts.competitionOpts ?? {});
    this.resourceField    = new ResourceField(opts.resourceOpts ?? {});

    this._enableCompetition = opts.enableCompetition ?? true;
    this._enableResources   = opts.enableResources   ?? true;

    this._tick = 0;
  }

  // ── MAIN UPDATE ─────────────────────────────

  /**
   * Run the full ecological pipeline for one tick.
   *
   * Must be called AFTER ReinforcementField.
   *
   * @param {Node[]}            nodes
   * @param {Graph}             graph
   * @param {Map<string,Node>}  nodeMap
   */
  update(nodes, graph, nodeMap) {
    this._tick++;

    // ── Step 1: Competition ────────────────────
    if (this._enableCompetition) {
      this.competitionField.update(nodes, graph, nodeMap);
    }

    // ── Step 2: Resource economy ───────────────
    if (this._enableResources) {
      this.resourceField.update(nodes, graph, nodeMap);
    }
  }

  // ── MANUAL CONTROLS ─────────────────────────

  /**
   * Emergency energy injection (UI or MetaOptimizer).
   * @param {Node[]} nodes
   * @param {number} amount
   */
  injectEnergy(nodes, amount = 0.2) {
    this.resourceField.injectEnergy(nodes, amount);
  }

  /**
   * Temporarily increase competition pressure.
   * @param {number} pressure ∈ [0,1]
   */
  setCompetitionPressure(pressure) {
    this.competitionField.setPressure(pressure);
  }

  /**
   * True if system is in energy crisis.
   * @param {Node[]} nodes
   */
  isCrisis(nodes) {
    return this.resourceField.isCrisis(nodes);
  }

  // ── DIAGNOSTICS ─────────────────────────────

  getState() {
    return {
      tick:         this._tick,
      competition:  this._enableCompetition ? this.competitionField.getState() : null,
      resources:    this._enableResources   ? this.resourceField.getState()    : null,
    };
  }
}