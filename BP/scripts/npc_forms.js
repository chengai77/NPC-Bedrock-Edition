import { system, world } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";
import { loadNpc, saveNpc, LIMITS } from "./npc_repository.js";
import { SKIN_COUNT, isNameLocked, getFixedName, getSkinDisplayName } from "./skin_registry.js";
import { validateCommand, buildCommand } from "./command_policy.js";

const AUTHOR = "承挨";
const SKIN_PAGE_SIZE = 20;
const TRADE_PREFIX = "customnpc:trade|";
const LONG_TEXT_PART_LENGTH = 256;
const LONG_TEXT_CONTINUE_PLACEHOLDER = "输入框输不下时可选择在此输入框继续编辑";
const MODE_LABELS = Object.freeze({ interaction: "交互模式", story: "剧情模式" });

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

function refreshLongTextEditor(callback) {
    system.run(callback);
}

function handleFormError(player, error) {
    const msg = String(error?.message ?? error);
    player.sendMessage(`[NPC UI] ${msg}`);
    console.error(`[NPC UI] ${msg}`);
}

function decodeTextFieldNewlines(value) {
    return String(value ?? "").replace(/\\n/g, "\n").replace(/\/n/g, "\n");
}

function encodeTextFieldNewlines(value) {
    return decodeTextFieldNewlines(value).replace(/\n/g, "/n");
}

function displayText(value) {
    return decodeTextFieldNewlines(value);
}

function previewText(value, max = 18) {
    return displayText(value).replace(/\n/g, " / ").slice(0, max);
}

function estimateDisplayLines(value) {
    return displayText(value).split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 18)), 0);
}

function addBottomButtonSpacer(form, buttonCount, bodyText) {
    const bodyLines = estimateDisplayLines(bodyText);
    const buttonRows = Math.max(1, Math.min(buttonCount, 4));
    const spacerLines = Math.max(0, 12 - bodyLines - buttonRows * 3);
    if (spacerLines > 0) form.label("\n".repeat(spacerLines));
    return form;
}

function splitLongTextForFields(value, maxLength) {
    const text = encodeTextFieldNewlines(value).slice(0, maxLength);
    const count = Math.ceil(maxLength / LONG_TEXT_PART_LENGTH);
    return Array.from({ length: count }, (_, index) => text.slice(index * LONG_TEXT_PART_LENGTH, (index + 1) * LONG_TEXT_PART_LENGTH));
}

function isLongTextMode(value) {
    return encodeTextFieldNewlines(value).length > LONG_TEXT_PART_LENGTH;
}

function addLongTextEditor(form, label, value, maxLength, longTextMode) {
    const parts = splitLongTextForFields(value, maxLength);
    form.textField(label, label, { defaultValue: parts[0] ?? "" })
        .toggle("长文本编辑模式", { defaultValue: longTextMode });
    if (longTextMode) {
        parts.slice(1).forEach((part) => form.textField("", LONG_TEXT_CONTINUE_PLACEHOLDER, { defaultValue: part }));
    }
    return form;
}

function longTextControlCount(maxLength, longTextMode) {
    const count = Math.ceil(maxLength / LONG_TEXT_PART_LENGTH);
    return longTextMode ? count + 1 : 2;
}

function readLongTextMode(values, startIndex) {
    return values[startIndex + 1] === true;
}

function readLongTextEditor(values, startIndex, maxLength, longTextMode) {
    const count = Math.ceil(maxLength / LONG_TEXT_PART_LENGTH);
    const parts = [String(values[startIndex] ?? "")];
    if (longTextMode) {
        parts.push(...values.slice(startIndex + 2, startIndex + count + 1).map((value) => String(value ?? "")));
    }
    return decodeTextFieldNewlines(parts.join(""))
        .trim()
        .slice(0, maxLength);
}

function nextDialogueId(dialogues) {
    return dialogues.reduce((max, dialogue) => Math.max(max, dialogue.id || 0), 0) + 1;
}

function getDialogue(data, id) {
    return data.dialogues.find((dialogue) => dialogue.id === id) ?? null;
}

function commandChoices(data) {
    return ["不执行", ...data.commands.map((entry, index) => `${index + 1}. ${previewText(entry.description, 18)}`)];
}

function getCommandIndex(data, button) {
    if (!button.commandId) return button.command ? data.commands.findIndex((entry) => entry.command === button.command) : -1;
    return data.commands.findIndex((entry) => entry.id === button.commandId);
}

function nextCommandId(commands) {
    let number = 1;
    const ids = new Set(commands.map((command) => command.id));
    while (ids.has(`command_${number}`)) number++;
    return `command_${number}`;
}

