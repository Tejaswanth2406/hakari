/**
 * HAKARI v3 — nodes/index.js
 * ─────────────────────────────────────────────
 * Barrel export for Block 3 nodes layer.
 *
 * Usage:
 *   import { Node, NodeFactory, NodeSerializer } from './nodes/index.js';
 *
 * Dependency order:
 *
 *   Node.js           ← core/constants, core/config
 *   NodeState.js      ← Node, core/math, core/numerics
 *   NodeSerializer.js ← Node, core/config, core/numerics
 *   NodeFactory.js    ← Node, core/constants, core/config, core/math, core/random
 * ─────────────────────────────────────────────
 */

export { Node }                                     from '../BLOCK_12/BLOCK_15_UPGRADE/nodes/Node.js';
export { NodeFactory }                              from '../BLOCK_12/BLOCK_15_UPGRADE/nodes/NodeFactory.js';
export {
  resetNodeState,
  resetPhysicsState,
  cloneNodeState,
  embeddingSimilarity,
  physicsDistance,
  compareNodes,
  diffNodeState,
  mergeNodeState,
}                                                   from './BLOCK3/nodestate.js';
export {
  serialize,
  serializeFull,
  deserialize,
  serializeBatch,
  serializeBatchFull,
  toJSON,
  fromJSON,
  snapshotDelta,
}                                                   from './nodeserializer.js';



