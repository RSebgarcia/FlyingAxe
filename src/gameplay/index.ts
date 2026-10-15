// Núcleo jugable de Flying Axe: física del hacha, leña, corte y cascazo, sin render.
export { Axe, AxeState, type AxeContact, type LogContactInfo } from './axe';
export * from './constants';
export { DEFAULT_KNOBS, type Knobs, browserStore, loadKnobs, saveKnobs } from './knobs';
export { buildPrism, fullPoly, halfPoly, type PrismData } from './prism';
export { GameSim, type SimEvents, type SimOptions } from './sim';
export { type Half, type ImpactOutcome, SPECIES, WoodLog } from './woodLog';
export { attachKnobKeys } from './input';
export { GameplayView, type LogMaterials, fallbackLogMaterials, prismGeometry } from './view';
