import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";

const [datasetPath, manifestPath] = process.argv.slice(2);
if (!datasetPath?.endsWith("recipes.json.gz") || !manifestPath) {
  throw new Error("Usage: build-manifest.mjs <recipes.json.gz> <datasets.manifest.json>");
}

const dataset = JSON.parse(gunzipSync(await fs.readFile(datasetPath)).toString("utf8"));
if (!dataset.pack || !dataset.datasetVersionId) {
  throw new Error("Pack-aware dataset metadata is required.");
}

const publicRoot = path.resolve("public");
function publicUrl(filePath) {
  const relative = path.relative(publicRoot, path.resolve(filePath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Dataset file is outside public/: ${filePath}`);
  }
  return `/${relative.split(path.sep).join("/")}`;
}

let manifest = { schemaVersion: 1, versions: [] };
try {
  manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const datasetDir = path.dirname(datasetPath);
const version = {
  id: dataset.datasetVersionId,
  pack: dataset.pack,
  channel: "stable",
  publishedAt: dataset.generatedAt,
  manifestPath: publicUrl(manifestPath),
  recipeDatasetPath: publicUrl(datasetPath),
  resourceIndexPath: publicUrl(path.join(datasetDir, "resource-index.json.gz")),
  recipeIndexPath: publicUrl(path.join(datasetDir, "recipe-index.json.gz")),
  recipeLookupIndexPath: publicUrl(path.join(datasetDir, "recipe-lookup-index.json.gz")),
  sourceInfo: dataset.sourceInfo,
};
manifest.versions = [...manifest.versions.filter((entry) => entry.id !== version.id), version];
manifest.latestStableVersion = version.id;
await fs.mkdir(path.dirname(manifestPath), { recursive: true });
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${manifest.versions.length} dataset version(s) to ${manifestPath}`);
