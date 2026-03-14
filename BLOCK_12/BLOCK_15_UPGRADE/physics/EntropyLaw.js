/**
 * HAKARI v3 — physics/EntropyLaw.js
 * --------------------------------------------------------
 * Enterprise-grade entropy and strength constraint system.
 *
 * Purpose
 * --------------------------------------------------------
 * Enforces physical bounds after HUIE updates node strength.
 * Prevents runaway dynamics and keeps the system within the
 * mathematically valid domain.
 *
 * Laws enforced
 * --------------------------------------------------------
 * Strength bounds:
 *      H_MIN ≤ Hᵢ ≤ H_MAX
 *
 * Collapse condition:
 *      Hᵢ < H_COLLAPSE
 *
 * Entropy bounds:
 *      0 ≤ S ≤ ln(N)
 *
 * Where:
 *      N = number of alive nodes
 *
 * --------------------------------------------------------
 * ENTERPRISE HARDENING
 * --------------------------------------------------------
 * ✓ Deterministic numeric guards
 * ✓ NaN isolation
 * ✓ SIMD-friendly loops
 * ✓ Collapse tracking
 * ✓ Strength clamp telemetry
 * ✓ Entropy violation diagnostics
 * ✓ Zero-allocation runtime
 * ✓ Resettable simulation state
 * --------------------------------------------------------
 */

import { PHYSICS } from '../core/constants.js'
import { clamp, maxEntropy } from '../../../BLOCK1/math.js'

const ZERO = 0

function safeNum(v) {
  return Number.isFinite(v) ? v : 0
}

export class EntropyLaw {

  constructor() {

    /** nodes clamped this tick */
    this.lastClampedCount = 0

    /** nodes flagged for collapse this tick */
    this.lastCollapseCount = 0

    /** entropy correction occurred */
    this.entropyViolation = false

    /** last entropy value returned */
    this.lastEntropy = 0

    /** theoretical max entropy */
    this.lastMaxEntropy = 0
  }


  /**
   * --------------------------------------------------------
   * Strength Bound Enforcement
   *
   * Ensures:
   *     H_MIN ≤ Hᵢ ≤ H_MAX
   *
   * Also flags nodes for collapse when:
   *     Hᵢ < H_COLLAPSE
   * --------------------------------------------------------
   */
  enforceStrengthBounds(nodes) {

    const N = nodes.length

    let clamped = ZERO
    let collapsed = ZERO

    for (let i = 0; i < N; i++) {

      const node = nodes[i]

      const before = safeNum(node.strength)

      const bounded =
        clamp(
          before,
          PHYSICS.H_MIN,
          PHYSICS.H_MAX
        )

      if (bounded !== before)
        clamped++

      node.strength = bounded

      if (bounded < PHYSICS.H_COLLAPSE) {

        node.pendingCollapse = true
        collapsed++

      } else {

        node.pendingCollapse = false
      }
    }

    this.lastClampedCount = clamped
    this.lastCollapseCount = collapsed
  }


  /**
   * --------------------------------------------------------
   * Entropy Bound Enforcement
   *
   * Ensures:
   *      0 ≤ S ≤ ln(N)
   *
   * Protects against NaN / Infinity propagation.
   * --------------------------------------------------------
   */
  enforceEntropyBound(S, N) {

    const entropy = safeNum(S)

    const S_max = maxEntropy(N)

    const bounded =
      clamp(
        entropy,
        ZERO,
        S_max
      )

    this.entropyViolation = (bounded !== entropy)

    this.lastEntropy = bounded
    this.lastMaxEntropy = S_max

    return bounded
  }


  /**
   * --------------------------------------------------------
   * Combined Enforcement Pass
   *
   * Called once per simulation tick after HUIE update.
   * --------------------------------------------------------
   */
  enforce(nodes, entropyValue) {

    this.enforceStrengthBounds(nodes)

    return this.enforceEntropyBound(
      entropyValue,
      nodes.length
    )
  }


  /**
   * --------------------------------------------------------
   * Diagnostics Snapshot
   * --------------------------------------------------------
   */
  getState() {

    return {

      lastClampedCount: this.lastClampedCount,
      lastCollapseCount: this.lastCollapseCount,
      entropyViolation: this.entropyViolation,

      lastEntropy: this.lastEntropy,
      lastMaxEntropy: this.lastMaxEntropy
    }
  }


  /**
   * --------------------------------------------------------
   * Hard Reset
   *
   * Used when simulation restarts.
   * --------------------------------------------------------
   */
  reset() {

    this.lastClampedCount = 0
    this.lastCollapseCount = 0
    this.entropyViolation = false
    this.lastEntropy = 0
    this.lastMaxEntropy = 0
  }

}