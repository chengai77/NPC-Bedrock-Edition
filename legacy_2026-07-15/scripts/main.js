import { GameMode, world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";
import { SKIN_ARM_MODELS } from "./skin_models.js";

const NPC_ID = "customnpc:npc";
const AUTHOR = "承挨";
const SKIN_COUNT = 100;
const SKIN_NAMES = { 1: "作者", 2: "星野" };
const LOCKED_NAME_SKINS = new Set([1]);
const AI_STEP = 0.08;

function getText(entity, key, fallback) {
    const value = entity.getDynamicProperty(key);
    return typeof value === "string" ? value : fallback;
}

function getNumber(entity, key, fallback) {
    const value = entity.getDynamicProperty(key);
    return typeof value === "number" ? value : fallback;
}

function getFlag(entity, key, fallback = false) {
    const value = entity.getDynamicProperty(key);
    return typeof value === "boolean" ? value : fallback;
}

function getJson(entity, key, fallback) {
    try {
        return JSON.parse(getText(entity, key, ""));
    } catch {
        return fallback;
    }
}

function setJson(entity, key, value) {
    entity.setDynamicProperty(key, JSON.stringify(value));
}

function skinName(skinId) {
    return SKIN_NAMES[skinId] ?? `皮肤 ${skinId}`;
}

function initializeNpc(entity) {
    if (entity.typeId !== NPC_ID) return;

    let skinId = getNumber(entity, "customnpc:skin", 1);
    skinId = Math.max(1, Math.min(SKIN_COUNT, Math.floor(skinId)));
    entity.setDynamicProperty("customnpc:skin", skinId);
    entity.setProperty("customnpc:skin_id", skinId);

    const armModel = SKIN_ARM_MODELS[skinId] ?? 0;
    entity.setProperty("customnpc:arm_model", armModel);

    let name = getText(entity, "customnpc:name", "");
    if (!name || LOCKED_NAME_SKINS.has(skinId)) {
        name = SKIN_NAMES[skinId] ?? "NPC";
        entity.setDynamicProperty("customnpc:name", name);
    }
    entity.nameTag = name;

    if (!getText(entity, "customnpc:dialogues", "")) setJson(entity, "customnpc:dialogues", []);
    if (!getText(entity, "customnpc:commands", "")) setJson(entity, "customnpc:commands", []);
    if (entity.getDynamicProperty("customnpc:ai") === undefined) entity.setDynamicProperty("customnpc:ai", false);
}

function isCreative(player) {
    return player.getGameMode() === GameMode.Creative;
}

function openLater(callback) {
    system.runTimeout(callback, 1);
}

async function openEditor(player, npc) {
    initializeNpc(npc);
    const name = getText(npc, "customnpc:name", "NPC");
    const skin = getNumber(npc, "customnpc:skin", 1);
    const ai = getFlag(npc, "customnpc:ai");

    const form = new ActionFormData()
        .title("编辑 NPC")
        .body(`名称: ${name}\n皮肤: ${skinName(skin)}\n作者: ${AUTHOR}`)
        .button("编辑名称")
        .button("编辑对话")
        .button("编辑指令")
        .button("选择皮肤")
        .button(ai ? "关闭自主行走" : "开启自主行走")
        .button("删除 NPC");
    const result = await form.show(player);
    if (result.canceled) return;

    switch (result.selection) {
        case 0: return editName(player, npc);
        case 1: return editDialogues(player, npc);
        case 2: return editCommands(player, npc);
        case 3: return selectSkin(player, npc);
        case 4:
            npc.setDynamicProperty("customnpc:ai", !ai);
            player.sendMessage(ai ? "NPC 已停止自主行走" : "NPC 已开启自主行走");
            return openLater(() => openEditor(player, npc));
        case 5: return confirmDelete(player, npc);
    }
}

async function editName(player, npc) {
    const skin = getNumber(npc, "customnpc:skin", 1);
    const current = getText(npc, "customnpc:name", "NPC");
    if (LOCKED_NAME_SKINS.has(skin)) {
        player.sendMessage(`该皮肤名称固定为「${current}」`);
        return openLater(() => openEditor(player, npc));
    }

    const form = new ModalFormData().title("编辑名称").textField("NPC 名称", "输入名称", current);
    const result = await form.show(player);
    if (!result.canceled) {
        const name = String(result.formValues[0]).trim() || "NPC";
        npc.setDynamicProperty("customnpc:name", name);
        npc.nameTag = name;
    }
    openLater(() => openEditor(player, npc));
}

async function editDialogues(player, npc) {
    const dialogues = getJson(npc, "customnpc:dialogues", []);
    const form = new ActionFormData()
        .title("编辑对话")
        .body(`已配置 ${dialogues.length} 条对话`)
        .button("添加对话")
        .button("删除对话")
        .button("返回");
    const result = await form.show(player);
    if (result.canceled || result.selection === 2) return openLater(() => openEditor(player, npc));

    if (result.selection === 0) {
        const input = new ModalFormData()
            .title("添加对话")
            .textField("NPC 说的话", "输入对话", "")
            .textField("按钮 1", "例如：继续", "继续")
            .textField("按钮 2", "例如：离开", "离开");
        const answer = await input.show(player);
        if (!answer.canceled) {
            const text = String(answer.formValues[0]).trim();
            if (text) {
                dialogues.push({ text, first: String(answer.formValues[1]).trim() || "继续", second: String(answer.formValues[2]).trim() || "关闭" });
                setJson(npc, "customnpc:dialogues", dialogues);
            }
        }
        return openLater(() => editDialogues(player, npc));
    }

    if (!dialogues.length) return openLater(() => editDialogues(player, npc));
    const deleteForm = new ActionFormData().title("删除对话");
    dialogues.forEach((dialogue, index) => deleteForm.button(`${index + 1}. ${dialogue.text}`));
    const choice = await deleteForm.show(player);
    if (!choice.canceled) {
        dialogues.splice(choice.selection, 1);
        setJson(npc, "customnpc:dialogues", dialogues);
    }
    openLater(() => editDialogues(player, npc));
}

async function editCommands(player, npc) {
    const commands = getJson(npc, "customnpc:commands", []);
    const form = new ActionFormData()
        .title("编辑指令")
        .body(`已配置 ${commands.length} 条指令`)
        .button("添加指令")
        .button("删除指令")
        .button("返回");
    const result = await form.show(player);
    if (result.canceled || result.selection === 2) return openLater(() => openEditor(player, npc));

    if (result.selection === 0) {
        const input = new ModalFormData()
            .title("添加指令")
            .textField("执行指令", "不需要输入 /", "say 欢迎 @p")
            .textField("说明", "仅供编辑者辨认", "欢迎消息");
        const answer = await input.show(player);
        if (!answer.canceled) {
            const command = String(answer.formValues[0]).trim().replace(/^\//, "");
            if (command) {
                commands.push({ command, description: String(answer.formValues[1]).trim() || command });
                setJson(npc, "customnpc:commands", commands);
            }
        }
        return openLater(() => editCommands(player, npc));
    }

    if (!commands.length) return openLater(() => editCommands(player, npc));
    const deleteForm = new ActionFormData().title("删除指令");
    commands.forEach((entry, index) => deleteForm.button(`${index + 1}. ${entry.description}`));
    const choice = await deleteForm.show(player);
    if (!choice.canceled) {
        commands.splice(choice.selection, 1);
        setJson(npc, "customnpc:commands", commands);
    }
    openLater(() => editCommands(player, npc));
}

async function selectSkin(player, npc) {
    const form = new ActionFormData().title("选择皮肤").body("按 npc_1 到 npc_100 的顺序排列");
    for (let i = 1; i <= SKIN_COUNT; i++) form.button(`npc_${i}${SKIN_NAMES[i] ? ` - ${SKIN_NAMES[i]}` : ""}`);
    const result = await form.show(player);
    if (result.canceled) return openLater(() => openEditor(player, npc));

    const skin = result.selection + 1;
    npc.setDynamicProperty("customnpc:skin", skin);
    npc.setProperty("customnpc:skin_id", skin);
    npc.setProperty("customnpc:arm_model", SKIN_ARM_MODELS[skin] ?? 0);
    if (SKIN_NAMES[skin]) {
        npc.setDynamicProperty("customnpc:name", SKIN_NAMES[skin]);
        npc.nameTag = SKIN_NAMES[skin];
    }
    openLater(() => openEditor(player, npc));
}

async function confirmDelete(player, npc) {
    const form = new MessageFormData().title("删除 NPC").body("确定删除此 NPC？").button1("删除").button2("取消");
    const result = await form.show(player);
    if (!result.canceled && result.selection === 0) npc.remove();
    else openLater(() => openEditor(player, npc));
}

async function openDialogue(player, npc) {
    initializeNpc(npc);
    const dialogues = getJson(npc, "customnpc:dialogues", []);
    if (!dialogues.length) {
        player.sendMessage("这个 NPC 还没有设置对话。");
        return;
    }
    const dialogue = dialogues[Math.floor(Math.random() * dialogues.length)];
    const form = new MessageFormData()
        .title(getText(npc, "customnpc:name", "NPC"))
        .body(dialogue.text)
        .button1(dialogue.first || "继续")
        .button2(dialogue.second || "关闭");
    const result = await form.show(player);
    if (result.canceled) return;

    const commands = getJson(npc, "customnpc:commands", []);
    for (const entry of commands) {
        try {
            await npc.dimension.runCommandAsync(entry.command.replace(/@p/g, `\"${player.name}\"`));
        } catch {
            player.sendMessage(`NPC 指令执行失败: ${entry.description}`);
        }
    }
}

function moveNpcs() {
    for (const dimensionId of ["overworld", "nether", "the_end"]) {
        let dimension;
        try { dimension = world.getDimension(dimensionId); } catch { continue; }
        for (const npc of dimension.getEntities({ type: NPC_ID })) {
            if (!getFlag(npc, "customnpc:ai")) continue;
            const tick = getNumber(npc, "customnpc:ai_tick", 0) - 1;
            if (tick > 0) {
                npc.setDynamicProperty("customnpc:ai_tick", tick);
                continue;
            }
            const angle = Math.random() * Math.PI * 2;
            const next = { x: npc.location.x + Math.cos(angle) * AI_STEP * 8, y: npc.location.y, z: npc.location.z + Math.sin(angle) * AI_STEP * 8 };
            npc.teleport(next, { checkForBlocks: true });
            npc.setDynamicProperty("customnpc:ai_tick", 20 + Math.floor(Math.random() * 50));
        }
    }
}

world.afterEvents.entitySpawn.subscribe(({ entity }) => {
    if (entity.typeId === NPC_ID) system.run(() => initializeNpc(entity));
});

function openNpcUi(player, target) {
    const form = isCreative(player) ? openEditor(player, target) : openDialogue(player, target);
    form.catch((error) => player.sendMessage(`NPC UI 错误: ${error}`));
}

world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
    const { player, target } = event;
    if (target.typeId !== NPC_ID) return;
    event.cancel = true;
    system.run(() => {
        if (!target.isValid || !player.isValid) return;
        openNpcUi(player, target);
    });
});

system.runInterval(moveNpcs, 10);
system.run(() => world.sendMessage(`自定义 NPC 系统已加载 | 作者: ${AUTHOR}`));
