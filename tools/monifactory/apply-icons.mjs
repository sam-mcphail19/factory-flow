import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

const [datasetPath, iconFolder] = process.argv.slice(2);
if (!datasetPath || !iconFolder) {
  throw new Error("Usage: apply-icons.mjs <recipes.json.gz> <exported-icon-folder>");
}
const dataset = JSON.parse(gunzipSync(await fs.readFile(datasetPath)));
const manifest = JSON.parse(await fs.readFile(path.join(iconFolder, "manifest.json"), "utf8"));
if (manifest.format !== "factory-flow-icons-v1") throw new Error("Unsupported icon export format");
const versionId = dataset.datasetVersionId;
const targetFolder = path.join(path.dirname(datasetPath), "textures", "icons");
await fs.mkdir(targetFolder, { recursive: true });
let applied = 0;
const atlasNames = new Map();
async function publishedAtlasName(file) {
  if (atlasNames.has(file)) return atlasNames.get(file);
  const bytes = await fs.readFile(path.join(iconFolder, file));
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const published = file.replace(/\.png$/, `-${digest}.png`);
  await fs.writeFile(path.join(targetFolder, published), bytes);
  atlasNames.set(file, published);
  return published;
}
for (const resource of dataset.resources) {
  if (resource.kind !== "item") continue;
  const face = manifest.items[resource.id];
  if (!face || !/^atlas-\d{4}\.png$/.test(face.atlas)) continue;
  if (![face.x, face.y].every((value) => Number.isInteger(value) && value >= 0 && value <= 480)) continue;
  const published = await publishedAtlasName(face.atlas);
  resource.iconAtlas = {
    imagePath: `/datasets/monifactory/${versionId}/textures/icons/${published}`,
    atlasWidth: 512,
    atlasHeight: 512,
    x: face.x,
    y: face.y,
    width: 32,
    height: 32,
  };
  applied += 1;
}
delete dataset.resourceIndex;
await fs.writeFile(datasetPath, gzipSync(`${JSON.stringify(dataset)}\n`, { level: 9 }));
console.log(`Attached ${applied} item icons from ${atlasNames.size} atlases. Rebuild the resource and recipe indexes next.`);
