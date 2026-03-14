/**
 * HAKARI v3 — nodes/NodeSerializer.js
 * ─────────────────────────────────────────────
 * Handles serialization of nodes to/from plain
 * objects suitable for MemoryStore, JSON export,
 * and network transmission.
 *
 * Separates persistence logic from Node.js
 * so Node stays a pure data structure.
 *
 * Implements:
 *   - serialize()      — Node → compact plain object
 *   - serializeFull()  — Node → full object (with embedding)
 *   - deserialize()    — plain object → Node via NodeFactory
 *   - serializeBatch() — Node[] → array
 *   - toJSON()         — JSON string
 *   - fromJSON()       — JSON string → Node[]
 *   - snapshotDelta()  — only changed fields vs previous snapshot
 * ─────────────────────────────────────────────
 */

import { Node }        from '../BLOCK_12/BLOCK_15_UPGRADE/nodes/Node.js';
import { NODES }       from '../BLOCK_12/BLOCK_15_UPGRADE/core/config.js';
import { isFiniteNum } from '../BLOCK1/numerics.js';

// ── SERIALIZE ────────────────────────────────

/**
 * Serialize a node to a compact plain object.
 * Excludes embedding and belief (too large for ring snapshots).
 * Rounds floats to 5 decimal places to reduce storage.
 *
 * @param {Node} node
 * @returns {object}
 */
export function serialize(node) {
  return {
    id:              node.id,
    label:           node.label,
    source:          node.source,
    createdAt:       node.createdAt,
    x:               round5(node.x),
    y:               round5(node.y),
    strength:        round5(node.strength),
    adaptiveLambda:  round5(node.adaptiveLambda),
    connectivity:    round5(node.connectivity),
    reinforcement:   round5(node.reinforcement),
    activationScore: round5(node.activationScore),
    uncertainty:     round5(node.uncertainty),
    attention:       round5(node.attention),
    memoryTrace:     round5(node.memoryTrace),
    activationCount: node.activationCount,
    lastActivatedAt: node.lastActivatedAt,
    age:             round5(node.age),
    ageTicks:        node.ageTicks,
    alive:           node.alive,
    collapseBy:      node.collapseBy ?? null,
  };
}

/**
 * Full serialization including embedding and belief vectors.
 * Embedding encoded as regular Array (JSON-safe).
 *
 * @param {Node} node
 * @returns {object}
 */
export function serializeFull(node) {
  return {
    ...serialize(node),
    lambda:    round5(node.lambda),
    embedding: node.embedding  ? compressFloat32(node.embedding)  : null,
    belief:    node.belief     ? compressFloat32(node.belief)     : null,
    beliefEntropy:    round5(node.beliefEntropy),
    expectedInfoGain: round5(node.expectedInfoGain),
  };
}

// ── DESERIALIZE ──────────────────────────────

/**
 * Deserialize a plain object back to a full node state object
 * suitable for NodeFactory.fromMemory().
 *
 * Does NOT create a Node instance directly —
 * route through NodeFactory.fromMemory() for proper init.
 *
 * @param {object} data  — serialized node object
 * @returns {object}     — normalized snapshot for fromMemory()
 */
export function deserialize(data) {
  const snapshot = {
    id:              data.id,
    label:           data.label      ?? '',
    source:          data.source     ?? 'memory',
    createdAt:       data.createdAt  ?? Date.now(),
    x:               data.x          ?? 0,
    y:               data.y          ?? 0,
    strength:        safeFloat(data.strength,        0.3),
    adaptiveLambda:  safeFloat(data.adaptiveLambda,  0.015),
    connectivity:    safeFloat(data.connectivity,    0),
    reinforcement:   safeFloat(data.reinforcement,   0),
    activationScore: safeFloat(data.activationScore, 0),
    uncertainty:     safeFloat(data.uncertainty,     0.5),
    attention:       safeFloat(data.attention,       0),
    memoryTrace:     safeFloat(data.memoryTrace,     0),
    activationCount: data.activationCount  ?? 0,
    lastActivatedAt: data.lastActivatedAt  ?? 0,
    age:             safeFloat(data.age,    0),
    ageTicks:        data.ageTicks         ?? 0,
    alive:           data.alive            ?? true,
  };

  // Restore embedding if present
  if (data.embedding) {
    snapshot.embedding = Node._toFloat32(data.embedding, NODES.EMBEDDING_DIM);
  }

  // Restore belief if present
  if (data.belief && Array.isArray(data.belief)) {
    snapshot.belief = Node._toFloat32(data.belief, data.belief.length);
  }

  return snapshot;
}

// ── BATCH ────────────────────────────────────

/**
 * Serialize an array of nodes (compact form).
 * @param {Node[]} nodes
 * @returns {object[]}
 */
export function serializeBatch(nodes) {
  return nodes.map(serialize);
}

/**
 * Serialize an array of nodes (full form with embeddings).
 * @param {Node[]} nodes
 * @returns {object[]}
 */
export function serializeBatchFull(nodes) {
  return nodes.map(serializeFull);
}

// ── JSON ─────────────────────────────────────

/**
 * Export nodes to a JSON string.
 * @param {Node[]} nodes
 * @param {boolean} [full=false]  include embeddings/beliefs
 * @returns {string}
 */
export function toJSON(nodes, full = false) {
  const data = full ? serializeBatchFull(nodes) : serializeBatch(nodes);
  return JSON.stringify({ version: 3, count: data.length, nodes: data });
}

/**
 * Import nodes from a JSON string.
 * Returns deserialized snapshot objects (pass through NodeFactory.fromMemory).
 *
 * @param {string} json
 * @returns {{ version: number, snapshots: object[] }}
 */
export function fromJSON(json) {
  const parsed = JSON.parse(json);
  const snapshots = (parsed.nodes ?? []).map(deserialize);
  return { version: parsed.version ?? 1, snapshots };
}

// ── DELTA SNAPSHOT ───────────────────────────

/**
 * Compute a delta between two compact snapshots.
 * Only includes fields that changed beyond tolerance.
 * Useful for efficient storage of state history.
 *
 * @param {object} prev   — earlier serialized snapshot
 * @param {object} curr   — later serialized snapshot
 * @param {number} [tol=1e-4]
 * @returns {object}      — { id, delta: { field: newValue } }
 */
export function snapshotDelta(prev, curr, tol = 1e-4) {
  const delta = { id: curr.id };
  const changed = {};

  for (const key of Object.keys(curr)) {
    if (key === 'id') continue;
    const pv = prev[key];
    const cv = curr[key];
    if (typeof cv === 'number' && typeof pv === 'number') {
      if (Math.abs(cv - pv) > tol) changed[key] = cv;
    } else if (cv !== pv) {
      changed[key] = cv;
    }
  }

  delta.changed = changed;
  delta.hasChanges = Object.keys(changed).length > 0;
  return delta;
}

// ── HELPERS ──────────────────────────────────

/** Round to 5 decimal places. */
function round5(v) {
  return isFiniteNum(v) ? Math.round(v * 1e5) / 1e5 : 0;
}

/** Safe float parse with fallback. */
function safeFloat(v, fallback) {
  return isFiniteNum(v) ? v : fallback;
}

/**
 * Compress Float32Array to regular Array with 5dp rounding.
 * Reduces JSON size significantly.
 * @param {Float32Array} arr
 * @returns {number[]}
 */
function compressFloat32(arr) {
  const out = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    out[i] = Math.round(arr[i] * 1e5) / 1e5;
  }
  return out;
}



