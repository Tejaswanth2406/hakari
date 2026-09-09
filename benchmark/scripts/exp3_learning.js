import { BenchmarkHarness } from '../harness.js';

const harness = new BenchmarkHarness({ resultsDir: 'benchmark/results' });

async function runExp3() {
  await harness.runExperiment(
    'exp3_learning',
    20, // 20 trials
    10000, 
    (engine) => {
      engine.spawnNodes(500);
      // Ensure MetaOptimizer is active
      if (engine.metaOptimizer) engine.metaOptimizer.enabled = true;
    },
    (engine, t, stats) => {
      if (t % 100 === 0) {
        stats.ticks.push({
          tick: t,
          objective: engine.learningCurve?.currentObjective || 0,
          learningRate: engine.learningCurve?.learningRate || 0,
          regressionDetected: engine.learningCurve?.regressionDetected || false,
          plateauDetected: engine.learningCurve?.plateauDetected || false,
          metaOptStepCount: engine.metaOptimizer?.stepCount || 0
        });
      }

      // Introduce a sharp perturbation at t=4000 to trigger regression
      if (t === 4000) {
        engine.injectEntropy();
        engine.injectEntropy();
        engine.parameterField.current.sigma = 0.5; // Maximize noise
      }
      
      // Return to normal at t=6000 to see convergence again
      if (t === 6000) {
        engine.parameterField.current.sigma = 0.05;
      }
    }
  );
}

runExp3().catch(console.error);
