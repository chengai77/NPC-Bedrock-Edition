// NPC数据持久化层
// 仅负责初始化、读取、验证、保存、迁移
// armModel 由 skinId 的 registry 唯一派生，不接受外部输入
import { getArmModel, isNameLocked, getFixedName, SKIN_COUNT } from "./skin_registry.js";

// 动态属性Key，统一前缀
const KEYS = Object.freeze({
    name: "customnpc:name",
    skinId: "customnpc:skin_id",
    armModel: "customnpc:arm_model",
    dialogues: "customnpc:dialogues",
    commands: "customnpc:commands",
    aiEnabled: "customnpc:ai_enabled",
    invulnerable: "customnpc:invulnerable"
});

// 数据上限，防止动态属性超长
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

// 读取字符串属性
function getText(entity, key, fallback) {
    const value = entity.getDynamicProperty(key);
    return typeof value === "string" ? value : fallback;
}

// 读取数值属性
function getNumber(entity, key, fallback) {
    const value = entity.getDynamicProperty(key);
    return typeof value === "number" ? value : fallback;
}

// 读取布尔属性
function getFlag(entity, key, fallback) {
    const value = entity.getDynamicProperty(key);
    return typeof value === "boolean" ? value : fallback;
}

// 读取JSON属性，损坏回退默认值
function getJson(entity, key, fallback) {
    try {
        const parsed = JSON.parse(getText(entity, key, ""));
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

// 写入JSON属性，超长抛错由调用方处理
function setJson(entity, key, value) {
    const str = JSON.stringify(value);
    if (str.length > LIMITS.maxJsonBytes) {
        throw new Error(`数据超长(${str.length}>${LIMITS.maxJsonBytes})`);
    }
    entity.setDynamicProperty(key, str);
}

// 限制皮肤槽位范围
function clampSkin(skinId) {
    const id = Math.floor(skinId);
    return Math.max(1, Math.min(SKIN_COUNT, id));
}

// 截断字符串到指定长度
function clampStr(s, max) {
    return typeof s === "string" ? s.slice(0, max) : "";
}

// 验证对话按钮
function normalizeDialogueButton(button, fallbackText) {
    const source = button && typeof button === "object" ? button : {};
    const text = clampStr(source.text || fallbackText, LIMITS.buttonTextLength).trim();
    const nextId = Number.isInteger(source.nextId) ? source.nextId : null;
    const command = clampStr(source.command || "", LIMITS.commandLength).trim().replace(/^\//, "");
    const closeAfterCommand = source.closeAfterCommand === true;
    const closeMenu = source.closeMenu === true
        || (text === "关闭" && nextId === null && !command && source.closeAfterCommand !== true);
    return { text: text || fallbackText, nextId, command, closeAfterCommand, closeMenu };
}

// 验证对话节点，兼容旧版 first/second 数据
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

// 验证NPC数据，回退安全默认值
// armModel 始终由 skinId 派生，不接受 data.armModel 输入
export function validateNpcData(data) {
    const safe = { ...DEFAULTS };
    if (data && typeof data === "object") {
        if (typeof data.skinId === "number") safe.skinId = clampSkin(data.skinId);
        // armModel 由 registry 派生，不接受外部输入
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
            safe.commands = data.commands.filter(isValidCommand).slice(0, LIMITS.maxCommands);
        }
        if (typeof data.aiEnabled === "boolean") safe.aiEnabled = data.aiEnabled;
        if (typeof data.invulnerable === "boolean") safe.invulnerable = data.invulnerable;
    } else {
        safe.armModel = getArmModel(safe.skinId);
    }
    // 名称锁定皮肤强制使用固定名
    if (isNameLocked(safe.skinId)) {
        const fixed = getFixedName(safe.skinId);
        if (fixed) safe.name = fixed;
    }
    return safe;
}

// 加载NPC数据为结构化对象
// armModel 不读取旧持久化值作为有效输入，始终由 skinId 派生
export function loadNpc(entity) {
    const skinId = clampSkin(getNumber(entity, KEYS.skinId, DEFAULTS.skinId));
    const data = {
        name: getText(entity, KEYS.name, DEFAULTS.name),
        skinId,
        // armModel 由 registry 派生，忽略持久化中的旧值
        armModel: getArmModel(skinId),
        dialogues: getJson(entity, KEYS.dialogues, DEFAULTS.dialogues),
        commands: getJson(entity, KEYS.commands, DEFAULTS.commands),
        aiEnabled: getFlag(entity, KEYS.aiEnabled, DEFAULTS.aiEnabled),
        invulnerable: getFlag(entity, KEYS.invulnerable, DEFAULTS.invulnerable)
    };
    return validateNpcData(data);
}

// 保存NPC数据，同步实体属性与nameTag
// armModel 只保存由 registry 派生的值，作为客户端缓存
export function saveNpc(entity, data) {
    const safe = validateNpcData(data);
    entity.setDynamicProperty(KEYS.name, safe.name);
    entity.setDynamicProperty(KEYS.skinId, safe.skinId);
    entity.setDynamicProperty(KEYS.armModel, safe.armModel);
    setJson(entity, KEYS.dialogues, safe.dialogues);
    setJson(entity, KEYS.commands, safe.commands);
    entity.setDynamicProperty(KEYS.aiEnabled, safe.aiEnabled);
    entity.setDynamicProperty(KEYS.invulnerable, safe.invulnerable);
    // 同步客户端渲染属性
    entity.setProperty("customnpc:skin_id", safe.skinId);
    entity.setProperty("customnpc:arm_model", safe.armModel);
    // 同步AI组件组状态
    syncAiComponent(entity, safe.aiEnabled);
    // 同步显示名称，不追加状态后缀
    entity.nameTag = safe.name;
    return safe;
}

// 同步AI组件组，通过实体事件增删
function syncAiComponent(entity, aiEnabled) {
    try {
        entity.triggerEvent(aiEnabled ? "customnpc:enable_ai" : "customnpc:disable_ai");
    } catch {
        // 事件触发失败忽略，不影响数据保存
    }
}

// 初始化NPC，仅在缺失数据时写入默认值
// 无条件将客户端属性设置为 registry 结果，处理旧实体和版本升级
export function initializeNpc(entity) {
    if (entity.typeId !== "customnpc:npc") return;
    const skinId = clampSkin(getNumber(entity, KEYS.skinId, -1));

    // 名称缺失或锁定皮肤强制固定名
    let name = getText(entity, KEYS.name, "");
    if (!name || isNameLocked(skinId)) {
        name = getFixedName(skinId) ?? DEFAULTS.name;
        entity.setDynamicProperty(KEYS.name, name);
    }

    // 写入缺失的默认值
    if (entity.getDynamicProperty(KEYS.skinId) === undefined) entity.setDynamicProperty(KEYS.skinId, skinId);
    // armModel 始终写入 registry 派生值，覆盖旧缓存
    entity.setDynamicProperty(KEYS.armModel, getArmModel(skinId));
    if (entity.getDynamicProperty(KEYS.dialogues) === undefined) setJson(entity, KEYS.dialogues, DEFAULTS.dialogues);
    if (entity.getDynamicProperty(KEYS.commands) === undefined) setJson(entity, KEYS.commands, DEFAULTS.commands);
    if (entity.getDynamicProperty(KEYS.aiEnabled) === undefined) entity.setDynamicProperty(KEYS.aiEnabled, DEFAULTS.aiEnabled);
    if (entity.getDynamicProperty(KEYS.invulnerable) === undefined) entity.setDynamicProperty(KEYS.invulnerable, DEFAULTS.invulnerable);

    // 无条件同步客户端渲染属性与nameTag
    entity.setProperty("customnpc:skin_id", skinId);
    entity.setProperty("customnpc:arm_model", getArmModel(skinId));
    entity.nameTag = name;

    // 恢复AI组件组状态
    const aiEnabled = getFlag(entity, KEYS.aiEnabled, DEFAULTS.aiEnabled);
    syncAiComponent(entity, aiEnabled);
}

// 迁移NPC：发现skin_id与arm_model不匹配时只修正arm_model
// 不得改动名称、对话、命令、AI状态
export function migrateNpc(entity) {
    if (entity.typeId !== "customnpc:npc") return false;
    const skinId = clampSkin(getNumber(entity, KEYS.skinId, DEFAULTS.skinId));
    const expectedArm = getArmModel(skinId);
    const storedArm = getNumber(entity, KEYS.armModel, -1);
    let migrated = false;

    // arm_model 不匹配则修正
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
    // 名称锁定皮肤强制固定名（不覆盖其他名称）
    if (isNameLocked(skinId)) {
        const fixed = getFixedName(skinId);
        const currentName = getText(entity, KEYS.name, "");
        if (fixed && currentName !== fixed) {
            entity.setDynamicProperty(KEYS.name, fixed);
            entity.nameTag = fixed;
            migrated = true;
        }
    } else {
        // 普通皮肤同步nameTag
        const name = getText(entity, KEYS.name, DEFAULTS.name);
        if (entity.nameTag !== name) entity.nameTag = name;
    }
    // 恢复AI组件组
    const aiEnabled = getFlag(entity, KEYS.aiEnabled, DEFAULTS.aiEnabled);
    syncAiComponent(entity, aiEnabled);
    return migrated;
}

export { KEYS, DEFAULTS };
