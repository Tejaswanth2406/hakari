import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { Hakari } from '../../BLOCK_12/BLOCK_15_UPGRADE/Hakari.js';

const resultsDir = path.join(process.cwd(), 'benchmark/results');
if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

async function runExp4() {
  const nodeCounts = [100, 500, 1000, 5000, 10000, 25000]; // Limiting to 25k for safety in standard Node
  const trials = 3; // Fewer trials per node count for speed
  const ticksToRun = 100; // Measure average tick time over 100 ticks
  
  const results = [];

  console.log(`Starting Experiment 4: Scalability`);

  for (const n of nodeCounts) {
    console.log(`\nTesting ${n} nodes...`);
    for (let trial = 0; trial < trials; trial++) {
      const engine = new Hakari({ seed: 42 + trial, headless: true, embedder: { mode: 'local' } });
      engine.spawnNodes(n); // Custom spawn logic to bypass UI limits if needed
      // Force the array length if spawnNodes limits it
      while (engine.aliveNodes().length < n && engine.aliveNodes().length < 50000) {
          engine.nodeFactory.batch(1000, engine.aliveNodes().length).forEach(node => engine._registerNode(node));
      }

      // Warmup
      engine.update(16);

      const startMem = process.memoryUsage();
      const startTime = performance.now();
      
      for (let t = 0; t < ticksToRun; t++) {
        engine.update(16);
      }
      
      const endTime = performance.now();
      const endMem = process.memoryUsage();
      
      const avgTickMs = (endTime - startTime) / ticksToRun;
      const memDeltaMB = (endMem.heapUsed - startMem.heapUsed) / 1024 / 1024;

      console.log(` Trial ${trial + 1} | Avg Tick: ${avgTickMs.toFixed(2)}ms | Mem Delta: ${memDeltaMB.toFixed(2)}MB`);
      
      results.push({
        nodes: n,
        trial: trial + 1,
        avgTickMs,
        memDeltaMB,
        finalHeapMB: endMem.heapUsed / 1024 / 1024
      });
    }
  }

  const jsonPath = path.join(resultsDir, 'exp4_scalability.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

  let csv = 'nodes,trial,avg_tick_ms,mem_delta_mb,final_heap_mb\n';
  results.forEach(r => {
    csv += `${r.nodes},${r.trial},${r.avgTickMs.toFixed(3)},${r.memDeltaMB.toFixed(3)},${r.finalHeapMB.toFixed(3)}\n`;
  });
  fs.writeFileSync(path.join(resultsDir, 'exp4_scalability.csv'), csv);
  console.log(`\nSaved scalability results.`);
}

runExp4().catch(console.error);
