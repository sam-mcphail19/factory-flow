# Monifactory recipe export

This exporter reads recipes after Monifactory's KubeJS recipe event has applied
pack changes. It was verified with Monifactory 0.13.7, Normal mode, on Minecraft
1.20.1. It writes raw recipes and resolved item tags into the instance's
`kubejs/config` folder; the converter and index builders run from this repository.

1. Copy `export-recipes.js` to the instance's
   `minecraft/kubejs/server_scripts/factory_flow_export.js`.
2. Load a world or run `/reload`. Wait for the export completion message in
   `minecraft/logs/latest.log`.
3. Remove the copied script from `server_scripts` after exporting, so later
   reloads do not repeat the work.
4. Run the commands below from the repository root with a current Node.js release.
   Replace the paths, version, and mode for your instance.

```bash
node tools/monifactory/normalize-recipes.mjs \
  "<instance>/minecraft/kubejs/config/factory-flow-recipes-manifest.json" \
  public/datasets/monifactory/monifactory-normal-0.13.7/recipes.json.gz \
  0.13.7 Normal \
  "<instance>/minecraft/config/enderio/machines-common.toml" \
  "<instance>/minecraft/config/NuclearCraft/processors.toml" \
  "<instance>/minecraft/kubejs/config/factory-flow-fluid-tags.json" \
  "<instance>/minecraft/saves/<world>/serverconfig/thermal-server.toml"
node tools/dataset-pipeline/scripts/build-resource-index.mjs \
  public/datasets/monifactory/monifactory-normal-0.13.7/recipes.json.gz
FACTORY_DATASET_PUBLIC_BASE=/datasets/monifactory \
  node tools/dataset-pipeline/scripts/build-recipe-index.mjs \
  public/datasets/monifactory/monifactory-normal-0.13.7/recipes.json.gz \
  public/datasets/monifactory/monifactory-normal-0.13.7
node tools/monifactory/build-manifest.mjs \
  public/datasets/monifactory/monifactory-normal-0.13.7/recipes.json.gz \
  public/datasets/factory/datasets.manifest.json
```

Set these in `.env.local` before starting the app:

```dotenv
NEXT_PUBLIC_FACTORY_DATASET_MANIFEST_URL=/datasets/factory/datasets.manifest.json
FACTORY_DATASET_ROOT=public/datasets/factory
```

The local dataset files are ignored by Git. A Monifactory 0.13.7 Normal export
contained 70,463 raw entries (70,397 unique recipe IDs); 69,221 are currently normalized. This includes simple
shaped and shapeless crafting, smithing, extended crafting, stonecutting, cooking,
deterministic GTM recipes, supported Ender IO, NuclearCraft, Thermal, Ad Astra, AE2 and SysTeams recipes.
The export resolved 4,932 nonempty item tags, allowing
tagged inputs to connect to concrete items. KubeJS
recipes replace originals with the same recipe ID. NBT variants and ingredient alternatives are retained. Recipes with unknown processing rates appear in search but cannot be added to plans. Some recipes with random amounts or special capabilities remain excluded. Ender IO and NuclearCraft base durations use the pack's machine configs;
capacitor, upgrade, FE, and uI power effects are not modeled. Thermal base durations
use the active world's machine settings; RF power and upgrades are not modeled. The fluid tag export
resolves GTM fluid inputs and outputs and some NuclearCraft recipes. Most missing NuclearCraft recipes reference empty fluid tags in the runtime export. Machine behavior and power calculations remain GTNH specific, so
Monifactory solver results should not be used for production planning yet.

## Item icons

The optional Forge client exporter renders the pack's registered items using the
running game's item renderer. Build it from `tools/monifactory/icon-exporter` with
Java 17 and `gradlew build`. It targets the same Forge 47.4.13 version as the
tested Monifactory instance. Copy the resulting JAR into the client's `mods`
folder, then create its request from the normalized dataset:

```bash
node tools/monifactory/create-icon-request.mjs \
  public/datasets/monifactory/monifactory-normal-0.13.7/recipes.json.gz \
  "<instance>/minecraft/config/factory-flow-icon-request.json"
```

Restart the client and enter a world. The exporter renders 64 items per frame and
writes 512 px image atlases to `minecraft/config/factory-flow-icons`. The log says
`[Factory Flow Icons] Complete` when the manifest is ready, and the request file
is removed. The corner of the game briefly shows the batch being captured. The
exporter can then be removed from `mods`.

Attach the images to the local dataset and rebuild both indexes and its manifest:

```bash
node tools/monifactory/apply-icons.mjs \
  public/datasets/monifactory/monifactory-normal-0.13.7/recipes.json.gz \
  "<instance>/minecraft/config/factory-flow-icons"
node tools/dataset-pipeline/scripts/build-resource-index.mjs \
  public/datasets/monifactory/monifactory-normal-0.13.7/recipes.json.gz
FACTORY_DATASET_PUBLIC_BASE=/datasets/monifactory \
  node tools/dataset-pipeline/scripts/build-recipe-index.mjs \
  public/datasets/monifactory/monifactory-normal-0.13.7/recipes.json.gz \
  public/datasets/monifactory/monifactory-normal-0.13.7
node tools/monifactory/build-manifest.mjs \
  public/datasets/monifactory/monifactory-normal-0.13.7/recipes.json.gz \
  public/datasets/factory/datasets.manifest.json
```

The images stay with the ignored local dataset. Item NBT variants are not yet
rendered separately and keep their fallback initials.
