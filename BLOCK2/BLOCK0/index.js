/**
 * HAKARI v3 — ecology/index.js
 * ─────────────────────────────────────────────
 * Barrel export for Block 0 ecological layer.
 *
 * Dependency order:
 *
 *   CompetitionField.js ← core/math, core/numerics, core/config
 *   ResourceField.js    ← core/math, core/numerics, core/config
 *   EcologyEngine.js    ← CompetitionField, ResourceField
 * ─────────────────────────────────────────────
 */

export { CompetitionField } from './Competitionfield.js';
export { ResourceField }    from './Resourcefield.js';
export { EcologyEngine }    from './Ecologyengine.js';