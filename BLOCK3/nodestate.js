/**
 * HAKARI v3 â€” nodes/NodeState.js
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * Pure utility functions for node state operations.
 * No class â€” stateless functions only.
 * No engine/physics imports.
 *
 * Implements:
 *   - resetNodeState()     â€” zero physics/learning fields
 *   - cloneNodeState()     â€” deep copy of node state
 *   - compareNodes()       â€” similarity/distance between nodes
 *   - diffNodeState()      â€” changed fields between two snapshots
 *   - mergeNodeState()     â€” blend two node states
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

import { PARAMS, PHYSICS } from '../BLOCK_12/BLOCK_15_UPGRADE/core/constants.js';
import { NODES, BELIEF }    from '../BLOCK_12/BLOCK_15_UPGRADE/core/config.js';
import { clamp }             from '../BLOCK1/math.js';
import { cosineSimilarity }  from '../BLOCK1/math.js';
import { isFiniteNum }       from '../BLOCK1/numerics.js';

// â”€â”€ RESET â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Reset all physics + learning fields to neutral defaults.
 * Preserves identity, embedding, position, and lifecycle state.
 * Useful when restoring a node from memory without carrying
 * over stale runtime values.
 *
 * @param {Node} node  â€” mutated in place
 */
export function resetNodeState(node) {
  // Physics
  node.energy         = 0;
  node.adaptiveLambda = node.lambda ?? PARAMS.lambda0;
  node.errorRate      = 0;
  node.connectivity   = 0;
  node.infoInput      = 0;

  // Reinforcement
  node.reinforcement    = 0;
  node.reinforcementAcc = 0;

  // Semantic
  node.activationScore  = 0;

  // Learning
  node.uncertainty = 0.5;
  node.attention   = 0;

  // Memory
  node.memoryTrace     = 0;
  // Note: activationCount and lastActivatedAt preserved intentionally
  // (they represent historical facts, not runtime state)

  // Belief
  node.beliefEntropy    = Math.log(BELIEF.HYPOTHESIS_DIM);
  node.beliefConfident  = false;
  node.expectedInfoGain = 0;
  // belief distribution reset to null â€” BeliefField will re-init
  node.belief    = null;
  node.logBelief = null;

  // History ring
  node.strengthHistory.fill(0);
  node._historyIdx  = 0;
  node._historyFull = false;
}

/**
 * Reset only physics fields (preserve cognition/memory).
 * Used when re-inserting a node after a soft reset.
 *
 * @param {Node} node
 */
export function resetPhysicsState(node) {
  node.energy         = 0;
  node.adaptiveLambda = node.lambda;
  node.errorRate      = 0;
  node.connectivity   = 0;
  node.infoInput      = 0;
  node.reinforcement  = 0;
  node.activationScore = 0;
}

// â”€â”€ CLONE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Deep clone of all node state.
 * Returns a plain object (not a Node instance).
 * Use NodeFactory.fromMemory(cloneNodeState(node)) to get a live node.
 *
 * @param {Node} node
 * @returns {object}  full snapshot with all fields
 */
export function cloneNodeState(node) {
  return {
    // Identity
    id:              node.id,
    label:           node.label,
    source:          node.source,
    createdAt:       node.createdAt,

    // Position
    x: node.x, y: node.y,
    vx: node.vx, vy: node.vy,

    // Physics
    strength:        node.strength,
    energy:          node.energy,
    lambda:          node.lambda,
    adaptiveLambda:  node.adaptiveLambda,
    errorRate:       node.errorRate,
    connectivity:    node.connectivity,
    infoInput:       node.infoInput,

    // Reinforcement
    reinforcement:    node.reinforcement,
    reinforcementAcc: node.reinforcementAcc,

    // Semantic
    embedding:       node.embedding ? new Float32Array(node.embedding) : null,
    activationScore: node.activationScore,

    // Learning
    uncertainty: node.uncertainty,
    attention:   node.attention,

    // Memory
    memoryTrace:     node.memoryTrace,
    activationCount: node.activationCount,
    lastActivatedAt: node.lastActivatedAt,

    // Belief
    belief:           node.belief     ? new Float32Array(node.belief)    : null,
    logBelief:        node.logBelief  ? new Float32Array(node.logBelief) : null,
    beliefEntropy:    node.beliefEntropy,
    beliefConfident:  node.beliefConfident,
    expectedInfoGain: node.expectedInfoGain,

    // Lifecycle
    alive:           node.alive,
    pendingCollapse: node.pendingCollapse,
    age:             node.age,
    ageTicks:        node.ageTicks,
    collapseAt:      node.collapseAt,
    collapseBy:      node.collapseBy,
  };
}

