/**
 * HAKARI v3 — physics/index.js
 * ─────────────────────────────────────────────
 * Barrel export for Block 2 physics layer.
 *
 * Usage:
 *   import { PhysicsEngine, BeliefField } from './physics/index.js';
 *
 * Module dependency order:
 *
 *   EntropyField        ← core/math, core/numerics
 *   EntropyLaw          ← core/math, core/numerics
 *   EnergyField         ← core/math, core/numerics
 *   InformationFlow     ← core/math, core/numerics
 *   BeliefField         ← core/probability, core/information
 *   InformationForce    ← core/information, core/numerics
 *   PhysicsEngine       ← all above
 * ─────────────────────────────────────────────
 */

export { EntropyField }     from './BLOCK5/Entropyfeild.js';
export { InformationFlow }  from '../BLOCK_12/BLOCK_15_UPGRADE/physics/InformationFlow.js';
export { EnergyField }      from './BLOCK2/Energyfeild.js';
export { EntropyLaw }       from './BLOCK5/Thermodynamicsengiene.js';
export { BeliefField }      from './Belieffield.js';
export { InformationForce } from './BLOCK2/Informationforce.js';
export { PhysicsEngine }    from './Physicsengine.js';



