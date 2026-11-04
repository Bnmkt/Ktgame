import { midnightContractInfo, evaluateMidnightDefinition } from "./contracts.js";
export { midnightContractInfo, midnightContractTiers, midnightCatalogFor } from "./contracts.js";
export function midnightContractLabel(id, catalog = midnightContractInfo) { return catalog[id]?.label ?? "Mandat secret"; }
export function midnightContractEvaluation(contract, dice = [], catalog = midnightContractInfo) { return evaluateMidnightDefinition(catalog[contract], dice); }
export function midnightScorePreview(contract, dice = [], catalog = midnightContractInfo) { return midnightContractEvaluation(contract, dice, catalog).points; }
