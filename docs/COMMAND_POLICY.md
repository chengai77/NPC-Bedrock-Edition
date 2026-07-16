# 命令白名单策略

> 本文档定义 NPC 可执行命令的允许列表、参数限制、执行身份与拒绝规则。
> 普通玩家只能触发已保存、已校验的命令；创造编辑者保存命令时即完成解析校验。

## 允许的命令

第一期仅允许以下命令类型，未列入的一律拒绝：

| 命令 | 最大参数数(含命令名) | 说明 |
|---|---|---|
| `say` | 8 | 广播消息 |
| `tellraw` | 8 | 原始 JSON 消息 |
| `give` | 6 | 给予物品 |
| `effect` | 6 | 状态效果 |
| `tag` | 5 | 实体标签 |
| `scoreboard players` | 6 | 记分板 players 子句（仅此子句） |

## 长度限制

- 单条命令最大长度：128 字符
- 命令说明最大长度：32 字符（见 `npc_repository.js` 的 `LIMITS.descLength`）

## 玩家数据注入

- 使用唯一占位符 `{player}` 代指触发对话的玩家
- 保存时校验占位符，运行时仅替换 `{player}` 为 `"玩家名"`
- 玩家名必须匹配 `^[A-Za-z0-9_]{1,16}$`，否则拒绝
- **禁止**将命令内 `@p` 文本替换为玩家名（会导致命令注入）

示例：`say 欢迎 {player}` → 执行时变为 `say 欢迎 "Steve"`

## 被拒绝的命令

以下命令及其任何间接形式一律拒绝：

- `execute`（可链式调用任意命令）
- `function`（可调用高权限函数）
- `schedule`（可延迟执行危险逻辑）
- `scriptevent`（可触发脚本事件递归）
- `op` / `deop` / `permission`（权限提升）
- `reload` / `gamerule`（影响游戏规则）
- `kick` / `ban` / `pardon`（影响其他玩家）
- `stop`（停止服务器）
- 任何未列入白名单的命令

## 执行身份

- 所有命令通过 `npc.dimension.runCommandAsync(cmd)` 执行
- 执行身份为维度级，影响面为该维度的所有玩家与实体
- 因此白名单必须严格，任何可影响权限或全局状态的命令均被拒绝

## 校验流程

1. **保存时校验**（创造编辑者输入命令时）：
   - 调用 `validateCommand(command, playerName)`
   - 第一个 token 必须在白名单
   - 参数数量不超过上限
   - 不包含被禁关键字
   - 长度不超过上限
   - 校验失败则拒绝保存，向玩家显示具体原因

2. **运行时校验**（普通玩家触发对话时）：
   - 再次调用 `validateCommand` 防止数据被外部篡改
   - 通过 `buildCommand(command, playerName)` 替换 `{player}`
   - 执行失败不中断后续命令

## 测试样例

### 应被拒绝保存的样例

```mcfunction
execute as @s run op Steve
function mypack:dangerous
schedule function mypack:dangerous 1t
scriptevent mypack:trigger
op Steve
deop Steve
reload
gamerule doDaylightCycle false
kick Steve
ban Steve
kill @e
summon zombie
```

### 应被允许保存的样例

```mcfunction
say 欢迎 {player}
tellraw @a {"rawtext":[{"text":"你好"}]}
give {player} apple 1
effect {player} speed 10 1
tag {player} add visitor
scoreboard players add {player} visits 1
```

## 相关文件

- 命令策略实现：[BP/scripts/command_policy.js](../BP/scripts/command_policy.js)
- 表单调用：[BP/scripts/npc_forms.js](../BP/scripts/npc_forms.js)
- 数据上限：[BP/scripts/npc_repository.js](../BP/scripts/npc_repository.js) 的 `LIMITS`
