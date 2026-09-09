import { BenchmarkHarness } from '../harness.js';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

const harness = new BenchmarkHarness({ resultsDir: 'benchmark/results' });

async function runAblation() {
  const numTrials = 10;
  const ticks = 5000;
  const configs = [
    { name: 'Full_System', setup: (e) => {} },
    { name: 'Physics_Only', setup: (e) => { 
        e.entropyField.compute = () => 0; // Disable information layer
        if(e.metaOptimizer) e.metaOptimizer.enabled = false; // Disable learning layer
    }},
    { name: 'Physics_Info_NoLearning', setup: (e) => {
        if(e.metaOptimizer) e.metaOptimizer.enabled = false;
    }},
    { name: 'Physics_Learning_NoInfo', setup: (e) => {
        e.entropyField.compute = () => 0;
    }}
  ];

  const results = {};

  for (const conf of configs) {
    console.log(`Running configuration: ${conf.name}`);
    const res = await harness.runExperiment(
      `ablation_${conf.name}`,
      numTrials,
      ticks,
      (engine) => {
        engine.spawnNodes(300);
        conf.setup(engine);
      },
      (engine, t, stats) => {
        if (t % 100 === 0) {
          stats.ticks.push({
            tick: t,
            nodes: engine.aliveNodes().length,
            objective: engine.objectiveFunction?.evaluate({
               information: engine.informationFlow?.systemInformation || 0,
               entropy: engine.entropyField?.normalized || 0,
               collapseRate: engine.collapseLog?.recentRate() || 0
            }) || 0,
            avgTickMs: stats.profiler.total / Math.max(1, t)
          });
        }
      }
    );
    results[conf.name] = res;
  }
}

runAblation().catch(console.error);
