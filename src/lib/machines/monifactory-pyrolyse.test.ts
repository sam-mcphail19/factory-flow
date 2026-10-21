import { describe, expect, it } from "vitest";
import { getRecipeMachineHandlers } from "@/lib/model/recipe-rules";
import { getMachineDurationMultiplier } from "@/lib/solver/machine-effects";
import { getOverclockedRecipeStats } from "@/lib/solver/overclock";
import type { Recipe } from "@/lib/model/types";

const logRecipe: Recipe = {
  id: "gtceu:pyrolyse_oven/log_to_wood_tar",
  name: "Charcoal (Pyrolyse Oven)",
  machineType: "pyrolyse_oven",
  minimumTier: "MV",
  durationTicks: 640,
  eut: 64,
  inputs: [
    { kind: "item", id: "factory-flow:gtceu-circuit-configuration-9", amount: 1, consumed: false },
    { kind: "item", id: "oredict:minecraft:logs_that_burn", amount: 16 },
  ],
  outputs: [
    { kind: "item", id: "minecraft:charcoal", amount: 20 },
    { kind: "fluid", id: "gtceu:wood_tar", amount: 1500 },
  ],
  source: { datasetVersionId: "monifactory-normal-0.13.7", recipeMap: "gtceu:pyrolyse_oven" },
};

describe("Monifactory Pyrolyse Oven", () => {
  it("uses the game's multiblock and coil choices", () => {
    expect(getRecipeMachineHandlers(logRecipe)[0]).toMatchObject({
      kind: "multiblock",
      machineType: "Pyrolyse Oven",
      machineConfigControls: [{ id: "heatingCoil", defaultKey: "kanthal" }],
    });
  });

  it("turns the 32-second MV log recipe into a 16-second HV run with Kanthal", () => {
    const node = { machineHandlerId: "pyrolyse_oven", overclockTier: "HV" };
    expect(getOverclockedRecipeStats(logRecipe, node)).toMatchObject({
      overclockSteps: 1,
      durationTicks: 320,
      eut: 256,
    });
    expect(16 * 20 / 320).toBe(1);
    expect(20 * 20 / 320).toBe(1.25);
    expect(1500 * 20 / 320).toBe(93.75);
  });

  it("uses Cupronickel's slower modifier and faster higher coils", () => {
    const node = { machineHandlerId: "pyrolyse_oven", overclockTier: "HV" };
    expect(getOverclockedRecipeStats(logRecipe, { ...node, coilTier: "cupronickel" }).durationTicks).toBe(426);
    expect(getOverclockedRecipeStats(logRecipe, { ...node, coilTier: "nichrome" }).durationTicks).toBe(213);
    expect(getMachineDurationMultiplier({ ...logRecipe, machineType: "Pyrolyse Oven" }, { coilTier: "kanthal" })).toBe(1);
  });
});
