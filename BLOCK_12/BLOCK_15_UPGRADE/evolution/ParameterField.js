/**
 * HAKARI v3 – Enterprise Parameter Field
 * --------------------------------------
 * Maintains evolvable parameter vector θ.
 *
 * Improvements:
 *  - Ring-buffer parameter history
 *  - Snapshot cloning for safe probing
 *  - Registry-driven parameters
 *  - Zero-allocation update loop
 *  - Immutable diagnostics snapshots
 */

import { PARAMS, PARAM_BOUNDS } from '../core/constants.js'
import { clamp } from '../../../BLOCK1/math.js'
import { isFiniteNum } from '../../../BLOCK1/numerics.js'
import { DIAGNOSTICS } from '../core/config.js'

/* Parameter registry */

const PARAM_KEYS = Object.keys(PARAMS)

/* Coupling constraints */

const COUPLING_CONSTRAINTS = [
  { type: "sum_le", a: "alpha", b: "beta", limit: 2.0 },
  { type: "a_ge_b", a: "sigma", b: "gamma" }
]

export class ParameterField {

  constructor() {

    this.current = { ...PARAMS }

    const bufferSize = DIAGNOSTICS.CURVE_BUFFER_SIZE

    /* ring buffer histories */

    this._history = Object.create(null)
    this._historyIndex = 0

    for (const k of PARAM_KEYS) {
      const buf = new Float64Array(bufferSize)
      buf[0] = PARAMS[k]
      this._history[k] = buf
    }

    this._bufferSize = bufferSize
    this._historyCount = 1

    this.updateCount = 0
    this.constraintViolations = 0
  }

  /* ----------------------------------
     Apply gradient update
  ---------------------------------- */

  apply(delta) {

    let mutated = false

    for (let i = 0; i < PARAM_KEYS.length; i++) {

      const key = PARAM_KEYS[i]

      const dv = delta[key]

      if (!isFiniteNum(dv)) continue

      const bounds = PARAM_BOUNDS[key]
      if (!bounds) continue

      const [lo, hi] = bounds

      const newVal = clamp(
        this.current[key] + dv,
        lo,
        hi
      )

      if (newVal !== this.current[key]) {

        this.current[key] = newVal
        mutated = true
      }
    }

    if (!mutated) return

    this._enforceCoupling()
    this._recordHistory()

    this.updateCount++
  }

  /* ----------------------------------
     Direct parameter set
  ---------------------------------- */

  set(key, value) {

    if (!(key in this.current)) return
    if (!isFiniteNum(value)) return

    const bounds = PARAM_BOUNDS[key]
    if (!bounds) return

    const [lo, hi] = bounds

    this.current[key] = clamp(value, lo, hi)

    this._enforceCoupling()
    this._recordHistory()

    this.updateCount++
  }

  /* ----------------------------------
     Snapshot (for optimizer probes)
  ---------------------------------- */

  snapshot() {
    return { ...this.current }
  }

  /* ----------------------------------
     Reset
  ---------------------------------- */

  reset() {

    this.current = { ...PARAMS }

    this._historyIndex = 0
    this._historyCount = 1

    for (const k of PARAM_KEYS) {
      this._history[k][0] = PARAMS[k]
    }

    this.updateCount++
  }

  /* ----------------------------------
     Drift analysis
  ---------------------------------- */

  drift(key) {
    return Math.abs(
      (this.current[key] ?? 0) -
      (PARAMS[key] ?? 0)
    )
  }

  allDrifts() {

    const out = Object.create(null)

    for (let i = 0; i < PARAM_KEYS.length; i++) {

      const k = PARAM_KEYS[i]
      out[k] = this.drift(k)
    }

    return out
  }

  runawayParams(threshold = 0.5) {

    const out = []

    for (let i = 0; i < PARAM_KEYS.length; i++) {

      const k = PARAM_KEYS[i]

      if (this.drift(k) > threshold)
        out.push(k)
    }

    return out
  }

  /* ----------------------------------
     History access
  ---------------------------------- */

  getHistory(key) {

    const buf = this._history[key]
    if (!buf) return []

    const out = []

    const size = this._bufferSize
    const count = this._historyCount

    for (let i = 0; i < count; i++) {

      const idx =
        (this._historyIndex - count + i + size) % size

      out.push(buf[idx])
    }

    return out
  }

  /* ----------------------------------
     Diagnostics
  ---------------------------------- */

  getState() {

    return Object.freeze({
      current: { ...this.current },
      drifts: this.allDrifts(),
      runaway: this.runawayParams(),
      updateCount: this.updateCount,
      constraintViolations: this.constraintViolations
    })
  }

  /* ----------------------------------
     Coupling constraints
  ---------------------------------- */

  _enforceCoupling() {

    for (let i = 0; i < COUPLING_CONSTRAINTS.length; i++) {

      const c = COUPLING_CONSTRAINTS[i]

      if (c.type === "sum_le") {

        const sum =
          this.current[c.a] +
          this.current[c.b]

        if (sum > c.limit) {

          const scale = c.limit / sum

          this.current[c.a] *= scale
          this.current[c.b] *= scale

          this.constraintViolations++
        }

      } else if (c.type === "a_ge_b") {

        if (this.current[c.a] < this.current[c.b]) {

          const bounds = PARAM_BOUNDS[c.a]

          const lo = bounds ? bounds[0] : 0
          const hi = bounds ? bounds[1] : 1

          this.current[c.a] =
            clamp(this.current[c.b], lo, hi)

          this.constraintViolations++
        }
      }
    }
  }

  /* ----------------------------------
     History ring buffer
  ---------------------------------- */

  _recordHistory() {

    const size = this._bufferSize

    this._historyIndex =
      (this._historyIndex + 1) % size

    for (let i = 0; i < PARAM_KEYS.length; i++) {

      const k = PARAM_KEYS[i]

      this._history[k][this._historyIndex] =
        this.current[k]
    }

    if (this._historyCount < size)
      this._historyCount++
  }

}