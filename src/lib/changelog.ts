/** Release notes shown from the version chip. */
export interface ChangelogAction {
  label: string;
  href: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  headline: string;
  notes: string[];
  warning?: string;
  actions?: ChangelogAction[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.1.0",
    date: "2026-10-18",
    headline: "Monifactory recipes are here",
    notes: [
      "Browse Monifactory 0.13.7 Normal mode recipes and build factory flowcharts.",
      "Item icons come from the game. Some machine recipes have unknown rates.",
      "Machine counts and power calculations are still being adapted for Monifactory.",
    ],
  },
];
