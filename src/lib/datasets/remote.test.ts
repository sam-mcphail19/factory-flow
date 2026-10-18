import { describe, expect, it } from "vitest";
import { pickDefaultDatasetVersion } from "./remote";
import { datasetPackLabel, datasetVersionLabel } from "./pack";
import type { DatasetManifest } from "./types";

describe("remote dataset selection", () => {
  it("prefers the latest stable dataset over a daily dataset", () => {
    const manifest: DatasetManifest = {
      schemaVersion: 1,
      latestStableVersion: "stable-2.8.4",
      latestDailyVersion: "daily-523",
      versions: [datasetVersion("daily-523", "daily"), datasetVersion("stable-2.8.4", "stable")],
    };

    expect(pickDefaultDatasetVersion(manifest)?.id).toBe("stable-2.8.4");
  });

  it("labels legacy GTNH and pack-aware Monifactory versions", () => {
    const legacy = datasetVersion("stable-2.9", "stable");
    const monifactory = {
      ...datasetVersion("monifactory-normal-1.2", "stable"),
      gtnhVersion: undefined,
      pack: { id: "monifactory", name: "Monifactory", version: "1.2", mode: "Normal" },
    };

    expect(datasetVersionLabel(legacy)).toBe("GTNH stable-2.9 (stable)");
    expect(datasetVersionLabel(monifactory)).toBe("Monifactory 1.2 · Normal (stable)");
    expect(datasetPackLabel(monifactory)).toBe("Monifactory 1.2 · Normal");
  });
});

function datasetVersion(id: string, channel: "stable" | "daily") {
  return {
    id,
    gtnhVersion: id,
    channel,
    publishedAt: "2026-05-20T00:00:00.000Z",
    manifestPath: "/datasets/gtnh/datasets.manifest.json",
    recipeDatasetPath: `/datasets/gtnh/${id}/recipes.json.gz`,
    sourceInfo: {
      sourceId: "recex" as const,
      generatedAt: "2026-05-20T00:00:00.000Z",
    },
  };
}
