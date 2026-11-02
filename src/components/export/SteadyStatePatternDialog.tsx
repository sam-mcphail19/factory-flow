"use client";

import { useState } from "react";
import { Repeat2, X } from "lucide-react";
import type { PatternAmount } from "@/lib/solver/steady-state-pattern";
import { makeSteadyStatePattern, steadyStatePatternTargets } from "@/lib/solver/steady-state-pattern";
import type { ResourceKey, ThroughputResult } from "@/lib/model/types";
import { useFactoryStore } from "@/store/factory-store";

export function SteadyStatePatternDialogFromStore({ onClose }: { onClose: () => void }) {
  const result = useFactoryStore((state) => state.lastResult);
  const projectName = useFactoryStore((state) => state.project.name);
  return <SteadyStatePatternDialog result={result} projectName={projectName} onClose={onClose} />;
}

export function SteadyStatePatternDialog({ result, projectName, onClose }: {
  result: ThroughputResult;
  projectName?: string;
  onClose: () => void;
}) {
  const targets = steadyStatePatternTargets(result);
  const namedTarget = targets.find((entry) =>
    entry.displayName?.trim().toLowerCase() === projectName?.trim().toLowerCase(),
  );
  const [targetKey, setTargetKey] = useState<ResourceKey | undefined>((namedTarget ?? targets[0])?.key);
  const [amount, setAmount] = useState(1000);
  const target = targets.find((entry) => entry.key === targetKey);
  const pattern = targetKey ? makeSteadyStatePattern(result, targetKey, amount) : undefined;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-neutral-950/50 p-4"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div role="dialog" aria-label="Steady-state pattern" className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded border border-line-strong bg-surface p-4 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Repeat2 aria-hidden className="h-4 w-4" /> Steady-state pattern</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-fg-subtle hover:bg-surface-raised"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-sm text-fg-muted">Net inputs and outputs for repeated requests. Matching returned materials are counted as recycled.</p>
        {targets.length ? (
          <div className="flex flex-wrap gap-3">
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-fg-muted">Requested output
              <select aria-label="Requested output" value={targetKey} onChange={(event) => {
                const next = targets.find((entry) => entry.key === event.target.value);
                setTargetKey(next?.key);
                setAmount(next?.kind === "fluid" ? 1000 : 1);
              }} className="rounded border border-line-strong bg-surface-sunken px-2 py-1.5 text-sm text-fg">
                {targets.map((entry) => <option key={entry.key} value={entry.key}>{entry.displayName ?? entry.resourceId}</option>)}
              </select>
            </label>
            <label className="flex w-36 flex-col gap-1 text-xs text-fg-muted">Batch output ({target?.kind === "fluid" ? "L" : "items"})
              <input aria-label="Batch output" type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(Number(event.target.value))} className="rounded border border-line-strong bg-surface-sunken px-2 py-1.5 text-sm text-fg" />
            </label>
          </div>
        ) : <p className="text-sm text-fg-muted">Add a product drawer and solve a running flow to see a pattern.</p>}
        {pattern ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <PatternList title="Inputs to request" amounts={pattern.inputs} />
              <PatternList title="Outputs to return" amounts={pattern.outputs} />
            </div>
            {pattern.recirculated.length ? <PatternList title="Returned to supply" amounts={pattern.recirculated} /> : null}
            {pattern.warnings.length ? <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-fg-subtle">
              {pattern.warnings.map((warning) => <p key={warning} className="mb-1 last:mb-0">{warning}</p>)}
              {pattern.suggestedBatchAmount ? <button type="button" onClick={() => setAmount(pattern.suggestedBatchAmount!)} className="mt-2 rounded border border-line-strong bg-surface-raised px-2 py-1 text-xs hover:bg-surface">Use {pattern.suggestedBatchAmount.toLocaleString()} {target?.kind === "fluid" ? "L" : "items"}</button> : null}
            </div> : null}
            <p className="text-xs text-fg-muted">Preview only. This does not encode an AE2 pattern or move materials in game.</p>
          </>
        ) : targets.length ? <p className="text-sm text-fg-muted">Enter a positive whole batch amount.</p> : null}
      </div>
    </div>
  );
}

function PatternList({ title, amounts }: { title: string; amounts: PatternAmount[] }) {
  return <section className="rounded border border-line-strong bg-surface-sunken p-3">
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">{title}</h3>
    {amounts.length ? <ul className="space-y-1 text-sm">
      {amounts.map((entry) => <li key={entry.key} className="flex justify-between gap-3">
        <span>{entry.label}</span>
        <span className="shrink-0 tabular-nums">{entry.wholeAmount?.toLocaleString() ?? entry.amount.toFixed(3)} {entry.kind === "fluid" ? "L" : "items"}</span>
      </li>)}
    </ul> : <p className="text-xs text-fg-muted">None</p>}
  </section>;
}
