/**
 * HAKARI v3 — network/AdaptiveConnectivity.js
 * ------------------------------------------------------------
 * Adaptive wiring of the concept graph.
 */

export class AdaptiveConnectivity {
  constructor(opts = {}) {
    this._tick = 0;
    this.nodeCount = 0;
    this.edgeCount = 0;
    this.avgConnectivity = 0;
    this.adaptationRate = opts.adaptationRate ?? 0.01;
    this.lastChanges = 0;
  }

  tick(nodes, graph, tick) {
    this._tick = tick;
    this.nodeCount = nodes?.length ?? 0;
    this.edgeCount = graph?.edgeCount ?? 0;
    this.lastChanges = 0;

    if (!graph || nodes.length === 0) return;

    for (const node of nodes) {
      if (node.connectivity == null) continue;

      if (node.connectivity < 0.15 && graph.getNeighbors(node.id).length === 0 && nodes.length > 1) {
        const candidate = nodes.find(n => n.id !== node.id);

        if (candidate && graph.addEdge(node.id, candidate.id, 0.05)) {
          this.lastChanges++;
        }
      }
    }

    this.avgConnectivity =
      nodes.reduce((sum, n) => sum + (n.connectivity ?? 0), 0) / Math.max(nodes.length, 1);
  }

  clear() {
    this._tick = 0;
    this.nodeCount = 0;
    this.edgeCount = 0;
    this.avgConnectivity = 0;
    this.lastChanges = 0;
  }

  getState(graph) {
    return {
      tick: this._tick,
      nodeCount: this.nodeCount,
      edgeCount: this.edgeCount,
      avgConnectivity: this.avgConnectivity,
      lastChanges: this.lastChanges,
      graph: graph?.getState?.() ?? null,
    };
  }
}
