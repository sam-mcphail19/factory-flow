package com.factoryflow.iconexport;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraftforge.client.event.RenderGuiEvent;
import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.loading.FMLPaths;

import java.io.Reader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

@Mod("factoryflowicons")
public final class FactoryFlowIcons {
    private static final int GRID = 8;
    private static final int GAME_ICON = 16;
    private static final int EXPORT_ICON = 32;
    private static final int ATLAS_GRID = 16;
    private static final int ATLAS_SIZE = EXPORT_ICON * ATLAS_GRID;
    private static final int PER_FRAME = GRID * GRID;
    private static final int PER_ATLAS = ATLAS_GRID * ATLAS_GRID;
    private static final int BACKGROUND = 0xFFFF00FF;

    private final Path requestPath = FMLPaths.GAMEDIR.get().resolve("config/factory-flow-icon-request.json");
    private final Path outputDir = FMLPaths.GAMEDIR.get().resolve("config/factory-flow-icons");
    private final List<String> ids = new ArrayList<>();
    private final JsonObject manifest = new JsonObject();
    private NativeImage atlas;
    private int cursor;
    private boolean initialized;
    private boolean finished;

    public FactoryFlowIcons() {
        MinecraftForge.EVENT_BUS.addListener(this::render);
    }

    private void initialize() {
        initialized = true;
        if (!Files.isRegularFile(requestPath)) {
            finished = true;
            return;
        }
        try (Reader reader = Files.newBufferedReader(requestPath)) {
            JsonObject request = JsonParser.parseReader(reader).getAsJsonObject();
            if (!"factory-flow-icon-request-v1".equals(request.get("format").getAsString())) {
                throw new IllegalArgumentException("Unexpected icon request format");
            }
            JsonArray items = request.getAsJsonArray("items");
            for (var item : items) ids.add(item.getAsString());
            Files.createDirectories(outputDir);
            atlas = new NativeImage(ATLAS_SIZE, ATLAS_SIZE, true);
            System.out.println("[Factory Flow Icons] Starting " + ids.size() + " item icons");
        } catch (Exception error) {
            finished = true;
            System.err.println("[Factory Flow Icons] Cannot read request: " + error);
        }
    }

    private void render(RenderGuiEvent.Post event) {
        if (!initialized) initialize();
        if (finished) return;
        Minecraft minecraft = Minecraft.getInstance();
        GuiGraphics graphics = event.getGuiGraphics();
        int remaining = Math.min(PER_FRAME, ids.size() - cursor);
        if (remaining == 0) {
            finish();
            return;
        }
        try {
            graphics.fill(0, 0, GRID * GAME_ICON, GRID * GAME_ICON, BACKGROUND);
            boolean[] rendered = new boolean[remaining];
            for (int slot = 0; slot < remaining; slot++) {
                String id = ids.get(cursor + slot);
                ResourceLocation key = ResourceLocation.tryParse(id);
                if (key == null || !BuiltInRegistries.ITEM.containsKey(key)) continue;
                Item item = BuiltInRegistries.ITEM.get(key);
                try {
                    ItemStack stack = item.getDefaultInstance();
                    if (stack.isEmpty()) continue;
                    graphics.renderFakeItem(stack, (slot % GRID) * GAME_ICON, (slot / GRID) * GAME_ICON);
                    rendered[slot] = true;
                } catch (Exception error) {
                    System.err.println("[Factory Flow Icons] Cannot render " + id + ": " + error);
                }
            }
            graphics.flush();
            double scale = event.getWindow().getGuiScale();
            try (NativeImage screenshot = Screenshot.takeScreenshot(minecraft.getMainRenderTarget())) {
                for (int slot = 0; slot < remaining; slot++) {
                    int index = cursor + slot;
                    String id = ids.get(index);
                    ResourceLocation key = ResourceLocation.tryParse(id);
                    if (key == null || !rendered[slot]) continue;
                    int atlasSlot = index % PER_ATLAS;
                    int atlasX = (atlasSlot % ATLAS_GRID) * EXPORT_ICON;
                    int atlasY = (atlasSlot / ATLAS_GRID) * EXPORT_ICON;
                    int gameX = (slot % GRID) * GAME_ICON;
                    int gameY = (slot / GRID) * GAME_ICON;
                    for (int y = 0; y < EXPORT_ICON; y++) {
                        for (int x = 0; x < EXPORT_ICON; x++) {
                            int sx = (int) ((gameX + (x + 0.5) * GAME_ICON / EXPORT_ICON) * scale);
                            int sy = (int) ((gameY + (y + 0.5) * GAME_ICON / EXPORT_ICON) * scale);
                            int pixel = screenshot.getPixelRGBA(sx, sy);
                            atlas.setPixelRGBA(atlasX + x, atlasY + y,
                                    (pixel & 0x00FFFFFF) == 0x00FF00FF ? 0 : pixel | 0xFF000000);
                        }
                    }
                    JsonObject face = new JsonObject();
                    face.addProperty("atlas", String.format("atlas-%04d.png", index / PER_ATLAS));
                    face.addProperty("x", atlasX);
                    face.addProperty("y", atlasY);
                    manifest.add(id, face);
                }
            }
            cursor += remaining;
            if (cursor % PER_ATLAS == 0 || cursor == ids.size()) writeAtlas((cursor - 1) / PER_ATLAS);
            if (cursor == ids.size()) finish();
        } catch (Exception error) {
            finished = true;
            System.err.println("[Factory Flow Icons] Export stopped at " + cursor + ": " + error);
        }
    }

    private void writeAtlas(int number) throws Exception {
        Path path = outputDir.resolve(String.format("atlas-%04d.png", number));
        atlas.writeToFile(path);
        atlas.close();
        if (cursor < ids.size()) atlas = new NativeImage(ATLAS_SIZE, ATLAS_SIZE, true);
        System.out.println("[Factory Flow Icons] Exported " + cursor + " / " + ids.size());
    }

    private void finish() {
        if (finished) return;
        finished = true;
        try {
            JsonObject output = new JsonObject();
            output.addProperty("format", "factory-flow-icons-v1");
            output.add("items", manifest);
            Files.writeString(outputDir.resolve("manifest.json"), output.toString());
            Files.deleteIfExists(requestPath);
            System.out.println("[Factory Flow Icons] Complete: " + manifest.size() + " item icons");
        } catch (Exception error) {
            System.err.println("[Factory Flow Icons] Cannot finish export: " + error);
        }
    }
}