function linkChoices(data) {
    return ["无", "关闭", ...data.dialogues.map((dialogue) => `节点 ${dialogue.id}: ${previewText(dialogue.text, 16)}`)];
}

export async function openEditor(player, npc) {
    const data = loadNpc(npc);
    const form = new ActionFormData()
        .title("编辑 NPC")
        .body(`名称: ${data.name}\n模式: ${MODE_LABELS[data.dialogueMode]}\n皮肤: ${getSkinDisplayName(data.skinId)}\n作者: ${AUTHOR}`)
        .button("编辑名称")
        .button(data.dialogueMode === "story" ? "切换为交互模式" : "切换为剧情模式")
        .button("编辑交互模式")
        .button("编辑剧情模式")
        .button("编辑指令库")
        .button("选择皮肤")
        .button(data.aiEnabled ? "关闭自主行走" : "开启自主行走")
        .button(data.invulnerable ? "关闭无敌模式" : "开启无敌模式")
        .button("删除 NPC");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return;
    switch (result.selection) {
        case 0: return editName(player, npc);
        case 1: return toggleDialogueMode(player, npc, data);
        case 2: return editDialogues(player, npc);
        case 3: return editStoryMode(player, npc);
        case 4: return editCommands(player, npc);
        case 5: return selectSkin(player, npc, 0);
        case 6: return toggleAi(player, npc, data);
        case 7: return toggleInvulnerability(player, npc, data);
        case 8: return confirmDelete(player, npc);
    }
}

async function toggleDialogueMode(player, npc, data) {
    const dialogueMode = data.dialogueMode === "story" ? "interaction" : "story";
    saveNpc(npc, { ...data, dialogueMode });
    player.sendMessage(`NPC 已切换为${MODE_LABELS[dialogueMode]}`);
    openLater(() => openEditor(player, npc));
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
        .textField(`名称`, "名称", { defaultValue: data.name });
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
        .title("编辑交互模式")
        .body(`模式: ${MODE_LABELS[data.dialogueMode]}\n首页: ${previewText(data.homeDescription, 28) || "未设置"}\n节点: ${data.dialogues.length}/${LIMITS.maxDialogues}`)
        .button("编辑首页描述")
        .button(data.dialogues.length < LIMITS.maxDialogues ? "添加节点" : "已达上限");
    data.dialogues.forEach((dialogue) => form.button(`节点 ${dialogue.id}: ${previewText(dialogue.text)}`));
    form.button("返回");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return openLater(() => openEditor(player, npc));
    if (result.selection === 0) return editHomeDescription(player, npc);
    if (result.selection === 1) {
        if (data.dialogues.length < LIMITS.maxDialogues) return addDialogue(player, npc, data);
        return openLater(() => editDialogues(player, npc));
    }
    const nodeIndex = result.selection - 2;
    if (nodeIndex < data.dialogues.length) return editDialogueNode(player, npc, data.dialogues[nodeIndex].id);
    openLater(() => openEditor(player, npc));
}

async function editHomeDescription(player, npc, draftText = null, longTextMode = null) {
    const data = loadNpc(npc);
    const value = draftText ?? data.homeDescription;
    const useLongTextMode = longTextMode ?? isLongTextMode(value);
    const form = new ModalFormData()
        .title("编辑首页描述");
    addLongTextEditor(form, "首页描述", value, LIMITS.homeDescriptionLength, useLongTextMode);
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (result && !result.canceled) {
        const nextLongTextMode = readLongTextMode(result.formValues, 0);
        const homeDescription = readLongTextEditor(result.formValues, 0, LIMITS.homeDescriptionLength, useLongTextMode);
        if (nextLongTextMode !== useLongTextMode) return refreshLongTextEditor(() => editHomeDescription(player, npc, homeDescription, nextLongTextMode));
        saveNpc(npc, { ...data, homeDescription });
    }
    openLater(() => editDialogues(player, npc));
}

