import fs from "node:fs/promises";
import path from "node:path";

const [manifestPath, outputPath] = process.argv.slice(2);
if (!manifestPath || !outputPath) {
  throw new Error("Usage: create-fluid-tag-probe.mjs <raw-manifest.json> <output.js>");
}

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
if (manifest.format !== "factory-flow-raw-v2") {
  throw new Error("Expected a full recipe export.");
}

const usedFluidTags = new Set();
function collect(value, fluidContext = false) {
  if (!value || typeof value !== "object") return;
  if (fluidContext && typeof value.tag === "string") usedFluidTags.add(value.tag);
  for (const [key, child] of Object.entries(value)) {
    collect(child, fluidContext || key.toLowerCase().includes("fluid"));
  }
}

for (const file of manifest.files) {
  const source = JSON.parse(
    await fs.readFile(path.join(path.dirname(manifestPath), file.file), "utf8"),
  );
  for (const entry of source.recipes) collect(entry.json);
}

const tags = [...usedFluidTags].sort();
const script = `// priority: -10000
// Temporary read-only probe for fluid tags referenced by the exported recipes.
var factoryFlowFluidTags = ${JSON.stringify(tags)};
ServerEvents.tags("fluid", (event) => {
  var resolved = {};
  var failed = [];
  factoryFlowFluidTags.forEach((tag) => {
    try {
      var members = [];
      event.get(tag).getObjectIds().forEach((fluidId) => {
        var id = String(fluidId);
        if (members.indexOf(id) < 0) members.push(id);
      });
      resolved[tag] = members.sort();
    } catch (error) {
      failed.push({ tag: tag, error: String(error) });
    }
  });
  JsonIO.write("kubejs/config/factory-flow-fluid-tags.json", {
    format: "factory-flow-fluid-tags-v1",
    tags: resolved,
    failed: failed,
  });
  console.info("[Factory Flow fluid tags] wrote " + Object.keys(resolved).length +
    "/" + factoryFlowFluidTags.length + " tags; failed " + failed.length);
});
`;
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, script);
console.log(`Wrote ${tags.length} fluid tags to ${outputPath}`);
