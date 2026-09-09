import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { Hakari } from '../../BLOCK_12/BLOCK_15_UPGRADE/Hakari.js';

const resultsDir = path.join(process.cwd(), 'benchmark/results');
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

// A rudimentary baseline tick scheduler for a JS graph
class BaselineGraphSim {
  constructor(nodeCount) {
    this.nodes = Array.from({ length: nodeCount }, (_, i) => ({ id: i, strength: Math.random() }));
    this.tickCount = 0;
  }
  update(dt) {
    this.tickCount++;
    for (let i = 0; i < this.nodes.length; i++) {
      this.nodes[i].strength *= 0.999; // Simple exponential decay
    }
  }
}

async function runBaselineComparison() {
  const nodeCounts = [1000, 5000, 10000];
  const ticksToRun = 100;
  const results = [];

  console.log(`Starting Baseline Comparison (HAKARI vs Simple Graph Sim)`);

  for (const n of nodeCounts) {
    console.log(`\nTesting ${n} nodes...`);
    
    // Test Baseline
    const baseSim = new BaselineGraphSim(n);
    const bStart = performance.now();
    for (let t = 0; t < ticksToRun; t++) baseSim.update(16);
    const bEnd = performance.now();
    const baseAvg = (bEnd - bStart) / ticksToRun;

    // Test Hakari
    const hakariSim = new Hakari({ seed: 42, headless: true, embedder: { mode: 'local' } });
    hakariSim.spawnNodes(n);
    const hStart = performance.now();
    for (let t = 0; t < ticksToRun; t++) hakariSim.update(16);
    const hEnd = performance.now();
    const hakariAvg = (hEnd - hStart) / ticksToRun;

    console.log(` Baseline Avg Tick: ${baseAvg.toFixed(3)}ms`);
    console.log(` Hakari Avg Tick:   ${hakariAvg.toFixed(3)}ms`);
    console.log(` Overhead factor:   ${(hakariAvg / Math.max(0.001, baseAvg)).toFixed(1)}x`);

    results.push({
      nodes: n,
      baselineTickMs: baseAvg,
      hakariTickMs: hakariAvg,
      overheadFactor: hakariAvg / Math.max(0.001, baseAvg)
    });
  }

  const jsonPath = path.join(resultsDir, 'baseline_comparison.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\nSaved baseline comparison results.`);
}

runBaselineComparison().catch(console.error);
