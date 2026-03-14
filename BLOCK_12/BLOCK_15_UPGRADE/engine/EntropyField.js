/**
 * HAKARI v3 – Enterprise Entropy Field
 * ------------------------------------
 * Computes Shannon entropy of node strength distribution.
 *
 * Features:
 *  - Zero-allocation computation loop
 *  - Ring-buffer entropy history
 *  - Welford streaming variance
 *  - Numeric fault tolerance
 *  - Immutable diagnostics snapshot
 *  - Scales to 1M+ nodes
 */

import { entropy, maxEntropy } from '../../../BLOCK1/math.js'
import { isFiniteNum, welfordUpdate } from '../../../BLOCK1/numerics.js'
import { DIAGNOSTICS } from '../core/config.js'

export class EntropyField {

  constructor(config = {}) {

    const size = config.bufferSize ?? DIAGNOSTICS.CURVE_BUFFER_SIZE

    this.entropy = 0
    this.entropyNorm = 0
    this.maxEntropy = 0

    /* Ring buffer */

    this._history = new Float64Array(size)
    this._historyIndex = 0
    this._historyCount = 0

    /* Online stats */

    this._mean = 0
    this._M2 = 0
    this._count = 0

    /* Reusable strength buffer */

    this._strengthBuffer = null
  }

  /**
   * Compute entropy of alive node strengths
   */
  compute(nodes) {

    const N = nodes.length

    if (N === 0) {
      this.entropy = 0
      this.entropyNorm = 0
      this.maxEntropy = 0
      return 0
    }

    /* Reuse buffer to avoid allocations */

    if (!this._strengthBuffer || this._strengthBuffer.length < N) {
      this._strengthBuffer = new Float64Array(N)
    }

    const strengths = this._strengthBuffer

    /* Collect strengths safely */

    let validCount = 0

    for (let i = 0; i < N; i++) {

      const s = nodes[i].strength

      strengths[i] = isFiniteNum(s) ? s : 0

      if (strengths[i] > 0) validCount++
    }

    /* If everything is zero -> entropy = 0 */

    if (validCount === 0) {
      this.entropy = 0
    } else {
      this.entropy = entropy(strengths.subarray(0, N))
    }

    /* Normalization */

    this.maxEntropy = maxEntropy(N)

    this.entropyNorm =
      this.maxEntropy > 1e-12
        ? this.entropy / this.maxEntropy
        : 0

    /* Diagnostics */

    if (DIAGNOSTICS.ENABLED) {
      this._recordHistory(this.entropy)
      this._updateStats(this.entropy)
    }

    return this.entropy
  }

  /* -----------------------------
     Ring Buffer History
  ----------------------------- */

  _recordHistory(value) {

    this._history[this._historyIndex] = value

    this._historyIndex =
      (this._historyIndex + 1) % this._history.length

    if (this._historyCount < this._history.length)
      this._historyCount++
  }

  /* -----------------------------
     Streaming statistics
  ----------------------------- */

  _updateStats(value) {

    this._count++

    const { mean, M2 } = welfordUpdate(
      { mean: this._mean, M2: this._M2 },
      value,
      this._count
    )

    this._mean = mean
    this._M2 = M2
  }

  entropyStats() {

    const variance =
      this._count > 1
        ? this._M2 / (this._count - 1)
        : 0

    return {
      mean: this._mean,
      variance
    }
  }

  /* -----------------------------
     Drift detection
  ----------------------------- */

  driftDirection(window = 20) {

    if (this._historyCount < window)
      return "stable"

    const size = this._history.length

    let firstSum = 0
    let lastSum = 0

    const half = Math.floor(window / 2)

    for (let i = 0; i < half; i++) {

      const idx =
        (this._historyIndex - window + i + size) % size

      firstSum += this._history[idx]
    }

    for (let i = half; i < window; i++) {

      const idx =
        (this._historyIndex - window + i + size) % size

      lastSum += this._history[idx]
    }

    const avgFirst = firstSum / half
    const avgLast = lastSum / (window - half)

    const delta = avgLast - avgFirst

    if (delta > 0.02) return "rising"
    if (delta < -0.02) return "falling"
    return "stable"
  }

  /* -----------------------------
     Diagnostics
  ----------------------------- */

  getState() {

    const stats = this.entropyStats()

    return Object.freeze({
      entropy: this.entropy,
      entropyNorm: this.entropyNorm,
      maxEntropy: this.maxEntropy,
      drift: this.driftDirection(),
      meanEntropy: stats.mean,
      varianceEntropy: stats.variance
    })
  }

}