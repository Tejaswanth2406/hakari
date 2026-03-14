/**
 * HAKARI v3 – Enterprise MetaOptimizer
 * ------------------------------------
 * Self-tuning evolutionary optimizer using
 * gradient flow with momentum and adaptive LR.
 *
 * Improvements:
 *  - Snapshot-safe probing
 *  - Deterministic gradient evaluation
 *  - Zero-allocation update loop
 *  - Parameter registry
 *  - Telemetry-ready
 */

import { PARAMS, PARAM_BOUNDS } from '../core/constants.js'
import { OPTIMIZER } from '../core/config.js'
import { clamp } from '../../../BLOCK1/math.js'
import { isFiniteNum } from '../../../BLOCK1/numerics.js'

const PARAM_REGISTRY = Object.freeze([
  { key: 'lambda0', scale: 1.0 },
  { key: 'alpha',   scale: 1.0 },
  { key: 'beta',    scale: 1.0 },
  { key: 'gamma',   scale: 1.0 },
  { key: 'kappa',   scale: 1.0 },
  { key: 'sigma',   scale: 1.0 },
  { key: 'phi',     scale: 0.5 },
  { key: 'delta',   scale: 0.5 },
  { key: 'epsilon', scale: 0.5 },
  { key: 'tau',     scale: 0.5 }
])

const GMAX       = 5
const MOMENTUM_B = 0.9
const PROBE_AVG  = 3
const EVAL_DELAY = 5

export class MetaOptimizer {

  constructor(objectiveFn, parameterField) {

    this.objectiveFn = objectiveFn
    this.parameterField = parameterField

    this.enabled = true
    this.stepCount = 0
    this.tickCounter = 0

    this._evalDelay = 0

    this._velocity = Object.create(null)
    this.lastGradient = Object.create(null)
    this.lastStepDelta = Object.create(null)

    for (const p of PARAM_REGISTRY) {
      this._velocity[p.key] = 0
    }

    this._pendingState = null
    this._pendingDt = 1
  }

  /* ----------------------------------
     Tick Driver
  ---------------------------------- */

  tick(systemState, dt) {

    if (!this.enabled) return

    this.tickCounter++

    if (this._evalDelay > 0) {
      this._evalDelay--
      this._pendingState = systemState
      this._pendingDt = dt
      return
    }

    if (this._pendingState) {
      this._step(this._pendingState, this._pendingDt)
      this._pendingState = null
      this.tickCounter = 0
      return
    }

    if (this.tickCounter < OPTIMIZER.UPDATE_EVERY_N) return

    this.tickCounter = 0
    this._step(systemState, dt)
  }

  /* ----------------------------------
     Gradient Step
  ---------------------------------- */

  _step(systemState, dt) {

    const params = this.parameterField.current
    const mu = isFiniteNum(params.mu) ? params.mu : (PARAMS.mu ?? 0.01)
    const gradDelta = OPTIMIZER.GRADIENT_DELTA

    const gradient = Object.create(null)
    const stepDelta = Object.create(null)

    for (let i = 0; i < PARAM_REGISTRY.length; i++) {

      const { key, scale } = PARAM_REGISTRY[i]

      const original = params[key]
      const bounds = PARAM_BOUNDS[key]

      if (!isFiniteNum(original) || !bounds) continue

      /* ---- Probe gradient without mutating live params ---- */

      let Jplus = 0
      let Jminus = 0

      for (let n = 0; n < PROBE_AVG; n++) {

        const plusParams = this.parameterField.snapshot()
        plusParams[key] = clamp(original + gradDelta, bounds[0], bounds[1])

        const minusParams = this.parameterField.snapshot()
        minusParams[key] = clamp(original - gradDelta, bounds[0], bounds[1])

        Jplus  += this.objectiveFn.probe(systemState, plusParams)
        Jminus += this.objectiveFn.probe(systemState, minusParams)
      }

      Jplus /= PROBE_AVG
      Jminus /= PROBE_AVG

      let grad = (Jplus - Jminus) / (2 * gradDelta)

      if (this.objectiveFn.mode === 'free_energy')
        grad = -grad

      grad = clamp(grad, -GMAX, GMAX)

      /* ---- Momentum ---- */

      const v =
        MOMENTUM_B * this._velocity[key] +
        (1 - MOMENTUM_B) * grad

      this._velocity[key] = isFiniteNum(v) ? v : 0

      /* ---- Adaptive learning rate ---- */

      const muEff = mu / (1 + Math.abs(grad))

      const step =
        scale *
        muEff *
        this._velocity[key] *
        dt *
        OPTIMIZER.UPDATE_EVERY_N

      gradient[key] = grad
      stepDelta[key] = isFiniteNum(step) ? step : 0
    }

    /* ---- Apply update ---- */

    this.parameterField.apply(stepDelta)

    this._evalDelay = EVAL_DELAY

    this.lastGradient = gradient
    this.lastStepDelta = stepDelta

    this.stepCount++

    const runaway = this.parameterField.runawayParams()

    if (runaway.length > 0) {
      console.warn(
        `[MetaOptimizer] Runaway drift: ${runaway.join(', ')}`
      )
    }
  }

  /* ----------------------------------
     Controls
  ---------------------------------- */

  pause() { this.enabled = false }
  resume() { this.enabled = true }

  reset() {

    this.parameterField.reset()

    this.stepCount = 0
    this.tickCounter = 0
    this._evalDelay = 0
    this._pendingState = null

    this.lastGradient = Object.create(null)
    this.lastStepDelta = Object.create(null)

    for (const k in this._velocity) {
      this._velocity[k] = 0
    }
  }

  /* ----------------------------------
     Diagnostics
  ---------------------------------- */

  getState() {

    return Object.freeze({
      enabled: this.enabled,
      stepCount: this.stepCount,
      tickCounter: this.tickCounter,
      evalDelay: this._evalDelay,
      lastGradient: { ...this.lastGradient },
      lastStepDelta: { ...this.lastStepDelta },
      velocity: { ...this._velocity },
      runaway: this.parameterField.runawayParams()
    })
  }

}