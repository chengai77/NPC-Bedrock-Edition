import { system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";
import { loadNpc, saveNpc, LIMITS } from "./npc_repository.js";
import { SKIN_COUNT, isNameLocked, getFixedName, getSkinDisplayName } from "./skin_registry.js";
import { validateCommand, buildCommand } from "./command_policy.js";

const AUTHOR = "承挨";
const SKIN_PAGE_SIZE = 20;
const TRADE_PREFIX = "customnpc:trade|";

const ITEM_DISPLAY_NAMES = Object.freeze({
    "minecraft:apple": "苹果",
    "minecraft:bread": "面包",
    "minecraft:diamond": "钻石",
    "minecraft:emerald": "绿宝石",
    "minecraft:gold_ingot": "金锭",
    "minecraft:iron_ingot": "铁锭",
    "minecraft:coal": "煤炭",
    "minecraft:lapis_lazuli": "青金石",
    "minecraft:redstone": "红石",
    "minecraft:netherite_ingot": "下界合金锭",
    "minecraft:stick": "木棍",
    "minecraft:stone": "石头",
    "minecraft:cobblestone": "圆石",
    "minecraft:oak_log": "橡木原木",
    "minecraft:oak_planks": "橡木木板",
    "minecraft:book": "书",
    "minecraft:paper": "纸",
    "minecraft:experience_bottle": "附魔之瓶",
    "customnpc:npc_spawn_egg": "NPC"
});

function getItemDisplayName(itemId) {
    return ITEM_DISPLAY_NAMES[itemId] ?? itemId;
}

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
    return ["无（仅执行命令）", "关闭菜单（不执行指令）", ...data.dialogues.map((dialogue) => `节点 ${dialogue.id}: ${dialogue.text.slice(0, 16)}`)];
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
        .body(`节点 ${data.dialogues.length}/${LIMITS.maxDialogues}\n首页显示未开启「首页隐藏」的节点`)
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
        .textField(`首页按钮名称(最多${LIMITS.buttonTextLength}字)`, "输入首页按钮文字", { defaultValue: "" })
        .textField(`对话内容(最多${LIMITS.dialogueTextLength}字)`, "输入对话", { defaultValue: "" });
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return openLater(() => editDialogues(player, npc));
    const homepageLabel = String(result.formValues[0] ?? "").trim().slice(0, LIMITS.buttonTextLength);
    const text = String(result.formValues[1] ?? "").trim();
    if (!homepageLabel || !text || text.length > LIMITS.dialogueTextLength) {
        if (text.length > LIMITS.dialogueTextLength) player.sendMessage(`对话超长(>${LIMITS.dialogueTextLength}字)`);
        return openLater(() => editDialogues(player, npc));
    }
    const dialogue = {
        id: nextDialogueId(data.dialogues),
        text,
        homepageLabel,
        homepageHidden: false,
        buttons: [{ text: "关闭", nextId: null, command: "", closeAfterCommand: false, closeMenu: true }]
    };
    saveNpc(npc, { ...data, dialogues: [...data.dialogues, dialogue] });
    openLater(() => editDialogueNode(player, npc, dialogue.id));
}

