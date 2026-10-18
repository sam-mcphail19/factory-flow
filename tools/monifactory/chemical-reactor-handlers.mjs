// Only advertise the LCR when the runtime export includes the same recipe in
// its large reactor map. Pack scripts can remove or alter copied recipes.
export function attachChemicalReactorHandlers(recipes) {
  const large = new Set(
    recipes
      .filter((recipe) => recipe.source?.recipeMap === "gtceu:large_chemical_reactor")
      .map(recipeSignature),
  );
  let compatible = 0;
  for (const recipe of recipes) {
    const map = recipe.source?.recipeMap;
    if (map !== "gtceu:chemical_reactor" && map !== "gtceu:large_chemical_reactor") continue;
    const lcr = {
      id: "large-chemical-reactor",
      label: "Large Chemical Reactor",
      machineType: "Large Chemical Reactor",
      minimumTier: recipe.minimumTier,
      kind: "multiblock",
      perfectOverclock: true,
    };
    if (map === "gtceu:large_chemical_reactor") {
      recipe.machineHandlers = [lcr];
    } else if (large.has(recipeSignature(recipe))) {
      recipe.machineHandlers = [
        {
          id: "chemical-reactor",
          label: "Chemical Reactor",
          machineType: "Chemical Reactor",
          minimumTier: recipe.minimumTier,
          kind: "single",
        },
        lcr,
      ];
      compatible += 1;
    }
  }
  return compatible;
}

function recipeSignature(recipe) {
  return JSON.stringify([recipe.inputs, recipe.outputs, recipe.durationTicks, recipe.eut]);
}
