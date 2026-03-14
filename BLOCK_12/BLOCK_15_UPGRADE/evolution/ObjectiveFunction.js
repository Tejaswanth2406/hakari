/**
 * HAKARI v3 – Enterprise Objective Function
 * -----------------------------------------
 * Computes system objective J or free-energy F.
 *
 * Improvements:
 *  - Zero-allocation ring buffers
 *  - Signal registry architecture
 *  - Welford streaming normalization
 *  - Immutable diagnostics
 *  - Deterministic probe() evaluation
 */

import { OBJECTIVE } from '../core/constants.js'
import { DIAGNOSTICS } from '../core/config.js'
import { isFiniteNum, welfordUpdate } from '../../../BLOCK1/numerics.js'

const SIGNALS = [
  "information",
  "entropy",
  "collapseRate",
  "surprise",
  "complexity"
]

export class ObjectiveFunction {

  constructor(opts = {}) {

    this.mode = opts.mode ?? "objective"
    this.logScaleInfo = opts.logScaleInfo ?? true
    this.normalise = opts.normalise ?? true
    this.omega_delta = opts.omega_delta ?? 0.1

    this.J = 0
    this.J_prev = 0
    this.J_delta = 0

    const size = DIAGNOSTICS.CURVE_BUFFER_SIZE

    /* ring buffer history */

    this._history = new Float64Array(size)
    this._historyIndex = 0
    this._historyCount = 0

    /* Welford stats per signal */

    this._stats = Object.create(null)

    for (const s of SIGNALS) {
      this._stats[s] = { mean: 0, M2: 0, count: 0 }
    }
  }

  /* -------------------------
     Evaluation
  ------------------------- */

  evaluate(state) {

    this._updateStats(state)

    this.J_prev = this.J
    this.J = this._compute(state)
    this.J_delta = this.J - this.J_prev

    this._recordHistory(this.J)

    return this.J
  }

  probe(state, weights = null) {
    return this._compute(state, weights)
  }

  /* -------------------------
     Core objective
  ------------------------- */

  _compute(state, weightOverride = null) {

    const w = weightOverride ?? OBJECTIVE
    const raw = this._normalisedInputs(state)

    if (this.mode === "free_energy") {

      const surprise   = isFiniteNum(raw.surprise) ? raw.surprise : 0
      const entropy    = isFiniteNum(raw.entropy) ? raw.entropy : 0
      const complexity = isFiniteNum(raw.complexity) ? raw.complexity : 0

      const ig = isFiniteNum(state.informationGain)
        ? Math.max(0, state.informationGain)
        : 0

      return (w.wE  ?? 1.0) * surprise
           + (w.wS  ?? 0.5) * entropy
           + (w.wC  ?? 0.3) * complexity
           - (w.wIG ?? 0.4) * ig
    }

    /* objective mode */

    const I = isFiniteNum(raw.information) ? raw.information : 0
    const S = isFiniteNum(raw.entropy) ? raw.entropy : 0
    const C = isFiniteNum(raw.collapseRate) ? raw.collapseRate : 0

    const Iprime =
      this.logScaleInfo
        ? Math.log(1 + Math.max(0, I))
        : I

    const stability = this.omega_delta * Math.abs(this.J_delta)

    return (w.omega_I ?? OBJECTIVE.omega_I) * Iprime
         - (w.omega_S ?? OBJECTIVE.omega_S) * S
         - (w.omega_C ?? OBJECTIVE.omega_C) * C
         - stability
  }

  /* -------------------------
     Normalisation
  ------------------------- */

  _normalisedInputs(state) {

    if (!this.normalise) return state

    const out = Object.create(null)

    for (let i = 0; i < SIGNALS.length; i++) {

      const key = SIGNALS[i]
      const raw = state[key]

      const st = this._stats[key]

      if (!st || st.count < 2) {
        out[key] = isFiniteNum(raw) ? raw : 0
        continue
      }

      const variance = st.M2 / (st.count - 1)
      const std = Math.sqrt(Math.max(variance, 0))

      out[key] =
        std > 1e-9
          ? (raw - st.mean) / std
          : 0
    }

    return out
  }

  /* -------------------------
     Online statistics
  ------------------------- */

  _updateStats(state) {

    for (let i = 0; i < SIGNALS.length; i++) {

      const key = SIGNALS[i]
      const value = state[key]

      if (!isFiniteNum(value)) continue

      const st = this._stats[key]

      st.count++

      const { mean, M2 } = welfordUpdate(
        { mean: st.mean, M2: st.M2 },
        value,
        st.count
      )

      st.mean = mean
      st.M2 = M2
    }
  }

  /* -------------------------
     History ring buffer
  ------------------------- */

  _recordHistory(value) {

    this._history[this._historyIndex] = value

    this._historyIndex =
      (this._historyIndex + 1) % this._history.length

    if (this._historyCount < this._history.length)
      this._historyCount++
  }

  /* -------------------------
     Metrics
  ------------------------- */

  smoothed(window = 20) {

    if (this._historyCount === 0) return 0

    const size = this._history.length
    const w = Math.min(window, this._historyCount)

    let sum = 0

    for (let i = 0; i < w; i++) {

      const idx =
        (this._historyIndex - 1 - i + size) % size

      sum += this._history[idx]
    }

    return sum / w
  }

  isImproving(window = 10) {

    if (this._historyCount < window * 2)
      return false

    const size = this._history.length

    let recent = 0
    let older = 0

    for (let i = 0; i < window; i++) {

      const r =
        (this._historyIndex - 1 - i + size) % size

      const o =
        (this._historyIndex - 1 - window - i + size) % size

      recent += this._history[r]
      older += this._history[o]
    }

    recent /= window
    older /= window

    return this.mode === "free_energy"
      ? recent < older
      : recent > older
  }

  /* -------------------------
     Diagnostics
  ------------------------- */

  getState() {

    return Object.freeze({
      J: this.J,
      J_delta: this.J_delta,
      mode: this.mode,
      improving: this.isImproving(),
      smoothed: this.smoothed()
    })
  }

}