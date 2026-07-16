import { system } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";
import { loadNpc, saveNpc, LIMITS } from "./npc_repository.js";
import { SKIN_COUNT, isNameLocked, getFixedName, getSkinDisplayName } from "./skin_registry.js";
import { validateCommand, buildCommand } from "./command_policy.js";

const AUTHOR = "承挨";
const SKIN_PAGE_SIZE = 20;

function openLater(callback) {
    system.runTimeout(callback, 1);
}

function handleFormError(player, error) {
    const msg = String(error?.message ?? error);
    player.sendMessage(`[NPC UI] ${msg}`);
    console.error(`[NPC UI] ${msg}`);
}

function nextDialogueId(dialogues) {
    return dialogues.reduce((max, dialogue) => Math.max(max, dialogue.id || 0), 0) + 1;
}

function getDialogue(data, id) {
    return data.dialogues.find((dialogue) => dialogue.id === id) ?? null;
}

function commandChoices(data) {
    return ["不执行指令", ...data.commands.map((entry, index) => `${index + 1}. ${entry.description}`)];
}

function linkChoices(data) {
    return ["结束对话", ...data.dialogues.map((dialogue) => `节点 ${dialogue.id}: ${dialogue.text.slice(0, 16)}`)];
}

export async function openEditor(player, npc) {
    const data = loadNpc(npc);
    const form = new ActionFormData()
        .title("编辑 NPC")
        .body(`名称: ${data.name}\n皮肤: ${getSkinDisplayName(data.skinId)}\n作者: ${AUTHOR}`)
        .button("编辑名称")
        .button("编辑对话")
        .button("编辑指令库")
        .button("选择皮肤")
        .button(data.aiEnabled ? "关闭自主行走" : "开启自主行走")
        .button(data.invulnerable ? "关闭无敌模式" : "开启无敌模式")
        .button("删除 NPC");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return;
    switch (result.selection) {
        case 0: return editName(player, npc);
        case 1: return editDialogues(player, npc);
        case 2: return editCommands(player, npc);
        case 3: return selectSkin(player, npc, 0);
        case 4: return toggleAi(player, npc, data);
        case 5: return toggleInvulnerability(player, npc, data);
        case 6: return confirmDelete(player, npc);
    }
}

async function toggleAi(player, npc, data) {
    const aiEnabled = !data.aiEnabled;
    saveNpc(npc, { ...data, aiEnabled });
    player.sendMessage(aiEnabled ? "NPC 已开启自主行走" : "NPC 已停止自主行走");
    openLater(() => openEditor(player, npc));
}

async function toggleInvulnerability(player, npc, data) {
    const invulnerable = !data.invulnerable;
    saveNpc(npc, { ...data, invulnerable });
    player.sendMessage(invulnerable ? "NPC 已开启无敌模式" : "NPC 已允许受到伤害");
    openLater(() => openEditor(player, npc));
}

async function editName(player, npc) {
    const data = loadNpc(npc);
    if (isNameLocked(data.skinId)) {
        player.sendMessage(`该皮肤名称固定为「${data.name}」`);
        return openLater(() => openEditor(player, npc));
    }
    const form = new ModalFormData()
        .title("编辑名称")
        .textField(`NPC 名称 (最多${LIMITS.nameLength}字)`, "输入名称", { defaultValue: data.name });
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return openLater(() => openEditor(player, npc));
    const name = String(result.formValues[0] ?? "").trim();
    if (name.length > LIMITS.nameLength) {
        player.sendMessage(`名称超长(>${LIMITS.nameLength}字)`);
    } else {
        saveNpc(npc, { ...data, name: name || "NPC" });
    }
    openLater(() => openEditor(player, npc));
}

