import { describe, expect, it } from "vitest";
import { applyMachineHandlerToRecipe, getRecipeCoilTierControl } from "@/lib/model/recipe-rules";
import type { Recipe } from "@/lib/model/types";
import { getNodePowerReport } from "./power-report";
import { getOverclockedRecipeStats } from "./overclock";

const recipe: Recipe = {
  id: "gtceu:electric_blast_furnace/blast_energetic_alloy",
  name: "Energetic Alloy",
  kind: "gregtech_machine",
  category: "gtceu:electric_blast_furnace",
  machineType: "electric_blast_furnace",
  minimumTier: "MV",
  durationTicks: 400,
  eut: 120,
  inputs: [{ kind: "item", id: "gtceu:redstone", amount: 1, displayName: "Redstone" }],
  outputs: [{ kind: "item", id: "gtceu:energetic_alloy", amount: 1, displayName: "Energetic Alloy" }],
  metadata: { ebfTemperature: 1250 },
  source: { datasetVersionId: "monifactory-normal-0.13.7", recipeMap: "gtceu:electric_blast_furnace" },
};

describe("Monifactory Electric Blast Furnace", () => {
  it("offers the GTCEu coils and defaults to the first coil that reaches recipe heat", () => {
    const effective = applyMachineHandlerToRecipe(recipe, {});
    const control = getRecipeCoilTierControl(effective, {});
    expect(effective.machineProfile?.kind).toBe("multiblock");
    expect(control?.tiers.map((tier) => tier.heat)).toEqual([
      1800, 2700, 3600, 4500, 5400, 7200, 9001, 10800,
    ]);
    expect(control?.current.key).toBe("cupronickel");

    const hotter = applyMachineHandlerToRecipe({ ...recipe, metadata: { ebfTemperature: 2500 } }, {});
    expect(getRecipeCoilTierControl(hotter, {})?.current.key).toBe("kanthal");
  });

  it("blocks a coil below the recipe temperature and accepts voltage heat", () => {
    const hotter = { ...recipe, metadata: { ebfTemperature: 1900 } };
    const cold = getNodePowerReport(hotter, { overclockTier: "MV", coilTier: "cupronickel" });
    expect(cold.state).toBe("over-tier");
    expect(cold.recipeGateReason).toContain("1900 K");
    const warm = getNodePowerReport(hotter, { overclockTier: "HV", coilTier: "cupronickel" });
    expect(warm.state).toBe("ok");
  });

  it("applies the heat discount and perfect heat overclocks", () => {
    const cool = getOverclockedRecipeStats(recipe, { overclockTier: "EV", coilTier: "cupronickel" });
    const hot = getOverclockedRecipeStats(recipe, { overclockTier: "EV", coilTier: "nichrome" });
    expect(cool.durationTicks).toBe(100);
    expect(cool.perfectOverclockSteps).toBe(0);
    expect(hot.durationTicks).toBe(50);
    expect(hot.perfectOverclockSteps).toBe(1);
    expect(hot.eut).toBeCloseTo(120 * 0.95 ** 2 * 16, 6);
    const lowTemperature = { ...recipe, metadata: { ebfTemperature: 307 } };
    expect(getOverclockedRecipeStats(lowTemperature, {
      overclockTier: "MV", coilTier: "cupronickel",
    }).eut).toBe(120);
  });
});
