/**
 * HAKARI v3 — network/NetworkEngine.js
 * ─────────────────────────────────────────────
 * Master coordinator for the network layer.
 * Runs the complete network pipeline every tick.
 *
 * Pipeline order (deterministic):
 *
 *   1. graph.pruneDeadEdges()       — remove collapsed node edges
 *   2. connectivity.update()        — compute Cᵢ for decay law
 *   3. graphEnergy.update()         — E_graph = Σ wᵢⱼ·Hᵢ·Hⱼ
 *   4. diffusion.update()           — strength + belief spreading
 *   5. clusterEntropy.update()      — structural entropy + phase detection
 *   6. graph.decayWeights()         — edge weight atrophy
 *
 * Exposes the Graph and Connectivity directly so
 * PhysicsEngine and HUIE can query them without
 * going through NetworkEngine.
 *
 * Single entry point: NetworkEngine.update()
 * ─────────────────────────────────────────────
 */

import { Graph }          from '../BLOCK_12/BLOCK_15_UPGRADE/network/Graph.js';
import { Connectivity }   from '../BLOCK_12/BLOCK_15_UPGRADE/network/Connectivity.js';
import { GraphEnergy }    from './BLOCK4/GraphEnergy.js';
import { Diffusion }      from './BLOCK4/Diffusion.js';
import { ClusterEntropy } from './ClusterEntropy.js';
import { sampleUniform }  from '../BLOCK1/random.js';

export class NetworkEngine {

  /**
   * @param {object} [opts]
   * @param {Function} opts.rng                — seeded RNG for Graph
   * @param {boolean}  opts.enableDiffusion    — toggle diffusion (default true)
   * @param {boolean}  opts.enableGraphEnergy  — toggle energy calc (default true)
   * @param {boolean}  opts.enableClusterStats — toggle cluster analysis (default true)
   * @param {number}   opts.weightDecayRate    — edge atrophy per second (default 0.001)
   * @param {number}   opts.weightPruneThreshold — prune below this (default 0.02)
   * @param {object}   opts.diffusionOpts      — passed to Diffusion constructor
   */
  constructor(opts = {}) {
    const rng = opts.rng ?? sampleUniform;

    this.graph          = new Graph({ rng });
    this.connectivity   = new Connectivity();
    this.graphEnergy    = new GraphEnergy();
    this.diffusion      = new Diffusion(opts.diffusionOpts ?? {});
    this.clusterEntropy = new ClusterEntropy();

    this._enableDiffusion    = opts.enableDiffusion    ?? true;
    this._enableGraphEnergy  = opts.enableGraphEnergy  ?? true;
    this._enableClusterStats = opts.enableClusterStats ?? true;
    this._weightDecayRate    = opts.weightDecayRate    ?? 0.001;
    this._weightPruneThresh  = opts.weightPruneThreshold ?? 0.02;

    this._tick = 0;
  }

  // ── MAIN UPDATE ─────────────────────────────

  /**
   * Run the full network pipeline for one tick.
   *
   * @param {Node[]}           nodes    — all alive nodes
   * @param {Set<string>}      aliveIds — set of alive node ids
   * @param {Map<string,Node>} nodeMap  — id → node lookup
   * @param {number}           dt       — delta time in seconds
   */
  update(nodes, aliveIds, nodeMap, dt) {
    this._tick++;
    this.graph.totalNodes = nodes.length;

    // ── Step 1: Prune dead edges ────────────────
    this.graph.pruneDeadEdges(aliveIds);

    // ── Step 2: Connectivity scores ────────────
    this.connectivity.update(nodes, this.graph, nodeMap);

    // ── Step 3: Graph energy ───────────────────
    if (this._enableGraphEnergy) {
      this.graphEnergy.update(nodes, this.graph, nodeMap);
    }

    // ── Step 4: Diffusion ──────────────────────
    if (this._enableDiffusion) {
      this.diffusion.update(nodes, this.graph, nodeMap, dt);
    }

    // ── Step 5: Cluster analysis ───────────────
    if (this._enableClusterStats) {
      this.clusterEntropy.update(nodes, this.graph, this.connectivity);
    }

    // ── Step 6: Edge weight decay ──────────────
    this.graph.decayWeights(dt, this._weightDecayRate, this._weightPruneThresh);
  }

  // ── NODE LIFECYCLE ───────────────────────────

  /**
   * Register a newly spawned node in the graph and
   * auto-connect it to nearby nodes.
   *
   * @param {Node}   node
   * @param {Node[]} allNodes
   */
  addNode(node, allNodes) {
    this.graph.addNode(node.id);
    this.graph.autoConnect(node, allNodes);
  }

  /**
   * Remove a collapsed node from the graph.
   * @param {string} nodeId
   */
  removeNode(nodeId) {
    this.graph.removeNode(nodeId);
  }

  // ── EDGE REINFORCEMENT ───────────────────────

  /**
   * Reinforce an edge between two co-activated nodes.
   * Called by ReinforcementField.
   *
   * @param {string} idA
   * @param {string} idB
   * @param {number} delta
   */
  reinforceEdge(idA, idB, delta = 0.01) {
    this.graph.reinforceEdge(idA, idB, delta);
  }

  // ── NEIGHBOR ENERGY PROXY ────────────────────

  /**
   * Neighbor energy for HUIE β term.
   * Pass-through to EnergyField-style query.
   *
   * @param {string}           nodeId
   * @param {Map<string,Node>} nodeMap
   * @returns {number}
   */
  neighborEnergy(nodeId, nodeMap) {
    const neighbors = this.graph.getNeighbors(nodeId);
    if (!neighbors.length) return 0;
    let sum = 0;
    for (const { id, weight } of neighbors) {
      const nbr = nodeMap.get(id);
      if (!nbr || !nbr.alive) continue;
      sum += weight * (Number.isFinite(nbr.strength) ? nbr.strength : 0);
    }
    return sum;
  }

  // ── DIAGNOSTICS ─────────────────────────────

  getState() {
    return {
      tick:           this._tick,
      graph:          this.graph.getState(),
      connectivity:   this.connectivity.getState(),
      graphEnergy:    this._enableGraphEnergy  ? this.graphEnergy.getState()    : null,
      diffusion:      this._enableDiffusion    ? this.diffusion.getState()      : null,
      clusterEntropy: this._enableClusterStats ? this.clusterEntropy.getState() : null,
    };
  }
}