async function editDialogues(player, npc) {
    const data = loadNpc(npc);
    const form = new ActionFormData()
        .title("编辑对话节点")
        .body(`节点 ${data.dialogues.length}/${LIMITS.maxDialogues}\n首个节点为玩家右键后的起点`)
        .button(data.dialogues.length < LIMITS.maxDialogues ? "添加节点" : "已达节点上限");
    data.dialogues.forEach((dialogue) => form.button(`节点 ${dialogue.id}: ${dialogue.text.slice(0, 18)}`));
    form.button("返回");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return openLater(() => openEditor(player, npc));
    if (result.selection === 0) {
        if (data.dialogues.length < LIMITS.maxDialogues) return addDialogue(player, npc, data);
        return openLater(() => editDialogues(player, npc));
    }
    const nodeIndex = result.selection - 1;
    if (nodeIndex < data.dialogues.length) return editDialogueNode(player, npc, data.dialogues[nodeIndex].id);
    openLater(() => openEditor(player, npc));
}

async function addDialogue(player, npc, data) {
    const form = new ModalFormData()
        .title("添加对话节点")
        .textField(`对话内容(最多${LIMITS.dialogueTextLength}字)`, "输入对话", { defaultValue: "" });
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return openLater(() => editDialogues(player, npc));
    const text = String(result.formValues[0] ?? "").trim();
    if (!text || text.length > LIMITS.dialogueTextLength) {
        if (text.length > LIMITS.dialogueTextLength) player.sendMessage(`对话超长(>${LIMITS.dialogueTextLength}字)`);
        return openLater(() => editDialogues(player, npc));
    }
    const dialogue = { id: nextDialogueId(data.dialogues), text, buttons: [{ text: "关闭", nextId: null, command: "" }] };
    saveNpc(npc, { ...data, dialogues: [...data.dialogues, dialogue] });
    openLater(() => editDialogueNode(player, npc, dialogue.id));
}

async function editDialogueNode(player, npc, dialogueId) {
    const data = loadNpc(npc);
    const dialogue = getDialogue(data, dialogueId);
    if (!dialogue) return openLater(() => editDialogues(player, npc));
    const form = new ActionFormData()
        .title(`节点 ${dialogue.id}`)
        .body(`${dialogue.text}\n按钮 ${dialogue.buttons.length}/${LIMITS.maxDialogueButtons}`)
        .button("编辑对话内容")
        .button(dialogue.buttons.length < LIMITS.maxDialogueButtons ? "添加按钮" : "已达按钮上限");
    dialogue.buttons.forEach((button, index) => form.button(`按钮 ${index + 1}: ${button.text}`));
    form.button("删除节点")
        .button("返回节点列表");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return openLater(() => editDialogues(player, npc));
    if (result.selection === 0) return editDialogueText(player, npc, dialogueId);
    if (result.selection === 1) {
        if (dialogue.buttons.length < LIMITS.maxDialogueButtons) return addDialogueButton(player, npc, dialogueId);
        return openLater(() => editDialogueNode(player, npc, dialogueId));
    }
    const buttonIndex = result.selection - 2;
    if (buttonIndex < dialogue.buttons.length) return editDialogueButton(player, npc, dialogueId, buttonIndex);
    if (result.selection === dialogue.buttons.length + 2) return deleteDialogueNode(player, npc, dialogueId);
    openLater(() => editDialogues(player, npc));
}

async function editDialogueText(player, npc, dialogueId) {
    const data = loadNpc(npc);
    const dialogue = getDialogue(data, dialogueId);
    if (!dialogue) return openLater(() => editDialogues(player, npc));
    const form = new ModalFormData().title("编辑对话内容")
        .textField(`对话内容(最多${LIMITS.dialogueTextLength}字)`, "输入对话", { defaultValue: dialogue.text });
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (result && !result.canceled) {
        const text = String(result.formValues[0] ?? "").trim();
        if (text && text.length <= LIMITS.dialogueTextLength) {
            dialogue.text = text;
            saveNpc(npc, data);
        }
    }
    openLater(() => editDialogueNode(player, npc, dialogueId));
}

async function addDialogueButton(player, npc, dialogueId) {
    const data = loadNpc(npc);
    const dialogue = getDialogue(data, dialogueId);
    if (!dialogue) return openLater(() => editDialogues(player, npc));
    dialogue.buttons.push({ text: "新按钮", nextId: null, command: "" });
    saveNpc(npc, data);
    openLater(() => editDialogueButton(player, npc, dialogueId, dialogue.buttons.length - 1));
}

