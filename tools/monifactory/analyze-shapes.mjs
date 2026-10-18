import fs from "node:fs/promises";
import path from "node:path";

const manifestPath = process.argv[2];
if (!manifestPath) throw new Error("Usage: analyze-shapes.mjs <raw-manifest.json>");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const counts = new Map();
const examples = new Map();
const add = (key) => counts.set(key, (counts.get(key) ?? 0) + 1);
const note = (key, recipeId, slot) => {
  add(key);
  if (!examples.has(key)) examples.set(key, { recipeId, slot });
};

for (const file of manifest.files) {
  const payload = JSON.parse(
    await fs.readFile(path.join(path.dirname(manifestPath), file.file), "utf8"),
  );
  for (const { id, json } of payload.recipes) {
    if (!Number.isInteger(json.duration) || json.duration <= 0) {
      add("no duration: " + file.type);
      continue;
    }
    for (const [sideName, side] of [
      ["inputs", json.inputs],
      ["outputs", json.outputs],
    ]) {
      for (const [kind, slots] of Object.entries(side ?? {})) {
        if (kind !== "item" && kind !== "fluid") {
          add(`${sideName}: other capability ${kind}`);
          continue;
        }
        for (const slot of slots) {
          const content = slot.content;
          if (!content) note(`${sideName}.${kind}: no content`, id, slot);
          else if (content.count_provider) note(`${sideName}.${kind}: count provider`, id, slot);
          else if (kind === "item" && content.type !== "gtceu:sized")
            note(`${sideName}.${kind}: type ${content.type}`, id, slot);
          else if (kind === "item" && !content.ingredient)
            note(`${sideName}.${kind}: no ingredient`, id, slot);
          else if (
            kind === "item" &&
            Object.keys(content.ingredient).some((key) => key !== "item" && key !== "tag")
          )
            note(
              `${sideName}.${kind}: ingredient ${Object.keys(content.ingredient).join(",")}`,
              id,
              slot,
            );
          else if (kind === "fluid" && content.value?.length !== 1)
            note(`${sideName}.${kind}: ${content.value?.length ?? 0} choices`, id, slot);
        }
      }
    }
  }
}

console.log(
  [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 35)
    .map(([key, count]) => `${count}\t${key}`)
    .join("\n"),
);
console.log(
  JSON.stringify(
    Object.fromEntries(
      [...counts]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([key]) => [key, examples.get(key)]),
    ),
    null,
    2,
  ),
);