async function addDialogue(player, npc, data, draftHomepageLabel = "", draftText = "", longTextMode = false) {
    const form = new ModalFormData()
        .title("添加节点")
        .textField(`首页按钮（/n换行）`, "按钮", { defaultValue: draftHomepageLabel });
    addLongTextEditor(form, "内容", draftText, LIMITS.dialogueTextLength, longTextMode);
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return openLater(() => editDialogues(player, npc));
    const homepageLabel = decodeTextFieldNewlines(result.formValues[0]).trim().slice(0, LIMITS.buttonTextLength);
    const nextLongTextMode = readLongTextMode(result.formValues, 1);
    const text = readLongTextEditor(result.formValues, 1, LIMITS.dialogueTextLength, longTextMode);
    if (nextLongTextMode !== longTextMode) return refreshLongTextEditor(() => addDialogue(player, npc, data, homepageLabel, text, nextLongTextMode));
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
        .body(`${displayText(dialogue.text)}\n首页按钮: ${displayText(dialogue.homepageLabel)}\n按钮 ${dialogue.buttons.length}/${LIMITS.maxDialogueButtons}`)
        .button("首页按钮")
        .button("节点内容")
        .button(dialogue.homepageHidden ? "关闭首页隐藏" : "首页隐藏")
        .button(dialogue.buttons.length < LIMITS.maxDialogueButtons ? "添加按钮" : "已达上限");
    dialogue.buttons.forEach((button, index) => form.button(`按钮 ${index + 1}: ${previewText(button.text)}`));
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
    const form = new ModalFormData().title("首页按钮")
        .textField(`首页按钮（/n换行）`, "按钮", { defaultValue: encodeTextFieldNewlines(dialogue.homepageLabel) });
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (result && !result.canceled) {
        const homepageLabel = decodeTextFieldNewlines(result.formValues[0]).trim().slice(0, LIMITS.buttonTextLength);
        if (homepageLabel) {
            dialogue.homepageLabel = homepageLabel;
            saveNpc(npc, data);
        }
    }
    openLater(() => editDialogueNode(player, npc, dialogueId));
}

