import { world, system } from "@minecraft/server";
import { setupInteraction } from "./npc_interaction.js";
import { initializeNpc, migrateNpc } from "./npc_repository.js";

const NPC_ID = "customnpc:npc";

function syncNpc(entity) {
    if (entity.typeId !== NPC_ID) return;
    initializeNpc(entity);
    migrateNpc(entity);
}

setupInteraction();

world.beforeEvents.entityHurt.subscribe((event) => {
    const npc = event.hurtEntity;
    if (npc.typeId !== NPC_ID) return;
    if (npc.getDynamicProperty("customnpc:invulnerable") === true) {
        event.cancel = true;
    }
});

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
    syncNpc(entity);
});

system.runInterval(() => {
    for (const dimensionId of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
        for (const entity of world.getDimension(dimensionId).getEntities({ type: NPC_ID })) {
            syncNpc(entity);
        }
    }
}, 100);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
    if (initialSpawn) {
        player.sendMessage("[自定义NPC] 脚本已加载 | API 2.8.0 / UI 2.1.0");
    }
});
