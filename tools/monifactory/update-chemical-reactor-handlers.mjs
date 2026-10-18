import fs from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { attachChemicalReactorHandlers } from "./chemical-reactor-handlers.mjs";

const file = process.argv[2];
if (!file?.endsWith(".json.gz")) throw new Error("Pass a Monifactory recipes.json.gz path.");
const dataset = JSON.parse(gunzipSync(await fs.readFile(file)));
const compatible = attachChemicalReactorHandlers(dataset.recipes);
await fs.writeFile(file, gzipSync(JSON.stringify(dataset)));
console.log(`Added LCR choice to ${compatible} chemical reactor recipes.`);
