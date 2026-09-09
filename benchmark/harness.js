import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { Hakari } from '../BLOCK_12/BLOCK_15_UPGRADE/Hakari.js';

/**
 * Benchmark Harness for HAKARI
 * Provides headless execution, multi-seed repetition, and profiling.
 */
export class BenchmarkHarness {
  constructor(config = {}) {
    this.resultsDir = config.resultsDir || path.join(process.cwd(), 'benchmark/results');
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  /**
   * Run an experiment multiple times with different seeds.
   */
  async runExperiment(name, numTrials, ticksPerTrial, setupFn, trialFn) {
    console.log(`Starting Experiment: ${name}`);
    console.log(`Trials: ${numTrials}, Ticks/Trial: ${ticksPerTrial}`);
    
    const allResults = [];
    
    for (let trial = 0; trial < numTrials; trial++) {
      const seed = 42 + trial;
      console.log(`\n--- Trial ${trial + 1}/${numTrials} (Seed: ${seed}) ---`);
      
      // Initialize headless Hakari
      const engine = new Hakari({ seed, headless: true, embedder: { mode: 'local' } });
      
      // Monkey-patch update for profiling
      this._instrumentEngine(engine);
      
      if (setupFn) setupFn(engine);
      
      const trialStats = {
        seed,
        ticks: [],
        profiler: { physics: 0, learning: 0, memory: 0, entropy: 0, rendering: 0, total: 0 },
        memoryProfile: []
      };
      
      for (let t = 0; t < ticksPerTrial; t++) {
        // Run tick
        engine.update(16); // 16ms dt
        
        // Execute custom trial logic
        if (trialFn) trialFn(engine, t, trialStats);
        
        // Memory profiling every 100 ticks
        if (t % 100 === 0) {
          const mem = process.memoryUsage();
          trialStats.memoryProfile.push({
            tick: t,
            heapUsedMB: mem.heapUsed / 1024 / 1024,
            nodes: engine.aliveNodes().length,
            snapshots: engine.memoryStore?.all?.()?.length || 0
          });
        }
      }
      
      // Aggregate profiler results for this trial
      Object.keys(engine._profilerTotals).forEach(k => {
        trialStats.profiler[k] = engine._profilerTotals[k];
      });
      
      allResults.push(trialStats);
    }
    
    this._saveResults(name, allResults);
    return allResults;
  }

  _instrumentEngine(engine) {
    engine._profilerTotals = { physics: 0, learning: 0, memory: 0, entropy: 0, rendering: 0, total: 0 };
    
    // Monkey patch subsystems
    const patch = (obj, method, category) => {
      if (!obj || !obj[method]) return;
      const orig = obj[method].bind(obj);
      obj[method] = (...args) => {
        const s = performance.now();
        const res = orig(...args);
        engine._profilerTotals[category] += (performance.now() - s);
        return res;
      };
    };

    patch(engine.entropyField, 'compute', 'entropy');
    patch(engine.entropyLaw, 'enforce', 'entropy');
    
    patch(engine.energyField, 'update', 'physics');
    patch(engine.decayEngine, 'update', 'physics');
    patch(engine.huie, 'update', 'physics');
    
    patch(engine.metaOptimizer, 'tick', 'learning');
    patch(engine.objectiveFunction, 'evaluate', 'learning');
    patch(engine.learningCurve, 'update', 'learning');
    
    patch(engine.memoryStore, 'tick', 'memory');
    patch(engine.temporalIndex, 'ingest', 'memory');
    patch(engine.longTermMemory, 'evaluate', 'memory');
    patch(engine.causalGraph, 'recordCollapse', 'memory');
    
    // Rendering is skipped in headless, but we keep the category
    
    const originalUpdate = engine.update.bind(engine);
    engine.update = (dt) => {
      const pStart = performance.now();
      originalUpdate(dt);
      engine._profilerTotals.total += (performance.now() - pStart);
    };
  }

  _saveResults(name, data) {
    const jsonPath = path.join(this.resultsDir, `${name}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    
    // Also save simple CSV summary
    let csv = 'trial,seed,final_nodes,final_entropy,final_objective,avg_tick_ms\n';
    data.forEach((d, i) => {
      const lastTick = d.ticks[d.ticks.length - 1] || {};
      const avgTick = d.profiler.total / d.ticks.length;
      csv += `${i+1},${d.seed},${lastTick.nodes || 0},${lastTick.entropy || 0},${lastTick.objective || 0},${avgTick.toFixed(3)}\n`;
    });
    
    const csvPath = path.join(this.resultsDir, `${name}_summary.csv`);
    fs.writeFileSync(csvPath, csv);
    
    console.log(`\nSaved results to ${jsonPath} and ${csvPath}`);
  }
}
