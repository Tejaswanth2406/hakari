/**
 * HAKARI v3 — network/Graph.js
 * ------------------------------------------------------------
 * Manages the node relationship network.
 *
 * Responsibilities:
 *   - Adjacency map: nodeId → [{id, weight}]
 *   - Add / remove bidirectional edges
 *   - Enforce edges_per_node ≤ √N cap
 *   - Auto-connect new nodes by proximity
 *   - Prune edges to dead nodes each tick
 *   - Weight decay: unused edges weaken over time
 *   - Edge reinforcement (Hebbian learning)
 *
 * Edge weight wᵢⱼ ∈ [0,1]
 */

import { NETWORK } from '../core/config.js'
import { clamp, edgeCap, cosineSimilarity } from '../../../BLOCK1/math.js'
import { isFiniteNum } from '../../../BLOCK1/numerics.js'
import { sampleUniform } from '../../../BLOCK1/random.js'

export class Graph {

  constructor(opts = {}) {
    this._adj = new Map()
    this._rng = opts.rng ?? sampleUniform
    this.edgeCount = 0
    this.totalNodes = 0
  }

  /* ---------------------------------------------------- */
  /* NODE REGISTRATION                                    */
  /* ---------------------------------------------------- */

  addNode(nodeId) {
    if (!this._adj.has(nodeId)) {
      this._adj.set(nodeId, [])
    }
  }

  removeNode(nodeId) {

    const edges = this._adj.get(nodeId)
    if (!edges) return

    for (const { id } of edges) {
      const nbrEdges = this._adj.get(id)
      if (!nbrEdges) continue

      const idx = nbrEdges.findIndex(e => e.id === nodeId)
      if (idx !== -1) nbrEdges.splice(idx, 1)
    }

    this.edgeCount = Math.max(0, this.edgeCount - edges.length)

    this._adj.delete(nodeId)
  }

  /* ---------------------------------------------------- */
  /* EDGE MANAGEMENT                                      */
  /* ---------------------------------------------------- */

  addEdge(idA, idB, weight = null) {

    if (idA === idB) return false
    if (!this._adj.has(idA) || !this._adj.has(idB)) return false
    if (this.hasEdge(idA, idB)) return false

    const cap = this._cap()

    if (this._adj.get(idA).length >= cap) return false
    if (this._adj.get(idB).length >= cap) return false

    const w = isFiniteNum(weight)
      ? clamp(weight, 0, 1)
      : this._randWeight()

    this._adj.get(idA).push({ id: idB, weight: w })
    this._adj.get(idB).push({ id: idA, weight: w })

    this.edgeCount++

    return true
  }

  removeEdge(idA, idB) {

    const removedA = this._removeDirected(idA, idB)
    const removedB = this._removeDirected(idB, idA)

    if (removedA && removedB) this.edgeCount--
  }

  hasEdge(idA, idB) {
    const edges = this._adj.get(idA)
    return !!edges && edges.some(e => e.id === idB)
  }

  setWeight(idA, idB, newWeight) {

    if (!isFiniteNum(newWeight)) return

    const w = clamp(newWeight, 0, 1)

    this._setDirectedWeight(idA, idB, w)
    this._setDirectedWeight(idB, idA, w)
  }

  /* ---------------------------------------------------- */
  /* QUERIES                                              */
  /* ---------------------------------------------------- */

  getNeighbors(nodeId) {
    return this._adj.get(nodeId) ?? []
  }

  degree(nodeId) {
    return (this._adj.get(nodeId) ?? []).length
  }

  getWeight(idA, idB) {
    return this._getWeight(idA, idB)
  }

  nodeIds() {
    return Array.from(this._adj.keys())
  }

  *getAllEdges() {

    const seen = new Set()

    for (const [idA, edges] of this._adj.entries()) {

      for (const { id: idB, weight } of edges) {

        const key = idA < idB
          ? `${idA}|${idB}`
          : `${idB}|${idA}`

        if (!seen.has(key)) {

          seen.add(key)

          yield { idA, idB, weight }
        }
      }
    }
  }

  /* ---------------------------------------------------- */
  /* AUTO CONNECT                                         */
  /* ---------------------------------------------------- */

