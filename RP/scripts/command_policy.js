// 命令安全策略层
// 严格白名单，未列入的一律拒绝
// 玩家数据通过 {player} 占位符注入，禁止替换 @p

// 允许的命令定义：命令名 -> {maxArgs, desc}
// maxArgs 包含命令名本身
const ALLOWED_COMMANDS = Object.freeze({
    say: { maxArgs: 8, desc: "广播消息" },
    tellraw: { maxArgs: 8, desc: "原始JSON消息" },
    give: { maxArgs: 6, desc: "给予物品" },
    effect: { maxArgs: 6, desc: "状态效果" },
    tag: { maxArgs: 5, desc: "实体标签" },
    scoreboard: { maxArgs: 6, desc: "记分板 players 子句" }
});

// 命令最大长度
const MAX_COMMAND_LENGTH = 128;

// 玩家名允许 Unicode，但拒绝命令注入字符
const PLAYER_NAME_SAFE = /^[^"\\\r\n]{1,64}$/;

// 校验玩家名
function isValidPlayerName(name) {
    return typeof name === "string" && PLAYER_NAME_SAFE.test(name);
}

// 解析并校验命令，返回 {ok, reason, parsed}
export function validateCommand(command, playerName) {
    if (typeof command !== "string") return { ok: false, reason: "命令非字符串" };
    const trimmed = command.trim().replace(/^\//, "");
    if (!trimmed) return { ok: false, reason: "命令为空" };
    if (trimmed.length > MAX_COMMAND_LENGTH) return { ok: false, reason: `命令超长(>${MAX_COMMAND_LENGTH})` };

    // 按空白拆分，第一个token为命令名
    const tokens = trimmed.split(/\s+/);
    const cmdName = tokens[0].toLowerCase();

    // scoreboard 仅允许 players 子句
    if (cmdName === "scoreboard") {
        if (tokens.length < 2 || tokens[1].toLowerCase() !== "players") {
            return { ok: false, reason: "仅允许 scoreboard players" };
        }
    }

    const rule = ALLOWED_COMMANDS[cmdName];
    if (!rule) return { ok: false, reason: `命令 '${cmdName}' 不在白名单` };
    if (tokens.length > rule.maxArgs) return { ok: false, reason: `参数过多(>${rule.maxArgs})` };

    // 拒绝任何形式的危险命令间接调用
    const lowered = trimmed.toLowerCase();
    if (/\b(execute|function|schedule|scriptevent|op|deop|permission|reload|gamerule|kick|ban|pardon|stop)\b/.test(lowered)) {
        return { ok: false, reason: "包含被禁命令关键字" };
    }

    // {player} 占位符校验
    if (playerName !== undefined) {
        if (!isValidPlayerName(playerName)) return { ok: false, reason: "玩家名非法" };
    }

    return { ok: true, parsed: trimmed };
}

// 替换 {player} 占位符，仅此一处注入
export function buildCommand(command, playerName) {
    if (!isValidPlayerName(playerName)) throw new Error("非法玩家名");
    // 仅替换 {player}，不动 @p 等其他文本
    return command.replace(/\{player\}/g, `"${playerName}"`);
}

export { ALLOWED_COMMANDS, MAX_COMMAND_LENGTH };