async function editDialogueNode(player, npc, dialogueId) {
    const data = loadNpc(npc);
    const dialogue = getDialogue(data, dialogueId);
    if (!dialogue) return openLater(() => editDialogues(player, npc));
    const form = new ActionFormData()
        .title(`节点 ${dialogue.id}`)
        .body(`${dialogue.text}\n首页按钮: ${dialogue.homepageLabel}\n按钮 ${dialogue.buttons.length}/${LIMITS.maxDialogueButtons}`)
        .button("编辑首页按钮名称")
        .button("编辑对话内容")
        .button(dialogue.homepageHidden ? "关闭首页隐藏" : "首页隐藏")
        .button(dialogue.buttons.length < LIMITS.maxDialogueButtons ? "添加按钮" : "已达按钮上限");
    dialogue.buttons.forEach((button, index) => form.button(`按钮 ${index + 1}: ${button.text}`));
    form.button("删除节点")
        .button("返回节点列表");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return openLater(() => editDialogues(player, npc));
    if (result.selection === 0) return editHomepageLabel(player, npc, dialogueId);
    if (result.selection === 1) return editDialogueText(player, npc, dialogueId);
    if (result.selection === 2) {
        dialogue.homepageHidden = !dialogue.homepageHidden;
        saveNpc(npc, data);
        return openLater(() => editDialogueNode(player, npc, dialogueId));
    }
    if (result.selection === 3) {
        if (dialogue.buttons.length < LIMITS.maxDialogueButtons) return addDialogueButton(player, npc, dialogueId);
        return openLater(() => editDialogueNode(player, npc, dialogueId));
    }
    const buttonIndex = result.selection - 4;
    if (buttonIndex < dialogue.buttons.length) return editDialogueButton(player, npc, dialogueId, buttonIndex);
    if (result.selection === dialogue.buttons.length + 4) return deleteDialogueNode(player, npc, dialogueId);
    openLater(() => editDialogues(player, npc));
}

async function editHomepageLabel(player, npc, dialogueId) {
    const data = loadNpc(npc);
    const dialogue = getDialogue(data, dialogueId);
    if (!dialogue) return openLater(() => editDialogues(player, npc));
    const form = new ModalFormData().title("编辑首页按钮名称")
        .textField(`首页按钮名称(最多${LIMITS.buttonTextLength}字)`, "输入首页按钮文字", { defaultValue: dialogue.homepageLabel });
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (result && !result.canceled) {
        const homepageLabel = String(result.formValues[0] ?? "").trim().slice(0, LIMITS.buttonTextLength);
        if (homepageLabel) {
            dialogue.homepageLabel = homepageLabel;
            saveNpc(npc, data);
        }
    }
    openLater(() => editDialogueNode(player, npc, dialogueId));
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
    dialogue.buttons.push({ text: "新按钮", nextId: null, command: "", closeAfterCommand: false });
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
    const linkIndex = button.closeMenu ? 1 : (button.nextId === null ? 0 : Math.max(0, data.dialogues.findIndex((item) => item.id === button.nextId) + 2));
    const commandIndex = button.command ? Math.max(0, data.commands.findIndex((item) => item.command === button.command) + 1) : 0;
    const form = new ModalFormData()
        .title(`编辑按钮 ${buttonIndex + 1}`)
        .textField(`按钮文字(最多${LIMITS.buttonTextLength}字)`, "输入按钮文字", { defaultValue: button.text })
        .dropdown("下一关联", links, { defaultValueIndex: linkIndex })
        .dropdown("执行指令(选填)", commands, { defaultValueIndex: commandIndex })
        .toggle("执行命令后关闭菜单", { defaultValue: button.closeAfterCommand === true });
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (result && !result.canceled) {
        const text = String(result.formValues[0] ?? "").trim().slice(0, LIMITS.buttonTextLength);
        const selectedLink = Number(result.formValues[1] ?? 0);
        const selectedCommand = Number(result.formValues[2] ?? 0);
        const closeAfterCommand = result.formValues[3] === true;
        const closeMenu = selectedLink === 1;
        button.text = text || "继续";
        button.nextId = selectedLink > 1 ? data.dialogues[selectedLink - 2].id : null;
        button.closeMenu = closeMenu;
        button.command = closeMenu ? "" : (selectedCommand > 0 ? data.commands[selectedCommand - 1].command : "");
        button.closeAfterCommand = closeMenu ? false : closeAfterCommand;
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
        .button(data.commands.length < LIMITS.maxCommands ? "预设交易" : "已达上限")
        .button("编辑交易方案")
        .button("删除指令")
        .button("返回");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled || result.selection === 4) return openLater(() => openEditor(player, npc));
    if (result.selection === 0 && data.commands.length < LIMITS.maxCommands) return addCommand(player, npc, data);
    if (result.selection === 1 && data.commands.length < LIMITS.maxCommands) return addPresetTrade(player, npc, data);
    if (result.selection === 2) return selectPresetTrade(player, npc, data);
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

function parseTradeItems(value) {
    const merged = new Map();
    for (const part of String(value ?? "").split(/[，,]/)) {
        const token = part.trim().toLowerCase();
        if (!token) continue;
        const match = token.match(/^([a-z0-9_.-]+:[a-z0-9_.-]+)(?:\s*[x*×]\s*(\d+))?$/);
        if (!match) return null;
        const itemId = match[1];
        const amount = Number(match[2] ?? 1);
        if (!Number.isInteger(amount) || amount < 1 || amount > 64) return null;
        merged.set(itemId, (merged.get(itemId) ?? 0) + amount);
    }
    const items = [...merged.entries()].map(([itemId, amount]) => ({ itemId, amount }));
    return items.length && items.every((item) => item.amount <= 64) ? items : null;
}

function encodeTrade(items) {
    return items.map((item) => `${item.itemId}*${item.amount}`).join(",");
}

async function addPresetTrade(player, npc, data) {
    return editPresetTrade(player, npc, data, -1);
}

async function selectPresetTrade(player, npc, data) {
    const trades = data.commands
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.command.startsWith(TRADE_PREFIX));
    if (!trades.length) {
        player.sendMessage("还没有预设交易方案。");
        return openLater(() => editCommands(player, npc));
    }
    const form = new ActionFormData().title("编辑交易方案");
    trades.forEach(({ entry }) => form.button(entry.description));
    form.button("返回");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled || result.selection >= trades.length) return openLater(() => editCommands(player, npc));
    editPresetTrade(player, npc, data, trades[result.selection].index);
}

