# Multi-pack dataset contract

Factory Flow can describe more than one modpack in a single dataset manifest. This is
the first integration boundary for Monifactory and later packs such as Star Technology.
The GTNH exporter and its existing manifests continue to work unchanged.

Each `versions` entry has a globally unique `id` and identifies the pack separately
from the dataset channel:

```json
{
  "id": "monifactory-normal-1.2.0",
  "pack": {
    "id": "monifactory",
    "name": "Monifactory",
    "version": "1.2.0",
    "mode": "Normal"
  },
  "channel": "stable",
  "publishedAt": "2026-10-15T00:00:00.000Z",
  "manifestPath": "/datasets/factory/datasets.manifest.json",
  "recipeDatasetPath": "/datasets/monifactory/normal-1.2.0/recipes.json.gz",
  "resourceIndexPath": "/datasets/monifactory/normal-1.2.0/resource-index.json.gz",
  "recipeIndexPath": "/datasets/monifactory/normal-1.2.0/recipe-index.json.gz",
  "recipeLookupIndexPath": "/datasets/monifactory/normal-1.2.0/recipe-lookup-index.json.gz",
  "sourceInfo": {
    "sourceId": "kubejs-exporter",
    "generatedAt": "2026-10-15T00:00:00.000Z"
  }
}
```

The catalog returned to the browser carries the same `pack` object. Existing GTNH
entries without `pack` use their `gtnhVersion` as a legacy fallback. New exporters
should write `pack` to both the manifest entry and normalized dataset. Include the
pack version, mode, and any compatibility profile in the identity so recipes from
different configurations cannot silently share a plan's dataset ID.

Set `NEXT_PUBLIC_FACTORY_DATASET_MANIFEST_URL` to the combined manifest URL and
`FACTORY_DATASET_ROOT` to its local directory on the server. If those variables
are absent, the existing GTNH paths continue to be used. Dataset index paths in
each manifest entry are resolved from the public directory, so pack datasets can
live in separate `/datasets/<pack-id>/` folders.

## Monifactory status

The [KubeJS exporter](../tools/monifactory/README.md) reads recipes at the end of
the `ServerEvents.recipes` event. A local Monifactory 0.13.7 Normal run exported
70,463 recipes in 237 files and resolved 4,932 nonempty item tags. The browser
indexes contain 69,221 GTM, Ender IO, NuclearCraft, Thermal, Ad Astra, AE2, SysTeams, crafting, stonecutting, and cooking
recipes. The dataset is generated locally and ignored by Git.

NBT variants and alternative ingredients are represented. Recipes without enough timing data appear in search with a rate unknown label and cannot be added to a plan. The remaining gaps are mostly NuclearCraft recipes whose runtime fluid tags have no members, plus dynamic and special recipes. Common GTM electric singleblock maps now have a separate standard overclock calculation. Other Monifactory machines still need their own profiles before solver results are reliable; the remaining parallel and power rules belong to GTNH.

[GTM's KubeJS recipe documentation](https://github.com/GregTechCEu/GregTech-Modern/blob/1.20.1/docs/content/Modpacks/Recipes/Adding-and-Removing-Recipes.md)
and [recipe lookup documentation](https://github.com/GregTechCEu/GregTech-Modern/blob/1.20.1/docs/content/Development/Recipe-Logic/Recipe-Searching.md)
provide upstream context. [Monifactory's mode switcher](https://github.com/Omicron-Industries/Monifactory/blob/main/pack-mode-switcher.bat)
identifies Normal, Hard, and Expert as distinct configurations.