// â”€â”€ COMPARE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Semantic similarity between two nodes via embedding cosine similarity.
 * Returns 0 if either node lacks an embedding.
 *
 * @param {Node} a
 * @param {Node} b
 * @returns {number} âˆˆ [-1, 1]
 */
export function embeddingSimilarity(a, b) {
  if (!a.embedding || !b.embedding) return 0;
  return cosineSimilarity(
    Array.from(a.embedding),
    Array.from(b.embedding)
  );
}

/**
 * Physics state distance: Euclidean distance in (strength, lambda, connectivity) space.
 *
 * @param {Node} a
 * @param {Node} b
 * @returns {number} distance â‰¥ 0
 */
export function physicsDistance(a, b) {
  const dH = a.strength    - b.strength;
  const dL = a.adaptiveLambda - b.adaptiveLambda;
  const dC = a.connectivity - b.connectivity;
  return Math.sqrt(dH * dH + dL * dL + dC * dC);
}

/**
 * Comprehensive node comparison returning multiple similarity metrics.
 *
 * @param {Node} a
 * @param {Node} b
 * @returns {{ semantic: number, physics: number, overall: number }}
 */
export function compareNodes(a, b) {
  const semantic = embeddingSimilarity(a, b);
  const physics  = physicsDistance(a, b);

  // Overall: high semantic similarity + low physics distance â†’ similar
  const physicsScore = Math.max(0, 1 - physics);
  const overall = 0.7 * Math.max(0, semantic) + 0.3 * physicsScore;

  return { semantic, physics, overall };
}

// â”€â”€ DIFF â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Compute changed fields between two snapshots (plain objects).
 * Returns an object containing only the fields that changed,
 * with { before, after } values.
 *
 * @param {object} before  â€” earlier snapshot
 * @param {object} after   â€” later snapshot
 * @param {number} [tol=1e-6]  â€” numerical tolerance for float fields
 * @returns {object}  { fieldName: { before, after } }
 */
export function diffNodeState(before, after, tol = 1e-6) {
  const diff = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    const bv = before[key];
    const av = after[key];

    // Skip embedding/belief arrays in diff (too large)
    if (bv instanceof Float32Array || av instanceof Float32Array) continue;

    if (typeof bv === 'number' && typeof av === 'number') {
      if (Math.abs(bv - av) > tol) diff[key] = { before: bv, after: av };
    } else if (bv !== av) {
      diff[key] = { before: bv, after: av };
    }
  }
  return diff;
}

// â”€â”€ MERGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Blend two node state objects (plain objects, not Node instances).
 * Returns a new merged snapshot with linearly interpolated numeric fields.
 * Non-numeric fields taken from `a`.
 *
 * Useful for: belief averaging, soft node merging, consensus states.
 *
 * @param {object} a      â€” first state snapshot
 * @param {object} b      â€” second state snapshot
 * @param {number} alpha  â€” weight for `a` âˆˆ [0,1] (0 = all b, 1 = all a)
 * @returns {object}      merged snapshot
 */
export function mergeNodeState(a, b, alpha = 0.5) {
  const result = { ...a };
  const beta   = 1 - alpha;

  const numericFields = [
    'strength', 'energy', 'lambda', 'adaptiveLambda', 'errorRate',
    'connectivity', 'infoInput', 'reinforcement', 'activationScore',
    'uncertainty', 'attention', 'memoryTrace', 'beliefEntropy',
    'expectedInfoGain', 'age',
  ];

  for (const key of numericFields) {
    const av = a[key], bv = b[key];
    if (isFiniteNum(av) && isFiniteNum(bv)) {
      result[key] = alpha * av + beta * bv;
    }
  }

  // Merge embeddings if both present
  if (a.embedding && b.embedding && a.embedding.length === b.embedding.length) {
    const merged = new Float32Array(a.embedding.length);
    for (let i = 0; i < merged.length; i++) {
      merged[i] = alpha * a.embedding[i] + beta * b.embedding[i];
    }
    result.embedding = merged;
  }

  // Merge belief distributions if both present
  if (a.belief && b.belief && a.belief.length === b.belief.length) {
    const merged = new Float32Array(a.belief.length);
    for (let i = 0; i < merged.length; i++) {
      merged[i] = alpha * a.belief[i] + beta * b.belief[i];
    }
    result.belief = merged;
  }

  return result;
}