async function editPresetTrade(player, npc, data, commandIndex) {
    const existing = commandIndex >= 0 ? data.commands[commandIndex] : null;
    const existingTrade = existing?.command.startsWith(TRADE_PREFIX)
        ? decodeTrade(existing.command.slice(TRADE_PREFIX.length)) : null;
    const form = new ModalFormData().title("预设交易")
        .textField("收取物品", "minecraft:diamond*3，minecraft:emerald*2", { defaultValue: existingTrade ? encodeTrade(existingTrade.costs) : "minecraft:diamond*1" })
        .textField("获得物品", "minecraft:apple*2,minecraft:bread*1", { defaultValue: existingTrade ? encodeTrade(existingTrade.rewards) : "minecraft:apple*1" })
        .textField(`说明(最多${LIMITS.descLength}字)`, "仅供编辑者识别", { defaultValue: existing?.description ?? "钻石换苹果" });
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return openLater(() => editCommands(player, npc));
    const costs = parseTradeItems(result.formValues[0]);
    const rewards = parseTradeItems(result.formValues[1]);
    const description = String(result.formValues[2] ?? "").trim().slice(0, LIMITS.descLength) || "预设交易";
    if (!costs || !rewards) {
        player.sendMessage("交易配置无效：使用 物品ID*数量，并用中文或英文逗号分隔。");
    } else {
        const command = `${TRADE_PREFIX}${encodeTrade(costs)}|${encodeTrade(rewards)}`;
        const commands = [...data.commands];
        if (commandIndex >= 0) commands[commandIndex] = { command, description };
        else commands.push({ command, description });
        saveNpc(npc, { ...data, commands });
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
        else if (skinId >= 3) updated.name = "NPC";
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
    showDialogueHome(player, npc);
}

async function showDialogueHome(player, npc) {
    const data = loadNpc(npc);
    const visibleNodes = data.dialogues.filter((dialogue) => !dialogue.homepageHidden);
    if (!visibleNodes.length) {
        player.sendMessage("这个 NPC 没有可显示的首页节点。");
        return;
    }
    const form = new ActionFormData().title(data.name).body("请选择对话");
    visibleNodes.forEach((dialogue) => form.button(dialogue.homepageLabel));
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled || result.selection >= visibleNodes.length) return;
    const targetId = visibleNodes[result.selection].id;
    openLater(() => showDialogueNode(player, npc, targetId));
}

