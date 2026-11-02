import type { ResourceBalance, ResourceKey, ResourceKind, ThroughputResult } from "@/lib/model/types";
import { isVirtualChoiceResource } from "@/lib/model/resources";

const EPSILON = 1e-6;
const INTEGER_TOLERANCE = 1e-4;

export interface PatternAmount {
  key: ResourceKey;
  kind: ResourceKind;
  resourceId: string;
  label: string;
  amount: number;
  wholeAmount?: number;
}

export interface SteadyStatePattern {
  target: PatternAmount;
  inputs: PatternAmount[];
  outputs: PatternAmount[];
  recirculated: PatternAmount[];
  warnings: string[];
  exact: boolean;
  suggestedBatchAmount?: number;
}

export function steadyStatePatternTargets(result: ThroughputResult): ResourceBalance[] {
  return Object.values(result.resources)
    .filter((balance) => balance.productPerSecond - balance.importedPerSecond > EPSILON)
    .sort((a, b) => (a.displayName ?? a.resourceId).localeCompare(b.displayName ?? b.resourceId));
}

/** Boundary rates form a steady-state batch. Returned material must reach the
 * same supply system as the matching input; internal wires are already net zero. */
export function makeSteadyStatePattern(
  result: ThroughputResult,
  targetKey: ResourceKey,
  targetAmount: number,
): SteadyStatePattern | undefined {
  const target = result.resources[targetKey];
  const targetRate = target?.productPerSecond - target?.importedPerSecond;
  if (!target || !(targetRate > EPSILON) || !Number.isSafeInteger(targetAmount) || targetAmount < 1) {
    return undefined;
  }
  const scale = targetAmount / targetRate;
  const inputs: PatternAmount[] = [];
  const outputs: PatternAmount[] = [];
  const recirculated: PatternAmount[] = [];
  const warnings: string[] = [];
  for (const balance of Object.values(result.resources)) {
    const imported = balance.importedPerSecond;
    const shipped = balance.productPerSecond + balance.byproductPerSecond;
    const makeAmount = (rate: number): PatternAmount => {
      const amount = rate * scale;
      const rounded = Math.round(amount);
      return {
        key: balance.key,
        kind: balance.kind,
        resourceId: balance.resourceId,
        label: balance.displayName ?? balance.resourceId,
        amount,
        ...(Math.abs(amount - rounded) <= INTEGER_TOLERANCE ? { wholeAmount: rounded } : {}),
      };
    };
    if (imported - shipped > EPSILON) inputs.push(makeAmount(imported - shipped));
    if (shipped - imported > EPSILON) outputs.push(makeAmount(shipped - imported));
    if (Math.min(imported, shipped) > EPSILON) recirculated.push(makeAmount(Math.min(imported, shipped)));
    if (balance.bufferFillPerSecond > EPSILON) {
      warnings.push(`${balance.displayName ?? balance.resourceId} accumulates in a buffer. Add an output or disposal path for continuous operation.`);
    }
  }
  for (const input of inputs) {
    if (isVirtualChoiceResource({ id: input.resourceId, displayName: input.label })) {
      warnings.push(`Choose a concrete item for ${input.label} before encoding an AE2 pattern.`);
    }
  }
  const amounts = [...inputs, ...outputs, ...recirculated];
  const suggestedMultiplier = amounts.some((entry) => entry.wholeAmount === undefined)
    ? Array.from({ length: 127 }, (_, index) => index + 2).find((multiplier) =>
      targetAmount * multiplier <= 1_000_000_000 && amounts.every((entry) =>
        Math.abs(entry.amount * multiplier - Math.round(entry.amount * multiplier)) <= INTEGER_TOLERANCE,
      ),
    ) : undefined;
  if (amounts.some((entry) => entry.wholeAmount === undefined)) {
    warnings.push("Some amounts are fractional. Increase the requested output batch to get whole item and mB counts.");
  }
  if (result.stale || result.held) warnings.push("The flow result is out of date. Solve the design again before using this ratio.");
  if (recirculated.length) warnings.push("Route returned materials back to the matching inputs and prime those buffers before requesting the first batch.");
  const sort = (a: PatternAmount, b: PatternAmount) => a.label.localeCompare(b.label);
  inputs.sort(sort);
  outputs.sort(sort);
  recirculated.sort(sort);
  return {
    target: makeTargetAmount(target, targetAmount),
    inputs,
    outputs,
    recirculated,
    warnings,
    ...(suggestedMultiplier ? { suggestedBatchAmount: targetAmount * suggestedMultiplier } : {}),
    exact: amounts.every((entry) => entry.wholeAmount !== undefined) &&
      !warnings.some((warning) => warning.includes("accumulates") || warning.includes("out of date")),
  };
}

function makeTargetAmount(balance: ResourceBalance, amount: number): PatternAmount {
  return {
    key: balance.key,
    kind: balance.kind,
    resourceId: balance.resourceId,
    label: balance.displayName ?? balance.resourceId,
    amount,
    wholeAmount: amount,
  };
}
