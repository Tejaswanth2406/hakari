/**
 * HAKARI v3 — physics/PhysicsEngine.js
 * ─────────────────────────────────────────────
 * Master physics coordinator.
 * Runs the complete physics pipeline every tick.
 *
 * Pipeline order (deterministic):
 *
 *   1. EntropyField.compute()       — compute S
 *   2. EntropyLaw.enforceStrengthBounds() — clamp Hᵢ, flag collapses
 *   3. EnergyField.update()         — Eᵢ = ε·Hᵢ², enforce ceiling
 *   4. InformationFlow.update()     — Iᵢ distribution
 *   5. BeliefField.update()         — Bayesian belief updates
 *   6. InformationFlow.applyEIGBoost() — EIG → info augment
 *   7. InformationForce.compute()   — uncertainty force
 *   8. InformationForce.applyMICoupling() — MI edge coupling
 *   9. InformationFlow.applyQueryBoost() — active query boost
 *  10. EntropyLaw.enforceEntropyBound()  — final S clamp
 *
 * Single entry point: PhysicsEngine.update()
 * ─────────────────────────────────────────────
 */

import { EntropyField }      from './BLOCK5/Entropyfeild.js';
import { InformationFlow }   from '../BLOCK_12/BLOCK_15_UPGRADE/physics/InformationFlow.js';
import { EnergyField }       from './BLOCK2/Energyfeild.js';
import { BeliefField }       from './BeliefField.js';
import { InformationForce }  from './BLOCK2/Informationforce.js';
import { EntropyLaw }        from './BLOCK5/Thermodynamicsengiene.js';

export class PhysicsEngine {

  /**
   * @param {object} [opts]
   * @param {boolean} opts.enableBeliefField    — toggle Bayesian layer (default true)
   * @param {boolean} opts.enableInfoForce      — toggle exploration force (default true)
   * @param {boolean} opts.enableMICoupling     — toggle MI coupling (default true)
   * @param {object}  opts.beliefOpts           — passed to BeliefField constructor
   * @param {object}  opts.forceOpts            — passed to InformationForce constructor
   */
  constructor(opts = {}) {
    this.entropyField     = new EntropyField();
    this.informationFlow  = new InformationFlow();
    this.energyField      = new EnergyField();
    this.entropyLaw       = new EntropyLaw();
    this.beliefField      = new BeliefField(opts.beliefOpts   ?? {});
    this.informationForce = new InformationForce(opts.forceOpts ?? {});

    this._enableBelief    = opts.enableBeliefField ?? true;
    this._enableForce     = opts.enableInfoForce   ?? true;
    this._enableMI        = opts.enableMICoupling  ?? true;

    // Current tick entropy (written each update — readable by engine)
    this.entropy   = 0;
    this._tick     = 0;
    this._queryBoost = 0;
  }

  // ── MAIN UPDATE ─────────────────────────────

  /**
   * Run the full physics pipeline for one tick.
   *
   * @param {Node[]}           nodes    — all alive nodes
   * @param {object}           params   — live PARAMS object
   * @param {Graph}            graph    — network topology
   * @param {Map<string,Node>} nodeMap  — id → node lookup
   */
  update(nodes, params, graph, nodeMap) {
    this._tick++;

    // ── Step 1: Compute raw entropy ────────────
    const rawS = this.entropyField.compute(nodes);

    // ── Step 2: Clamp node strengths ───────────
    // (collapses flagged here, not removed yet)
    this.entropyLaw.enforceStrengthBounds(nodes);

    // ── Step 3: Energy field ───────────────────
    this.energyField.update(nodes, params);

    // ── Step 4: Information flow (base) ────────
    this.informationFlow.update(nodes, rawS);

    // ── Steps 5-6: Belief field + EIG boost ────
    if (this._enableBelief) {
      this.beliefField.update(nodes, this._tick);
      this.informationFlow.applyEIGBoost(nodes);
    }

    // ── Steps 7-8: Information force ───────────
    if (this._enableForce) {
      this.informationForce.compute(nodes, rawS);

      if (this._enableMI && graph && nodeMap) {
        this.informationForce.applyMICoupling(nodes, graph, nodeMap);
      }
    }

    // ── Step 9: Query boost (if active) ────────
    if (this._queryBoost > 0) {
      this.informationFlow.applyQueryBoost(nodes, this._queryBoost);
      this._queryBoost = 0;   // consumed once per tick
    }

    // ── Step 10: Final entropy bound ───────────
    this.entropy = this.entropyLaw.enforceEntropyBound(rawS, nodes.length);
  }

  // ── NEIGHBOR ENERGY PROXY ───────────────────

  /**
   * Convenience pass-through: neighbor energy for HUIE β term.
   *
   * @param {string}           nodeId
   * @param {Graph}            graph
   * @param {Map<string,Node>} nodeMap
   * @returns {number}
   */
  neighborEnergy(nodeId, graph, nodeMap) {
    return this.energyField.neighborEnergy(nodeId, graph, nodeMap);
  }

  // ── QUERY ACTIVATION ────────────────────────

  /**
   * Signal an active query to apply boost next tick.
   * Called by the retrieval layer when a query fires.
   *
   * @param {number} boost  — boost multiplier (default 1.0)
   */
  signalQuery(boost = 1.0) {
    this._queryBoost = boost;
  }

  // ── NODE INITIALIZATION ──────────────────────

  /**
   * Initialize physics state on a newly spawned node.
   * Called by NodeFactory after node creation.
   *
   * @param {Node} node
   */
  initNode(node) {
    if (this._enableBelief) {
      this.beliefField.initNode(node);
    }
  }

  // ── DIAGNOSTICS ─────────────────────────────

  /**
   * Snapshot of all physics sub-system states.
   * @returns {object}
   */
  getState() {
    return {
      entropy:         this.entropy,
      tick:            this._tick,
      entropyField:    this.entropyField.getState(),
      informationFlow: this.informationFlow.getState(),
      energyField:     this.energyField.getState(),
      entropyLaw:      this.entropyLaw.getState(),
      beliefField:     this._enableBelief ? this.beliefField.getState()      : null,
      infoForce:       this._enableForce  ? this.informationForce.getState() : null,
    };
  }
}



