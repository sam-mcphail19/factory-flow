import { expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync, gunzipSync } from "node:zlib";

it("attaches atlas references with immutable image filenames", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-flow-icons-"));
  try {
    const icons = path.join(dir, "icons");
    fs.mkdirSync(icons);
    fs.writeFileSync(path.join(icons, "atlas-0000.png"), Buffer.from("sample-png"));
    fs.writeFileSync(path.join(icons, "manifest.json"), JSON.stringify({
      format: "factory-flow-icons-v1",
      items: { "test:widget": { atlas: "atlas-0000.png", x: 0, y: 32 } },
    }));
    const dataset = path.join(dir, "recipes.json.gz");
    fs.writeFileSync(dataset, gzipSync(JSON.stringify({
      datasetVersionId: "monifactory-normal-0.13.7",
      resources: [{ kind: "item", id: "test:widget" }, { kind: "fluid", id: "test:water" }],
      recipes: [],
    })));
    const run = spawnSync(process.execPath, [path.join(import.meta.dirname, "apply-icons.mjs"), dataset, icons], { encoding: "utf8" });
    expect(run.status, run.stderr).toBe(0);
    const result = JSON.parse(gunzipSync(fs.readFileSync(dataset)));
    expect(result.resources[0].iconAtlas).toMatchObject({ x: 0, y: 32, width: 32, height: 32 });
    const imagePath = result.resources[0].iconAtlas.imagePath;
    expect(imagePath).toMatch(/atlas-0000-[a-f0-9]{12}\.png$/);
    expect(fs.existsSync(path.join(dir, "textures", "icons", path.basename(imagePath)))).toBe(true);
    expect(result.resources[1].iconAtlas).toBeUndefined();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