async function editDialogueText(player, npc, dialogueId, draftText = null, longTextMode = null) {
    const data = loadNpc(npc);
    const dialogue = getDialogue(data, dialogueId);
    if (!dialogue) return openLater(() => editDialogues(player, npc));
    const value = draftText ?? dialogue.text;
    const useLongTextMode = longTextMode ?? isLongTextMode(value);
    const form = new ModalFormData().title("节点内容");
    addLongTextEditor(form, "内容", value, LIMITS.dialogueTextLength, useLongTextMode);
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (result && !result.canceled) {
        const nextLongTextMode = readLongTextMode(result.formValues, 0);
        const text = readLongTextEditor(result.formValues, 0, LIMITS.dialogueTextLength, useLongTextMode);
        if (nextLongTextMode !== useLongTextMode) return refreshLongTextEditor(() => editDialogueText(player, npc, dialogueId, text, nextLongTextMode));
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
    const commandIndex = Math.max(0, getCommandIndex(data, button) + 1);
    const form = new ModalFormData()
        .title(`编辑按钮 ${buttonIndex + 1}`)
        .textField(`按钮文字（/n换行）`, "按钮", { defaultValue: encodeTextFieldNewlines(button.text) })
        .dropdown("下一关联", links, { defaultValueIndex: linkIndex })
        .dropdown("执行指令", commands, { defaultValueIndex: commandIndex })
        .dropdown("执行后关闭", ["关闭", "保持打开"], { defaultValueIndex: button.closeAfterCommand === true ? 0 : 1 });
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (result && !result.canceled) {
        const text = decodeTextFieldNewlines(result.formValues[0]).trim().slice(0, LIMITS.buttonTextLength);
        const selectedLink = Number(result.formValues[1] ?? 0);
        const selectedCommand = Number(result.formValues[2] ?? 0);
        const closeAfterCommand = Number(result.formValues[3]) === 0;
        const closeMenu = selectedLink === 1;
        button.text = text || "继续";
        button.nextId = selectedLink > 1 ? data.dialogues[selectedLink - 2].id : null;
        button.closeMenu = closeMenu;
        const selectedCommandEntry = selectedCommand > 0 ? data.commands[selectedCommand - 1] : null;
        button.command = closeMenu || !selectedCommandEntry ? "" : selectedCommandEntry.command;
        button.commandId = closeMenu || !selectedCommandEntry ? "" : selectedCommandEntry.id;
        button.closeAfterCommand = closeMenu ? false : closeAfterCommand;
        saveNpc(npc, data);
    }
    openLater(() => editDialogueNode(player, npc, dialogueId));
}

async function deleteDialogueNode(player, npc, dialogueId) {
    const data = loadNpc(npc);
    const form = new MessageFormData().title("删除节点").body("关联按钮会结束。")
        .button1("删除").button2("取消");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (result && !result.canceled && result.selection === 0) {
        saveNpc(npc, { ...data, dialogues: data.dialogues.filter((dialogue) => dialogue.id !== dialogueId) });
    }
    openLater(() => editDialogues(player, npc));
}

async function editStoryMode(player, npc) {
    const data = loadNpc(npc);
    const form = new ActionFormData()
        .title("编辑剧情模式")
        .body(`模式: ${MODE_LABELS[data.dialogueMode]}\n文本: ${data.storyLines.length}/${LIMITS.maxDialogues}`)
        .button(data.storyLines.length < LIMITS.maxDialogues ? "添加文本" : "已达上限");
    data.storyLines.forEach((line, index) => form.button(`${index + 1}. ${previewText(line)}`));
    form.button("返回");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return openLater(() => openEditor(player, npc));
    if (result.selection === 0) {
        if (data.storyLines.length < LIMITS.maxDialogues) return editStoryLine(player, npc, -1);
        return openLater(() => editStoryMode(player, npc));
    }
    const lineIndex = result.selection - 1;
    if (lineIndex < data.storyLines.length) return editStoryLine(player, npc, lineIndex);
    openLater(() => openEditor(player, npc));
}

async function editStoryLine(player, npc, lineIndex, draftText = null, longTextMode = null) {
    const data = loadNpc(npc);
    const isNew = lineIndex < 0;
    const oldText = isNew ? "" : data.storyLines[lineIndex];
    const value = draftText ?? oldText ?? "";
    const useLongTextMode = longTextMode ?? isLongTextMode(value);
    const form = new ModalFormData()
        .title(isNew ? "添加文本" : `文本 ${lineIndex + 1}`);
    addLongTextEditor(form, "独白", value, LIMITS.storyLineLength, useLongTextMode)
        .dropdown("删除此文本", ["保留", "删除"], { defaultValueIndex: 0 });
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (result && !result.canceled) {
        const nextLongTextMode = readLongTextMode(result.formValues, 0);
        const text = readLongTextEditor(result.formValues, 0, LIMITS.storyLineLength, useLongTextMode);
        const remove = Number(result.formValues[longTextControlCount(LIMITS.storyLineLength, useLongTextMode)]) === 1;
        if (nextLongTextMode !== useLongTextMode) return refreshLongTextEditor(() => editStoryLine(player, npc, lineIndex, text, nextLongTextMode));
        const storyLines = [...data.storyLines];
        if (!isNew && remove) storyLines.splice(lineIndex, 1);
        else if (text) {
            if (isNew) storyLines.push(text);
            else storyLines[lineIndex] = text;
        }
        saveNpc(npc, { ...data, storyLines });
    }
    openLater(() => editStoryMode(player, npc));
}

async function editCommands(player, npc) {
    const data = loadNpc(npc);
    const form = new ActionFormData().title("编辑指令库")
        .body(`指令: ${data.commands.length}/${LIMITS.maxCommands}`)
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
        .textField(`指令`, "指令", { defaultValue: "say 欢迎 {player}" })
        .textField(`说明`, "说明", { defaultValue: "欢迎消息" });
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return openLater(() => editCommands(player, npc));
    const command = String(result.formValues[0] ?? "").trim().replace(/^\//, "");
    const description = decodeTextFieldNewlines(result.formValues[1]).trim().slice(0, LIMITS.descLength) || command;
    const check = validateCommand(command);
    if (!check.ok) {
        player.sendMessage(`指令被拒绝: ${check.reason}`);
    } else {
        saveNpc(npc, {
            ...data,
            commands: [...data.commands, { id: nextCommandId(data.commands), command, description }]
        });
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
        player.sendMessage("暂无交易方案。");
        return openLater(() => editCommands(player, npc));
    }
    const form = new ActionFormData().title("编辑交易方案");
    trades.forEach(({ entry }) => form.button(displayText(entry.description)));
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
        .textField("收取", "minecraft:diamond*1", { defaultValue: existingTrade ? encodeTrade(existingTrade.costs) : "minecraft:diamond*1" })
        .textField("获得", "minecraft:apple*1", { defaultValue: existingTrade ? encodeTrade(existingTrade.rewards) : "minecraft:apple*1" })
        .textField(`说明`, "说明", { defaultValue: existing?.description ?? "钻石换苹果" });
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return openLater(() => editCommands(player, npc));
    const costs = parseTradeItems(result.formValues[0]);
    const rewards = parseTradeItems(result.formValues[1]);
    const description = decodeTextFieldNewlines(result.formValues[2]).trim().slice(0, LIMITS.descLength) || "预设交易";
    if (!costs || !rewards) {
        player.sendMessage("交易配置无效。");
    } else {
        const command = `${TRADE_PREFIX}${encodeTrade(costs)}|${encodeTrade(rewards)}`;
        const commands = [...data.commands];
        const entry = { id: existing?.id ?? nextCommandId(commands), command, description };
        if (commandIndex >= 0) commands[commandIndex] = entry;
        else commands.push(entry);
        saveNpc(npc, { ...data, commands });
    }
    openLater(() => editCommands(player, npc));
}

async function deleteCommand(player, npc, data) {
    if (!data.commands.length) return openLater(() => editCommands(player, npc));
    const form = new ActionFormData().title("删除指令");
    data.commands.forEach((command, index) => form.button(`${index + 1}. ${displayText(command.description)}`));
    form.button("返回");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (result && !result.canceled && result.selection < data.commands.length) {
        const commandId = data.commands[result.selection].id;
        const dialogues = data.dialogues.map((dialogue) => ({
            ...dialogue,
            buttons: dialogue.buttons.map((button) => button.commandId === commandId
                ? { ...button, command: "", commandId: "" }
                : button)
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
    const data = loadNpc(npc);
    if (data.dialogueMode === "story") return showStoryMode(player, npc, 0);
    showDialogueHome(player, npc);
}

function formatStoryBody(data, index) {
    const total = data.storyLines.length;
    const text = displayText(data.storyLines[index] ?? "");
    return `§8━━━━━━━━━━━━━━§r\n§l${data.name}§r\n\n${text}\n\n§8━━━━━━━━━━━━━━§r\n§7${index + 1}/${total} · 点击“继续”推进剧情§r`;
}

async function showStoryMode(player, npc, index) {
    const data = loadNpc(npc);
    if (!data.storyLines.length) {
        player.sendMessage("暂无剧情文本。");
        return;
    }
    const safeIndex = Math.max(0, Math.min(index, data.storyLines.length - 1));
    const storyBody = formatStoryBody(data, safeIndex);
    const form = new ActionFormData()
        .title("剧情")
        .body(storyBody);
    addBottomButtonSpacer(form, 1, storyBody)
        .button(safeIndex < data.storyLines.length - 1 ? "继续" : "结束");
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled) return;
    if (safeIndex < data.storyLines.length - 1) openLater(() => showStoryMode(player, npc, safeIndex + 1));
}

async function showDialogueHome(player, npc) {
    const data = loadNpc(npc);
    const visibleNodes = data.dialogues.filter((dialogue) => !dialogue.homepageHidden);
    if (!visibleNodes.length) {
        player.sendMessage("暂无首页节点。");
        return;
    }
    const homeBody = data.homeDescription ? displayText(data.homeDescription) : "请选择交互内容";
    const form = new ActionFormData().title(data.name).body(homeBody);
    addBottomButtonSpacer(form, visibleNodes.length, homeBody);
    visibleNodes.forEach((dialogue) => form.button(displayText(dialogue.homepageLabel)));
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled || result.selection >= visibleNodes.length) return;
    const targetId = visibleNodes[result.selection].id;
    openLater(() => showDialogueNode(player, npc, targetId));
}

function resolveButtonCommand(data, button) {
    if (!button.commandId) return button.command;
    return data.commands.find((entry) => entry.id === button.commandId)?.command || "";
}

async function showDialogueNode(player, npc, dialogueId, depth = 0) {
    if (depth >= LIMITS.maxDialogues) {
        player.sendMessage("[NPC] 层级过深。");
        return;
    }
    const data = loadNpc(npc);
    const dialogue = getDialogue(data, dialogueId);
    if (!dialogue) {
        openLater(() => showDialogueHome(player, npc));
        return;
    }
    const nodeBody = displayText(dialogue.text);
    const form = new ActionFormData().title(data.name).body(nodeBody);
    addBottomButtonSpacer(form, dialogue.buttons.length, nodeBody);
    dialogue.buttons.forEach((button) => form.button(displayText(button.text)));
    const result = await form.show(player).catch((error) => { handleFormError(player, error); return null; });
    if (!result || result.canceled || result.selection >= dialogue.buttons.length) return;
    const button = dialogue.buttons[result.selection];
    if (button.closeMenu) return;
    const command = resolveButtonCommand(data, button);
    const commandExecuted = command ? await runNpcCommand(player, npc, command) : false;
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

async function runPresetTrade(player, npc, payload) {
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
            npc.dimension.runCommand(`give "${player.name}" ${item.itemId} ${item.amount}`);
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
        return runPresetTrade(player, npc, command.slice(TRADE_PREFIX.length));
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
        npc.dimension.runCommand(commandText);
        return true;
    } catch (error) {
        const msg = String(error?.message ?? error);
        player.sendMessage(`[NPC] 指令执行失败: ${msg}`);
        console.error(`[NPC] 指令执行失败: ${msg}`);
        return false;
    }
}
