/**
 * HAKARI v3 – Enterprise Decay Engine
 * -----------------------------------
 * Deterministic, scalable, and observable decay framework.
 *
 * Features:
 *  - Strategy-based physics models
 *  - Deterministic seeded RNG
 *  - Fault-tolerant numeric guards
 *  - Structured telemetry
 *  - Pool-safe node mutation
 *  - Zero-allocation tick loop
 */

import { adaptiveLambda, collapseProb, clamp } from '../../../BLOCK1/math.js'
import { sampleUniform } from '../../../BLOCK1/random.js'
import { isFiniteNum } from '../../../BLOCK1/numerics.js'
import { PHYSICS } from '../core/constants.js'
import { DIAGNOSTICS } from '../core/config.js'

const DEFAULTS = Object.freeze({
  stochasticScale: 0.002,
  temperatureRef: 1.0,
  temperatureClampMin: 0.5,
  temperatureClampMax: 2.0,
  freeEnergyBoost: 0.1
})

export class DecayEngine {

  constructor({
    rng = sampleUniform,
    physics = PHYSICS,
    diagnostics = DIAGNOSTICS,
    config = {}
  } = {}) {

    if (!physics) throw new Error("DecayEngine requires PHYSICS")
    if (!diagnostics) throw new Error("DecayEngine requires DIAGNOSTICS")

    this.rng = rng
    this.physics = physics
    this.diagnostics = diagnostics

    this.config = { ...DEFAULTS, ...config }

    this.state = {
      totalCollapsed: 0,
      stochasticCount: 0,
      strengthFloorCount: 0
    }

    this.collapsedThisTick = []
    this.collapseHistory = new Float64Array(diagnostics.CURVE_BUFFER_SIZE)
    this.historyIndex = 0
  }

  /**
   * Main simulation step
   */
  update(nodes, entropy, params, temperature = 1, freeEnergy = 0) {

    const collapsed = this.collapsedThisTick
    collapsed.length = 0

    const cfg = this.config
    const physics = this.physics

    const T = isFiniteNum(temperature) ? temperature : 1
    const Tfactor = clamp(
      T / cfg.temperatureRef,
      cfg.temperatureClampMin,
      cfg.temperatureClampMax
    )

    const Fboost = isFiniteNum(freeEnergy)
      ? clamp(freeEnergy * cfg.freeEnergyBoost, 0, 0.5)
      : 0

    const stochasticScale = cfg.stochasticScale * Tfactor + Fboost

    const nodeCount = nodes.length

    for (let i = 0; i < nodeCount; i++) {

      const node = nodes[i]
      if (!node.alive) continue

      /* Adaptive Lambda */

      const lambdaRaw = adaptiveLambda(
        params.lambda0,
        entropy,
        isFiniteNum(node.errorRate) ? node.errorRate : 0,
        isFiniteNum(node.connectivity) ? node.connectivity : 0
      )

      const lambda = isFiniteNum(lambdaRaw)
        ? Math.max(0, lambdaRaw)
        : params.lambda0

      node.adaptiveLambda = lambda

      /* Collapse Probability */

      const age = isFiniteNum(node.age) ? node.age : 0
      const collapseP = collapseProb(lambda, age)

      /* Stochastic collapse */

      const stochastic = this.rng() < collapseP * stochasticScale

      /* Hard collapse */

      const strengthCollapse =
        !isFiniteNum(node.strength) ||
        node.strength < physics.H_COLLAPSE ||
        node.pendingCollapse === true

      if (stochastic || strengthCollapse) {

        const cause = strengthCollapse
          ? "strength_floor"
          : "stochastic"

        node.collapse(cause)

        collapsed.push(node)

        this.state.totalCollapsed++

        if (strengthCollapse)
          this.state.strengthFloorCount++
        else
          this.state.stochasticCount++
      }
    }

    this._recordHistory(collapsed.length)

    return collapsed
  }

  /**
   * Inject disturbance
   */
  injectEntropy(nodes, amount = 0.3) {

    const n = nodes.length

    for (let i = 0; i < n; i++) {

      const node = nodes[i]

      const e = isFiniteNum(node.errorRate)
        ? node.errorRate
        : 0

      node.errorRate = Math.min(1, e + amount)
    }
  }

  /**
   * Homeostatic recovery
   */
  recoverErrorRates(nodes, dt, rate = 0.05) {

    const n = nodes.length

    for (let i = 0; i < n; i++) {

      const node = nodes[i]

      if (!isFiniteNum(node.errorRate)) {
        node.errorRate = 0
        continue
      }

      node.errorRate = Math.max(
        0,
        node.errorRate - rate * dt
      )
    }
  }

  /**
   * Collapse rate average
   */
  recentCollapseRate(window = 30) {

    const size = this.collapseHistory.length
    const w = Math.min(window, size)

    let sum = 0

    for (let i = 0; i < w; i++) {
      const idx = (this.historyIndex - i + size) % size
      sum += this.collapseHistory[idx]
    }

    return sum / w
  }

  /**
   * Immutable diagnostics snapshot
   */
  getState() {

    return Object.freeze({
      totalCollapsed: this.state.totalCollapsed,
      stochasticCount: this.state.stochasticCount,
      strengthFloorCount: this.state.strengthFloorCount,
      recentCollapseRate: this.recentCollapseRate()
    })
  }

  _recordHistory(value) {

    this.collapseHistory[this.historyIndex] = value
    this.historyIndex = (this.historyIndex + 1) % this.collapseHistory.length
  }

}