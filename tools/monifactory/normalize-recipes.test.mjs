import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";

it("keeps Microverse requirements and converts research CWU into ticks", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-flow-special-"));
  try {
    const format = "factory-flow-raw-v2";
    const files = [
      {
        type: "gtceu:microverse",
        file: "microverse.json",
        json: {
          duration: 200,
          data: { projector_tier: 2, damage_rate: 1 },
          inputs: {
            microverse: [{ content: 3 }],
            item: [
              { content: { type: "gtceu:sized", count: 1, ingredient: { item: "test:miner" } } },
            ],
          },
          outputs: {
            item: [
              { content: { type: "gtceu:sized", count: 2, ingredient: { item: "test:ore" } } },
            ],
          },
        },
      },
      {
        type: "gtceu:research_station",
        file: "research.json",
        json: {
          duration: 128000,
          data: { duration_is_total_cwu: 1 },
          tickInputs: { eu: [{ content: 32 }], cwu: [{ content: 32 }] },
          inputs: {
            item: [
              { content: { type: "gtceu:sized", count: 1, ingredient: { item: "test:data_orb" } } },
            ],
          },
          outputs: {
            item: [
              { content: { type: "gtceu:sized", count: 1, ingredient: { item: "test:research" } } },
            ],
          },
        },
      },
    ];
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ format, files: files.map(({ type, file }) => ({ type, file })) }),
    );
    files.forEach(({ type, file, json }, index) =>
      fs.writeFileSync(
        path.join(dir, file),
        JSON.stringify({ format, type, recipes: [{ id: `test:${index}`, json }] }),
      ),
    );
    const output = path.join(dir, "recipes.json.gz");
    const run = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "normalize-recipes.mjs"),
        path.join(dir, "manifest.json"),
        output,
        "0.13.7",
        "Normal",
      ],
      { encoding: "utf8" },
    );
    expect(run.status, run.stderr).toBe(0);
    const recipes = JSON.parse(gunzipSync(fs.readFileSync(output)).toString("utf8")).recipes;
    expect(recipes).toHaveLength(2);
    expect(recipes[0]).toMatchObject({
      durationTicks: 200,
      metadata: { requiredMicroverse: 3, projectorTier: 2, minerDamageRate: 1 },
    });
    expect(recipes[1]).toMatchObject({
      durationTicks: 4000,
      metadata: { totalCWU: 128000, cwuPerTick: 32 },
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it("includes AE2 Inscriber recipes as rate unknown and keeps the press reusable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-flow-inscriber-"));
  try {
    const format = "factory-flow-raw-v2";
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ format, files: [{ type: "ae2:inscriber", file: "inscriber.json" }] }),
    );
    fs.writeFileSync(
      path.join(dir, "inscriber.json"),
      JSON.stringify({
        format,
        type: "ae2:inscriber",
        recipes: [
          {
            id: "test:print",
            json: {
              mode: "inscribe",
              ingredients: {
                middle: { item: "test:ingot" },
                top: { item: "ae2:logic_processor_press" },
              },
              result: { item: "ae2:printed_logic_processor" },
            },
          },
        ],
      }),
    );
    const output = path.join(dir, "recipes.json.gz");
    const run = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "normalize-recipes.mjs"),
        path.join(dir, "manifest.json"),
        output,
        "0.13.7",
        "Normal",
      ],
      { encoding: "utf8" },
    );
    expect(run.status, run.stderr).toBe(0);
    const recipe = JSON.parse(gunzipSync(fs.readFileSync(output)).toString("utf8")).recipes[0];
    expect(recipe).toMatchObject({
      machineType: "AE2 Inscriber",
      metadata: { rateUnknown: true },
      inputs: [{ id: "test:ingot" }, { id: "ae2:logic_processor_press", consumed: false }],
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it("resolves explicit ingredient choices and Ad Astra fluid outputs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-flow-choices-"));
  try {
    const format = "factory-flow-raw-v2";
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        format,
        files: [
          { type: "minecraft:crafting_shapeless", file: "crafting.json" },
          { type: "ad_astra:cryo_freezing", file: "freezing.json" },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "crafting.json"),
      JSON.stringify({
        format,
        type: "minecraft:crafting_shapeless",
        recipes: [
          {
            id: "test:dye",
            json: {
              ingredients: [[{ item: "test:red" }, { tag: "forge:blue" }]],
              result: { item: "test:output" },
            },
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "tags.json"),
      JSON.stringify({
        format: "factory-flow-item-tags-v1",
        tags: { "forge:blue": ["test:blue"] },
      }),
    );
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json")));
    manifest.itemTagsFile = "tags.json";
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    fs.writeFileSync(
      path.join(dir, "freezing.json"),
      JSON.stringify({
        format,
        type: "ad_astra:cryo_freezing",
        recipes: [
          {
            id: "test:freeze",
            json: {
              ingredient: { item: "test:ice" },
              result: { fluid: "test:fuel", millibuckets: 25 },
              cookingtime: 60,
              energy: 40,
            },
          },
        ],
      }),
    );
    const output = path.join(dir, "recipes.json.gz");
    const run = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "normalize-recipes.mjs"),
        path.join(dir, "manifest.json"),
        output,
        "0.13.7",
        "Normal",
      ],
      { encoding: "utf8" },
    );
    expect(run.status, run.stderr).toBe(0);
    const dataset = JSON.parse(gunzipSync(fs.readFileSync(output)).toString("utf8"));
    const choice = dataset.recipes[0].inputs[0].id;
    expect(choice).toMatch(/^oredict:factory-flow:alternatives\/[a-f0-9]{16}$/);
    expect(dataset.oreDictionary[choice.slice(8)]).toEqual(["test:blue", "test:red"]);
    expect(dataset.recipes[1]).toMatchObject({
      durationTicks: 60,
      outputs: [{ kind: "fluid", id: "test:fuel", amount: 25 }],
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it("keeps NBT variants separate from ordinary items in machine and charge-transfer recipes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-flow-nbt-"));
  try {
    const format = "factory-flow-raw-v2";
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        format,
        files: [
          { type: "gtceu:macerator", file: "machine.json" },
          { type: "gtceu:crafting_shaped_energy_transfer", file: "crafting.json" },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "machine.json"),
      JSON.stringify({
        format,
        type: "gtceu:macerator",
        recipes: [
          {
            id: "test:macerate_tool",
            json: {
              duration: 20,
              inputs: {
                item: [
                  {
                    content: {
                      type: "gtceu:sized",
                      count: 1,
                      ingredient: {
                        type: "forge:nbt",
                        item: "test:tool",
                        count: 1,
                        nbt: "{Damage:0}",
                      },
                    },
                  },
                ],
              },
              outputs: {
                item: [
                  { content: { type: "gtceu:sized", count: 1, ingredient: { item: "test:dust" } } },
                ],
              },
            },
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "crafting.json"),
      JSON.stringify({
        format,
        type: "gtceu:crafting_shaped_energy_transfer",
        recipes: [
          {
            id: "test:charge_tool",
            json: {
              pattern: ["A"],
              key: { A: { item: "test:tool" } },
              chargeIngredient: { item: "test:tool" },
              transferMaxCharge: true,
              overrideCharge: false,
              result: { item: "test:tool", nbt: { MaxCharge: 1000 } },
            },
          },
        ],
      }),
    );
    const output = path.join(dir, "recipes.json.gz");
    const run = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "normalize-recipes.mjs"),
        path.join(dir, "manifest.json"),
        output,
        "0.13.7",
        "Normal",
      ],
      { encoding: "utf8" },
    );
    expect(run.status, run.stderr).toBe(0);
    const dataset = JSON.parse(gunzipSync(fs.readFileSync(output)).toString("utf8"));
    expect(dataset.recipes).toHaveLength(2);
    const machine = dataset.recipes.find((recipe) => recipe.id === "test:macerate_tool");
    const crafting = dataset.recipes.find((recipe) => recipe.id === "test:charge_tool");
    expect(machine.inputs[0].id).toMatch(/^test:tool@nbt:[a-f0-9]{16}$/);
    expect(crafting.inputs[0].id).toBe("test:tool");
    expect(crafting.outputs[0].id).toMatch(/^test:tool@nbt:[a-f0-9]{16}$/);
    expect(machine.inputs[0].tooltip).toContain("forge:nbt: NBT: {Damage:0}");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it("converts Thermal item and fluid recipes with configured base times and reusable dies", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-flow-thermal-"));
  try {
    const format = "factory-flow-raw-v2";
    const cases = [
      [
        "thermal:press",
        {
          ingredients: [
            { item: "test:metal", count: 4 },
            { item: "thermal:press_packing_2x2_die" },
          ],
          result: [{ item: "test:block" }],
          energy: 400,
        },
      ],
      [
        "thermal:chiller",
        {
          ingredient: { fluid: "minecraft:water", amount: 1000 },
          result: [{ item: "minecraft:ice" }],
          energy: 2000,
        },
      ],
      [
        "thermal:crucible",
        {
          ingredient: { item: "minecraft:ice" },
          result: [{ fluid: "minecraft:water", amount: 1000 }],
          energy: 2000,
        },
      ],
      [
        "thermal:centrifuge",
        {
          ingredient: { item: "test:ore" },
          result: [{ item: "test:dust", count: 2 }],
          energy: 1600,
        },
      ],
    ];
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        format,
        files: cases.map(([type], index) => ({ type, file: `${index}.json` })),
      }),
    );
    cases.forEach(([type, json], index) =>
      fs.writeFileSync(
        path.join(dir, `${index}.json`),
        JSON.stringify({ format, type, recipes: [{ id: `test:${index}`, json }] }),
      ),
    );
    fs.writeFileSync(
      path.join(dir, "thermal.toml"),
      '[Machines.Press]\n"Base Power" = 20\n[Recipes.Press]\n"Energy Multiplier" = 1.0\n[Machines.Chiller]\n"Base Power" = 20\n[Recipes.Chiller]\n"Energy Multiplier" = 1.0\n[Machines.Crucible]\n"Base Power" = 80\n[Recipes.Crucible]\n"Energy Multiplier" = 1.0\n[Machines.Centrifuge]\n"Base Power" = 20\n[Recipes.Centrifuge]\n"Energy Multiplier" = 1.0\n',
    );
    const output = path.join(dir, "recipes.json.gz");
    const result = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "normalize-recipes.mjs"),
        path.join(dir, "manifest.json"),
        output,
        "0.13.7",
        "Normal",
        "",
        "",
        "",
        path.join(dir, "thermal.toml"),
      ],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    const recipes = JSON.parse(gunzipSync(fs.readFileSync(output)).toString("utf8")).recipes;
    expect(recipes).toHaveLength(4);
    expect(recipes[0]).toMatchObject({
      durationTicks: 20,
      inputs: [
        { id: "test:metal", amount: 4 },
        { id: "thermal:press_packing_2x2_die", consumed: false },
      ],
    });
    expect(recipes[1]).toMatchObject({
      durationTicks: 100,
      inputs: [{ kind: "fluid", id: "minecraft:water", amount: 1000 }],
    });
    expect(recipes[2]).toMatchObject({
      durationTicks: 25,
      outputs: [{ kind: "fluid", id: "minecraft:water", amount: 1000 }],
    });
    expect(recipes[3]).toMatchObject({
      durationTicks: 80,
      outputs: [{ id: "test:dust", amount: 2 }],
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it("connects crafting and GTM tag inputs to concrete items", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-flow-monifactory-"));
  try {
    const format = "factory-flow-raw-v2";
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        format,
        files: [
          { type: "minecraft:crafting_shaped", file: "crafting.json" },
          { type: "gtceu:alloy_smelter", file: "machine.json" },
          { type: "minecraft:stonecutting", file: "stonecutting.json" },
          { type: "minecraft:smelting", file: "smelting.json" },
        ],
        itemTagsFile: "tags.json",
      }),
    );
    fs.writeFileSync(
      path.join(dir, "tags.json"),
      JSON.stringify({
        format: "factory-flow-item-tags-v1",
        tags: { "forge:plates/iron": ["gtceu:iron_plate", "other:iron_plate"] },
      }),
    );
    fs.writeFileSync(
      path.join(dir, "crafting.json"),
      JSON.stringify({
        format,
        type: "minecraft:crafting_shaped",
        recipes: [
          {
            id: "test:craft",
            json: {
              pattern: ["AA", " B"],
              key: { A: { tag: "forge:plates/iron" }, B: { item: "minecraft:stick" } },
              result: { item: "test:part", count: 2 },
            },
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "machine.json"),
      JSON.stringify({
        format,
        type: "gtceu:alloy_smelter",
        recipes: [
          {
            id: "test:machine",
            json: {
              duration: 40,
              tickInputs: { eu: [{ content: 16 }] },
              inputs: {
                item: [
                  {
                    content: {
                      type: "gtceu:sized",
                      count: 1,
                      ingredient: { tag: "forge:plates/iron" },
                    },
                  },
                ],
              },
              outputs: { item: [{ content: { item: "test:part" } }] },
            },
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "stonecutting.json"),
      JSON.stringify({
        format,
        type: "minecraft:stonecutting",
        recipes: [
          {
            id: "test:cut",
            json: {
              ingredient: { item: "test:part" },
              result: "test:tile",
              count: 4,
            },
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "smelting.json"),
      JSON.stringify({
        format,
        type: "minecraft:smelting",
        recipes: [
          {
            id: "test:smelt",
            json: {
              ingredient: { tag: "forge:plates/iron" },
              result: { item: "test:ingot" },
              cookingtime: 200,
            },
          },
        ],
      }),
    );
    const output = path.join(dir, "recipes.json.gz");
    const result = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "normalize-recipes.mjs"),
        path.join(dir, "manifest.json"),
        output,
        "0.13.7",
        "Normal",
      ],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    const dataset = JSON.parse(gunzipSync(fs.readFileSync(output)).toString("utf8"));
    expect(dataset.sourceInfo.sourceId).toBe("kubejs-exporter");
    expect(dataset.recipes).toHaveLength(4);
    expect(dataset.recipes[0].inputs).toEqual([
      expect.objectContaining({ id: "oredict:forge:plates/iron", amount: 2 }),
      expect.objectContaining({ id: "minecraft:stick", amount: 1 }),
    ]);
    expect(dataset.recipes[1].inputs[0].id).toBe("oredict:forge:plates/iron");
    expect(dataset.recipes[2]).toMatchObject({
      machineType: "Stonecutter",
      durationTicks: 1,
      outputs: [{ id: "test:tile", amount: 4 }],
    });
    expect(dataset.recipes[3]).toMatchObject({
      machineType: "Furnace",
      durationTicks: 200,
      inputs: [{ id: "oredict:forge:plates/iron" }],
    });
    expect(dataset.oreDictionary["forge:plates/iron"]).toEqual([
      "gtceu:iron_plate",
      "other:iron_plate",
    ]);
    expect(
      dataset.resources.find((resource) => resource.id === "oredict:forge:plates/iron")
        .alternatives,
    ).toHaveLength(2);
    expect(
      dataset.resources.find((resource) => resource.id === "gtceu:iron_plate").oreDictionary,
    ).toContain("forge:plates/iron");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it("uses a KubeJS replacement when its recipe ID matches an original", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-flow-replacement-"));
  try {
    const format = "factory-flow-raw-v2";
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        format,
        files: [
          { type: "kubejs:shapeless", file: "added.json" },
          { type: "minecraft:crafting_shaped", file: "existing.json" },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "added.json"),
      JSON.stringify({
        format,
        type: "kubejs:shapeless",
        recipes: [
          {
            id: "test:replacement",
            source: "kubejs",
            json: { ingredients: [{ item: "test:new_input" }], result: { item: "test:output" } },
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "existing.json"),
      JSON.stringify({
        format,
        type: "minecraft:crafting_shaped",
        recipes: [
          {
            id: "test:replacement",
            source: "existing",
            json: {
              pattern: ["A"],
              key: { A: { item: "test:old_input" } },
              result: { item: "test:output" },
            },
          },
        ],
      }),
    );
    const output = path.join(dir, "recipes.json.gz");
    const result = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "normalize-recipes.mjs"),
        path.join(dir, "manifest.json"),
        output,
        "0.13.7",
        "Normal",
      ],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    const dataset = JSON.parse(gunzipSync(fs.readFileSync(output)).toString("utf8"));
    expect(dataset.recipes).toHaveLength(1);
    expect(dataset.recipes[0].inputs[0].id).toBe("test:new_input");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it("converts Ender IO alloy smelting with pack energy settings and keeps unsupported choices out", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-flow-enderio-"));
  try {
    const format = "factory-flow-raw-v2";
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        format,
        files: [{ type: "enderio:alloy_smelting", file: "alloy.json" }],
        itemTagsFile: "tags.json",
      }),
    );
    fs.writeFileSync(
      path.join(dir, "tags.json"),
      JSON.stringify({
        format: "factory-flow-item-tags-v1",
        tags: { "forge:dusts/iron": ["gtceu:iron_dust"] },
      }),
    );
    fs.writeFileSync(
      path.join(dir, "alloy.json"),
      JSON.stringify({
        format,
        type: "enderio:alloy_smelting",
        recipes: [
          {
            id: "test:alloy",
            json: {
              energy: 1500,
              inputs: [{ ingredient: { tag: "forge:dusts/iron" }, count: 2 }],
              result: { item: "test:alloy", count: 3 },
            },
          },
          {
            id: "test:choice",
            json: {
              energy: 1500,
              inputs: [{ ingredient: [{ item: "test:a" }, { item: "test:b" }], count: 1 }],
              result: { item: "test:alloy" },
            },
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "machines-common.toml"),
      "[energy.alloySmelter]\nusage = 20\n[energy.sagMill]\nusage = 40\n",
    );
    const output = path.join(dir, "recipes.json.gz");
    const result = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "normalize-recipes.mjs"),
        path.join(dir, "manifest.json"),
        output,
        "0.13.7",
        "Normal",
        path.join(dir, "machines-common.toml"),
      ],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    const dataset = JSON.parse(gunzipSync(fs.readFileSync(output)).toString("utf8"));
    expect(dataset.recipes).toHaveLength(2);
    expect(dataset.recipes[0]).toMatchObject({
      machineType: "Ender IO Alloy Smelter",
      durationTicks: 75,
      eut: 0,
      inputs: [{ id: "oredict:forge:dusts/iron", amount: 2 }],
      outputs: [{ id: "test:alloy", amount: 3 }],
      metadata: { energyUnit: "uI", energyCost: 1500, baseEnergyPerTick: 20 },
    });
    const choiceId = dataset.recipes[1].inputs[0].id;
    expect(choiceId).toMatch(/^oredict:factory-flow:alternatives\/[a-f0-9]{16}$/);
    expect(dataset.oreDictionary[choiceId.slice(8)]).toEqual(["test:a", "test:b"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it("converts smithing upgrades and SAG Mill chance outputs", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-flow-smithing-sag-"));
  try {
    const format = "factory-flow-raw-v2";
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        format,
        files: [
          { type: "minecraft:smithing_transform", file: "smithing.json" },
          { type: "enderio:sag_milling", file: "sag.json" },
        ],
        itemTagsFile: "tags.json",
      }),
    );
    fs.writeFileSync(
      path.join(dir, "tags.json"),
      JSON.stringify({
        format: "factory-flow-item-tags-v1",
        tags: { "forge:ingots/netherite": ["minecraft:netherite_ingot"] },
      }),
    );
    fs.writeFileSync(
      path.join(dir, "smithing.json"),
      JSON.stringify({
        format,
        type: "minecraft:smithing_transform",
        recipes: [
          {
            id: "test:smithing",
            json: {
              template: { item: "minecraft:netherite_upgrade_smithing_template" },
              base: { item: "test:old_tool" },
              addition: { tag: "forge:ingots/netherite" },
              result: { item: "test:new_tool" },
            },
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "sag.json"),
      JSON.stringify({
        format,
        type: "enderio:sag_milling",
        recipes: [
          {
            id: "test:sag",
            json: {
              energy: 2400,
              input: { item: "test:ore" },
              outputs: [
                { chance: 1, item: { item: "test:dust", count: 2 }, optional: false },
                { chance: 0.25, item: { item: "test:stone" }, optional: false },
              ],
            },
          },
          {
            id: "test:unresolved_output",
            json: {
              energy: 2400,
              input: { item: "test:ore" },
              outputs: [{ chance: 1, item: { tag: "forge:unknown" }, optional: false }],
            },
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "machines-common.toml"),
      "[energy.alloySmelter]\nusage = 20\n[energy.sagMill]\nusage = 40\n",
    );
    const output = path.join(dir, "recipes.json.gz");
    const result = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "normalize-recipes.mjs"),
        path.join(dir, "manifest.json"),
        output,
        "0.13.7",
        "Normal",
        path.join(dir, "machines-common.toml"),
      ],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    const dataset = JSON.parse(gunzipSync(fs.readFileSync(output)).toString("utf8"));
    expect(dataset.recipes).toHaveLength(2);
    expect(dataset.recipes[0]).toMatchObject({
      machineType: "Smithing Table",
      inputs: [
        { id: "minecraft:netherite_upgrade_smithing_template" },
        { id: "test:old_tool" },
        { id: "oredict:forge:ingots/netherite" },
      ],
      outputs: [{ id: "test:new_tool" }],
    });
    expect(dataset.recipes[1]).toMatchObject({
      machineType: "Ender IO SAG Mill",
      durationTicks: 60,
      outputs: [
        { id: "test:dust", amount: 2 },
        { id: "test:stone", chance: 0.25 },
      ],
      metadata: { energyUnit: "uI", energyCost: 2400, baseEnergyPerTick: 40 },
    });
    expect(JSON.parse(result.stdout).skipped["unsupported Ender IO SAG recipe"]).toBe(1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it("uses NuclearCraft processor settings and rejects ambiguous output tags", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-flow-nuclearcraft-"));
  try {
    const format = "factory-flow-raw-v2";
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        format,
        files: [{ type: "nuclearcraft:manufactory", file: "manufactory.json" }],
        itemTagsFile: "tags.json",
      }),
    );
    fs.writeFileSync(
      path.join(dir, "tags.json"),
      JSON.stringify({
        format: "factory-flow-item-tags-v1",
        tags: {
          "forge:ingots/copper": ["minecraft:copper_ingot"],
          "forge:dusts/copper": ["gtceu:copper_dust"],
          "forge:dusts/mixed": ["test:a", "test:b"],
        },
      }),
    );
    fs.writeFileSync(
      path.join(dir, "manufactory.json"),
      JSON.stringify({
        format,
        type: "nuclearcraft:manufactory",
        recipes: [
          {
            id: "test:manufactory",
            json: {
              input: [{ tag: "forge:ingots/copper" }],
              output: [{ tag: "forge:dusts/copper", count: 2 }],
              timeModifier: 0.5,
              powerModifier: 1.5,
              radiation: 0,
            },
          },
          {
            id: "test:ambiguous",
            json: {
              input: [{ item: "test:input" }],
              output: [{ tag: "forge:dusts/mixed" }],
              timeModifier: 1,
              powerModifier: 1,
            },
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "processors.toml"),
      '["Common settings"]\nbase_time = 240\nbase_power = 128\n[manufactory]\nbase_time = 200\nbase_power = 50\n',
    );
    const output = path.join(dir, "recipes.json.gz");
    const result = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "normalize-recipes.mjs"),
        path.join(dir, "manifest.json"),
        output,
        "0.13.7",
        "Normal",
        "",
        path.join(dir, "processors.toml"),
      ],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    const dataset = JSON.parse(gunzipSync(fs.readFileSync(output)).toString("utf8"));
    expect(dataset.recipes).toHaveLength(1);
    expect(dataset.recipes[0]).toMatchObject({
      machineType: "NuclearCraft Manufactory",
      durationTicks: 100,
      eut: 0,
      inputs: [{ id: "oredict:forge:ingots/copper" }],
      outputs: [{ id: "gtceu:copper_dust", amount: 2 }],
      metadata: { energyUnit: "FE", baseEnergyPerTick: 75 },
    });
    expect(JSON.parse(result.stdout).skipped["unsupported NuclearCraft processor recipe"]).toBe(1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it("resolves exported fluid tags for NuclearCraft processing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-flow-nuclearcraft-fluid-"));
  try {
    const format = "factory-flow-raw-v2";
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        format,
        files: [{ type: "nuclearcraft:melter", file: "melter.json" }],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "melter.json"),
      JSON.stringify({
        format,
        type: "nuclearcraft:melter",
        recipes: [
          {
            id: "test:melter",
            json: {
              input: [{ item: "test:metal_dust" }],
              outputFluids: [{ tag: "forge:molten_metal", amount: 90 }],
              timeModifier: 0.5,
              powerModifier: 2,
            },
          },
          {
            id: "test:ambiguous_fluid",
            json: {
              input: [{ item: "test:other_dust" }],
              outputFluids: [{ tag: "forge:multiple_fluids", amount: 90 }],
              timeModifier: 1,
              powerModifier: 1,
            },
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "processors.toml"),
      "[manufactory]\nbase_time = 200\nbase_power = 50\n[melter]\nbase_time = 200\nbase_power = 50\n",
    );
    fs.writeFileSync(
      path.join(dir, "fluid-tags.json"),
      JSON.stringify({
        format: "factory-flow-fluid-tags-v1",
        tags: {
          "forge:molten_metal": ["gtceu:molten_metal"],
          "forge:multiple_fluids": ["test:a", "test:b"],
        },
      }),
    );
    const output = path.join(dir, "recipes.json.gz");
    const result = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "normalize-recipes.mjs"),
        path.join(dir, "manifest.json"),
        output,
        "0.13.7",
        "Normal",
        "",
        path.join(dir, "processors.toml"),
        path.join(dir, "fluid-tags.json"),
      ],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    const dataset = JSON.parse(gunzipSync(fs.readFileSync(output)).toString("utf8"));
    expect(dataset.recipes).toHaveLength(1);
    expect(dataset.recipes[0]).toMatchObject({
      machineType: "NuclearCraft Melter",
      durationTicks: 100,
      inputs: [{ id: "test:metal_dust" }],
      outputs: [{ kind: "fluid", id: "gtceu:molten_metal", amount: 90 }],
      metadata: { energyUnit: "FE", baseEnergyPerTick: 100 },
    });
    expect(JSON.parse(result.stdout).skipped["unsupported NuclearCraft processor recipe"]).toBe(1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it("connects GTM fluid tags with one or multiple members", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-flow-gtm-fluid-"));
  try {
    const format = "factory-flow-raw-v2";
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify({ format, files: [{ type: "gtceu:chemical_reactor", file: "gtm.json" }] }),
    );
    fs.writeFileSync(
      path.join(dir, "gtm.json"),
      JSON.stringify({
        format,
        type: "gtceu:chemical_reactor",
        recipes: [
          {
            id: "test:reaction",
            json: {
              duration: 40,
              tickInputs: { eu: [{ content: 8 }] },
              inputs: { fluid: [{ content: { amount: 100, value: [{ tag: "forge:oxygen" }] } }] },
              outputs: { fluid: [{ content: { amount: 100, value: [{ tag: "forge:water" }] } }] },
            },
          },
          {
            id: "test:steam_reaction",
            json: {
              duration: 40,
              inputs: { fluid: [{ content: { amount: 100, value: [{ tag: "forge:steam" }] } }] },
              outputs: { item: [{ content: { item: "test:product" } }] },
            },
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(dir, "fluid-tags.json"),
      JSON.stringify({
        format: "factory-flow-fluid-tags-v1",
        tags: {
          "forge:oxygen": ["gtceu:oxygen"],
          "forge:water": ["minecraft:water"],
          "forge:steam": ["gtceu:steam", "systeams:steam"],
        },
      }),
    );
    const output = path.join(dir, "recipes.json.gz");
    const result = spawnSync(
      process.execPath,
      [
        path.join(import.meta.dirname, "normalize-recipes.mjs"),
        path.join(dir, "manifest.json"),
        output,
        "0.13.7",
        "Normal",
        "",
        "",
        path.join(dir, "fluid-tags.json"),
      ],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    const dataset = JSON.parse(gunzipSync(fs.readFileSync(output)).toString("utf8"));
    expect(dataset.recipes).toHaveLength(2);
    expect(dataset.recipes[0]).toMatchObject({
      inputs: [{ kind: "fluid", id: "gtceu:oxygen", amount: 100 }],
      outputs: [{ kind: "fluid", id: "minecraft:water", amount: 100 }],
    });
    expect(dataset.recipes[1].inputs[0]).toMatchObject({
      kind: "fluid",
      id: "#forge:steam",
      alternatives: [{ id: "gtceu:steam" }, { id: "systeams:steam" }],
    });
    expect(dataset.resources.find((resource) => resource.id === "#forge:steam")).toMatchObject({
      alternatives: [{ id: "gtceu:steam" }, { id: "systeams:steam" }],
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
