import fs from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const [datasetPath, requestPath] = process.argv.slice(2);
if (!datasetPath || !requestPath) {
  throw new Error("Usage: create-icon-request.mjs <recipes.json.gz> <request.json>");
}
const dataset = JSON.parse(gunzipSync(await fs.readFile(datasetPath)));
const items = [...new Set(
  dataset.resources
    .filter((resource) => resource.kind === "item")
    .map((resource) => resource.id)
    .filter((id) => /^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(id) && !id.startsWith("factory-flow:")),
)].sort();
await fs.writeFile(requestPath, JSON.stringify({ format: "factory-flow-icon-request-v1", items }));
console.log(`Wrote ${items.length} concrete item IDs to ${requestPath}`);
