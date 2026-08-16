// NPC交互层
import { world, system, GameMode } from "@minecraft/server";
import { openEditor, openDialogue } from "./npc_forms.js";
import { initializeNpc } from "./npc_repository.js";

const NPC_ID = "customnpc:npc";
const DEBUG = false;

function isCreative(player) {
    try {
        return player.getGameMode() === GameMode.Creative;
    } catch {
        return false;
    }
}

export function setupInteraction() {
    world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
        const { player, target } = event;
        if (!target || target.typeId !== NPC_ID) return;

        if (DEBUG) player.sendMessage("NPC interact received");

        event.cancel = true;
        system.run(() => {
            if (DEBUG) player.sendMessage("NPC UI dispatch");
            if (!target.isValid) {
                if (DEBUG) player.sendMessage("NPC target invalid");
                return;
            }
            if (!player.isValid) {
                return;
            }
            try {
                initializeNpc(target);
            } catch (e) {
                const msg = String(e?.message ?? e);
                player.sendMessage(`[NPC] initializeNpc 失败: ${msg}`);
                console.error(`[NPC] initializeNpc 失败: ${msg}`);
                return;
            }
            try {
                const formPromise = isCreative(player)
                    ? openEditor(player, target)
                    : openDialogue(player, target);
                formPromise.catch((error) => {
                    const msg = String(error?.message ?? error);
                    player.sendMessage(`[NPC UI] ${msg}`);
                    console.error(`[NPC UI] ${msg}`);
                });
            } catch (e) {
                const msg = String(e?.message ?? e);
                player.sendMessage(`[NPC UI dispatch] ${msg}`);
                console.error(`[NPC UI dispatch] ${msg}`);
            }
        });
    });
}
