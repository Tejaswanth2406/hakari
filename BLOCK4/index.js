/**
 * HAKARI v3 — network/index.js
 * ─────────────────────────────────────────────
 * Barrel export for Block 4 network layer.
 *
 * Usage:
 *   import { NetworkEngine, Graph } from './network/index.js';
 *
 * Dependency order:
 *
 *   Graph.js         ← core/config, core/math, core/numerics, core/random
 *   Connectivity.js  ← core/math, core/numerics
 *   GraphEnergy.js   ← core/math, core/numerics
 *   Diffusion.js     ← core/math, core/probability, core/numerics
 *   ClusterEntropy.js← core/math, core/numerics
 *   NetworkEngine.js ← all above
 * ─────────────────────────────────────────────
 */

export { Graph }          from '../BLOCK_12/BLOCK_15_UPGRADE/network/Graph.js';
export { Connectivity }   from '../BLOCK_12/BLOCK_15_UPGRADE/network/Connectivity.js';
export { GraphEnergy }    from './BLOCK4/GraphEnergy.js';
export { Diffusion }      from './BLOCK4/Diffusion.js';
export { ClusterEntropy } from './Clusterentropy.js';
export { NetworkEngine }  from './Networkengine.js';



