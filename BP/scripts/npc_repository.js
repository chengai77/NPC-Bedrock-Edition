// NPC数据持久化层
import { getArmModel, isNameLocked, getFixedName, SKIN_COUNT } from "./skin_registry.js";

// 动态属性Key
const KEYS = Object.freeze({
    name: "customnpc:name",
    skinId: "customnpc:skin_id",
    armModel: "customnpc:arm_model",
    dialogues: "customnpc:dialogues",
    commands: "customnpc:commands",
    aiEnabled: "customnpc:ai_enabled",
    invulnerable: "customnpc:invulnerable"
});

// 数据上限
export const LIMITS = Object.freeze({
    nameLength: 32,
    dialogueTextLength: 256,
    buttonTextLength: 32,
    commandLength: 512,
    descLength: 32,
    maxDialogues: 20,
    maxDialogueButtons: 6,
    maxCommands: 10,
    maxJsonBytes: 30000
});

// 安全默认值
/** @type {{name: string, skinId: number, armModel: number, dialogues: Array, commands: Array, aiEnabled: boolean, invulnerable: boolean}} */
const DEFAULTS = Object.freeze({
    name: "NPC",
    skinId: 1,
    armModel: 0,
    dialogues: [],
    commands: [],
    aiEnabled: false,
    invulnerable: false
});

// 读字符串
function getText(entity, key, fallback) {
    const value = entity.getDynamicProperty(key);
    return typeof value === "string" ? value : fallback;
}

// 读数值
function getNumber(entity, key, fallback) {
    const value = entity.getDynamicProperty(key);
    return typeof value === "number" ? value : fallback;
}

// 读布尔
function getFlag(entity, key, fallback) {
    const value = entity.getDynamicProperty(key);
    return typeof value === "boolean" ? value : fallback;
}

