import {
  getRecipeMinimumVoltageTier,
  getVoltageTierIndex,
  getVoltageTierMaxEuT,
} from "@/lib/model/tiers";
import type { MachineTier, Recipe } from "@/lib/model/types";

// These GTM recipe maps are served by ordinary electric singleblocks in Monifactory.
// Other maps may be multiblocks or have custom modifiers and need separate profiles.
const STANDARD_SINGLEBLOCK_MAPS = new Set([
  "alloy_smelter",
  "assembler",
  "autoclave",
  "bender",
  "canner",
  "centrifuge",
  "chemical_reactor",
  "compressor",
  "cutter",
  "electrolyzer",
  "extractor",
  "fluid_extractor",
  "fluid_solidifier",
  "forge_hammer",
  "lathe",
  "macerator",
  "mixer",
  "polarizer",
  "sifter",
  "wiremill",
]);

export function getMonifactorySingleblockStats(
  recipe: Pick<Recipe, "source" | "durationTicks" | "eut" | "minimumTier">,
  tier: Exclude<MachineTier, "DEMO">,
): { overclockSteps: number; durationTicks: number; eut: number } | undefined {
  if (
    !recipe.source?.datasetVersionId?.startsWith("monifactory-") ||
    !recipe.source.recipeMap?.startsWith("gtceu:") ||
    !STANDARD_SINGLEBLOCK_MAPS.has(recipe.source.recipeMap.slice(6)) ||
    recipe.eut <= 0 ||
    recipe.durationTicks < 1
  )
    return undefined;

  const recipeTier = getVoltageTierIndex(getRecipeMinimumVoltageTier(recipe));
  const machineTier = getVoltageTierIndex(tier);
  // GTM treats ULV as LV when counting voltage overclocks.
  const available = Math.max(0, machineTier - recipeTier - (recipeTier === 0 ? 1 : 0));
  const maxVoltage = getVoltageTierMaxEuT(tier);
  let duration = recipe.durationTicks;
  let eut = recipe.eut;
  let overclockSteps = 0;
  while (overclockSteps < available && eut * 4 <= maxVoltage && duration / 2 >= 1) {
    duration /= 2;
    eut *= 4;
    overclockSteps += 1;
  }
  return { overclockSteps, durationTicks: Math.max(1, Math.floor(duration)), eut };
}
