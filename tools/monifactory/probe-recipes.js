// priority: -10000
// Copy into kubejs/server_scripts, then load a world or run /reload.
// Read the [Factory Flow probe] lines in logs/kubejs/server.log.

ServerEvents.recipes((event) => {
  const counts = {};
  const samples = [];
  let originalCount = 0;

  // The pack's lowest recipe-script priority is -9999, so this observes its edits.
  event.forEachRecipe("*", (recipe) => {
    const type = String(recipe.getType());
    counts[type] = (counts[type] || 0) + 1;
    originalCount += 1;

    if (type.startsWith("gtceu:") && samples.length < 2) {
      samples.push({
        id: String(recipe.getId()),
        type: type,
        json: String(recipe.json),
      });
    }
  });

  const gtTypes = Object.keys(counts).filter((type) => type.startsWith("gtceu:"));
  const gtRecipes = gtTypes.reduce((sum, type) => sum + counts[type], 0);
  console.info(
    `[Factory Flow probe] originals=${originalCount}, added=${event.addedRecipes.size()}, GTM originals=${gtRecipes}, GTM types=${gtTypes.length}`,
  );
  console.info(`[Factory Flow probe] GTM sample=${JSON.stringify(samples)}`);
  console.info(`[Factory Flow probe] recipe counts=${JSON.stringify(counts)}`);
});
