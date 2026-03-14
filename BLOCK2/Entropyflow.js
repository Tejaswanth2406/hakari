/**
 * HAKARI v3 â€” physics/EntropyLaw.js
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Enforces physical bounds on entropy and
 * node strength every tick.
 *
 * Laws enforced:
 *   0 â‰¤ Háµ¢ â‰¤ 1          (strength clamp)
 *   0 â‰¤ S  â‰¤ ln(N)       (entropy bound)
 *
 * Called AFTER huieDifferential is applied.
 *
 * HARDENING vs original:
 *   - NaN/Infinity guard before strength clamp
 *   - Entropy history for drift detection
 *   - Separate NaN-collapse counter (diagnostic)
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

import { PHYSICS } from '../BLOCK_12/BLOCK_15_UPGRADE/core/constants.js';
import { DIAGNOSTICS } from '../BLOCK_12/BLOCK_15_UPGRADE/core/config.js';
import { clamp, maxEntropy } from '../BLOCK1/math.js';
import { isFiniteNum } from '../BLOCK1/numerics.js';

export class EntropyLaw {

  constructor() {
    this.lastClampedCount  = 0;    // nodes clamped last tick
    this.nanCollapseCount  = 0;    // nodes forced to 0 due to NaN (cumulative)
    this.entropyViolation  = false;
    this.entropyHistory    = [];   // rolling S history for drift
    this._bufferSize       = DIAGNOSTICS.CURVE_BUFFER_SIZE;
  }

  // â”€â”€ STRENGTH ENFORCEMENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Clamp every node's strength to [H_MIN, H_MAX].
   * NaN/Inf are replaced with H_MIN before clamping.
   * Marks nodes for collapse if below H_COLLAPSE.
   *
   * @param {Node[]} nodes â€” all alive nodes
   */
  enforceStrengthBounds(nodes) {
    let clamped = 0;
    for (const node of nodes) {
      // â”€â”€ NaN / Infinity guard â”€â”€
      if (!isFiniteNum(node.strength)) {
        node.strength = PHYSICS.H_MIN;
        this.nanCollapseCount++;
        clamped++;
        node.pendingCollapse = true;
        continue;
      }

      const before = node.strength;
      node.strength = clamp(node.strength, PHYSICS.H_MIN, PHYSICS.H_MAX);
      if (node.strength !== before) clamped++;

      // Flag for collapse â€” DecayEngine handles actual removal
      if (node.strength < PHYSICS.H_COLLAPSE) {
        node.pendingCollapse = true;
      }
    }
    this.lastClampedCount = clamped;
  }

  // â”€â”€ ENTROPY ENFORCEMENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Clamp entropy value S to valid range [0, ln(N)].
   * Appends to history.
   *
   * @param {number} S â€” raw entropy
   * @param {number} N â€” number of alive nodes
   * @returns {number}   clamped entropy
   */
  enforceEntropyBound(S, N) {
    const S_max   = maxEntropy(N);
    const raw     = isFiniteNum(S) ? S : 0;
    const clamped = clamp(raw, 0, S_max);

    this.entropyViolation = (raw !== clamped);

    if (DIAGNOSTICS.ENABLED) {
      this.entropyHistory.push(clamped);
      if (this.entropyHistory.length > this._bufferSize) {
        this.entropyHistory.shift();
      }
    }

    return clamped;
  }

  // â”€â”€ COMBINED PASS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Run both enforcement passes in one call.
   * Returns clamped entropy value.
   *
   * @param {Node[]} nodes â€” all alive nodes
   * @param {number} S     â€” raw entropy from EntropyField
   * @returns {number}       safe entropy value
   */
  enforce(nodes, S) {
    this.enforceStrengthBounds(nodes);
    return this.enforceEntropyBound(S, nodes.length);
  }

  // â”€â”€ DIAGNOSTICS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  getState() {
    return {
      lastClampedCount: this.lastClampedCount,
      nanCollapseCount: this.nanCollapseCount,
      entropyViolation: this.entropyViolation,
    };
  }
}



