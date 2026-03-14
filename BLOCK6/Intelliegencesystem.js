/**
 * HAKARI v3 — intelligence/IntelligenceEngine.js
 * ─────────────────────────────────────────────
 * Master coordinator for the intelligence layer.
 * Block 6 single entry point.
 *
 * Pipeline order (deterministic, every tick):
 *
 *   1. attentionField.decayActivations()    — fade stale activations
 *   2. attentionField.updateStructuralAttention() — bottom-up salience
 *   3. informationGain.update()             — IG per node (uses belief from BeliefField)
 *   4. bayesianBelief.update()              — B_i confidence scores
 *   5. utilityField.update()                — EU scores per node
 *   6. reinforcementField.update()          — Rᵢ + Hebbian edges
 *   7. huie.update()                        — apply extended dH/dt
 *
 * Query pipeline (on-demand, not every tick):
 *   attentionField.activateQuery()
 *   utilityField.activateQuery()
 *   → returned top-K nodes
 *
 * Exposes all sub-engines for direct access by
 * the main Hakari engine and diagnostics.
 * ─────────────────────────────────────────────
 */

import { HUIE }                from '../BLOCK_12/BLOCK_15_UPGRADE/intelligence/HUIE.js';
import { ReinforcementField }  from '../BLOCK_12/BLOCK_15_UPGRADE/intelligence/ReinforcementField.js';
import { InformationGain }     from './InformationGain.js';
import { BayesianBelief }      from './BayesianBelief.js';
import { UtilityField }        from './UtilityField.js';
import { AttentionField }      from './AttentionField.js';
import { sampleUniform }       from '../BLOCK1/random.js';

export class IntelligenceEngine {

  /**
   * @param {object}   [opts]
   * @param {Function} opts.rng                  — seeded RNG for HUIE noise
   * @param {boolean}  opts.enableIG             — default true
   * @param {boolean}  opts.enableBelief         — default true
   * @param {boolean}  opts.enableUtility        — default true
   * @param {object}   opts.huieOpts             — passed to HUIE constructor
   * @param {object}   opts.utilityOpts          — passed to UtilityField constructor
   */
  constructor(opts = {}) {
    const rng = opts.rng ?? sampleUniform;

    this.huie               = new HUIE({ rng, ...opts.huieOpts });
    this.reinforcementField = new ReinforcementField();
    this.informationGain    = new InformationGain();
    this.bayesianBelief     = new BayesianBelief();
    this.utilityField       = new UtilityField(opts.utilityOpts ?? {});
    this.attentionField     = new AttentionField();

    this._enableIG      = opts.enableIG      ?? true;
    this._enableBelief  = opts.enableBelief  ?? true;
    this._enableUtility = opts.enableUtility ?? true;

    this._tick = 0;
  }

  // ── MAIN UPDATE ─────────────────────────────

  /**
   * Run the full intelligence pipeline for one tick.
   *
   * @param {Node[]}           nodes
   * @param {number}           S          — clamped system entropy
   * @param {object}           energySrc  — EnergyField or NetworkEngine
   * @param {Graph}            graph
   * @param {Map<string,Node>} nodeMap
   * @param {object}           params     — live PARAMS
   * @param {number}           dt
   */
  update(nodes, S, energySrc, graph, nodeMap, params, dt) {
    this._tick++;

    // ── Step 1-2: Attention ────────────────────
    this.attentionField.decayActivations(nodes);
    this.attentionField.updateStructuralAttention(nodes);

    // ── Step 3: Information gain ───────────────
    if (this._enableIG) {
      this.informationGain.update(nodes);
    }

    // ── Step 4: Belief confidence ──────────────
    if (this._enableBelief) {
      this.bayesianBelief.update(nodes);
    }

    // ── Step 5: Utility scores ─────────────────
    if (this._enableUtility) {
      this.utilityField.update(nodes, graph, nodeMap);
    }

    // ── Step 6: Reinforcement + Hebbian ────────
    this.reinforcementField.update(nodes, graph, nodeMap);

    // ── Step 7: HUIE differential ─────────────
    this.huie.update(nodes, S, energySrc, graph, nodeMap, params, dt);
  }

  // ── QUERY PIPELINE ───────────────────────────

  /**
   * Activate the field with a query embedding.
   * Runs attention activation and flags utility field.
   *
   * @param {Node[]}   nodes
   * @param {number[]} queryVec
   * @param {object}   params
   * @param {number}   tick
   * @returns {Node[]} top-K activated nodes
   */
  query(nodes, queryVec, params, tick) {
    this.utilityField.activateQuery();
    const topK = this.attentionField.activateQuery(nodes, queryVec, params, tick);
    return topK;
  }

  /**
   * Clear query activation state.
   * @param {Node[]} nodes
   */
  clearQuery(nodes) {
    this.attentionField.clearActivations(nodes);
    this.utilityField.clearQuery();
  }

  // ── DIAGNOSTICS ─────────────────────────────

  getState() {
    return {
      tick:               this._tick,
      huie:               this.huie.getState(),
      reinforcement:      this.reinforcementField.getState(),
      informationGain:    this._enableIG      ? this.informationGain.getState()  : null,
      bayesianBelief:     this._enableBelief  ? this.bayesianBelief.getState()   : null,
      utilityField:       this._enableUtility ? this.utilityField.getState()     : null,
      attentionField:     this.attentionField.getState(),
    };
  }
}



