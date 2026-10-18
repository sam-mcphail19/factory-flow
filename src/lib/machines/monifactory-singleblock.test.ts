import { describe, expect, it } from "vitest";
import { getMonifactorySingleblockStats } from "./monifactory-singleblock";
import { getOverclockedRecipeStats } from "@/lib/solver/overclock";
import type { Recipe } from "@/lib/model/types";

const recipe = {
  source: { datasetVersionId: "monifactory-normal-0.13.7", recipeMap: "gtceu:macerator" },
  minimumTier: "LV" as const,
  durationTicks: 7,
  eut: 30,
};

describe("Monifactory GTM singleblock overclocks", () => {
  it("uses perfect LCR overclocks for chemical recipes", () => {
    const chemical: Recipe = {
      id: "gtceu:chemical_reactor/example",
      name: "Example chemical recipe",
      machineType: "chemical_reactor",
      source: { datasetVersionId: "monifactory-normal-0.13.7", recipeMap: "gtceu:chemical_reactor" },
      minimumTier: "MV",
      durationTicks: 128,
      eut: 120,
      inputs: [],
      outputs: [],
      machineHandlers: [{ id: "large-chemical-reactor", label: "Large Chemical Reactor", machineType: "Large Chemical Reactor", minimumTier: "MV", kind: "multiblock", perfectOverclock: true }],
    };
    const small = getOverclockedRecipeStats(chemical, { overclockTier: "EV", machineHandlerId: "chemical-reactor" });
    const large = getOverclockedRecipeStats(chemical, { overclockTier: "EV", machineHandlerId: "large-chemical-reactor" });
    expect(small).toMatchObject({ overclockSteps: 2, durationTicks: 32, eut: 1920 });
    expect(large).toMatchObject({ overclockSteps: 2, perfectOverclockSteps: 2, durationTicks: 8, eut: 1920 });
  });

  it("halves time and quadruples EU/t without crossing the one tick floor", () => {
    expect(getMonifactorySingleblockStats(recipe, "LV")).toEqual({
      overclockSteps: 0,
      durationTicks: 7,
      eut: 30,
    });
    expect(getMonifactorySingleblockStats(recipe, "HV")).toEqual({
      overclockSteps: 2,
      durationTicks: 1,
      eut: 480,
    });
    expect(getMonifactorySingleblockStats(recipe, "EV")).toEqual({
      overclockSteps: 2,
      durationTicks: 1,
      eut: 480,
    });
  });

  it("does not award a free overclock to an ULV recipe at LV", () => {
    expect(
      getMonifactorySingleblockStats({ ...recipe, minimumTier: "ULV", eut: 8 }, "LV")
        ?.overclockSteps,
    ).toBe(0);
  });

  it("leaves other packs and unverified GTM maps to their own profiles", () => {
    expect(
      getMonifactorySingleblockStats(
        { ...recipe, source: { ...recipe.source, datasetVersionId: "gtnh-2.9" } },
        "HV",
      ),
    ).toBeUndefined();
    expect(
      getMonifactorySingleblockStats(
        { ...recipe, source: { ...recipe.source, recipeMap: "gtceu:electric_blast_furnace" } },
        "HV",
      ),
    ).toBeUndefined();
  });

  it("uses the profile through the planner's rate calculation", () => {
    const fullRecipe: Recipe = {
      ...recipe,
      id: "test:macerate",
      name: "Macerate",
      machineType: "macerator",
      inputs: [],
      outputs: [],
    };
    expect(getOverclockedRecipeStats(fullRecipe, { overclockTier: "EV", machineHandlerId: "macerator" })).toMatchObject({
      overclockSteps: 2,
      durationTicks: 1,
      eut: 480,
    });
  });
});
