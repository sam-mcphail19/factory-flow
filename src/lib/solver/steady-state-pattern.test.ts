import { describe, expect, it } from "vitest";
import type { ResourceBalance, ResourceKey, ResourceKind, ThroughputResult } from "@/lib/model/types";
import { makeSteadyStatePattern, steadyStatePatternTargets } from "./steady-state-pattern";

function balance(kind: ResourceKind, id: string, imported: number, product: number): ResourceBalance {
  return {
    key: `${kind}:${id}` as ResourceKey,
    kind,
    resourceId: id,
    displayName: id,
    producedPerSecond: product,
    consumedPerSecond: imported,
    netPerSecond: product - imported,
    deficitPerSecond: imported,
    surplusPerSecond: product,
    importedPerSecond: imported,
    productPerSecond: product,
    byproductPerSecond: 0,
    bufferFillPerSecond: 0,
  };
}

function result(...balances: ResourceBalance[]): ThroughputResult {
  return {
    nodes: {}, storages: {}, edges: {},
    resources: Object.fromEntries(balances.map((entry) => [entry.key, entry])) as ThroughputResult["resources"],
    totalEuT: 0, totalEuPerSecond: 0, bottlenecks: [], externalInputs: [], unconsumedOutputs: [], generatedAt: "",
  };
}

describe("steady-state AE2 pattern preview", () => {
  it("nets returned materials without counting internal flow as a new input", () => {
    const flow = result(
      balance("fluid", "epoxy", 0, 50),
      balance("fluid", "chlorine", 200, 100),
      balance("fluid", "hydrogen", 300, 100),
      balance("fluid", "phenol", 100, 0),
      balance("fluid", "hydrochloric_acid", 0, 50),
      balance("item", "carbon_dust", 0.15, 0),
    );
    expect(steadyStatePatternTargets(flow).map((entry) => entry.resourceId)).toEqual(["epoxy", "hydrochloric_acid"]);
    const pattern = makeSteadyStatePattern(flow, "fluid:epoxy" as ResourceKey, 1000)!;
    expect(pattern.inputs.map((entry) => [entry.resourceId, entry.wholeAmount])).toEqual([
      ["carbon_dust", 3], ["chlorine", 2000], ["hydrogen", 4000], ["phenol", 2000],
    ]);
    expect(pattern.outputs.map((entry) => [entry.resourceId, entry.wholeAmount])).toEqual([
      ["epoxy", 1000], ["hydrochloric_acid", 1000],
    ]);
    expect(pattern.recirculated.map((entry) => [entry.resourceId, entry.wholeAmount])).toEqual([
      ["chlorine", 2000], ["hydrogen", 2000],
    ]);
    expect(pattern.exact).toBe(true);
  });

  it("keeps a fractional batch visibly fractional and flags buffer accumulation", () => {
    const buffer = balance("fluid", "waste", 0, 0);
    buffer.bufferFillPerSecond = 1;
    const flow = result(balance("item", "product", 0, 2), balance("item", "reagent", 1, 0), buffer);
    const pattern = makeSteadyStatePattern(flow, "item:product" as ResourceKey, 1)!;
    expect(pattern.inputs[0]?.wholeAmount).toBeUndefined();
    expect(pattern.warnings.some((warning) => warning.includes("fractional"))).toBe(true);
    expect(pattern.suggestedBatchAmount).toBe(2);
    expect(pattern.warnings.some((warning) => warning.includes("accumulates"))).toBe(true);
    expect(pattern.exact).toBe(false);
  });
});
