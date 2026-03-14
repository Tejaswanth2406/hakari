/**
 * HAKARI v3 — llm/ContextBuilder.js
 * ─────────────────────────────────────────────
 * Formats retrieved HAKARI nodes into a structured
 * context block for LLM consumption.
 *
 * BLOCK 9 HARDENING vs original:
 *   - Belief confidence shown per node (epistemic signal)
 *   - Free energy / phase state included in header
 *   - buildJSON returns richer schema
 *   - Reliability label includes belief qualifier
 * ─────────────────────────────────────────────
 */

export class ContextBuilder {

  /**
   * @param {object} opts
   *   opts.maxTokenEstimate  — soft context length limit (default 2000)
   *   opts.includeStrength   — show strength values (default true)
   *   opts.includeProbability— show retrieval probability (default false)
   *   opts.includeBelief     — show belief confidence (default true)
   */
  constructor(opts = {}) {
    this.maxTokenEstimate   = opts.maxTokenEstimate   ?? 2000;
    this.includeStrength    = opts.includeStrength    ?? true;
    this.includeProbability = opts.includeProbability ?? false;
    this.includeBelief      = opts.includeBelief      ?? true;
  }

  // ── BUILD ─────────────────────────────────────

  /**
   * Build a context string from retrieval results.
   *
   * @param {RetrievalResult[]} results
   * @param {string}            query
   * @param {object}            [meta]
   *   meta.entropy, meta.nodeCount, meta.tick,
   *   meta.temperature, meta.freeEnergy, meta.phase
   * @returns {string}
   */
  build(results, query, meta = {}) {
    if (!results || results.length === 0) return this._noContextBlock(query);

    const lines = [];

    lines.push('## HAKARI Knowledge Field — Active Context');
    lines.push(`Query: "${query}"`);

    // Extended field state header
    if (meta.entropy !== undefined) {
      const phase = meta.phase ?? '—';
      const T     = meta.temperature !== undefined ? `T=${meta.temperature.toFixed(2)}` : '';
      const F     = meta.freeEnergy  !== undefined ? `F=${meta.freeEnergy.toFixed(2)}`  : '';
      const extra = [T, F].filter(Boolean).join(' | ');
      lines.push(
        `Field S=${meta.entropy.toFixed(3)} | N=${meta.nodeCount ?? '?'} | tick=${meta.tick ?? '?'} | phase=${phase}` +
        (extra ? ` | ${extra}` : '')
      );
    }

    lines.push('');
    lines.push('### Retrieved Knowledge Nodes (ranked by field activation):');
    lines.push('');

    for (const result of results) {
      const label    = result.node?.label || result.label || result.node?.id || '(unlabelled)';
      const strength = result.node?.strength   ?? 0;
      const prob     = result.probability      ?? 0;
      const rank     = result.rank             ?? '?';
      const B        = result.node?.beliefConfidence;

      const reliability = this._reliabilityLabel(strength, B);
      let entry = `${rank}. **${label}**`;

      if (this.includeStrength) {
        entry += ` [${(strength * 100).toFixed(0)}% — ${reliability}]`;
      }
      if (this.includeProbability) {
        entry += ` (p=${prob.toFixed(3)})`;
      }
      if (this.includeBelief && B !== undefined) {
        entry += ` {belief: ${(B * 100).toFixed(0)}%}`;
      }

      lines.push(entry);

      const conn = result.node?.connectivity;
      if (conn !== undefined && conn > 0.5) {
        lines.push(`   ↳ Highly connected concept`);
      }
    }

    lines.push('');
    lines.push('### Instructions:');
    lines.push('Use the above knowledge nodes as contextual grounding for your response.');
    lines.push('Prioritise high-strength, high-belief nodes. Treat low-strength nodes as uncertain.');
    lines.push('');

    return this._trim(lines.join('\n'));
  }

  buildSummary(results) {
    if (!results || results.length === 0) return 'No active context.';
    return 'Top nodes: ' + results.slice(0, 5).map(r => r.node?.label || r.node?.id || '?').join(', ');
  }

  buildJSON(results, query, meta = {}) {
    return {
      query,
      meta,
      nodes: results.map(r => ({
        rank:             r.rank,
        label:            r.node?.label || r.node?.id,
        strength:         r.node?.strength,
        probability:      r.probability,
        connectivity:     r.node?.connectivity,
        beliefConfidence: r.node?.beliefConfidence,
        utilityScore:     r.node?.utilityScore,
      })),
    };
  }

  // ── PRIVATE ──────────────────────────────────

  _reliabilityLabel(strength, beliefConfidence) {
    const base = strength > 0.75 ? 'highly reliable'
               : strength > 0.5  ? 'reliable'
               : strength > 0.25 ? 'uncertain'
               : 'weak';

    if (beliefConfidence !== undefined && beliefConfidence < 0.3) {
      return `${base}, low confidence`;
    }
    return base;
  }

  _noContextBlock(query) {
    return [
      '## HAKARI Knowledge Field — Active Context',
      `Query: "${query}"`,
      '',
      'No relevant knowledge nodes are currently active in the field.',
      '',
    ].join('\n');
  }

  _trim(text) {
    const charLimit = this.maxTokenEstimate * 4;
    if (text.length <= charLimit) return text;
    return text.slice(0, charLimit) + '\n[...context trimmed]';
  }
}