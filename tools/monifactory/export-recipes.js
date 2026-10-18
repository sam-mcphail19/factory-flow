// priority: -10000
// Install in kubejs/server_scripts. A world load or /reload writes one JSON
// file per recipe type and the used item tags to kubejs/config/.

ServerEvents.recipes((event) => {
  const recipesByType = {};
  const usedTags = {};
  let skipped = 0;

  function collect(recipe, source) {
    const type = String(recipe.getType());
    if (recipe.json == null) {
      skipped += 1;
      return;
    }

    let json;
    try {
      json = JSON.parse(String(recipe.json));
    } catch (error) {
      skipped += 1;
      return;
    }
    collectTags(json);
    const recipes = recipesByType[type] || (recipesByType[type] = {});
    const id = String(recipe.getOrCreateId());
    recipes[id] = { id: id, source: source, json: json };
  }

  function collectTags(value) {
    if (!value || typeof value !== "object") return;
    if (typeof value.tag === "string") usedTags[value.tag] = true;
    Object.keys(value).forEach((key) => collectTags(value[key]));
  }

  event.forEachRecipe("*", (recipe) => collect(recipe, "existing"));
  event.addedRecipes.forEach((recipe) => collect(recipe, "kubejs"));

  const files = [];
  let exported = 0;
  Object.keys(recipesByType)
    .sort()
    .forEach((type) => {
      const file = "factory-flow-recipe-" + String(files.length).padStart(3, "0") + ".json";
      const recipes = Object.values(recipesByType[type]);
      JsonIO.write("kubejs/config/" + file, {
        format: "factory-flow-raw-v2",
        type: type,
        recipes: recipes,
      });
      files.push({ type: type, file: file, count: recipes.length });
      exported += recipes.length;
    });

  const tags = {};
  const failedTags = [];
  const tagErrors = [];
  var tagMemberCount = 0;
  var nonemptyTagCount = 0;
  Object.keys(usedTags)
    .sort()
    .forEach((tag) => {
      try {
        var tagMembers = [];
        var tagStacks = Ingredient.of("#" + tag).stacks;
        tagStacks.forEach((stack) => {
          var tagItemId = String(Item.of(stack).idLocation);
          if (tagMembers.indexOf(tagItemId) < 0) tagMembers.push(tagItemId);
        });
        tags[tag] = tagMembers.sort();
        tagMemberCount += tagMembers.length;
        if (tagMembers.length > 0) nonemptyTagCount += 1;
      } catch (error) {
        failedTags.push(tag);
        if (tagErrors.length < 3) tagErrors.push({ tag: tag, message: String(error) });
      }
    });
  JsonIO.write("kubejs/config/factory-flow-item-tags.json", {
    format: "factory-flow-item-tags-v1",
    tags: tags,
  });

  JsonIO.write("kubejs/config/factory-flow-recipes-manifest.json", {
    format: "factory-flow-raw-v2",
    files: files,
    itemTagsFile: "factory-flow-item-tags.json",
    skipped: skipped,
    failedTags: failedTags,
    tagErrors: tagErrors,
    tagMemberCount: tagMemberCount,
    nonemptyTagCount: nonemptyTagCount,
  });
  console.info(
    `[Factory Flow export] wrote ${exported} recipes in ${files.length} files and ${nonemptyTagCount}/${Object.keys(tags).length} nonempty item tags (${tagMemberCount} memberships); skipped ${skipped} without JSON and ${failedTags.length} tags`,
  );
});
