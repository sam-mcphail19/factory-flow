import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { attachChemicalReactorHandlers } from "./chemical-reactor-handlers.mjs";

const [
  manifestPath,
  outputPath,
  packVersion,
  mode,
  enderIoConfigPath,
  nuclearCraftConfigPath,
  fluidTagsPath,
  thermalConfigPath,
] = process.argv.slice(2);
if (!manifestPath || !outputPath?.endsWith(".json.gz") || !packVersion || !mode) {
  throw new Error(
    "Usage: normalize-recipes.mjs <raw-manifest.json> <recipes.json.gz> <pack-version> <mode> [enderio-machines-common.toml] [nuclearcraft-processors.toml] [fluid-tags.json] [thermal-server.toml]",
  );
}

const thermalMachines = new Map();
if (thermalConfigPath) {
  const config = await fs.readFile(thermalConfigPath, "utf8");
  let section;
  const settings = new Map();
  for (const line of config.split(/\r?\n/)) {
    const heading = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (heading) section = heading[1];
    const value = line.match(/^\s*"(Base Power|Energy Multiplier)"\s*=\s*([\d.]+)\s*$/);
    if (!value || !section) continue;
    const [group, machine] = section.split(".");
    if (!machine || !["Machines", "Recipes"].includes(group)) continue;
    const current = settings.get(machine) ?? {};
    current[value[1] === "Base Power" ? "basePower" : "energyMultiplier"] = Number(value[2]);
    settings.set(machine, current);
  }
  for (const [machine, setting] of settings) {
    if (setting.basePower > 0 && setting.energyMultiplier > 0)
      thermalMachines.set(machine, setting);
  }
}

const nuclearCraftProcessors = new Map();
if (nuclearCraftConfigPath) {
  const config = await fs.readFile(nuclearCraftConfigPath, "utf8");
  let section;
  const settings = new Map();
  for (const line of config.split(/\r?\n/)) {
    const heading = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (heading) section = heading[1];
    const value = line.match(/^\s*(base_time|base_power)\s*=\s*(\d+)\s*$/);
    if (section && value) {
      const machine = settings.get(section) ?? {};
      machine[value[1]] = Number(value[2]);
      settings.set(section, machine);
    }
  }
  for (const [machine, value] of settings) {
    if (
      Number.isSafeInteger(value.base_time) &&
      value.base_time > 0 &&
      Number.isSafeInteger(value.base_power) &&
      value.base_power > 0
    ) {
      nuclearCraftProcessors.set(machine, {
        baseTime: value.base_time,
        basePower: value.base_power,
      });
    }
  }
  if (!nuclearCraftProcessors.has("manufactory")) {
    throw new Error("Missing positive manufactory base_time or base_power in NuclearCraft config.");
  }
}

let enderIoAlloyUsage;
let enderIoSagUsage;
let enderIoSlicerUsage;
if (enderIoConfigPath) {
  const config = await fs.readFile(enderIoConfigPath, "utf8");
  let section;
  for (const line of config.split(/\r?\n/)) {
    const heading = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (heading) section = heading[1];
    const usage = line.match(/^\s*usage\s*=\s*(\d+)\s*$/);
    if (section === "energy.alloySmelter" && usage) enderIoAlloyUsage = Number(usage[1]);
    if (section === "energy.sagMill" && usage) enderIoSagUsage = Number(usage[1]);
    if (section === "energy.slicer" && usage) enderIoSlicerUsage = Number(usage[1]);
  }
  if (
    !Number.isSafeInteger(enderIoAlloyUsage) ||
    enderIoAlloyUsage <= 0 ||
    !Number.isSafeInteger(enderIoSagUsage) ||
    enderIoSagUsage <= 0
  ) {
    throw new Error("Missing positive alloySmelter or sagMill usage in Ender IO config.");
  }
}

const rawManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
if (!["factory-flow-gtm-raw-v1", "factory-flow-raw-v2"].includes(rawManifest.format)) {
  throw new Error("Unsupported Monifactory raw export format.");
}

let itemTags = new Map();
if (rawManifest.itemTagsFile) {
  const tagExport = JSON.parse(
    await fs.readFile(path.join(path.dirname(manifestPath), rawManifest.itemTagsFile), "utf8"),
  );
  if (tagExport.format !== "factory-flow-item-tags-v1") {
    throw new Error("Unsupported item tag export format.");
  }
  itemTags = new Map(Object.entries(tagExport.tags));
}

let fluidTags = new Map();
if (fluidTagsPath) {
  const tagExport = JSON.parse(await fs.readFile(fluidTagsPath, "utf8"));
  if (tagExport.format !== "factory-flow-fluid-tags-v1") {
    throw new Error("Unsupported fluid tag export format.");
  }
  fluidTags = new Map(Object.entries(tagExport.tags));
}

const versionId = `monifactory-${mode.toLowerCase()}-${packVersion}`;
const generatedAt = new Date().toISOString();
const exporterId =
  rawManifest.format === "factory-flow-raw-v2" ? "kubejs-exporter" : "gtm-exporter";
const resources = new Map();
const recipes = [];
const recipeMaps = new Set();
const skipped = new Map();
const oreDictionary = {};
const selectedEntries = new Map();
let replacedRecipes = 0;

for (const file of rawManifest.files) {
  const source = JSON.parse(
    await fs.readFile(path.join(path.dirname(manifestPath), file.file), "utf8"),
  );
  if (source.format !== rawManifest.format || source.type !== file.type) {
    throw new Error(`Invalid recipe file: ${file.file}`);
  }
  for (const entry of source.recipes) {
    const previous = selectedEntries.get(entry.id);
    if (previous) {
      replacedRecipes += 1;
      if (previous.entry.source === "kubejs" && entry.source !== "kubejs") continue;
    }
    selectedEntries.set(entry.id, { entry, type: source.type });
  }
}

for (const { entry, type } of selectedEntries.values()) {
  const converted = convertRecipe(entry, type);
  if (converted.reason) {
    skipped.set(converted.reason, (skipped.get(converted.reason) ?? 0) + 1);
    continue;
  }
  recipes.push(converted.recipe);
  recipeMaps.add(converted.recipe.source.recipeMap);
  for (const resource of [...converted.recipe.inputs, ...converted.recipe.outputs]) {
    const key = `${resource.kind}:${resource.id}`;
    if (!resources.has(key)) {
      resources.set(key, {
        id: resource.id,
        kind: resource.kind,
        displayName: resource.displayName,
        ...(resource.tooltip?.length ? { tooltip: resource.tooltip } : {}),
        ...(resource.alternatives?.length ? { alternatives: resource.alternatives } : {}),
        ...(resource.id.startsWith("#") ? {} : { modId: resource.id.split(":")[0] }),
      });
    }
  }
}

attachChemicalReactorHandlers(recipes);

for (const [tag, members] of itemTags) {
  if (!Array.isArray(members) || members.length === 0) continue;
  const virtual = resources.get(`item:oredict:${tag}`);
  if (!virtual) continue;
  const uniqueMembers = [...new Set(members)].filter(
    (id) => typeof id === "string" && id.includes(":"),
  );
  if (uniqueMembers.length === 0) continue;
  oreDictionary[tag] = uniqueMembers;
  virtual.alternatives = uniqueMembers.map((id) => ({
    kind: "item",
    id,
    displayName: humanize(id.split(":").pop()),
    modId: id.split(":")[0],
  }));
  for (const id of uniqueMembers) {
    const key = `item:${id}`;
    if (!resources.has(key)) {
      resources.set(key, {
        kind: "item",
        id,
        displayName: humanize(id.split(":").pop()),
        modId: id.split(":")[0],
      });
    }
    const member = resources.get(key);
    member.oreDictionary = [...new Set([...(member.oreDictionary ?? []), tag])];
  }
}

