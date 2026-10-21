import type { MachineConfigControl, Recipe } from "@/lib/model/types";

export function isMonifactoryPyrolyseRecipe(
  recipe: Pick<Recipe, "source">,
): boolean {
  return recipe.source?.datasetVersionId?.startsWith("monifactory-") === true &&
    recipe.source.recipeMap === "gtceu:pyrolyse_oven";
}

// GTCEu's pyrolyse modifier uses the coil's ordinal: Cupronickel runs at
// 75% speed, then each higher coil uses 2 / (ordinal + 1) duration.
const COILS = [
  ["cupronickel", "Cupronickel"],
  ["kanthal", "Kanthal"],
  ["nichrome", "Nichrome"],
  ["rtm_alloy", "RTM Alloy"],
  ["hssg", "HSS-G"],
  ["naquadah", "Naquadah"],
  ["trinium", "Trinium"],
  ["tritanium", "Tritanium"],
] as const;

export const MONIFACTORY_PYROLYSE_COIL_CONTROL: MachineConfigControl = {
  id: "heatingCoil",
  label: "Heating Coil",
  minimumKey: "cupronickel",
  defaultKey: "kanthal",
  tiers: COILS.map(([key, label]) => ({
    key,
    label,
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
  const tier = Math.max(0, COILS.findIndex(([key]) => key === coilKey));
  return tier === 0 ? 4 / 3 : 2 / (tier + 1);
}