// 读JSON属性
function getJson(entity, key, fallback) {
    try {
        const parsed = JSON.parse(getText(entity, key, ""));
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

// 写JSON属性
function setJson(entity, key, value) {
    const str = JSON.stringify(value);
    if (str.length > LIMITS.maxJsonBytes) {
        throw new Error(`数据超长(${str.length}>${LIMITS.maxJsonBytes})`);
    }
    entity.setDynamicProperty(key, str);
}

// 皮肤槽位范围
function clampSkin(skinId) {
    const id = Math.floor(skinId);
    return Math.max(1, Math.min(SKIN_COUNT, id));
}

// 截断字符串
function clampStr(s, max) {
    return typeof s === "string" ? s.slice(0, max) : "";
}

// 验证对话按钮
function normalizeDialogueButton(button, fallbackText) {
    const source = button && typeof button === "object" ? button : {};
    const text = clampStr(source.text || fallbackText, LIMITS.buttonTextLength).trim();
    const nextId = Number.isInteger(source.nextId) ? source.nextId : null;
    const command = clampStr(source.command || "", LIMITS.commandLength).trim().replace(/^\//, "");
    const commandId = clampStr(source.commandId || "", 64).trim();
    const closeAfterCommand = source.closeAfterCommand === true;
    const closeMenu = source.closeMenu === true
        || (text === "关闭" && nextId === null && !command && source.closeAfterCommand !== true);
    return { text: text || fallbackText, nextId, command, commandId, closeAfterCommand, closeMenu };
}

// 验证对话节点
function normalizeDialogue(dialogue, index) {
    if (!dialogue || typeof dialogue !== "object" || typeof dialogue.text !== "string" || !dialogue.text.trim()) {
        return null;
    }
    const legacyButtons = [
        { text: dialogue.first || "继续", nextId: null, command: "", closeAfterCommand: false, closeMenu: false },
        { text: dialogue.second || "关闭", nextId: null, command: "", closeAfterCommand: false, closeMenu: false }
    ];
    const sourceButtons = Array.isArray(dialogue.buttons) ? dialogue.buttons : legacyButtons;
    const buttons = sourceButtons
        .slice(0, LIMITS.maxDialogueButtons)
        .map((button, buttonIndex) => normalizeDialogueButton(button, buttonIndex === 0 ? "继续" : "关闭"));
    return {
        id: Number.isInteger(dialogue.id) && dialogue.id > 0 ? dialogue.id : index + 1,
        text: clampStr(dialogue.text.trim(), LIMITS.dialogueTextLength),
        homepageLabel: clampStr(dialogue.homepageLabel || dialogue.text, LIMITS.buttonTextLength).trim() || "对话",
        homepageHidden: dialogue.homepageHidden === true,
        buttons: buttons.length ? buttons : legacyButtons.map((button, buttonIndex) => normalizeDialogueButton(button, buttonIndex === 0 ? "继续" : "关闭"))
    };
}

// 验证单条对话
function isValidDialogue(dialogue) {
    return normalizeDialogue(dialogue, 0) !== null;
}

// 验证单条指令
function isValidCommand(c) {
    return c && typeof c === "object" && typeof c.command === "string" && c.command.trim()
        && c.command.length <= LIMITS.commandLength;
}

function normalizeCommandId(value, index) {
    const id = clampStr(value || "", 64).trim();
    return id || `command_${index + 1}`;
}

function synchronizeCommandReferences(dialogues, commands) {
    const byId = new Map(commands.map((command) => [command.id, command.command]));
    const byCommand = new Map(commands.map((command) => [command.command, command.id]));
    dialogues.forEach((dialogue) => {
        dialogue.buttons.forEach((button) => {
            if (!button.commandId && button.command) button.commandId = byCommand.get(button.command) || "";
            if (button.commandId) {
                const command = byId.get(button.commandId);
                if (command) button.command = command;
                else {
                    button.commandId = "";
                    button.command = "";
                }
            }
        });
    });
}

// 验证NPC数据
export function validateNpcData(data) {
    const safe = { ...DEFAULTS };
    if (data && typeof data === "object") {
        if (typeof data.skinId === "number") safe.skinId = clampSkin(data.skinId);
        // armModel由skinId派生
        safe.armModel = getArmModel(safe.skinId);
        if (typeof data.name === "string" && data.name.trim()) {
            safe.name = clampStr(data.name.trim(), LIMITS.nameLength);
        }
        if (Array.isArray(data.dialogues)) {
            safe.dialogues = data.dialogues
                .map((dialogue, index) => normalizeDialogue(dialogue, index))
                .filter(Boolean)
                .slice(0, LIMITS.maxDialogues);
            const ids = new Set();
            safe.dialogues.forEach((dialogue, index) => {
                while (ids.has(dialogue.id)) dialogue.id = index + 1;
                ids.add(dialogue.id);
            });
            const validIds = new Set(safe.dialogues.map((dialogue) => dialogue.id));
            safe.dialogues.forEach((dialogue) => {
                dialogue.buttons.forEach((button) => {
                    if (!validIds.has(button.nextId)) button.nextId = null;
                });
            });
        }
        if (Array.isArray(data.commands)) {
            safe.commands = data.commands
                .filter(isValidCommand)
                .slice(0, LIMITS.maxCommands)
                .map((command, index) => ({
                    id: normalizeCommandId(command.id, index),
                    command: clampStr(command.command, LIMITS.commandLength).trim().replace(/^\//, ""),
                    description: clampStr(command.description || command.command, LIMITS.descLength).trim() || command.command
                }));
            const usedIds = new Set();
            safe.commands.forEach((command, index) => {
                while (usedIds.has(command.id)) command.id = `command_${index + 1}_${usedIds.size + 1}`;
                usedIds.add(command.id);
            });
        }
        synchronizeCommandReferences(safe.dialogues, safe.commands);
        if (typeof data.aiEnabled === "boolean") safe.aiEnabled = data.aiEnabled;
        if (typeof data.invulnerable === "boolean") safe.invulnerable = data.invulnerable;
    } else {
        safe.armModel = getArmModel(safe.skinId);
    }
    // 锁定皮肤固定名
    if (isNameLocked(safe.skinId)) {
        const fixed = getFixedName(safe.skinId);
        if (fixed) safe.name = fixed;
    }
    return safe;
}

// 加载NPC数据
export function loadNpc(entity) {
    const skinId = clampSkin(getNumber(entity, KEYS.skinId, DEFAULTS.skinId));
    const data = {
        name: getText(entity, KEYS.name, DEFAULTS.name),
        skinId,
        // armModel由skinId派生
        armModel: getArmModel(skinId),
        dialogues: getJson(entity, KEYS.dialogues, DEFAULTS.dialogues),
        commands: getJson(entity, KEYS.commands, DEFAULTS.commands),
        aiEnabled: getFlag(entity, KEYS.aiEnabled, DEFAULTS.aiEnabled),
        invulnerable: getFlag(entity, KEYS.invulnerable, DEFAULTS.invulnerable)
    };
    return validateNpcData(data);
}

// 保存NPC数据
export function saveNpc(entity, data) {
    const safe = validateNpcData(data);
    entity.setDynamicProperty(KEYS.name, safe.name);
    entity.setDynamicProperty(KEYS.skinId, safe.skinId);
    entity.setDynamicProperty(KEYS.armModel, safe.armModel);
    setJson(entity, KEYS.dialogues, safe.dialogues);
    setJson(entity, KEYS.commands, safe.commands);
    entity.setDynamicProperty(KEYS.aiEnabled, safe.aiEnabled);
    entity.setDynamicProperty(KEYS.invulnerable, safe.invulnerable);
    // 同步客户端属性
    entity.setProperty("customnpc:skin_id", safe.skinId);
    entity.setProperty("customnpc:arm_model", safe.armModel);
    // 同步AI组件组状态
    syncAiComponent(entity, safe.aiEnabled);
    // 同步显示名称
    entity.nameTag = safe.name;
    return safe;
}

// 同步AI组件组
function syncAiComponent(entity, aiEnabled) {
    try {
        entity.triggerEvent(aiEnabled ? "customnpc:enable_ai" : "customnpc:disable_ai");
    } catch {
        // 事件失败忽略
    }
}

// 初始化NPC
export function initializeNpc(entity) {
    if (entity.typeId !== "customnpc:npc") return;
    const skinId = clampSkin(getNumber(entity, KEYS.skinId, -1));

    // 名称缺失或锁定
    let name = getText(entity, KEYS.name, "");
    if (!name || isNameLocked(skinId)) {
        name = getFixedName(skinId) ?? DEFAULTS.name;
        entity.setDynamicProperty(KEYS.name, name);
    }

    // 写入默认值
    if (entity.getDynamicProperty(KEYS.skinId) === undefined) entity.setDynamicProperty(KEYS.skinId, skinId);
    // armModel由skinId派生
    entity.setDynamicProperty(KEYS.armModel, getArmModel(skinId));
    if (entity.getDynamicProperty(KEYS.dialogues) === undefined) setJson(entity, KEYS.dialogues, DEFAULTS.dialogues);
    if (entity.getDynamicProperty(KEYS.commands) === undefined) setJson(entity, KEYS.commands, DEFAULTS.commands);
    if (entity.getDynamicProperty(KEYS.aiEnabled) === undefined) entity.setDynamicProperty(KEYS.aiEnabled, DEFAULTS.aiEnabled);
    if (entity.getDynamicProperty(KEYS.invulnerable) === undefined) entity.setDynamicProperty(KEYS.invulnerable, DEFAULTS.invulnerable);

    // 同步客户端属性
    entity.setProperty("customnpc:skin_id", skinId);
    entity.setProperty("customnpc:arm_model", getArmModel(skinId));
    entity.nameTag = name;

    // 恢复AI状态
    const aiEnabled = getFlag(entity, KEYS.aiEnabled, DEFAULTS.aiEnabled);
    syncAiComponent(entity, aiEnabled);
}

// 迁移NPC
export function migrateNpc(entity) {
    if (entity.typeId !== "customnpc:npc") return false;
    const skinId = clampSkin(getNumber(entity, KEYS.skinId, DEFAULTS.skinId));
    const expectedArm = getArmModel(skinId);
    const storedArm = getNumber(entity, KEYS.armModel, -1);
    let migrated = false;

    // 修正armModel
    if (storedArm !== expectedArm) {
        entity.setDynamicProperty(KEYS.armModel, expectedArm);
        migrated = true;
    }
    // 同步客户端属性
    try {
        entity.setProperty("customnpc:skin_id", skinId);
        entity.setProperty("customnpc:arm_model", expectedArm);
    } catch {
        // 属性设置失败忽略
    }
    // 锁定皮肤固定名
    if (isNameLocked(skinId)) {
        const fixed = getFixedName(skinId);
        const currentName = getText(entity, KEYS.name, "");
        if (fixed && currentName !== fixed) {
            entity.setDynamicProperty(KEYS.name, fixed);
            entity.nameTag = fixed;
            migrated = true;
        }
    } else {
        // 同步nameTag
        const name = getText(entity, KEYS.name, DEFAULTS.name);
        if (entity.nameTag !== name) entity.nameTag = name;
    }
    // 恢复AI组件组
    const aiEnabled = getFlag(entity, KEYS.aiEnabled, DEFAULTS.aiEnabled);
    syncAiComponent(entity, aiEnabled);
    return migrated;
}

export { KEYS, DEFAULTS };
