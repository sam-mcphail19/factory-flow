import type { DatasetPack, DatasetVersion } from "./types";

export function packForVersion(version: DatasetVersion): DatasetPack {
  return (
    version.pack ?? {
      id: "gtnh",
      name: "GTNH",
      version: version.gtnhVersion ?? "unknown",
    }
  );
}

export function datasetVersionLabel(version: DatasetVersion): string {
  const pack = packForVersion(version);
  return `${pack.name} ${pack.version}${pack.mode ? ` · ${pack.mode}` : ""} (${version.channel})`;
}

export function datasetPackLabel(version: DatasetVersion): string {
  const pack = packForVersion(version);
  return `${pack.name} ${pack.version}${pack.mode ? ` · ${pack.mode}` : ""}`;
}
