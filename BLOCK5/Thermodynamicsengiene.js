/**
 * HAKARI v3 — engine/ThermodynamicEngine.js
 * ─────────────────────────────────────────────
 * Master coordinator for the thermodynamic layer.
 * Block 5 single entry point.
 *
 * Pipeline order (deterministic, runs every tick):
 *
 *   1. entropyField.update()       — compute S(t)
 *   2. temperature.update()        — T(t+1) = T + α·ΔS − β·(T−T_ref)
 *   3. freeEnergy.update()         — F = E − T·S
 *   4. decayEngine.update()        — Λᵢ, P_collapse, collapse nodes
 *   5. decayEngine.recoverErrorRates() — homeostasis
 *   6. phaseTransition.update()    — detect ORDER↔CHAOS, EMERGENCE
 *
 * Exposes:
 *   this.S          — current entropy (consumed by HUIE, InformationFlow)
 *   this.T          — temperature (consumed by DecayEngine, renderer)
 *   this.F          — free energy (consumed by PhaseTransition, diagnostics)
 *   this.collapsed  — nodes collapsed this tick
 * ─────────────────────────────────────────────
 */

import { EntropyField }    from './BLOCK5/Entropyfeild.js';
import { Temperature }     from './BLOCK5/Temperature.js';
import { FreeEnergy }      from './BLOCK5/Freeenergy.js';
import { DecayEngine }     from '../BLOCK_12/BLOCK_15_UPGRADE/engine/DecayEngine.js';
import { PhaseTransition } from './BLOCK5/Phasetransition.js';
import { sampleUniform }   from '../BLOCK1/random.js';

export class ThermodynamicEngine {

  /**
   * @param {object} [opts]
   * @param {Function} opts.rng              — seeded RNG for DecayEngine
   * @param {object}   opts.temperatureOpts  — passed to Temperature constructor
   * @param {boolean}  opts.enableTemperature  — default true
   * @param {boolean}  opts.enableFreeEnergy   — default true
   * @param {boolean}  opts.enablePhaseDetect  — default true
   */
  constructor(opts = {}) {
    const rng = opts.rng ?? sampleUniform;

    this.entropyField    = new EntropyField();
    this.temperature     = new Temperature(opts.temperatureOpts ?? {});
    this.freeEnergy      = new FreeEnergy();
    this.decayEngine     = new DecayEngine({ rng });
    this.phaseTransition = new PhaseTransition();

    this._enableTemp    = opts.enableTemperature ?? true;
    this._enableFreeE   = opts.enableFreeEnergy  ?? true;
    this._enablePhase   = opts.enablePhaseDetect ?? true;

    // Public outputs — read by other engine modules
    this.S         = 0;
    this.T         = 1.0;
    this.F         = 0;
    this.collapsed = [];
    this._tick     = 0;
  }

  // ── MAIN UPDATE ─────────────────────────────

  /**
   * Run the full thermodynamic pipeline for one tick.
   *
   * @param {Node[]} nodes      — all alive nodes
   * @param {object} params     — live PARAMS
   * @param {number} dt         — delta time
   * @param {number} [E=0]      — total network energy (from EnergyField or GraphEnergy)
   * @param {object} [networkState] — optional network diagnostics for phase detection
   * @returns {Node[]}          — nodes that collapsed this tick
   */
  update(nodes, params, dt, E = 0, networkState = null) {
    this._tick++;

    // ── Step 1: Entropy ────────────────────────
    this.S = this.entropyField.update(nodes);

    // ── Step 2: Temperature ────────────────────
    if (this._enableTemp) {
      this.T = this.temperature.update(this.entropyField.S_delta, dt);
    }

    // ── Step 3: Free Energy ────────────────────
    if (this._enableFreeE) {
      this.F = this.freeEnergy.update(E, this.T, this.S);
    }

    // ── Step 4: Decay & collapse ───────────────
    this.collapsed = this.decayEngine.update(nodes, this.S, params, this.T, this.F);

    // ── Step 5: Error rate homeostasis ─────────
    this.decayEngine.recoverErrorRates(nodes, dt);

    // ── Step 6: Phase transition detection ─────
    if (this._enablePhase) {
      const ns = networkState ?? {};
      this.phaseTransition.update({
        entropyRegime:     this.entropyField.regime,
        S_delta:           this.entropyField.S_delta,
        T:                 this.T,
        T_regime:          this.temperature.regime,
        F_delta:           this.freeEnergy.F_delta,
        coherence:         ns.coherence         ?? 0,
        coherenceGradient: ns.energyGradient     ?? 0,
        healthScore:       ns.healthScore        ?? 1,
        collapseRate:      this.collapsed.length,
        nodeCount:         nodes.length,
      });
    }

    return this.collapsed;
  }

  // ── MANUAL CONTROLS ─────────────────────────

  /** Inject entropy shock — boosts node error rates and heats system. */
  injectEntropy(nodes, amount = 0.3) {
    this.decayEngine.injectEntropy(nodes, amount);
    if (this._enableTemp) this.temperature.heat(amount * 0.5);
  }

  /** Cool the system — reduces temperature toward T_ref. */
  cool(amount = 0.3) {
    if (this._enableTemp) this.temperature.cool(amount);
  }

  // ── DIAGNOSTICS ─────────────────────────────

  getState() {
    return {
      tick:            this._tick,
      S:               this.S,
      T:               this.T,
      F:               this.F,
      entropyField:    this.entropyField.getState(),
      temperature:     this._enableTemp  ? this.temperature.getState()     : null,
      freeEnergy:      this._enableFreeE ? this.freeEnergy.getState()      : null,
      decayEngine:     this.decayEngine.getState(),
      phaseTransition: this._enablePhase ? this.phaseTransition.getState() : null,
    };
  }
}



