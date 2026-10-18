# Monifactory Planner

This fork adapts GTNH Factory Flow into a recipe browser and production-chain
planner for Monifactory. The exporter and converter collect 69,221 recipes from
a running Monifactory 0.13.7 Normal instance, including GTM, Ender IO,
NuclearCraft, Thermal, Ad Astra, AE2, SysTeams, crafting, stonecutting, and
cooking. Item tags resolve to the pack's actual members.
Common GTM electric singleblocks use GTM's standard overclock rule. Other
Monifactory machines still need validated profiles, so plans are currently for
recipe browsing and layout. See [the dataset contract](docs/MULTIPACK.md).

Search recipes, place machine cards on a board, and connect outputs to inputs.
Plans save in the browser and can be exported as JSON or images.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run test
```

The repository includes the Monifactory 0.13.7 Normal dataset and
`public/datasets/factory/datasets.manifest.json`, so the app is ready after installation.
Follow [the exporter instructions](tools/monifactory/README.md) to rebuild it for a new pack version.
Community features need Supabase; see [docs/COMMUNITY.md](docs/COMMUNITY.md).

## How it fits together

- `tools/monifactory/`: exporters and converters collect recipes and item icons
  from a running Monifactory instance and build the local dataset.
- `tools/dataset-pipeline/`: shared dataset indexing and the original GTNH pipeline.
- `src/lib/`: the domain model, machine math (overclocks, parallels, curated per-machine
  behaviour checked against the mod source) and an LP-based solver.
- `src/components/`, `src/store/`: the Next.js + React Flow UI and Zustand stores.

Working notes for contributors and AI agents are in [AGENTS.md](AGENTS.md) and the
`CLAUDE.md` file in each area's folder.

## License and credits

Code is MIT licensed. The included recipe dataset and item icon sheets come from
Monifactory and its mods; game and mod assets remain under their owners' licenses.

This fork retains the MIT license and copyright from
[jackwrichards/gtnh-factory-flow](https://github.com/jackwrichards/gtnh-factory-flow).
That project started as a fork of
[Samiracle64/gtnh-factory-flow](https://github.com/Samiracle64/gtnh-factory-flow) and has
since diverged into an independent codebase. The original work is MIT licensed and its
copyright is retained in `LICENSE`.