async function showDialogueNode(player, npc, dialogueId, depth = 0) {
    if (depth >= LIMITS.maxDialogues) {
        player.sendMessage("[NPC] 对话关联层级过深，已结束。");
        return;
    }
    const data = loadNpc(npc);
    const dialogue = getDialogue(data, dialogueId);
    if (!dialogue) {
        openLater(() => showDialogueHome(player, npc));
        return;
    }
    const form = new ActionFormData().title(data.name).body(dialogue.text);
    dialogue.buttons.forEach((button) => form.button(button.text));
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled || result.selection >= dialogue.buttons.length) return;
    const button = dialogue.buttons[result.selection];
    if (button.closeMenu) return;
    const commandExecuted = button.command ? await runNpcCommand(player, npc, button.command) : false;
    if (commandExecuted && button.closeAfterCommand) return;
    if (button.nextId !== null) {
        openLater(() => showDialogueNode(player, npc, button.nextId, depth + 1));
        return;
    }
    openLater(() => showDialogueNode(player, npc, dialogueId, depth));
}

function decodeTrade(payload) {
    const [costText, rewardText, ...extra] = payload.split("|");
    if (extra.length) return null;
    const costs = parseTradeItems(costText);
    const rewards = parseTradeItems(rewardText);
    return costs && rewards ? { costs, rewards } : null;
}

function countInventoryItems(inventory, itemId) {
    let total = 0;
    for (let slot = 0; slot < inventory.size; slot++) {
        const item = inventory.getItem(slot);
        if (item?.typeId === itemId) total += item.amount;
    }
    return total;
}

function removeInventoryItems(inventory, itemId, amount) {
    let remaining = amount;
    for (let slot = 0; slot < inventory.size && remaining > 0; slot++) {
        const stack = inventory.getItem(slot);
        if (!stack || stack.typeId !== itemId) continue;
        const removed = Math.min(stack.amount, remaining);
        if (removed === stack.amount) inventory.setItem(slot, undefined);
        else {
            stack.amount -= removed;
            inventory.setItem(slot, stack);
        }
        remaining -= removed;
    }
    return remaining === 0;
}

async function runPresetTrade(player, payload) {
    const trade = decodeTrade(payload);
    if (!trade) {
        player.sendMessage("[NPC] 预设交易配置已损坏。");
        return false;
    }
    try {
        const inventory = player.getComponent("minecraft:inventory")?.container;
        if (!inventory || !inventory.isValid) throw new Error("玩家背包不可用");
        const missing = trade.costs.find((item) => countInventoryItems(inventory, item.itemId) < item.amount);
        if (missing) {
            player.sendMessage(`交易失败：需要 ${missing.amount} 个 ${getItemDisplayName(missing.itemId)}。`);
            return false;
        }
        for (const item of trade.costs) removeInventoryItems(inventory, item.itemId, item.amount);
        for (const item of trade.rewards) {
            player.dimension.runCommand(`give "${player.name}" ${item.itemId} ${item.amount}`);
        }
        player.sendMessage("交易完成。");
        return true;
    } catch (error) {
        const msg = String(error?.message ?? error);
        player.sendMessage(`[NPC] 交易失败: ${msg}`);
        console.error(`[NPC] 交易失败: ${msg}`);
        return false;
    }
}

async function runNpcCommand(player, npc, command) {
    if (command.startsWith(TRADE_PREFIX)) {
        return runPresetTrade(player, command.slice(TRADE_PREFIX.length));
    }
    const check = validateCommand(command);
    if (!check.ok) {
        player.sendMessage(`[NPC] 指令被拒绝: ${check.reason}`);
        return false;
    }
    try {
        const commandText = buildCommand(check.parsed, player.name);
        if (commandText.split(/\s+/, 1)[0].toLowerCase() === "say") {
            world.sendMessage(commandText.slice(4));
            return true;
        }
        player.dimension.runCommand(commandText);
        return true;
    } catch (error) {
        const msg = String(error?.message ?? error);
        player.sendMessage(`[NPC] 指令执行失败: ${msg}`);
        console.error(`[NPC] 指令执行失败: ${msg}`);
        return false;
    }
}
