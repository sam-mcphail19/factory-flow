import { describe, expect, it } from "vitest";
import { attachChemicalReactorHandlers } from "./chemical-reactor-handlers.mjs";

describe("Monifactory chemical reactor handlers", () => {
  it("offers the LCR only for small recipes copied into its map", () => {
    const recipe = (id, map, amount) => ({
      id,
      minimumTier: "MV",
      durationTicks: 80,
      eut: 120,
      inputs: [{ kind: "item", id: "test:input", amount: 1 }],
      outputs: [{ kind: "item", id: "test:output", amount }],
      source: { recipeMap: map },
    });
    const recipes = [
      recipe("small-copy", "gtceu:chemical_reactor", 1),
      recipe("large-copy", "gtceu:large_chemical_reactor", 1),
      recipe("small-only", "gtceu:chemical_reactor", 2),
    ];
    expect(attachChemicalReactorHandlers(recipes)).toBe(1);
    expect(recipes[0].machineHandlers?.map((handler) => handler.label)).toEqual([
      "Chemical Reactor",
      "Large Chemical Reactor",
    ]);
    expect(recipes[1].machineHandlers?.map((handler) => handler.label)).toEqual([
      "Large Chemical Reactor",
    ]);
    expect(recipes[2].machineHandlers).toBeUndefined();
  });
});
