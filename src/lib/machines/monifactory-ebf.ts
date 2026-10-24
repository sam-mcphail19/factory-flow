import type { MachineConfigControl, Recipe } from "@/lib/model/types";
import { MONIFACTORY_COILS } from "./monifactory-pyrolyse";

export function isMonifactoryEbfRecipe(recipe: Pick<Recipe, "source">): boolean {
  return recipe.source?.datasetVersionId?.startsWith("monifactory-") === true &&
    recipe.source.recipeMap === "gtceu:electric_blast_furnace";
}

export function getMonifactoryEbfTemperature(recipe: Pick<Recipe, "metadata">): number | undefined {
  const temperature = recipe.metadata?.ebfTemperature;
  return typeof temperature === "number" && Number.isSafeInteger(temperature) && temperature >= 0
    ? temperature : undefined;
}

export function monifactoryEbfCoilControl(recipe: Pick<Recipe, "metadata">): MachineConfigControl {
  const temperature = getMonifactoryEbfTemperature(recipe);
  const defaultCoil = MONIFACTORY_COILS.find(([, , heat]) => heat >= (temperature ?? 0));
  return {
    id: "heatingCoil",
    label: "Heating Coil",
    minimumKey: "cupronickel",
    defaultKey: defaultCoil?.[0] ?? "tritanium",
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
}
