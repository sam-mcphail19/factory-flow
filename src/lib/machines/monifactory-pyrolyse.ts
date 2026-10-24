import type { MachineConfigControl, Recipe } from "@/lib/model/types";

export function isMonifactoryPyrolyseRecipe(
  recipe: Pick<Recipe, "source">,
): boolean {
  return recipe.source?.datasetVersionId?.startsWith("monifactory-") === true &&
    recipe.source.recipeMap === "gtceu:pyrolyse_oven";
}

// GTCEu's pyrolyse modifier uses the coil's ordinal: Cupronickel runs at
// 75% speed, then each higher coil uses 2 / (ordinal + 1) duration.
export const MONIFACTORY_COILS = [
  ["cupronickel", "Cupronickel", 1800],
  ["kanthal", "Kanthal", 2700],
  ["nichrome", "Nichrome", 3600],
  ["rtm_alloy", "RTM Alloy", 4500],
  ["hssg", "HSS-G", 5400],
  ["naquadah", "Naquadah", 7200],
  ["trinium", "Trinium", 9001],
  ["tritanium", "Tritanium", 10800],
] as const;

export const MONIFACTORY_PYROLYSE_COIL_CONTROL: MachineConfigControl = {
  id: "heatingCoil",
  label: "Heating Coil",
  minimumKey: "cupronickel",
  defaultKey: "kanthal",
  tiers: MONIFACTORY_COILS.map(([key, label, heat]) => ({
    key,
    label,
    heat,
    resource: {
      kind: "item",
      id: `gtceu:${key}_coil_block`,
      amount: 1,
      displayName: `${label} Coil Block`,
      consumed: false,
    },
  })),
};

export function monifactoryPyrolyseDurationMultiplier(coilKey: string): number {
  const tier = Math.max(0, MONIFACTORY_COILS.findIndex(([key]) => key === coilKey));
  return tier === 0 ? 4 / 3 : 2 / (tier + 1);
}
