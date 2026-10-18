"use client";

import { Compass, Library } from "lucide-react";
import { leaveLibrary, openLibrary } from "@/lib/library/library-tab";
import { openWelcomeTab } from "@/lib/welcome/welcome-tab";

/** Local navigation shared by the desktop header and compact menu. */
export function MenuLinks({ onAction }: { onAction?: () => void }) {
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => {
          leaveLibrary();
          openWelcomeTab();
          onAction?.();
        }}
        className="flex h-10 items-center gap-2.5 rounded px-2 text-left text-sm text-fg-subtle hover:bg-surface-sunken"
      >
        <Compass className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">Welcome</span>
      </button>
      <button
        type="button"
        onClick={() => {
          openLibrary();
          onAction?.();
        }}
        className="flex h-10 items-center gap-2.5 rounded px-2 text-left text-sm text-fg-subtle hover:bg-surface-sunken"
      >
        <Library className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">Library</span>
      </button>
    </div>
  );
}

export function WelcomeButton() {
  return (
    <button
      type="button"
      onClick={() => {
        leaveLibrary();
        openWelcomeTab();
      }}
      title="Welcome"
      aria-label="Open welcome"
      className="inline-flex h-5 items-center gap-1 rounded px-1.5 text-fg-muted hover:bg-surface-raised hover:text-fg"
    >
      <Compass className="h-3.5 w-3.5" aria-hidden />
      Welcome
    </button>
  );
}
