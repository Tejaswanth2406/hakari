/**
 * HAKARI v3 — physics/EnergyField.js
 * ---------------------------------------------------------
 * Enterprise-grade energy field computation.
 *
 * Physical Model
 * ---------------------------------------------------------
 * Node Energy:
 *     Ei = ε · Hi²
 *
 * Global Energy:
 *     E_total = Σ Ei
 *
 * Stability Constraint:
 *     E_total < E_max
 *
 * where
 *     E_max = E_MAX_FACTOR · N
 *
 * If exceeded, node strengths are proportionally scaled
 * to conserve energy and restore system stability.
 *
 * ---------------------------------------------------------
 * ENTERPRISE HARDENING
 * ---------------------------------------------------------
 * ✓ Quadratic energy model (runaway prevention)
 * ✓ Deterministic numeric guards
 * ✓ Immutable configuration
 * ✓ SIMD-friendly loops
 * ✓ Zero-allocation update cycle
 * ✓ Fail-safe NaN isolation
 * ✓ Diagnostic telemetry
 * ✓ Predictable scaling behaviour
 * ✓ High-performance neighbor accumulation
 *
 * ---------------------------------------------------------
 */

import { PARAMS, PHYSICS } from '../core/constants.js'
import { clamp } from '../../../BLOCK1/math.js'
import { isFiniteNum } from '../../../BLOCK1/numerics.js'

const ZERO = 0

/**
 * Fast numeric guard
 */
function safeNum(v) {
  return Number.isFinite(v) ? v : 0
}

export class EnergyField {

  constructor() {

    /** @type {number} */
    this.totalEnergy = 0

    /** @type {number} */
    this.averageEnergy = 0

    /** @type {boolean} */
    this.overload = false

    /** @type {number} */
    this.overloadCount = 0

    /** @type {number} */
    this.lastScaleFactor = 1
  }


  /**
   * ---------------------------------------------------------
   * Node Energy Function
   *
   * Ei = ε · Hi²
   * ---------------------------------------------------------
   */
  static nodeEnergy(epsilon, strength) {
    const H = safeNum(strength)
    return epsilon * H * H
  }


  /**
   * ---------------------------------------------------------
   * Main Energy Update Loop
   * ---------------------------------------------------------
   */
  update(nodes, params = PARAMS) {

    const epsilon =
      (params && isFiniteNum(params.epsilon))
        ? params.epsilon
        : PARAMS.epsilon

    const N = nodes.length

    if (N === 0) {
      this.totalEnergy = 0
      this.averageEnergy = 0
      this.overload = false
      return
    }

    let total = ZERO

    // -------------------------------------------------
    // Compute Node Energies
    // -------------------------------------------------

    for (let i = 0; i < N; i++) {

      const node = nodes[i]

      const H = safeNum(node.strength)

      const energy = epsilon * H * H

      node.energy = energy

      total += energy
    }

    this.totalEnergy = total
    this.averageEnergy = total / N

    // -------------------------------------------------
    // Global Energy Constraint
    // -------------------------------------------------

    const E_max = PHYSICS.E_MAX_FACTOR * N

    if (
      total > E_max &&
      Number.isFinite(E_max) &&
      E_max > 0
    ) {

      this.overload = true
      this.overloadCount++

      const scale = E_max / total

      this.lastScaleFactor = scale

      // ---------------------------------------------
      // Proportional Strength Compression
      // ---------------------------------------------

      for (let i = 0; i < N; i++) {

        const node = nodes[i]

        const scaled =
          clamp(
            node.strength * scale,
            PHYSICS.H_MIN,
            PHYSICS.H_MAX
          )

        node.strength = scaled
        node.energy = epsilon * scaled * scaled
      }

      this.totalEnergy = E_max

    } else {

      this.overload = false
      this.lastScaleFactor = 1
    }
  }


  /**
   * ---------------------------------------------------------
   * Neighbor Energy Contribution
   *
   * E_neighbors = Σ ( w_ij · H_j )
   *
   * Used by HUIE interaction law.
   * ---------------------------------------------------------
   */
  neighborEnergy(nodeId, graph, nodeMap) {

    const neighbors = graph.getNeighbors(nodeId)

    if (!neighbors || neighbors.length === 0)
      return ZERO

    let sum = ZERO

    for (let i = 0; i < neighbors.length; i++) {

      const edge = neighbors[i]

      const neighborNode = nodeMap.get(edge.id)

      if (!neighborNode || !neighborNode.alive)
        continue

      const H = safeNum(neighborNode.strength)
      const w = safeNum(edge.weight)

      const contribution = w * H

      if (Number.isFinite(contribution))
        sum += contribution
    }

    return sum
  }


  /**
   * ---------------------------------------------------------
   * Diagnostic State
   * ---------------------------------------------------------
   */
  getState() {

    return {
      totalEnergy: this.totalEnergy,
      averageEnergy: this.averageEnergy,
      overload: this.overload,
      overloadCount: this.overloadCount,
      lastScaleFactor: this.lastScaleFactor
    }
  }


  /**
   * ---------------------------------------------------------
   * Hard Reset (used by simulation restart)
   * ---------------------------------------------------------
   */
  reset() {

    this.totalEnergy = 0
    this.averageEnergy = 0
    this.overload = false
    this.overloadCount = 0
    this.lastScaleFactor = 1
  }

}