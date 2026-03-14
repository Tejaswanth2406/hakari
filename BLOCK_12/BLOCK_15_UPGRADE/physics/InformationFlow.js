/**
 * HAKARI v3 — physics/InformationFlow.js
 * ---------------------------------------------------------
 * Enterprise-grade implementation of information–entropy
 * duality and per-node information distribution.
 *
 * Core Law
 * ---------------------------------------------------------
 *      I_system = H_max − S
 *
 * where
 *      H_max = ln(N)
 *
 * High entropy  → low information
 * Low entropy   → high information
 *
 * Node Distribution
 * ---------------------------------------------------------
 *      I_i = (H_i / ΣH) · I_system
 *
 * Optional Hakari extensions:
 *
 *      I_i += λ_eig · EIG_i
 *      I_i += queryBoost · A_i
 *
 * ---------------------------------------------------------
 * ENTERPRISE HARDENING
 * ---------------------------------------------------------
 * ✓ deterministic numeric guards
 * ✓ NaN / Infinity isolation
 * ✓ normalized information distribution
 * ✓ SIMD-friendly loops
 * ✓ zero-allocation update pass
 * ✓ safe EIG integration
 * ✓ bounded query boost
 * ✓ system telemetry
 * ✓ simulation reset support
 * ---------------------------------------------------------
 */

import { informationValue, clamp } from '../../../BLOCK1/math.js'
import { PHYSICS, INFORMATION } from '../core/constants.js'
import { isFiniteNum } from '../../../BLOCK1/numerics.js'

const ZERO = 0

function safeNum(v) {
  return Number.isFinite(v) ? v : 0
}

export class InformationFlow {

  constructor() {

    /** system information I_system */
    this.systemInformation = 0

    /** Σ I_i */
    this.totalInformation = 0

    /** total strength ΣH */
    this.totalStrength = 0

    /** expected information gain weight */
    this._eigWeight =
      isFiniteNum(INFORMATION?.EIG_WEIGHT)
        ? INFORMATION.EIG_WEIGHT
        : 0.3

    /** query boost factor */
    this.lastQueryBoost = 0
  }


  /**
   * ---------------------------------------------------------
   * Compute system information and distribute to nodes
   * ---------------------------------------------------------
   */
  update(nodes, entropy) {

    const N = nodes.length

    if (N === 0) {

      this.systemInformation = 0
      this.totalInformation = 0
      this.totalStrength = 0
      return
    }

    // ---------------------------------------------
    // Information–Entropy Duality
    // ---------------------------------------------

    const systemInfo = informationValue(entropy, N)

    this.systemInformation =
      Number.isFinite(systemInfo)
        ? systemInfo
        : 0

    // ---------------------------------------------
    // Compute total strength
    // ---------------------------------------------

    let totalStrength = ZERO

    for (let i = 0; i < N; i++) {

      const H = safeNum(nodes[i].strength)

      totalStrength += H
    }

    // Prevent division-by-zero system
    if (totalStrength <= 0)
      totalStrength = 1

    this.totalStrength = totalStrength

    // ---------------------------------------------
    // Distribute information
    // ---------------------------------------------

    let totalInfo = ZERO

    for (let i = 0; i < N; i++) {

      const node = nodes[i]

      const H = safeNum(node.strength)

      const share =
        (H / totalStrength) *
        this.systemInformation

      const info =
        clamp(
          share,
          0,
          this.systemInformation
        )

      node.infoInput = info

      totalInfo += info
    }

    this.totalInformation = totalInfo
  }


  /**
   * ---------------------------------------------------------
   * Expected Information Gain Boost
   *
   * I_i += λ_eig · EIG_i
   * ---------------------------------------------------------
   */
  applyEIGBoost(nodes) {

    const N = nodes.length

    if (N === 0)
      return

    const eigWeight = this._eigWeight

    const maxInfo =
      this.systemInformation * 2

    for (let i = 0; i < N; i++) {

      const node = nodes[i]

      const eig =
        safeNum(node.expectedInfoGain)

      if (eig <= 0)
        continue

      const boosted =
        node.infoInput +
        eigWeight * eig

      node.infoInput =
        clamp(
          boosted,
          0,
          maxInfo
        )
    }
  }


  /**
   * ---------------------------------------------------------
   * Query Activation Boost
   *
   * I_i += boost · A_i
   * ---------------------------------------------------------
   */
  applyQueryBoost(nodes, boost = 1) {

    const N = nodes.length

    if (N === 0)
      return

    const safeBoost =
      isFiniteNum(boost)
        ? boost
        : 1

    this.lastQueryBoost = safeBoost

    const limit =
      PHYSICS.H_MAX * 2

    for (let i = 0; i < N; i++) {

      const node = nodes[i]

      const activation =
        safeNum(node.activationScore)

      if (activation <= 0)
        continue

      const boosted =
        node.infoInput +
        safeBoost * activation

      node.infoInput =
        clamp(
          boosted,
          0,
          limit
        )
    }
  }


  /**
   * ---------------------------------------------------------
   * Diagnostics
   * ---------------------------------------------------------
   */
  getState() {

    return {

      systemInformation: this.systemInformation,

      totalInformation: this.totalInformation,

      totalStrength: this.totalStrength,

      eigWeight: this._eigWeight,

      lastQueryBoost: this.lastQueryBoost
    }
  }


  /**
   * ---------------------------------------------------------
   * Reset simulation state
   * ---------------------------------------------------------
   */
  reset() {

    this.systemInformation = 0
    this.totalInformation = 0
    this.totalStrength = 0
    this.lastQueryBoost = 0
  }

}