async function editDialogueButton(player, npc, dialogueId, buttonIndex) {
    const data = loadNpc(npc);
    const dialogue = getDialogue(data, dialogueId);
    const button = dialogue?.buttons[buttonIndex];
    if (!button) return openLater(() => editDialogueNode(player, npc, dialogueId));
    const links = linkChoices(data);
    const commands = commandChoices(data);
    const linkIndex = button.nextId === null ? 0 : Math.max(0, data.dialogues.findIndex((item) => item.id === button.nextId) + 1);
    const commandIndex = button.command ? Math.max(0, data.commands.findIndex((item) => item.command === button.command) + 1) : 0;
    const form = new ModalFormData()
        .title(`编辑按钮 ${buttonIndex + 1}`)
        .textField(`按钮文字(最多${LIMITS.buttonTextLength}字)`, "输入按钮文字", { defaultValue: button.text })
        .dropdown("关联下一节点", links, { defaultValueIndex: linkIndex })
        .dropdown("执行指令(选填)", commands, { defaultValueIndex: commandIndex });
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (result && !result.canceled) {
        const text = String(result.formValues[0] ?? "").trim().slice(0, LIMITS.buttonTextLength);
        const selectedLink = Number(result.formValues[1] ?? 0);
        const selectedCommand = Number(result.formValues[2] ?? 0);
        button.text = text || "继续";
        button.nextId = selectedLink > 0 ? data.dialogues[selectedLink - 1].id : null;
        button.command = selectedCommand > 0 ? data.commands[selectedCommand - 1].command : "";
        saveNpc(npc, data);
    }
    openLater(() => editDialogueNode(player, npc, dialogueId));
}

async function deleteDialogueNode(player, npc, dialogueId) {
    const data = loadNpc(npc);
    const form = new MessageFormData().title("删除对话节点").body("关联到此节点的按钮会自动变为结束对话。")
        .button1("删除").button2("取消");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (result && !result.canceled && result.selection === 0) {
        saveNpc(npc, { ...data, dialogues: data.dialogues.filter((dialogue) => dialogue.id !== dialogueId) });
    }
    openLater(() => editDialogues(player, npc));
}

async function editCommands(player, npc) {
    const data = loadNpc(npc);
    const form = new ActionFormData().title("编辑指令库")
        .body(`已配置 ${data.commands.length}/${LIMITS.maxCommands} 条指令\n按钮可选择其中任意一条。`)
        .button(data.commands.length < LIMITS.maxCommands ? "添加指令" : "已达上限")
        .button("删除指令")
        .button("返回");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled || result.selection === 2) return openLater(() => openEditor(player, npc));
    if (result.selection === 0 && data.commands.length < LIMITS.maxCommands) return addCommand(player, npc, data);
    deleteCommand(player, npc, data);
}