const dataset = {
  schemaVersion: 1,
  datasetVersionId: versionId,
  pack: { id: "monifactory", name: "Monifactory", version: packVersion, mode },
  sourceInfo: { sourceId: exporterId, generatedAt },
  resources: [...resources.values()],
  recipes,
  oreDictionary,
  recipeMaps: [...recipeMaps].sort(),
  generatedAt,
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, gzipSync(JSON.stringify(dataset), { level: 9 }));
console.log(
  JSON.stringify(
    {
      datasetVersionId: versionId,
      recipes: recipes.length,
      replacedRecipes,
      craftingRecipes: recipes.filter((recipe) => recipe.category === "crafting").length,
      resources: resources.size,
      resolvedItemTags: Object.keys(oreDictionary).length,
      resolvedFluidTags: [...fluidTags.values()].filter((members) => members.length > 0).length,
      unresolvedItemTags: [...resources.values()].filter(
        (resource) => resource.id.startsWith("#") && resource.kind === "item",
      ).length,
      unresolvedFluidResources: [...resources.values()].filter(
        (resource) => resource.id.startsWith("#") && resource.kind === "fluid",
      ).length,
      skipped: Object.fromEntries([...skipped].sort((a, b) => b[1] - a[1])),
    },
    null,
    2,
  ),
);

