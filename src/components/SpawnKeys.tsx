"use client";

import { Gauge } from "lucide-react";
import type { ReactNode } from "react";
import { useFactoryStore } from "@/store/factory-store";

/**
 * The custom rate card at the top of the items column. Styled
 * quietly like the column's own keys (no plate, uncoloured icons). `leading`
 * is the column's fold-away key, placed at the row's start.
 */
export function SpawnKeys({ leading }: { leading?: ReactNode }) {
  const isReadOnly = useFactoryStore((state) => state.isReadOnly);
  const addCustomRateNode = useFactoryStore((state) => state.addCustomRateNode);
  // The columns' own hide keys' dress (the right column's "Hide" key): no
  // ground of their own, the column's border, a plain lift on hover - keys that act,
  // a step apart from the filter chips under them, which only narrow.
  const key =
    "flex h-7 min-w-0 flex-auto items-center justify-center gap-1 whitespace-nowrap rounded border border-neutral-700 px-1 text-[12px]! leading-3 font-medium text-neutral-300 hover:border-neutral-500 hover:text-neutral-100";
  if (isReadOnly) return <div className="mx-2 mt-2 flex shrink-0 gap-1">{leading}</div>;
  return (
    <div className="mx-2 mt-2 flex shrink-0 gap-1">
      {leading}
      <button
        type="button"
        onClick={addCustomRateNode}
        className={key}
        title="Add custom rate node"
        aria-label="Add custom rate node"
      >
        <Gauge className="h-3 w-3 shrink-0" />
        Custom
      </button>
    </div>
  );
}