async function addCommand(player, npc, data) {
    const form = new ModalFormData().title("添加指令")
        .textField(`指令(最多${LIMITS.commandLength}字)`, "可用 {player} 代指点击玩家", { defaultValue: "say 欢迎 {player}" })
        .textField(`说明(最多${LIMITS.descLength}字)`, "仅供编辑者识别", { defaultValue: "欢迎消息" });
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return openLater(() => editCommands(player, npc));
    const command = String(result.formValues[0] ?? "").trim().replace(/^\//, "");
    const description = String(result.formValues[1] ?? "").trim().slice(0, LIMITS.descLength) || command;
    const check = validateCommand(command);
    if (!check.ok) {
        player.sendMessage(`指令被拒绝: ${check.reason}`);
    } else {
        saveNpc(npc, { ...data, commands: [...data.commands, { command, description }] });
    }
    openLater(() => editCommands(player, npc));
}

async function deleteCommand(player, npc, data) {
    if (!data.commands.length) return openLater(() => editCommands(player, npc));
    const form = new ActionFormData().title("删除指令");
    data.commands.forEach((command, index) => form.button(`${index + 1}. ${command.description}`));
    form.button("返回");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (result && !result.canceled && result.selection < data.commands.length) {
        const command = data.commands[result.selection].command;
        const dialogues = data.dialogues.map((dialogue) => ({
            ...dialogue,
            buttons: dialogue.buttons.map((button) => button.command === command ? { ...button, command: "" } : button)
        }));
        saveNpc(npc, { ...data, dialogues, commands: data.commands.filter((_, index) => index !== result.selection) });
    }
    openLater(() => editCommands(player, npc));
}

async function selectSkin(player, npc, page) {
    const data = loadNpc(npc);
    const totalPages = Math.ceil(SKIN_COUNT / SKIN_PAGE_SIZE);
    const start = page * SKIN_PAGE_SIZE + 1;
    const end = Math.min(start + SKIN_PAGE_SIZE - 1, SKIN_COUNT);
    const form = new ActionFormData().title(`选择皮肤 ${page + 1}/${totalPages}`)
        .body(`当前: ${getSkinDisplayName(data.skinId)}\n范围: npc_${start} - npc_${end}`);
    for (let id = start; id <= end; id++) form.button(getSkinDisplayName(id));
    if (page > 0) form.button("上一页");
    if (page < totalPages - 1) form.button("下一页");
    form.button("返回");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return openLater(() => openEditor(player, npc));
    const skinCount = end - start + 1;
    if (result.selection < skinCount) {
        const skinId = start + result.selection;
        const updated = { ...data, skinId };
        const fixedName = getFixedName(skinId);
        if (fixedName) updated.name = fixedName;
        saveNpc(npc, updated);
        return openLater(() => openEditor(player, npc));
    }
    const previousIndex = skinCount;
    const nextIndex = skinCount + (page > 0 ? 1 : 0);
    if (page > 0 && result.selection === previousIndex) return openLater(() => selectSkin(player, npc, page - 1));
    if (page < totalPages - 1 && result.selection === nextIndex) return openLater(() => selectSkin(player, npc, page + 1));
    openLater(() => openEditor(player, npc));
}

async function confirmDelete(player, npc) {
    const form = new MessageFormData().title("删除 NPC").body("确定删除此 NPC？")
        .button1("删除").button2("取消");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (result && !result.canceled && result.selection === 0) npc.remove();
}

export async function openDialogue(player, npc) {
    const data = loadNpc(npc);
    if (!data.dialogues.length) {
        player.sendMessage("这个 NPC 还没有设置对话。");
        return;
    }
    showDialogueNode(player, npc, data, data.dialogues[0].id);
}

async function showDialogueNode(player, npc, data, dialogueId, depth = 0) {
    if (depth >= LIMITS.maxDialogues) {
        player.sendMessage("[NPC] 对话关联层级过深，已结束。");
        return;
    }
    const dialogue = getDialogue(data, dialogueId);
    if (!dialogue) return;
    const form = new ActionFormData().title(data.name).body(dialogue.text);
    dialogue.buttons.forEach((button) => form.button(button.text));
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled || result.selection >= dialogue.buttons.length) return;
    const button = dialogue.buttons[result.selection];
    if (button.command) await runNpcCommand(player, npc, button.command);
    if (button.nextId !== null) {
        const refreshed = loadNpc(npc);
        openLater(() => showDialogueNode(player, npc, refreshed, button.nextId, depth + 1));
    }
}

async function runNpcCommand(player, npc, command) {
    const check = validateCommand(command);
    if (!check.ok) {
        player.sendMessage(`[NPC] 指令被拒绝: ${check.reason}`);
        return;
    }
    try {
        const commandText = buildCommand(check.parsed, player.name);
        player.dimension.runCommand(commandText);
    } catch (error) {
        const msg = String(error?.message ?? error);
        player.sendMessage(`[NPC] 指令执行失败: ${msg}`);
        console.error(`[NPC] 指令执行失败: ${msg}`);
    }
}
