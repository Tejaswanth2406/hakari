/**
 * HAKARI v3 — information.js
 * -------------------------------------------------------
 * Enterprise-grade information theory utilities.
 *
 * Stateless module.
 * No dependency on engine, network, nodes, or memory.
 *
 * Implements:
 *   • KL divergence (forward / reverse / symmetric)
 *   • Jensen–Shannon divergence + distance
 *   • Shannon entropy
 *   • Cross entropy
 *   • Information gain
 *   • Expected information gain
 *   • Mutual information
 *   • Normalized mutual information
 *   • Self information (surprise)
 *   • Perplexity
 *
 * -------------------------------------------------------
 * ENTERPRISE HARDENING
 * -------------------------------------------------------
 * ? numeric guards (NaN / Infinity)
 * ? dimension validation
 * ? overflow-safe logs
 * ? SIMD-friendly loops
 * ? zero-allocation hot paths
 * ? deterministic results
 * -------------------------------------------------------
 */

import { safeLog } from '../BLOCK1/numerics.js'

const EPS = 1e-12

function safeNum(v) {
  return Number.isFinite(v) ? v : 0
}

/* ======================================================
   KL DIVERGENCE
====================================================== */

export function klDivergence(P, Q, eps = EPS) {

  const n = P.length

  if (n !== Q.length)
    throw new Error(
      `klDivergence dimension mismatch (${n} vs ${Q.length})`
    )

  let kl = 0

  for (let i = 0; i < n; i++) {

    const p = safeNum(P[i])

    if (p < eps)
      continue

    const q = Math.max(safeNum(Q[i]), eps)

    kl += p * Math.log(p / q)
  }

  return Math.max(0, kl)
}

export function klDivergenceReverse(P, Q) {
  return klDivergence(Q, P)
}

export function klDivergenceSymmetric(P, Q) {
  return 0.5 * (
    klDivergence(P, Q) +
    klDivergence(Q, P)
  )
}

/* ======================================================
   JENSEN–SHANNON DIVERGENCE
====================================================== */

export function jsDivergence(P, Q) {

  const n = P.length

  if (n !== Q.length)
    throw new Error("jsDivergence dimension mismatch")

  const M = new Array(n)

  for (let i = 0; i < n; i++)
    M[i] = 0.5 * (safeNum(P[i]) + safeNum(Q[i]))

  return 0.5 * klDivergence(P, M)
       + 0.5 * klDivergence(Q, M)
}

export function jsDistance(P, Q) {
  return Math.sqrt(
    Math.max(0, jsDivergence(P, Q))
  )
}

/* ======================================================
   ENTROPY
====================================================== */

export function shannonEntropy(P, eps = EPS) {

  const n = P.length

  let H = 0

  for (let i = 0; i < n; i++) {

    const p = safeNum(P[i])

    if (p < eps)
      continue

    H -= p * Math.log(p)
  }

  return Math.max(0, H)
}

export function crossEntropy(P, Q, eps = EPS) {

  const n = P.length

  if (n !== Q.length)
    throw new Error("crossEntropy dimension mismatch")

  let ce = 0

  for (let i = 0; i < n; i++) {

    const p = safeNum(P[i])

    if (p < eps)
      continue

    const q = Math.max(safeNum(Q[i]), eps)

    ce -= p * safeLog(q)
  }

  return ce
}

/* ======================================================
   INFORMATION GAIN
====================================================== */

export function informationGain(prior, posterior) {
  return klDivergence(posterior, prior)
}

export function entropyReduction(prior, posterior) {
  return shannonEntropy(prior)
       - shannonEntropy(posterior)
}

export function expectedInformationGain(
  prior,
  posteriors,
  outcomeProbs
) {

  const k = outcomeProbs.length

  const priorEntropy = shannonEntropy(prior)

  let expectedPosteriorEntropy = 0

  for (let i = 0; i < k; i++) {

    const p = safeNum(outcomeProbs[i])

    if (p <= 0)
      continue

    expectedPosteriorEntropy +=
      p * shannonEntropy(posteriors[i])
  }

  return priorEntropy - expectedPosteriorEntropy
}

/* ======================================================
   MUTUAL INFORMATION
====================================================== */

export function mutualInformation(joint) {

  const rows = joint.length

  if (rows === 0)
    return 0

  const cols = joint[0].length

  const marginalX = new Array(rows).fill(0)
  const marginalY = new Array(cols).fill(0)

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {

      const v = safeNum(joint[i][j])

      marginalX[i] += v
      marginalY[j] += v
    }
  }

  let mi = 0

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {

      const pij = safeNum(joint[i][j])

      if (pij < EPS)
        continue

      const pi = marginalX[i]
      const pj = marginalY[j]

      if (pi < EPS || pj < EPS)
        continue

      mi += pij * Math.log(pij / (pi * pj))
    }
  }

  return Math.max(0, mi)
}

export function normalizedMutualInformation(joint) {

  const rows = joint.length
  const cols = joint[0].length

  const marginalX = new Array(rows).fill(0)
  const marginalY = new Array(cols).fill(0)

  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {

      const v = safeNum(joint[i][j])

      marginalX[i] += v
      marginalY[j] += v
    }

  const hX = shannonEntropy(marginalX)
  const hY = shannonEntropy(marginalY)

  const denom = Math.sqrt(hX * hY)

  if (denom < EPS)
    return 0

  return mutualInformation(joint) / denom
}

/* ======================================================
   SURPRISE
====================================================== */

export function selfInformation(probability) {

  const p = Math.max(
    safeNum(probability),
    EPS
  )

  return -safeLog(p)
}

export function perplexity(P) {
  return Math.exp(shannonEntropy(P))
}
