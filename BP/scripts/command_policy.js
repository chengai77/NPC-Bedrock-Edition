// 命令输入规范化
// 允许任意单行 Minecraft 命令

const MAX_COMMAND_LENGTH = 1024;
const PLAYER_NAME_SAFE = /^[^"\\\r\n]{1,64}$/;

function isValidPlayerName(name) {
    return typeof name === "string" && PLAYER_NAME_SAFE.test(name);
}

// 仅拒绝无法作为单条命令执行的输入
export function validateCommand(command, playerName) {
    if (typeof command !== "string") return { ok: false, reason: "命令非字符串" };
    const trimmed = command.trim().replace(/^\//, "");
    if (!trimmed) return { ok: false, reason: "命令为空" };
    if (trimmed.length > MAX_COMMAND_LENGTH) return { ok: false, reason: `命令超长(>${MAX_COMMAND_LENGTH})` };
    if (/[\r\n]/.test(trimmed)) return { ok: false, reason: "命令不能换行" };
    if (playerName !== undefined && !isValidPlayerName(playerName)) {
        return { ok: false, reason: "玩家名非法" };
    }
    return { ok: true, parsed: trimmed };
}

// 仅替换 {player}，不改动选择器或命令参数
export function buildCommand(command, playerName) {
    if (!isValidPlayerName(playerName)) throw new Error("非法玩家名");
    return command.replace(/\{player\}/g, `"${playerName}"`);
}

export { MAX_COMMAND_LENGTH };
