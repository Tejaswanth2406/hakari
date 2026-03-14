/**
 * HAKARI v3 — engine/index.js
 * ─────────────────────────────────────────────
 * Barrel export for Block 5 thermodynamic engine layer.
 *
 * Usage:
 *   import { ThermodynamicEngine, PhaseTransition } from './engine/index.js';
 *
 * Dependency order:
 *
 *   EntropyField.js    ← core/math, core/numerics, core/config
 *   Temperature.js     ← core/math, core/numerics, core/config
 *   FreeEnergy.js      ← core/math, core/numerics, core/config
 *   DecayEngine.js     ← core/math, core/constants, core/random, core/numerics
 *   PhaseTransition.js ← core/config, core/numerics
 *   ThermodynamicEngine.js ← all above
 * ─────────────────────────────────────────────
 */

export { EntropyField }         from './BLOCK5/Entropyfeild.js';
export { Temperature }          from './BLOCK5/Temperature.js';
export { FreeEnergy }           from './BLOCK5/Freeenergy.js';
export { DecayEngine }          from '../BLOCK_12/BLOCK_15_UPGRADE/engine/DecayEngine.js';
export { PhaseTransition, TRANSITION } from './BLOCK5/Phasetransition.js';
export { ThermodynamicEngine }  from './Thermodynamicengine.js';



