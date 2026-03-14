/**
 * HAKARI v3 — knowledge/KnowledgeEngine.js (Advanced)
 * ---------------------------------------------
 * Master coordinator for Block 8 — the knowledge layer.
 *
 * Tick pipeline:
 *   1. queryActivation.update()        — compute node activations
 *   2. knowledgeDiffusion.propagate()  — spread activation to neighbors
 *   3. memoryConsolidation.update()    — boost frequently activated nodes
 *   4. knowledgeDecay.update()         — weaken unused knowledge
 *
 * Query pipeline (on-demand):
 *   setQuery() ? top-K retrieval
 *   clearQuery()
 * ---------------------------------------------
 */

import { EmbeddingStore }       from '../BLOCK_15_UPGRADE/knowledge/EmbeddingStore.js';
import { QueryActivation }      from '../BLOCK_15_UPGRADE/knowledge/QueryActivation.js';
import { RetrievalEngine }      from '../BLOCK_15_UPGRADE/knowledge/RetrievalEngine.js';
import { KnowledgeDiffusion }   from './BLOCK8/KnowledgeDiffusion.js';
import { MemoryConsolidation }  from './BLOCK8/MemoryConsolidation.js';
import { KnowledgeDecay }       from './BLOCK8/KnowledgeDecay.js';
import { sampleUniform }        from '../BLOCK1/random.js';
import { clamp }                from '../BLOCK1/math.js';

export class KnowledgeEngine {

  constructor(opts = {}) {
    const rng = opts.rng ?? sampleUniform;

    this.embeddingStore      = new EmbeddingStore({ rng });
    this.queryActivation     = new QueryActivation();
    this.retrievalEngine     = new RetrievalEngine(opts.retrievalOpts ?? {});
    this.knowledgeDiffusion  = new KnowledgeDiffusion(opts.diffusionOpts ?? {});
    this.memoryConsolidation = new MemoryConsolidation(opts.consolidationOpts ?? {});
    this.knowledgeDecay      = new KnowledgeDecay(opts.decayOpts ?? {});

    this._enableDiffusion       = opts.enableDiffusion      ?? true;
    this._enableConsolidation   = opts.enableConsolidation  ?? true;
    this._enableKnowledgeDecay  = opts.enableKnowledgeDecay ?? true;

    this._tick = 0;
  }

  /**
   * Main tick update for all nodes.
   * @param {Node[]} nodes
   * @param {Graph} graph
   * @param {Map<string, Node>} nodeMap
   * @param {object} params — live PARAMS
   */
  update(nodes, graph, nodeMap, params) {
    this._tick++;

    if (!nodes || nodes.length === 0) return;

    // Step 1: Query activation
    this.queryActivation.update(nodes, this.embeddingStore, params);

    // Step 2: Activation diffusion
    if (this._enableDiffusion && this.queryActivation.isActive) {
      // Optional stochastic modulation for diffusion
      this.knowledgeDiffusion.propagate(nodes, graph, nodeMap, {
        stochasticScale: params?.diffusionStochastic ?? 0.01
      });
    }

    // Step 3: Memory consolidation
    if (this._enableConsolidation) {
      this.memoryConsolidation.update(nodes);
    }

    // Step 4: Knowledge decay
    if (this._enableKnowledgeDecay) {
      this.knowledgeDecay.update(nodes);
    }
  }

  // -- QUERY INTERFACE --------------------------

  setQuery(queryVec, text = '') {
    this.queryActivation.setQuery(queryVec, text);
  }

  clearQuery() {
    this.queryActivation.clearQuery();
  }

  /**
   * Retrieve top-K results from current field state
   * @param {Node[]} nodes
   * @param {number} k
   * @returns {RetrievalResult[]}
   */
  retrieve(nodes, k) {
    return this.retrievalEngine.retrieve(nodes, k);
  }

  // -- NODE LIFECYCLE --------------------------

  registerNode(node, vec = null) {
    if (!node?.id) return;
    if (vec) this.embeddingStore.set(node.id, vec);
    else this.embeddingStore.setRandom(node.id);
  }

  removeNode(nodeId) {
    if (!nodeId) return;
    this.embeddingStore.remove(nodeId);
  }

  // -- DIAGNOSTICS / STATE ---------------------

  getState() {
    return {
      tick:                this._tick,
      embeddingStore:      this.embeddingStore.getState(),
      queryActivation:     this.queryActivation.getState(),
      retrievalEngine:     this.retrievalEngine.getState(),
      knowledgeDiffusion:  this._enableDiffusion      ? this.knowledgeDiffusion.getState()  : null,
      memoryConsolidation: this._enableConsolidation  ? this.memoryConsolidation.getState() : null,
      knowledgeDecay:      this._enableKnowledgeDecay ? this.knowledgeDecay.getState()      : null,
    };
  }
}