  autoConnect(newNode, allNodes) {

    const target = NETWORK.EDGES_PER_NODE_TARGET
    const radius = NETWORK.CONNECTION_RADIUS

    const candidates = []

    for (const n of allNodes) {

      if (n.id === newNode.id || !n.alive) continue

      const dx = n.x - newNode.x
      const dy = n.y - newNode.y

      const dist = Math.hypot(dx, dy)

      if (dist > radius) continue

      let cosineBias = 0

      if (newNode.embedding && n.embedding) {

        const sim = cosineSimilarity(
          Array.from(newNode.embedding),
          Array.from(n.embedding)
        )

        cosineBias = Math.max(0, sim) * 0.2
      }

      candidates.push({ id: n.id, dist, cosineBias })
    }

    candidates.sort((a, b) => a.dist - b.dist)

    const chosen = candidates.slice(0, target)

    for (const c of chosen) {

      const spatialW = clamp(
        1 - c.dist / radius,
        NETWORK.WEIGHT_INIT_MIN,
        NETWORK.WEIGHT_INIT_MAX
      )

      const w = clamp(spatialW + c.cosineBias, 0, 1)

      this.addEdge(newNode.id, c.id, w)
    }
  }

  /* ---------------------------------------------------- */
  /* PRUNING                                              */
  /* ---------------------------------------------------- */

  pruneDeadEdges(aliveIds) {

    for (const [id, edges] of this._adj.entries()) {

      if (!aliveIds.has(id)) continue

      let removed = 0

      const kept = edges.filter(e => {
        if (aliveIds.has(e.id)) return true
        removed++
        return false
      })

      if (removed > 0) {

        edges.length = 0

        kept.forEach(e => edges.push(e))

        this.edgeCount -= Math.floor(removed / 2)
      }
    }

    if (this.edgeCount < 0) this.edgeCount = 0
  }

  /* ---------------------------------------------------- */
  /* WEIGHT DECAY                                         */
  /* ---------------------------------------------------- */

  decayWeights(dt, decayRate = 0.001, pruneThreshold = 0.02) {

    const toRemove = []

    for (const [idA, edges] of this._adj.entries()) {

      for (const { id: idB, weight } of edges) {

        const newW = clamp(weight - decayRate * dt, 0, 1)

        this._setDirectedWeight(idA, idB, newW)

        if (newW <= pruneThreshold) {
          toRemove.push([idA, idB])
        }
      }
    }

    for (const [a, b] of toRemove) {
      this.removeEdge(a, b)
    }
  }

  /* ---------------------------------------------------- */
  /* HEBBIAN LEARNING                                     */
  /* ---------------------------------------------------- */

  reinforceEdge(idA, idB, delta = 0.01) {

    const current = this._getWeight(idA, idB) ?? 0.1

    this.setWeight(idA, idB, clamp(current + delta, 0, 1))
  }

  /* ---------------------------------------------------- */
  /* DIAGNOSTICS                                          */
  /* ---------------------------------------------------- */

  getState() {

    const n = this._adj.size

    const totalDeg =
      n > 0
        ? Array.from(this._adj.values()).reduce((s, e) => s + e.length, 0)
        : 0

    return {
      nodeCount: n,
      edgeCount: this.edgeCount,
      avgDegree: n > 0 ? totalDeg / n : 0,
      cap: this._cap()
    }
  }

  validate() {

    let directed = 0

    for (const edges of this._adj.values()) {
      directed += edges.length
    }

    const undirected = Math.floor(directed / 2)

    if (undirected !== this.edgeCount) {

      console.warn(
        "Graph invariant mismatch",
        { stored: this.edgeCount, computed: undirected }
      )

      this.edgeCount = undirected
    }
  }

  /* ---------------------------------------------------- */
  /* PRIVATE                                              */
  /* ---------------------------------------------------- */

  _cap() {
    return NETWORK.EDGES_PER_NODE_MAX ?? edgeCap(this.totalNodes || this._adj.size)
  }

  _randWeight() {

    return NETWORK.WEIGHT_INIT_MIN +
      this._rng() *
      (NETWORK.WEIGHT_INIT_MAX - NETWORK.WEIGHT_INIT_MIN)
  }

  _removeDirected(from, to) {

    const edges = this._adj.get(from)
    if (!edges) return false

    const idx = edges.findIndex(e => e.id === to)

    if (idx !== -1) {
      edges.splice(idx, 1)
      return true
    }

    return false
  }

  _setDirectedWeight(from, to, w) {

    const edges = this._adj.get(from)
    if (!edges) return

    const edge = edges.find(e => e.id === to)

    if (edge) edge.weight = w
  }

  _getWeight(idA, idB) {

    const edges = this._adj.get(idA)

    if (!edges) return null

    const edge = edges.find(e => e.id === idB)

    return edge ? edge.weight : null
  }

}