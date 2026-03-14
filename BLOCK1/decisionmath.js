/**
 * HAKARI v3 — decisionMath.js
 * -------------------------------------------------------
 * Enterprise-grade decision theory utilities.
 *
 * Stateless module. No dependency on engine, nodes,
 * network, or memory subsystems.
 *
 * Implements:
 *   • Expected Utility
 *   • CRRA Risk Utility
 *   • Greedy / Softmax / Epsilon Action Selection
 *   • Regret Analysis
 *   • Multi-objective decision scoring
 *   • Pareto dominance testing
 *
 * -------------------------------------------------------
 * ENTERPRISE HARDENING
 * -------------------------------------------------------
 * ? deterministic numeric guards
 * ? overflow-safe softmax
 * ? dimension validation
 * ? SIMD-friendly loops
 * ? zero-allocation hot paths
 * ? RNG injection support
 * -------------------------------------------------------
 */

import { softmax } from '../BLOCK1/math.js'
import { sampleCategorical } from '../BLOCK1/probability.js'
import { sampleUniform } from '../BLOCK1/random.js'

const EPS = 1e-12

function safeNum(v) {
  return Number.isFinite(v) ? v : 0
}

/* =======================================================
   EXPECTED UTILITY
======================================================= */

/**
 * EU(a) = S P(o|a) · U(o)
 */
export function expectedUtility(probabilities, utilities) {

  const n = probabilities.length

  if (n !== utilities.length)
    throw new Error(
      `expectedUtility dimension mismatch (${n} vs ${utilities.length})`
    )

  let eu = 0

  for (let i = 0; i < n; i++) {

    const p = safeNum(probabilities[i])
    const u = safeNum(utilities[i])

    eu += p * u
  }

  return eu
}

/**
 * Expected utilities for all actions
 */
export function expectedUtilitiesAll(actionProbs, utilities) {

  const numActions = actionProbs.length

  const result = new Array(numActions)

  for (let a = 0; a < numActions; a++)
    result[a] = expectedUtility(actionProbs[a], utilities)

  return result
}

/* =======================================================
   RISK ADJUSTED UTILITY (CRRA)
======================================================= */

/**
 * Constant Relative Risk Aversion utility
 *
 * r = 0  ? risk neutral
 * r = 1  ? log utility
 */
export function crraUtility(value, riskAversion) {

  const v = Math.max(safeNum(value), EPS)
  const r = safeNum(riskAversion)

  if (Math.abs(r - 1) < 1e-8)
    return Math.log(v)

  return Math.pow(v, 1 - r) / (1 - r)
}

/**
 * Risk-adjusted expected utility
 */
export function riskAdjustedEU(probabilities, values, riskAversion) {

  const n = probabilities.length

  if (n !== values.length)
    throw new Error(
      `riskAdjustedEU dimension mismatch (${n} vs ${values.length})`
    )

  let eu = 0

  for (let i = 0; i < n; i++) {

    const p = safeNum(probabilities[i])
    const v = safeNum(values[i])

    const u = crraUtility(v, riskAversion)

    eu += p * u
  }

  return eu
}

/* =======================================================
   ACTION SELECTION
======================================================= */

/**
 * Greedy action selection
 */
export function argmaxAction(expectedUtils) {

  const n = expectedUtils.length

  if (n === 0)
    throw new Error("argmaxAction: empty action set")

  let bestIndex = 0
  let bestValue = expectedUtils[0]

  for (let i = 1; i < n; i++) {

    const v = expectedUtils[i]

    if (v > bestValue) {

      bestValue = v
      bestIndex = i
    }
  }

  return bestIndex
}

/**
 * Softmax exploration
 */
export function softmaxActionSelect(
  expectedUtils,
  temperature,
  rng = sampleUniform
) {

  const tau = Math.max(safeNum(temperature), EPS)

  const n = expectedUtils.length
  const scaled = new Array(n)

  for (let i = 0; i < n; i++)
    scaled[i] = expectedUtils[i] / tau

  const probs = softmax(scaled)

  return sampleCategorical(probs, rng)
}

/**
 * Epsilon-greedy exploration
 */
export function epsilonGreedy(
  expectedUtils,
  epsilon,
  rng = sampleUniform
) {

  const e = Math.min(Math.max(epsilon, 0), 1)

  if (rng() < e)
    return Math.floor(rng() * expectedUtils.length)

  return argmaxAction(expectedUtils)
}

/* =======================================================
   REGRET ANALYSIS
======================================================= */

/**
 * Instant regret
 *
 * regret(a) = max(EU) - EU(a)
 */
export function actionRegret(expectedUtils, chosenIndex) {

  const n = expectedUtils.length

  let maxEU = -Infinity

  for (let i = 0; i < n; i++)
    if (expectedUtils[i] > maxEU)
      maxEU = expectedUtils[i]

  const chosen = expectedUtils[chosenIndex]

  return Math.max(0, maxEU - chosen)
}

/**
 * Cumulative regret
 */
export function cumulativeRegret(euHistory, chosenHistory) {

  const T = euHistory.length

  let total = 0

  for (let t = 0; t < T; t++) {

    total += actionRegret(
      euHistory[t],
      chosenHistory[t]
    )
  }

  return total
}

/* =======================================================
   MULTI-OBJECTIVE DECISION
======================================================= */

/**
 * Weighted objective aggregation
 *
 * Score(a) = S w_j · objective_j(a)
 */
export function multiCriteriaScore(objectives, weights) {

  const m = objectives.length

  if (m !== weights.length)
    throw new Error(
      "multiCriteriaScore: objectives / weights mismatch"
    )

  const numActions = objectives[0].length

  const scores = new Array(numActions).fill(0)

  for (let j = 0; j < m; j++) {

    const weight = safeNum(weights[j])
    const obj = objectives[j]

    for (let a = 0; a < numActions; a++)
      scores[a] += weight * safeNum(obj[a])
  }

  return scores
}

/**
 * Pareto dominance test
 */
export function paretoDominates(scoresA, scoresB) {

  const n = scoresA.length

  let strictlyBetter = false

  for (let i = 0; i < n; i++) {

    const a = safeNum(scoresA[i])
    const b = safeNum(scoresB[i])

    if (a < b)
      return false

    if (a > b)
      strictlyBetter = true
  }

  return strictlyBetter
}