function convertRecipe(entry, type) {
  const raw = entry.json;
  if (
    [
      "thermal:press",
      "thermal:centrifuge",
      "thermal:chiller",
      "thermal:crucible",
      "thermal:refinery",
      "thermal:sawmill",
      "thermal:bottler",
      "thermal:crystallizer",
      "thermal:insolator",
      "thermal:smelter",
      "thermal:pulverizer",
      "thermal:furnace",
      "thermal:pyrolyzer",
      "thermal:smelter_recycle",
      "thermal:pulverizer_recycle",
    ].includes(type)
  ) {
    return convertThermalRecipe(entry, type);
  }
  if (type === "extendedcrafting:combination") return convertCombinationRecipe(entry);
  if (["ad_astra:compressing", "ad_astra:cryo_freezing"].includes(type))
    return convertAdAstraRecipe(entry, type);
  if (type === "ad_astra:alloying") return convertAdAstraAlloyRecipe(entry);
  if (["ad_astra:oxygen_loading", "ad_astra:refining"].includes(type))
    return convertAdAstraFluidRecipe(entry, type);
  if (type === "enderio:slicing") return convertEnderIoSlicingRecipe(entry);
  if (type === "systeams:boiling") return convertSysTeamsBoilingRecipe(entry);
  if (type === "systeams:steam") return convertSysTeamsSteamRecipe(entry);
  if (type === "enderio:tank") return convertEnderIoTankRecipe(entry);
  if (type === "ae2:inscriber") return convertAe2InscriberRecipe(entry);
  if (type === "ae2:charger") return convertSimpleUnknownRateRecipe(entry, type, "AE2 Charger");
  if (type === "ae2:transform") return convertAe2TransformRecipe(entry);
  if (["gtceu:steam_boiler", "gtceu:large_boiler"].includes(type))
    return convertBoilerFuelRecipe(entry, type);
  if (type === "framedblocks:frame") return convertFramingSawRecipe(entry);
  if (type.startsWith("thermal:") && type.endsWith("_fuel"))
    return convertThermalFuelRecipe(entry, type);
  if (["gtceu:chromatic_processing", "gtceu:chromatic_transcendence"].includes(type))
    return convertChromaticStateRecipe(entry, type);
  if (type.startsWith("gtceu:") && entry.json?.tickOutputs?.eu)
    return convertGtmGeneratorRecipe(entry, type);
  if (type === "enderio:alloy_smelting") return convertEnderIoAlloyRecipe(entry);
  if (type === "enderio:sag_milling") return convertEnderIoSagRecipe(entry);
  if (type === "minecraft:smithing_transform") return convertSmithingRecipe(entry);
  if (type.startsWith("nuclearcraft:") && nuclearCraftProcessors.has(type.split(":")[1])) {
    return convertNuclearCraftProcessor(entry, type);
  }
  if (isSimpleCraftingType(type)) {
    return convertCraftingRecipe(entry, type);
  }
  if (isUtilityRecipeType(type)) {
    return convertUtilityRecipe(entry, type);
  }
  if (!raw || !Number.isInteger(raw.duration) || raw.duration <= 0) {
    return { reason: "missing positive duration" };
  }
  let durationTicks = raw.duration;
  let metadata;
  let notes;
  let inputSide = raw.inputs;
  if (type === "gtceu:microverse") {
    const requirement = raw.inputs?.microverse;
    if (
      !Array.isArray(requirement) ||
      requirement.length !== 1 ||
      !Number.isSafeInteger(requirement[0].content) ||
      requirement[0].content <= 0 ||
      raw.outputs?.microverse
    )
      return { reason: "unsupported Microverse requirement" };
    metadata = {
      requiredMicroverse: requirement[0].content,
      projectorTier: raw.data?.projector_tier,
      minerDamageRate: raw.data?.damage_rate,
    };
    notes = `Requires Microverse level ${requirement[0].content}. Miner damage and projector behavior are not modeled.`;
    inputSide = { ...raw.inputs };
    delete inputSide.microverse;
  }
  if (type === "gtceu:research_station" && raw.data?.duration_is_total_cwu === 1) {
    const cwu = raw.tickInputs?.cwu?.[0]?.content;
    if (!Number.isSafeInteger(cwu) || cwu <= 0) return { reason: "unsupported research CWU" };
    durationTicks = Math.ceil(raw.duration / cwu);
    metadata = { totalCWU: raw.duration, cwuPerTick: cwu };
    notes = "Duration is total CWU divided by the recipe's CWU per tick.";
  }
  const eut = raw.tickInputs?.eu?.[0]?.content ?? raw.inputs?.eu?.[0]?.content ?? 0;
  if (typeof eut !== "number" || eut < 0) {
    return { reason: "unsupported EU value" };
  }

  const inputs = convertSide(inputSide, "input");
  const outputs = convertSide(raw.outputs, "output");
  if (!inputs || !outputs || outputs.length === 0) {
    return { reason: "unsupported item or fluid content" };
  }
  if (
    Object.keys(raw.tickInputs ?? {}).some(
      (key) => key !== "eu" && !(metadata?.cwuPerTick && key === "cwu"),
    ) ||
    Object.keys(raw.tickOutputs ?? {}).length > 0
  ) {
    return { reason: "unsupported per-tick resource" };
  }

  const machineType = type.split(":")[1] ?? type;
  return {
    recipe: {
      id: entry.id,
      name: `${outputs[0].displayName} (${humanize(machineType)})`,
      kind: "gregtech_machine",
      category: raw.category ?? type,
      machineType,
      minimumTier: tierForEU(eut),
      durationTicks,
      eut,
      inputs,
      outputs,
      ...(metadata ? { metadata } : {}),
      ...(notes ? { notes } : {}),
      source: {
        datasetVersionId: versionId,
        recipeMap: type,
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function convertThermalRecipe(entry, type) {
  const machine = type.split(":")[1];
  const baseMachine = machine.replace(/_recycle$/, "");
  const machineName = baseMachine[0].toUpperCase() + baseMachine.slice(1);
  const setting = thermalMachines.get(machine === "crystallizer" ? "Brewer" : machineName);
  if (!setting) return { reason: "missing Thermal machine config" };
  const raw = entry.json;
  const results = Array.isArray(raw.results ?? raw.result)
    ? (raw.results ?? raw.result)
    : [raw.results ?? raw.result];
  const uncertainOutputs = results.some(
    (value) => value && (value.chance > 1 || value.locked !== undefined),
  );
  const energyKnown = Number.isSafeInteger(raw.energy) && raw.energy > 0;
  const rateUnknown = !energyKnown || uncertainOutputs || machine === "insolator";
  const ingredients = raw.ingredients ?? [raw.ingredient];
  if (!Array.isArray(ingredients) || !results.length) {
    return { reason: "unsupported Thermal recipe" };
  }
  const inputs = ingredients.map((value) => convertThermalResource(value, true));
  const outputs = results.map((value) => {
    if (!value) return null;
    const { locked, chance, ...base } = value;
    const output = convertThermalResource(
      chance > 1 ? base : { ...base, ...(chance === undefined ? {} : { chance }) },
      false,
    );
    if (output && (chance > 1 || locked !== undefined))
      output.tooltip = [
        `Raw output chance: ${chance ?? 1}${locked !== undefined ? `; locked: ${locked}` : ""}. Quantity varies; rate unknown.`,
      ];
    return output;
  });
  if (inputs.some((value) => !value) || outputs.some((value) => !value)) {
    return { reason: "unsupported Thermal recipe" };
  }
  for (const input of inputs) {
    if (machine === "press" && /^thermal:press_.*_die$/.test(input.id)) input.consumed = false;
  }
  const energyCost = energyKnown ? raw.energy * setting.energyMultiplier : undefined;
  return {
    recipe: {
      id: entry.id,
      name: `${outputs[0].displayName} (Thermal ${machineName})`,
      kind: "custom",
      category: machine,
      machineType: `Thermal ${machineName}`,
      minimumTier: "NONE",
      durationTicks: energyKnown ? Math.max(1, Math.ceil(energyCost / setting.basePower)) : 1,
      eut: 0,
      inputs,
      outputs,
      notes: rateUnknown
        ? "Rate unknown: energy cost, water use, or output quantity is not fully specified in the export."
        : "Base time estimated from recipe energy cost and configured machine power. RF power and upgrades are not yet modeled.",
      metadata: {
        ...(rateUnknown ? { rateUnknown: true } : {}),
        ...(uncertainOutputs
          ? { rawOutputChances: results.map((value) => value.chance ?? 1) }
          : {}),
        ...(machine === "insolator"
          ? { waterModifier: raw.water_mod ?? 1, waterUseUnknown: true }
          : {}),
        ...(raw.energy_mod !== undefined ? { energyModifier: raw.energy_mod } : {}),
        energyUnit: "RF",
        ...(energyKnown ? { energyCost: raw.energy } : {}),
        recipeEnergyMultiplier: setting.energyMultiplier,
        baseEnergyPerTick: setting.basePower,
      },
      source: {
        datasetVersionId: versionId,
        recipeMap: type,
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function convertThermalResource(value, input) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          "item",
          "tag",
          "fluid",
          "fluid_tag",
          "value",
          "nbt",
          "count",
          "amount",
          "chance",
        ].includes(key),
    )
  )
    return null;
  if (
    value.chance !== undefined &&
    (input || typeof value.chance !== "number" || value.chance < 0 || value.chance > 1)
  )
    return null;
  if (value.value) {
    if (
      !input ||
      !Array.isArray(value.value) ||
      value.item ||
      value.tag ||
      value.fluid ||
      value.fluid_tag ||
      value.nbt ||
      value.amount !== undefined
    )
      return null;
    const resource = convertCraftingIngredient(value.value);
    const amount = value.count ?? 1;
    if (!resource || !Number.isSafeInteger(amount) || amount <= 0) return null;
    resource.amount = amount;
    return resource;
  }
  if (value.fluid || value.fluid_tag) {
    if (
      value.item ||
      value.tag ||
      (value.fluid && value.fluid_tag) ||
      value.count !== undefined ||
      !Number.isSafeInteger(value.amount) ||
      value.amount <= 0
    )
      return null;
    const members = value.fluid_tag && fluidTags.get(value.fluid_tag);
    const id =
      value.fluid ??
      (members?.length === 1
        ? members[0]
        : members?.length && input
          ? `#${value.fluid_tag}`
          : undefined);
    if (!id) return null;
    return {
      kind: "fluid",
      id,
      amount: value.amount,
      displayName: humanize(id.split(":").pop()),
      ...(id.startsWith("#")
        ? {
            alternatives: members.map((fluidId) => ({
              kind: "fluid",
              id: fluidId,
              displayName: humanize(fluidId.split(":").pop()),
            })),
          }
        : {}),
      ...(value.chance !== undefined && value.chance !== 1 ? { chance: value.chance } : {}),
    };
  }
  if (value.amount !== undefined || (value.item && value.tag)) return null;
  if (input && value.nbt !== undefined) return null;
  const amount = value.count ?? 1;
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;
  const resource = input
    ? convertCraftingIngredient({ item: value.item, tag: value.tag })
    : convertSimpleItemResult({
        item: value.item,
        count: amount,
        ...(value.nbt === undefined ? {} : { nbt: value.nbt }),
      });
  if (!resource || resource.id.startsWith("#")) return null;
  resource.amount = amount;
  if (value.chance !== undefined && value.chance !== 1) resource.chance = value.chance;
  return resource;
}

function convertCombinationRecipe(entry) {
  const raw = entry.json;
  if (
    !Array.isArray(raw.ingredients) ||
    !Number.isSafeInteger(raw.powerCost) ||
    raw.powerCost <= 0 ||
    !Number.isSafeInteger(raw.powerRate) ||
    raw.powerRate <= 0
  )
    return { reason: "unsupported combination recipe" };
  const inputs = [raw.input, ...raw.ingredients].map(convertCraftingIngredient);
  const output = convertSimpleItemResult(raw.result);
  if (inputs.some((input) => !input || input.id.startsWith("#")) || !output)
    return { reason: "unsupported combination recipe" };
  return {
    recipe: {
      id: entry.id,
      name: `${output.displayName} (Extended Crafting Combination)`,
      kind: "custom",
      category: "combination",
      machineType: "Extended Crafting Combination",
      minimumTier: "NONE",
      durationTicks: Math.ceil(raw.powerCost / raw.powerRate),
      eut: 0,
      inputs,
      outputs: [output],
      metadata: { energyUnit: "FE", energyCost: raw.powerCost, baseEnergyPerTick: raw.powerRate },
      source: {
        datasetVersionId: versionId,
        recipeMap: "extendedcrafting:combination",
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function convertAdAstraRecipe(entry, type) {
  const raw = entry.json;
  const input = convertCraftingIngredient(raw.ingredient);
  const output =
    raw.result?.fluid &&
    Number.isSafeInteger(raw.result.millibuckets) &&
    raw.result.millibuckets > 0
      ? {
          kind: "fluid",
          id: raw.result.fluid,
          amount: raw.result.millibuckets,
          displayName: humanize(raw.result.fluid.split(":").pop()),
        }
      : convertSimpleItemResult(
          raw.result?.id ? { item: raw.result.id, count: raw.result.count } : raw.result,
        );
  if (
    !input ||
    input.id.startsWith("#") ||
    !output ||
    !Number.isSafeInteger(raw.cookingtime) ||
    raw.cookingtime <= 0 ||
    !Number.isFinite(raw.energy) ||
    raw.energy < 0
  )
    return { reason: "unsupported Ad Astra recipe" };
  const machineType =
    type === "ad_astra:compressing" ? "Ad Astra Compressor" : "Ad Astra Cryo Freezer";
  return {
    recipe: {
      id: entry.id,
      name: `${output.displayName} (${machineType})`,
      kind: "custom",
      category: type.split(":")[1],
      machineType,
      minimumTier: "NONE",
      durationTicks: raw.cookingtime,
      eut: 0,
      inputs: [input],
      outputs: [output],
      metadata: { energyUnit: "FE", baseEnergyPerTick: raw.energy },
      source: {
        datasetVersionId: versionId,
        recipeMap: type,
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function convertAdAstraAlloyRecipe(entry) {
  const raw = entry.json;
  if (!Array.isArray(raw.ingredients)) return { reason: "unsupported Ad Astra alloy recipe" };
  const inputs = raw.ingredients.map(convertCraftingIngredient);
  const output = convertSimpleItemResult({ item: raw.result?.id, count: raw.result?.count });
  if (
    inputs.some((input) => !input || input.id.startsWith("#")) ||
    !output ||
    !Number.isSafeInteger(raw.cookingtime) ||
    raw.cookingtime <= 0 ||
    !Number.isFinite(raw.energy) ||
    raw.energy < 0
  )
    return { reason: "unsupported Ad Astra alloy recipe" };
  return {
    recipe: {
      id: entry.id,
      name: `${output.displayName} (Ad Astra Alloying)`,
      kind: "custom",
      category: "alloying",
      machineType: "Ad Astra Alloying",
      minimumTier: "NONE",
      durationTicks: raw.cookingtime,
      eut: 0,
      inputs,
      outputs: [output],
      metadata: { energyUnit: "FE", baseEnergyPerTick: raw.energy },
      source: {
        datasetVersionId: versionId,
        recipeMap: "ad_astra:alloying",
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function convertAdAstraFluidRecipe(entry, type) {
  const raw = entry.json;
  const ingredient = raw.input?.ingredient;
  const input = convertNuclearCraftFluid(
    { tag: ingredient?.tag, amount: raw.input?.millibuckets },
    true,
  );
  const output = convertNuclearCraftFluid(
    { fluid: raw.result?.fluid, amount: raw.result?.millibuckets },
    false,
  );
  if (
    !input ||
    !output ||
    !Number.isSafeInteger(raw.cookingtime) ||
    raw.cookingtime <= 0 ||
    !Number.isFinite(raw.energy) ||
    raw.energy < 0
  )
    return { reason: "unsupported Ad Astra fluid recipe" };
  const machineType = type === "ad_astra:refining" ? "Ad Astra Refinery" : "Ad Astra Oxygen Loader";
  return {
    recipe: {
      id: entry.id,
      name: `${output.displayName} (${machineType})`,
      kind: "custom",
      category: type.split(":")[1],
      machineType,
      minimumTier: "NONE",
      durationTicks: raw.cookingtime,
      eut: 0,
      inputs: [input],
      outputs: [output],
      metadata: { energyUnit: "FE", baseEnergyPerTick: raw.energy },
      source: {
        datasetVersionId: versionId,
        recipeMap: type,
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function convertEnderIoSlicingRecipe(entry) {
  const raw = entry.json;
  if (
    !enderIoSlicerUsage ||
    !Array.isArray(raw.inputs) ||
    !Number.isSafeInteger(raw.energy) ||
    raw.energy <= 0
  )
    return { reason: "unsupported Ender IO slicing recipe" };
  const inputs = raw.inputs.map(convertCraftingIngredient);
  const output = convertSimpleItemResult(raw.output);
  if (inputs.some((input) => !input || input.id.startsWith("#")) || !output)
    return { reason: "unsupported Ender IO slicing recipe" };
  return {
    recipe: {
      id: entry.id,
      name: `${output.displayName} (Ender IO Slicer)`,
      kind: "custom",
      category: "slicing",
      machineType: "Ender IO Slicer",
      minimumTier: "NONE",
      durationTicks: Math.ceil(raw.energy / enderIoSlicerUsage),
      eut: 0,
      inputs,
      outputs: [output],
      notes:
        "Base time uses configured slicer energy use. FE power and upgrades are not yet modeled.",
      metadata: { energyUnit: "uI", energyCost: raw.energy, baseEnergyPerTick: enderIoSlicerUsage },
      source: {
        datasetVersionId: versionId,
        recipeMap: "enderio:slicing",
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function convertSysTeamsBoilingRecipe(entry) {
  const raw = entry.json;
  const input = convertThermalResource(raw.input ?? raw.ingredient, true);
  const output = convertThermalResource(raw.result ?? raw.output, false);
  if (!input || !output) return { reason: "unsupported SysTeams boiling recipe" };
  return unknownRateRecipe(entry, "systeams:boiling", "SysTeams Boiler", [input], [output]);
}

function convertSysTeamsSteamRecipe(entry) {
  const raw = entry.json;
  const input = convertThermalResource(raw.ingredient ?? raw.input, true);
  if (!input || !Number.isSafeInteger(raw.energy) || raw.energy <= 0)
    return { reason: "unsupported SysTeams steam recipe" };
  const converted = unknownRateRecipe(entry, "systeams:steam", "SysTeams Steam Fuel", [input], []);
  converted.recipe.metadata.energyYield = raw.energy;
  converted.recipe.notes = "Steam fuel energy is exported, but its consumption rate is unknown.";
  return converted;
}

function convertEnderIoTankRecipe(entry) {
  const raw = entry.json;
  const itemInput = convertCraftingIngredient(raw.input);
  const itemOutput = convertSimpleItemResult(raw.output);
  const fluid = convertThermalResource(raw.fluid, true);
  if (
    !itemInput ||
    itemInput.id.startsWith("#") ||
    !itemOutput ||
    !fluid ||
    fluid.kind !== "fluid" ||
    typeof raw.is_emptying !== "boolean"
  )
    return { reason: "unsupported Ender IO tank recipe" };
  return {
    recipe: {
      id: entry.id,
      name: `${itemOutput.displayName} (Ender IO Tank)`,
      kind: "custom",
      category: "tank",
      machineType: "Ender IO Tank",
      minimumTier: "NONE",
      durationTicks: 1,
      eut: 0,
      inputs: raw.is_emptying ? [itemInput] : [itemInput, fluid],
      outputs: raw.is_emptying ? [itemOutput, fluid] : [itemOutput],
      source: {
        datasetVersionId: versionId,
        recipeMap: "enderio:tank",
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function unknownRateRecipe(entry, type, machineType, inputs, outputs) {
  return {
    recipe: {
      id: entry.id,
      name: `${outputs[0]?.displayName ?? inputs[0]?.displayName ?? machineType} (${machineType})`,
      kind: "custom",
      category: type.split(":")[1],
      machineType,
      minimumTier: "NONE",
      durationTicks: 1,
      eut: 0,
      inputs,
      outputs,
      notes: "Rate unknown: the exported recipe has no processing time or power cost.",
      metadata: { rateUnknown: true },
      source: {
        datasetVersionId: versionId,
        recipeMap: type,
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function convertAe2InscriberRecipe(entry) {
  const raw = entry.json;
  if (!raw?.ingredients || !["inscribe", "press"].includes(raw.mode))
    return { reason: "unsupported AE2 inscriber recipe" };
  const inputs = [];
  for (const slot of ["middle", "top", "bottom"]) {
    if (!raw.ingredients[slot]) continue;
    const input = convertCraftingIngredient(raw.ingredients[slot]);
    if (!input || input.id.startsWith("#")) return { reason: "unsupported AE2 inscriber recipe" };
    if (raw.mode === "inscribe" && slot !== "middle") input.consumed = false;
    inputs.push(input);
  }
  const output = convertSimpleItemResult(raw.result);
  if (!inputs.length || !output) return { reason: "unsupported AE2 inscriber recipe" };
  return unknownRateRecipe(entry, "ae2:inscriber", "AE2 Inscriber", inputs, [output]);
}

function convertSimpleUnknownRateRecipe(entry, type, machineType) {
  const input = convertCraftingIngredient(entry.json?.ingredient);
  const output = convertSimpleItemResult(entry.json?.result);
  if (!input || input.id.startsWith("#") || !output)
    return { reason: "unsupported rate-unknown recipe" };
  return unknownRateRecipe(entry, type, machineType, [input], [output]);
}

function convertAe2TransformRecipe(entry) {
  const raw = entry.json;
  if (!Array.isArray(raw?.ingredients) || !raw.circumstance)
    return { reason: "unsupported AE2 transform recipe" };
  const inputs = raw.ingredients.map(convertCraftingIngredient);
  const output = convertSimpleItemResult(raw.result);
  if (inputs.some((input) => !input || input.id.startsWith("#")) || !output)
    return { reason: "unsupported AE2 transform recipe" };
  if (raw.circumstance.type === "fluid") {
    const fluid = convertNuclearCraftFluid({ tag: raw.circumstance.tag, amount: 1 }, true);
    if (!fluid) return { reason: "unsupported AE2 transform recipe" };
    fluid.consumed = false;
    inputs.push(fluid);
  } else if (raw.circumstance.type !== "explosion") {
    return { reason: "unsupported AE2 transform recipe" };
  }
  const converted = unknownRateRecipe(entry, "ae2:transform", "AE2 Transform", inputs, [output]);
  converted.recipe.metadata.circumstance = raw.circumstance.type;
  return converted;
}

function convertBoilerFuelRecipe(entry, type) {
  const raw = entry.json;
  if (!Number.isSafeInteger(raw?.duration) || raw.duration <= 0)
    return { reason: "unsupported boiler fuel" };
  const inputs = convertSide(raw.inputs, "input");
  if (!inputs?.length || raw.outputs || raw.tickInputs || raw.tickOutputs)
    return { reason: "unsupported boiler fuel" };
  const machineType = type === "gtceu:large_boiler" ? "Large Boiler" : "Steam Boiler";
  return {
    recipe: {
      id: entry.id,
      name: `${inputs[0].displayName} fuel (${machineType})`,
      kind: "custom",
      category: "fuel",
      machineType,
      minimumTier: "NONE",
      durationTicks: raw.duration,
      eut: 0,
      inputs,
      outputs: [],
      notes:
        "Fuel burn time is exported. Steam output depends on the boiler and is not available in this recipe.",
      metadata: { rateUnknown: true, fuelBurnTicks: raw.duration },
      source: {
        datasetVersionId: versionId,
        recipeMap: type,
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function convertFramingSawRecipe(entry) {
  const raw = entry.json;
  if (
    !Number.isSafeInteger(raw?.material) ||
    raw.material <= 0 ||
    !Array.isArray(raw.additives ?? [])
  )
    return { reason: "unsupported framing saw recipe" };
  const additives = (raw.additives ?? []).map((slot) => {
    const input = convertCraftingIngredient(slot.ingredient);
    if (input) input.amount = slot.count ?? 1;
    return input;
  });
  const output = convertSimpleItemResult(raw.result);
  if (additives.some((input) => !input || input.id.startsWith("#")) || !output)
    return { reason: "unsupported framing saw recipe" };
  const material = {
    kind: "item",
    id: "factory-flow:unspecified-framing-material",
    amount: raw.material,
    displayName: "Unspecified framing material",
    tooltip: ["Material amount is in FramedBlocks saw units; the source item was not exported."],
  };
  const converted = unknownRateRecipe(
    entry,
    "framedblocks:frame",
    "Framing Saw",
    [material, ...additives],
    [output],
  );
  converted.recipe.metadata.materialUnits = raw.material;
  converted.recipe.notes =
    "Material amount is exported in saw units, but the material item and processing rate are unknown.";
  return converted;
}

function convertThermalFuelRecipe(entry, type) {
  const raw = entry.json;
  if (!Number.isSafeInteger(raw?.energy) || raw.energy <= 0)
    return { reason: "unsupported Thermal fuel" };
  const ingredients = raw.ingredients ?? [raw.ingredient];
  if (!Array.isArray(ingredients) || !ingredients.length)
    return { reason: "unsupported Thermal fuel" };
  const inputs = ingredients.map((value) => convertThermalResource(value, true));
  if (inputs.some((input) => !input)) return { reason: "unsupported Thermal fuel" };
  const machineType = `Thermal ${humanize(type.split(":")[1].replace(/_fuel$/, ""))} Fuel`;
  const converted = unknownRateRecipe(entry, type, machineType, inputs, []);
  converted.recipe.name = `${inputs[0].displayName} (${machineType})`;
  converted.recipe.notes = "Energy yield is exported; burn rate and machine behavior are not.";
  converted.recipe.metadata.energyUnit = "RF";
  converted.recipe.metadata.energyYield = raw.energy;
  return converted;
}

function convertChromaticStateRecipe(entry, type) {
  const raw = entry.json;
  const chroma = raw?.inputs?.Chroma;
  if (
    !Number.isSafeInteger(raw?.duration) ||
    raw.duration <= 0 ||
    !Array.isArray(chroma) ||
    chroma.length !== 1 ||
    !Number.isFinite(chroma[0].content) ||
    chroma[0].content <= 0
  )
    return { reason: "unsupported chromatic state recipe" };
  const side = { ...raw.inputs };
  delete side.Chroma;
  const inputs = convertSide(side, "input");
  const outputs = convertSide(raw.outputs, "output");
  if (!inputs || !outputs) return { reason: "unsupported chromatic state recipe" };
  const machineType = humanize(type.split(":")[1]);
  const eut = raw.tickInputs?.eu?.[0]?.content ?? 0;
  if (
    !Number.isFinite(eut) ||
    eut < 0 ||
    Object.keys(raw.tickInputs ?? {}).some((key) => key !== "eu")
  )
    return { reason: "unsupported chromatic state recipe" };
  return {
    recipe: {
      id: entry.id,
      name: `${machineType} state change`,
      kind: "custom",
      category: type,
      machineType,
      minimumTier: tierForEU(eut),
      durationTicks: raw.duration,
      eut,
      inputs,
      outputs,
      notes:
        "This operation changes chromatic state. The export has no material output to connect to a production chain.",
      metadata: { rateUnknown: true, chromaCost: chroma[0].content, stateData: raw.data ?? {} },
      source: {
        datasetVersionId: versionId,
        recipeMap: type,
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function convertGtmGeneratorRecipe(entry, type) {
  const raw = entry.json;
  if (
    !Number.isSafeInteger(raw.duration) ||
    raw.duration <= 0 ||
    Object.keys(raw.tickOutputs ?? {}).some((key) => key !== "eu") ||
    Object.keys(raw.tickInputs ?? {}).some((key) => key !== "eu") ||
    raw.tickOutputs.eu.length !== 1
  )
    return { reason: "unsupported GTM generator" };
  const powerGenerationEUt = raw.tickOutputs.eu[0].content;
  if (!Number.isFinite(powerGenerationEUt) || powerGenerationEUt <= 0)
    return { reason: "unsupported GTM generator" };
  const inputs = convertSide(raw.inputs, "input");
  const outputs = convertSide(raw.outputs, "output");
  if (!inputs || !outputs) return { reason: "unsupported GTM generator" };
  const machineType = humanize(type.split(":")[1]);
  return {
    recipe: {
      id: entry.id,
      name: `${inputs[0]?.displayName ?? machineType} (${machineType})`,
      kind: "custom",
      category: "generation",
      machineType,
      minimumTier: "NONE",
      durationTicks: raw.duration,
      eut: 0,
      inputs,
      outputs,
      notes:
        "The export gives fuel inputs, duration, and EU per tick. Generator efficiency and machine behavior are not modeled.",
      metadata: {
        planningUnavailable: true,
        planningUnavailableReason: "Generator data",
        powerGenerationEUt,
        totalGeneratedEU: powerGenerationEUt * raw.duration,
      },
      source: {
        datasetVersionId: versionId,
        recipeMap: type,
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function convertNuclearCraftProcessor(entry, type) {
  const machine = type.split(":")[1];
  const processor = nuclearCraftProcessors.get(machine);
  const raw = entry.json;
  if (
    !raw ||
    ["input", "output", "inputFluids", "outputFluids"].some(
      (key) => raw[key] !== undefined && !Array.isArray(raw[key]),
    ) ||
    Object.keys(raw).some(
      (key) =>
        ![
          "type",
          "input",
          "output",
          "inputFluids",
          "outputFluids",
          "powerModifier",
          "timeModifier",
          "radiation",
          "conditions",
        ].includes(key),
    ) ||
    typeof raw.timeModifier !== "number" ||
    raw.timeModifier <= 0 ||
    typeof raw.powerModifier !== "number" ||
    raw.powerModifier <= 0
  ) {
    return { reason: "unsupported NuclearCraft processor recipe" };
  }
  const inputs = (raw.input ?? []).map((ingredient) => {
    const input = convertCraftingIngredient(
      ingredient.item || ingredient.tag
        ? { item: ingredient.item, tag: ingredient.tag }
        : ingredient,
    );
    if (input) input.amount = ingredient.count ?? 1;
    return input;
  });
  const outputs = (raw.output ?? []).map((rawOutput) => {
    const outputTagMembers = rawOutput.tag && itemTags.get(rawOutput.tag);
    return convertSimpleItemResult(
      outputTagMembers?.length === 1
        ? { item: outputTagMembers[0], count: rawOutput.count }
        : rawOutput,
    );
  });
  inputs.push(...(raw.inputFluids ?? []).map((value) => convertNuclearCraftFluid(value, true)));
  outputs.push(...(raw.outputFluids ?? []).map((value) => convertNuclearCraftFluid(value, false)));
  if (
    inputs.length === 0 ||
    outputs.length === 0 ||
    inputs.some(
      (input) =>
        !input ||
        input.id.startsWith("#") ||
        !Number.isSafeInteger(input.amount) ||
        input.amount <= 0,
    ) ||
    outputs.some((output) => !output)
  ) {
    return { reason: "unsupported NuclearCraft processor recipe" };
  }
  const machineType = `NuclearCraft ${humanize(machine)}`;
  return {
    recipe: {
      id: entry.id,
      name: `${outputs[0].displayName} (${machineType})`,
      kind: "custom",
      category: machine,
      machineType,
      minimumTier: "NONE",
      durationTicks: Math.ceil(processor.baseTime * raw.timeModifier),
      eut: 0,
      inputs,
      outputs,
      notes:
        "Base time uses the pack's NuclearCraft processor config. FE power and upgrades are not yet modeled.",
      metadata: {
        energyUnit: "FE",
        baseEnergyPerTick: processor.basePower * raw.powerModifier,
        ...(raw.radiation !== undefined ? { radiation: raw.radiation } : {}),
      },
      source: {
        datasetVersionId: versionId,
        recipeMap: type,
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function convertNuclearCraftFluid(value, input) {
  if (
    !value ||
    Object.keys(value).some((key) => !["fluid", "tag", "amount"].includes(key)) ||
    !Number.isSafeInteger(value.amount) ||
    value.amount <= 0
  ) {
    return null;
  }
  const members = value.tag && fluidTags.get(value.tag);
  const id =
    value.fluid ??
    (members?.length === 1 ? members[0] : input && members?.length ? `#${value.tag}` : undefined);
  if (typeof id !== "string" || !id.includes(":")) return null;
  return {
    kind: "fluid",
    id,
    amount: value.amount,
    displayName: humanize(id.split(":").pop()),
    ...(id.startsWith("#")
      ? {
          alternatives: members.map((fluidId) => ({
            kind: "fluid",
            id: fluidId,
            displayName: humanize(fluidId.split(":").pop()),
          })),
        }
      : {}),
  };
}

function convertSmithingRecipe(entry) {
  const raw = entry.json;
  const inputs = [raw.template, raw.base, raw.addition].map(convertCraftingIngredient);
  const output = convertSimpleItemResult(raw.result);
  if (inputs.some((input) => !input || input.id.startsWith("#")) || !output) {
    return { reason: "unsupported smithing recipe" };
  }
  return {
    recipe: {
      id: entry.id,
      name: `Smithing Table: ${output.displayName}`,
      kind: "custom",
      category: "crafting",
      machineType: "Smithing Table",
      minimumTier: "NONE",
      durationTicks: 1,
      eut: 0,
      inputs,
      outputs: [output],
      source: {
        datasetVersionId: versionId,
        recipeMap: "Smithing Table",
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function convertEnderIoSagRecipe(entry) {
  if (!enderIoSagUsage) return { reason: "missing Ender IO machine config" };
  const raw = entry.json;
  const input = convertCraftingIngredient(raw.input);
  if (
    !Number.isSafeInteger(raw.energy) ||
    raw.energy <= 0 ||
    !input ||
    input.id.startsWith("#") ||
    !Array.isArray(raw.outputs) ||
    raw.outputs.length === 0
  ) {
    return { reason: "unsupported Ender IO SAG recipe" };
  }
  const outputs = [];
  for (const slot of raw.outputs) {
    const output = convertSimpleItemResult(slot.item);
    if (!output || typeof slot.chance !== "number" || slot.chance < 0 || slot.chance > 1) {
      return { reason: "unsupported Ender IO SAG recipe" };
    }
    if (slot.chance !== 1) output.chance = slot.chance;
    outputs.push(output);
  }
  return {
    recipe: {
      id: entry.id,
      name: `${outputs[0].displayName} (Ender IO SAG Mill)`,
      kind: "custom",
      category: "sag_milling",
      machineType: "Ender IO SAG Mill",
      minimumTier: "NONE",
      durationTicks: Math.ceil(raw.energy / enderIoSagUsage),
      eut: 0,
      inputs: [input],
      outputs,
      notes:
        "Base time estimated from Ender IO energy cost and configured usage. uI power, capacitors, and grinding ball effects are not yet modeled.",
      metadata: {
        energyUnit: "uI",
        energyCost: raw.energy,
        baseEnergyPerTick: enderIoSagUsage,
        ...(raw.bonus ? { grindingBallBonus: raw.bonus } : {}),
      },
      source: {
        datasetVersionId: versionId,
        recipeMap: "enderio:sag_milling",
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function convertEnderIoAlloyRecipe(entry) {
  if (!enderIoAlloyUsage) return { reason: "missing Ender IO machine config" };
  const raw = entry.json;
  if (!Number.isSafeInteger(raw.energy) || raw.energy <= 0 || !Array.isArray(raw.inputs)) {
    return { reason: "unsupported Ender IO alloy recipe" };
  }
  const inputs = [];
  for (const slot of raw.inputs) {
    if (!Number.isSafeInteger(slot.count) || slot.count <= 0) {
      return { reason: "unsupported Ender IO alloy recipe" };
    }
    const input = convertCraftingIngredient(slot.ingredient);
    if (!input || input.id.startsWith("#")) {
      return { reason: "unsupported Ender IO alloy recipe" };
    }
    input.amount = slot.count;
    inputs.push(input);
  }
  const output = convertSimpleItemResult(raw.result);
  if (!inputs.length || !output) return { reason: "unsupported Ender IO alloy recipe" };
  return {
    recipe: {
      id: entry.id,
      name: `${output.displayName} (Ender IO Alloy Smelter)`,
      kind: "custom",
      category: "alloy_smelting",
      machineType: "Ender IO Alloy Smelter",
      minimumTier: "NONE",
      durationTicks: Math.ceil(raw.energy / enderIoAlloyUsage),
      eut: 0,
      inputs,
      outputs: [output],
      notes:
        "Base time estimated from Ender IO energy cost and configured usage. uI power and capacitor effects are not yet modeled.",
      metadata: {
        energyUnit: "uI",
        energyCost: raw.energy,
        baseEnergyPerTick: enderIoAlloyUsage,
      },
      source: {
        datasetVersionId: versionId,
        recipeMap: "enderio:alloy_smelting",
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function isSimpleCraftingType(type) {
  return [
    "minecraft:crafting_shaped",
    "minecraft:crafting_shapeless",
    "kubejs:shaped",
    "kubejs:shapeless",
    "gtceu:crafting_shaped_strict",
    "gtceu:crafting_shaped_energy_transfer",
    "gtceu:shaped",
    "extendedcrafting:shaped_table",
    "sophisticatedcore:upgrade_next_tier",
    "sophisticatedstorage:shulker_box_from_vanilla_shapeless",
    "sophisticatedstorage:storage_tier_upgrade",
    "sophisticatedbackpacks:backpack_upgrade",
    "ad_astra:nasa_workbench",
    "systeams:upgrade_shapeless",
    "sophisticatedstorage:generic_wood_storage",
  ].includes(type);
}

function convertCraftingRecipe(entry, type) {
  const raw = entry.json;
  const shaped = !type.endsWith("shapeless") && type !== "ad_astra:nasa_workbench";
  const ingredients = [];
  if (shaped) {
    if (!Array.isArray(raw.pattern) || !raw.key || typeof raw.key !== "object") {
      return { reason: "unsupported crafting pattern" };
    }
    for (const row of raw.pattern) {
      if (typeof row !== "string") return { reason: "unsupported crafting pattern" };
      for (const symbol of row) {
        if (symbol === " ") continue;
        ingredients.push(raw.key[symbol]);
      }
    }
  } else {
    if (!Array.isArray(raw.ingredients)) return { reason: "unsupported crafting ingredients" };
    ingredients.push(...raw.ingredients);
  }
  const inputs = new Map();
  for (const ingredient of ingredients) {
    const input = convertCraftingIngredient(ingredient);
    if (!input) return { reason: "unsupported crafting ingredients" };
    const key = `${input.id}:${input.consumed !== false}`;
    const existing = inputs.get(key);
    if (existing) existing.amount += input.amount;
    else inputs.set(key, input);
  }
  const output = convertSimpleItemResult(
    raw.result?.id ? { item: raw.result.id, count: raw.result.count } : raw.result,
  );
  if (!output) {
    return { reason: "unsupported crafting result" };
  }
  const machineType =
    type === "extendedcrafting:shaped_table"
      ? "Extended Crafting Table"
      : type === "ad_astra:nasa_workbench"
        ? "NASA Workbench"
        : shaped
          ? "Shaped Crafting"
          : "Shapeless Crafting";
  const outputName = output.displayName;
  return {
    recipe: {
      id: entry.id,
      name: `${machineType}: ${outputName}`,
      kind: "gregtech_machine",
      category: "crafting",
      machineType,
      minimumTier: "NONE",
      durationTicks: 1,
      eut: 0,
      inputs: [...inputs.values()],
      outputs:
        type === "systeams:upgrade_shapeless" && typeof raw.replacement === "string"
          ? [output, convertSimpleItemResult(raw.replacement)]
          : [output],
      source: {
        datasetVersionId: versionId,
        recipeMap: machineType,
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function isUtilityRecipeType(type) {
  return [
    "minecraft:stonecutting",
    "minecraft:smelting",
    "minecraft:blasting",
    "minecraft:smoking",
    "minecraft:campfire_cooking",
  ].includes(type);
}

function convertUtilityRecipe(entry, type) {
  const raw = entry.json;
  const input = convertCraftingIngredient(raw.ingredient);
  const output = convertSimpleItemResult(raw.result, raw.count);
  if (!input || !output) return { reason: "unsupported utility recipe" };
  const machineTypes = {
    "minecraft:stonecutting": "Stonecutter",
    "minecraft:smelting": "Furnace",
    "minecraft:blasting": "Blast Furnace",
    "minecraft:smoking": "Smoker",
    "minecraft:campfire_cooking": "Campfire",
  };
  const machineType = machineTypes[type];
  const durationTicks = type === "minecraft:stonecutting" ? 1 : raw.cookingtime;
  if (!Number.isInteger(durationTicks) || durationTicks <= 0) {
    return { reason: "missing utility recipe duration" };
  }
  return {
    recipe: {
      id: entry.id,
      name: `${machineType}: ${output.displayName}`,
      kind: "gregtech_machine",
      category: type === "minecraft:stonecutting" ? "crafting" : "cooking",
      machineType,
      minimumTier: "NONE",
      durationTicks,
      eut: 0,
      inputs: [input],
      outputs: [output],
      source: {
        datasetVersionId: versionId,
        recipeMap: machineType,
        sourceMod: entry.id.split(":")[0],
        exporter: exporterId,
        rawRecipeId: entry.id,
      },
    },
  };
}

function convertSimpleItemResult(result, countOverride) {
  const value = typeof result === "string" ? { item: result } : result;
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).some((key) => key !== "item" && key !== "count" && key !== "nbt")
  )
    return null;
  const count = countOverride ?? value.count ?? 1;
  if (typeof value.item !== "string" || !Number.isInteger(count) || count <= 0) return null;
  const variant = nbtVariant(value.item, value.nbt);
  if (value.nbt !== undefined && !variant) return null;
  return {
    kind: "item",
    id: variant?.id ?? value.item,
    amount: count,
    displayName: humanize(value.item.split(":").pop()),
    ...(variant ? { tooltip: [variant.description] } : {}),
  };
}

function nbtVariant(item, nbt) {
  if (nbt === undefined) return null;
  if (typeof nbt !== "string" && (!nbt || typeof nbt !== "object" || Array.isArray(nbt)))
    return null;
  const canonical = typeof nbt === "string" ? nbt : JSON.stringify(sortObject(nbt));
  const digest = createHash("sha256").update(canonical).digest("hex").slice(0, 16);
  return { id: `${item}@nbt:${digest}`, description: `NBT: ${canonical}` };
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortObject(value[key])]),
    );
  }
  return value;
}

function convertCraftingIngredient(ingredient) {
  if (Array.isArray(ingredient)) {
    const members = new Set();
    for (const option of ingredient) {
      const converted = convertCraftingIngredient(option);
      if (!converted) return null;
      if (converted.id.startsWith("oredict:")) {
        for (const id of itemTags.get(converted.id.slice(8)) ?? []) members.add(id);
      } else if (!converted.id.startsWith("#")) members.add(converted.id);
    }
    if (!members.size) return null;
    const ids = [...members].sort();
    const digest = createHash("sha256").update(ids.join("\n")).digest("hex").slice(0, 16);
    const tag = `factory-flow:alternatives/${digest}`;
    itemTags.set(tag, ids);
    return { kind: "item", id: `oredict:${tag}`, amount: 1, displayName: "Any listed item" };
  }
  if (!ingredient || typeof ingredient !== "object") return null;
  if (Object.keys(ingredient).some((key) => key !== "item" && key !== "tag")) return null;
  const id = ingredient.item ?? tagResourceId(ingredient.tag);
  if (!id || typeof id !== "string") return null;
  return {
    kind: "item",
    id,
    amount: 1,
    displayName: humanize(
      id
        .replace(/^(#|oredict:)/, "")
        .split(":")
        .pop(),
    ),
    ...(ingredient.tag?.includes(":tools/") ? { consumed: false } : {}),
  };
}

function tagResourceId(tag) {
  if (typeof tag !== "string") return undefined;
  return itemTags.get(tag)?.length ? `oredict:${tag}` : `#${tag}`;
}

function convertSide(side = {}, direction) {
  const converted = [];
  for (const kind of ["item", "fluid"]) {
    for (const slot of side[kind] ?? []) {
      const resource = convertSlot(slot, kind, direction);
      if (!resource) return null;
      converted.push(resource);
    }
  }
  // Other GTM capabilities need their own adapters; do not silently drop them.
  if (Object.keys(side).some((key) => key !== "item" && key !== "fluid")) return null;
  return converted;
}

function convertSlot(slot, kind, direction) {
  const content = slot.content;
  if (!content || content.count_provider) return null;
  if (kind === "item" && content.type === "gtceu:circuit" && direction === "input") {
    return circuitInput(content.configuration);
  }
  if (kind === "item" && content.type && content.type !== "gtceu:sized") return null;
  const amount = kind === "item" ? (content.count ?? 1) : content.amount;
  const ingredient = kind === "item" ? (content.ingredient ?? content) : content.value?.[0];
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !ingredient ||
    (kind === "fluid" && content.value.length !== 1)
  )
    return null;
  if (
    kind === "fluid" &&
    direction === "output" &&
    ingredient.tag &&
    fluidTags.get(ingredient.tag)?.length > 1
  )
    return null;
  if (kind === "item" && ingredient.type === "gtceu:circuit" && direction === "input") {
    return circuitInput(ingredient.configuration);
  }
  const nbtType = kind === "item" && ["forge:nbt", "forge:partial_nbt"].includes(ingredient.type);
  if (nbtType) {
    if (
      typeof ingredient.item !== "string" ||
      ingredient.nbt === undefined ||
      Object.keys(ingredient).some((key) => !["type", "item", "count", "nbt"].includes(key))
    )
      return null;
  }
  if (
    !nbtType &&
    Object.keys(ingredient).some(
      (key) => key !== "item" && key !== "fluid" && key !== "tag" && key !== "count",
    )
  )
    return null;
  if (
    !nbtType &&
    ingredient.count !== undefined &&
    ingredient.count !== 1 &&
    ingredient.count !== amount
  )
    return null;
  const baseId =
    ingredient.item ??
    ingredient.fluid ??
    (kind === "item"
      ? tagResourceId(ingredient.tag)
      : ingredient.tag &&
        (fluidTags.get(ingredient.tag)?.length === 1
          ? fluidTags.get(ingredient.tag)[0]
          : `#${ingredient.tag}`));
  if (!baseId || typeof baseId !== "string") return null;
  const variant = nbtType ? nbtVariant(baseId, ingredient.nbt) : null;
  if (nbtType && !variant) return null;
  const id = variant?.id ?? baseId;
  const chance = slot.chance === undefined ? 1 : slot.chance / (slot.maxChance ?? 10000);
  if (!Number.isFinite(chance) || chance < 0 || chance > 1) return null;
  if (direction === "input" && chance !== 0 && chance !== 1) return null;
  return {
    kind,
    id,
    amount,
    displayName: humanize(baseId.replace(/^#/, "").split(":").pop()),
    ...(variant ? { tooltip: [`${ingredient.type}: ${variant.description}`] } : {}),
    ...(kind === "fluid" &&
    direction === "input" &&
    ingredient.tag &&
    fluidTags.get(ingredient.tag)?.length > 1
      ? {
          alternatives: fluidTags.get(ingredient.tag).map((fluidId) => ({
            kind: "fluid",
            id: fluidId,
            displayName: humanize(fluidId.split(":").pop()),
          })),
        }
      : {}),
    ...(direction === "input" && chance === 0 ? { consumed: false } : {}),
    ...(direction === "output" && chance !== 1 ? { chance } : {}),
  };
}

function circuitInput(configuration) {
  if (!Number.isInteger(configuration) || configuration < 0 || configuration > 32) return null;
  return {
    kind: "item",
    id: `factory-flow:gtceu-circuit-configuration-${configuration}`,
    amount: 1,
    displayName: `Programmed Circuit (${configuration})`,
    consumed: false,
  };
}

function tierForEU(eut) {
  const tiers = [
    "ULV",
    "LV",
    "MV",
    "HV",
    "EV",
    "IV",
    "LuV",
    "ZPM",
    "UV",
    "UHV",
    "UEV",
    "UIV",
    "UMV",
    "UXV",
    "MAX",
  ];
  let limit = 8;
  for (const tier of tiers) {
    if (eut <= limit) return tier;
    limit *= 4;
  }
  return "MAX";
}

function humanize(id) {
  return String(id ?? "Unknown")
    .replace(/[_/-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
