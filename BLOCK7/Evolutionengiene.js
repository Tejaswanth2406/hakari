/**
 * HAKARI v3 — evolution/EvolutionEngine.js
 * ─────────────────────────────────────────────
 * Master coordinator for Block 7 — the evolution layer.
 *
 * Combines three optimization timescales:
 *
 *   Fast  (every tick) : PredictiveModel, SurpriseField
 *   Medium (every 30t) : ObjectiveFunction, MetaOptimizer
 *   Slow  (every 60t) : FitnessField, ReplicationEngine
 *
 * Pipeline order (every tick):
 *   1. predictiveModel.updateVelocities()  — track ΔH
 *   2. predictiveModel.writeErrors()       — ε per node
 *   3. surpriseField.update()              — mean |ε|
 *   4. metaOptimizer.tick()                — gradient step (every N ticks)
 *   5. fitnessField.update()               — fitness scores (every M ticks)
 *   6. replicationEngine.replicate()       — spawn children (every M ticks)
 *
 * Exposes:
 *   this.parameterField  — live params read by all subsystems
 *   this.objectiveFn     — current J / F score
 * ─────────────────────────────────────────────
 */

import { ObjectiveFunction }  from '../BLOCK_12/BLOCK_15_UPGRADE/evolution/ObjectiveFunction.js';
import { ParameterField }     from '../BLOCK_12/BLOCK_15_UPGRADE/evolution/ParameterField.js';
import { MetaOptimizer }      from '../BLOCK_12/BLOCK_15_UPGRADE/evolution/MetaOptimizer.js';
import { PredictiveModel }    from './BLOCK7/Predictivemodel.js';
import { SurpriseField }      from './SurpriseField.js';
import { FitnessField }       from './FitnessField.js';
import { ReplicationEngine }  from './ReplicationEngine.js';

const REPLICATION_EVERY_N = 60;   // ticks between replication passes

export class EvolutionEngine {

  /**
   * @param {object}      [opts]
   * @param {NodeFactory} opts.nodeFactory        — required for replication
   * @param {Function}    opts.rng                — seeded RNG
   * @param {string}      opts.objectiveMode      — 'objective' | 'free_energy'
   * @param {boolean}     opts.enableReplication  — default true
   * @param {boolean}     opts.enablePrediction   — default true
   * @param {object}      opts.objectiveOpts      — passed to ObjectiveFunction
   * @param {object}      opts.replicationOpts    — passed to ReplicationEngine
   */
  constructor(opts = {}) {
    this.objectiveFn      = new ObjectiveFunction(opts.objectiveOpts ?? { mode: opts.objectiveMode ?? 'objective' });
    this.parameterField   = new ParameterField();
    this.metaOptimizer    = new MetaOptimizer(this.objectiveFn, this.parameterField);
    this.predictiveModel  = new PredictiveModel();
    this.surpriseField    = new SurpriseField();
    this.fitnessField     = new FitnessField();
    this.replicationEngine = opts.nodeFactory
      ? new ReplicationEngine(opts.nodeFactory, { rng: opts.rng, ...opts.replicationOpts })
      : null;

    this._enableReplication = (opts.enableReplication ?? true) && !!this.replicationEngine;
    this._enablePrediction  = opts.enablePrediction ?? true;

    this._tick       = 0;
    this._repTicker  = 0;
    this._pendingChildren = [];  // nodes to inject after update
  }

  // ── MAIN UPDATE ─────────────────────────────

  /**
   * @param {Node[]} nodes
   * @param {object} systemState  — { information, entropy, collapseRate, surprise, ... }
   * @param {number} dt
   * @returns {Node[]} newly replicated nodes (caller injects into field)
   */
  update(nodes, systemState, dt) {
    this._tick++;
    this._repTicker++;

    // ── Step 1-3: Prediction + Surprise ────────
    if (this._enablePrediction) {
      this.predictiveModel.updateVelocities(nodes);
      this.predictiveModel.writeErrors(nodes);
      this.surpriseField.update(nodes);
    }

    // Augment systemState with surprise
    const enrichedState = {
      ...systemState,
      surprise:    this.surpriseField.totalError,
      complexity:  nodes.length / 1500,   // normalized model complexity
    };

    // ── Step 4: MetaOptimizer ──────────────────
    this.objectiveFn.evaluate(enrichedState);
    this.metaOptimizer.tick(enrichedState, dt);

    // ── Steps 5-6: Fitness + Replication ───────
    let newChildren = [];
    if (this._enableReplication && this._repTicker >= REPLICATION_EVERY_N) {
      this._repTicker = 0;
      this.fitnessField.update(nodes, this.surpriseField);
      newChildren = this.replicationEngine.replicate(nodes, this.fitnessField, nodes.length);
    }

    return newChildren;
  }

  // ── DIAGNOSTICS ─────────────────────────────

  getState() {
    return {
      tick:              this._tick,
      objective:         this.objectiveFn.getState(),
      parameters:        this.parameterField.getState(),
      metaOptimizer:     this.metaOptimizer.getState(),
      surpriseField:     this._enablePrediction ? this.surpriseField.getState()    : null,
      fitnessField:      this._enableReplication ? this.fitnessField.getState()    : null,
      replicationEngine: this._enableReplication ? this.replicationEngine?.getState() : null,
    };
  }
}



