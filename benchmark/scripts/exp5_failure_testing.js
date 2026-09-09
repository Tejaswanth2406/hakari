import { BenchmarkHarness } from '../harness.js';

const harness = new BenchmarkHarness({ resultsDir: 'benchmark/results' });

async function runExp5() {
  await harness.runExperiment(
    'exp5_failure_testing',
    5, // 5 edge cases
    1000, 
    (engine) => {
      // Don't spawn nodes here, trialFn will handle setups
    },
    (engine, t, stats) => {
      const trialIdx = stats.seed - 42; // seed starts at 42

      if (t === 10) {
        if (trialIdx === 0) {
          // Case 1: Empty graph
          engine.reset(); 
        } else if (trialIdx === 1) {
          // Case 2: Zero entropy bounds / frozen physics
          engine.spawnNodes(100);
          engine.parameterField.current.sigma = 0;
          engine.parameterField.current.alpha = 0;
        } else if (trialIdx === 2) {
          // Case 3: Forced NaN values
          engine.spawnNodes(50);
          engine.aliveNodes()[0].strength = NaN; 
        } else if (trialIdx === 3) {
          // Case 4: Extreme energy overload
          engine.spawnNodes(200);
          engine.parameterField.current.beta = 9999; 
        } else if (trialIdx === 4) {
          // Case 5: Instant collapse of all nodes
          engine.spawnNodes(300);
          engine.aliveNodes().forEach(n => n.alive = false);
        }
      }

      // Record stability
      if (t % 100 === 0) {
        stats.ticks.push({
          tick: t,
          nodes: engine.aliveNodes().length,
          entropy: engine.entropyField?.S || 0,
          regime: engine.stabilityAnalyzer?.regime || 'UNKNOWN',
          hasNaN: isNaN(engine.entropyField?.S || 0)
        });
      }
    }
  );
}

runExp5().catch(console.error);
