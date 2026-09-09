import { BenchmarkHarness } from '../harness.js';

const harness = new BenchmarkHarness({ resultsDir: 'benchmark/results' });

async function runExp2() {
  await harness.runExperiment(
    'exp2_information',
    20, // 20 trials
    10000, 
    (engine) => {
      engine.spawnNodes(500);
    },
    (engine, t, stats) => {
      // Continuous monitoring of entropy and structural reorganization
      if (t % 100 === 0) {
        const alive = engine.aliveNodes();
        stats.ticks.push({
          tick: t,
          entropy: engine.entropyField?.S || 0,
          entropyGradient: engine.entropyField?.S_delta || 0,
          topologyChanges: engine.causalGraph?._events?.filter(e => e.type === 'edge_added' || e.type === 'edge_removed').length || 0, // Mock metric or actual if tracked
          structuralHealth: alive.length > 0 ? alive.reduce((s, n) => s + n.strength, 0) / alive.length : 0,
          phase: engine.phaseDetector?.phase || 'STABLE'
        });
      }

      // Simulate varying interaction conditions continuously
      if (t % 1000 === 0) {
        engine.parameterField.current.alpha += (Math.random() * 0.2 - 0.1);
        engine.parameterField.current.gamma += (Math.random() * 0.2 - 0.1);
      }
    }
  );
}

runExp2().catch(console.error);
