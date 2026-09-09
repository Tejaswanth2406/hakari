import { BenchmarkHarness } from '../harness.js';

const harness = new BenchmarkHarness({ resultsDir: 'benchmark/results' });

async function runExp1() {
  await harness.runExperiment(
    'exp1_perturbation',
    20, // 20 trials for statistical rigor
    10000, // 10,000 ticks
    (engine) => {
      // Setup: ensure graph is connected and healthy
      engine.spawnNodes(500);
      engine.reinforceAll(); // Boost initial connectivity
    },
    (engine, t, stats) => {
      // Every 100 ticks, record metrics
      if (t % 100 === 0) {
        const alive = engine.aliveNodes();
        const avgStrength = alive.length > 0 ? alive.reduce((s, n) => s + n.strength, 0) / alive.length : 0;
        
        stats.ticks.push({
          tick: t,
          nodes: alive.length,
          entropy: engine.entropyField?.S || 0,
          objective: engine.objectiveFunction?.evaluate({
             information: engine.informationFlow?.systemInformation || 0,
             entropy: engine.entropyField?.normalized || 0,
             collapseRate: engine.collapseLog?.recentRate() || 0
          }) || 0,
          avgStrength: avgStrength,
          ar1: engine.diagnostics?._ar1 || 0, // Assuming diagnostics tracks AR1
          variance: engine.diagnostics?._variance || 0
        });
      }

      // Progressive Perturbation
      // After tick 2000, start injecting entropy and reducing connectivity
      if (t > 2000 && t % 500 === 0) {
        engine.injectEntropy(); // Force entropy injection
        // Simulate interaction strength reduction
        engine.parameterField.current.beta = Math.max(0.1, engine.parameterField.current.beta - 0.05);
      }
    }
  );
}

runExp1().catch(console.error);
