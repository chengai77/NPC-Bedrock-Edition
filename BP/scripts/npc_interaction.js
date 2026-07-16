// NPC交互层，监听beforeEvents取消默认交互并延迟打开UI
import { world, system, GameMode } from "@minecraft/server";
import { openEditor, openDialogue } from "./npc_forms.js";
import { initializeNpc } from "./npc_repository.js";

const NPC_ID = "customnpc:npc";
// 调试开关：验证通过后置为false
const DEBUG = false;

// 使用枚举判断创造模式，禁止小写字符串比较
function isCreative(player) {
    try {
        return player.getGameMode() === GameMode.Creative;
    } catch {
        return false;
    }
}

// 设置交互监听
export function setupInteraction() {
    world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
        const { player, target } = event;
        // 非本实体直接放行，不取消
        if (!target || target.typeId !== NPC_ID) return;

        if (DEBUG) player.sendMessage("NPC interact received");

        // 取消默认交互，避免消耗手持物品
        event.cancel = true;
        // 延迟到普通执行上下文打开UI
        system.run(() => {
            if (DEBUG) player.sendMessage("NPC UI dispatch");
            // 双重校验实体有效性
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
