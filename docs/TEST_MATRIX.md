# 测试矩阵 V1-V14

> 静态验证由工具脚本完成；游戏内验证需在 Minecraft Bedrock 1.26.10 中逐项确认。
> 整改版本：1.1.0（含 P0/P1/P2 整改）

## 静态验证结果

| 工具 | 结果 |
|---|---|
| `python tools/validate_pack.py` | 待运行 |
| `python tools/detect_skin_models.py` | 待运行（歧义失败机制） |
| `npx tsc --noEmit` | 待运行 |
| `python tools/build_mcaddon.py` | 待运行 |

## 游戏内验收矩阵

| 编号 | 验收项 | 预期结果 | 游戏内验证 |
|---|---|---|---|
| V1 | BP、RP 同时加载 | Content Log 无阻断错误 | 待验证 |
| V2 | 脚本加载探针 | 出现加载消息且无 JS 异常 | 待验证 |
| V3 | `/give @s customnpc:npc_spawn_egg 1` | 成功给出 | 待验证 |
| V4 | 生成蛋显示名称 | 严格为"NPC"，图标正常 | 待验证 |
| V5 | `/summon customnpc:npc ~ ~ ~` | 成功生成实体 | 待验证 |
| V6 | 生成蛋生成实体 | 生成 customnpc:npc | 待验证 |
| V7 | 创造模式右键 | 打开编辑界面 | 待验证 |
| V8 | 生存/冒险右键 | 只打开对话界面 | 待验证 |
| V9 | 重进世界 | 名称/对话/命令/皮肤/AI 保留 | 待验证 |
| V10 | 固定名称 | npc_1=作者, npc_2=星野 | 待验证 |
| V11 | 手臂模型 | Classic/Slim 宽度/UV/第二层正确 | 待验证 |
| V12 | AI 开关 | 自然行走与完全静止，无滑行/穿墙 | 待验证 |
| V13 | 命令白名单 | 允许合法，拒绝 execute/function/schedule 等 | 待验证 |
| V14 | 多人一致 | 两名玩家看到名称/皮肤/对话/AI 一致 | 待验证 |

## 整改重点验证

### P0-1 命令白名单
- 创造编辑者输入 `execute as @s run op Steve` 应被拒绝保存
- 创造编辑者输入 `function mypack:dangerous` 应被拒绝保存
- 创造编辑者输入 `say 欢迎 {player}` 应保存成功
- 普通玩家触发对话时执行已保存命令

### P0-2 armModel 派生
- 故意制造 skin_id=2 搭配 armModel=0 的旧数据，加载后自动恢复为 Slim
- skin_id=1 始终为 Classic

### P0-3 AI 实体组件组
- 关闭 AI 时 NPC 完全静止
- 开启 AI 后 NPC 自然迈步，双腿双臂反向摆动
- 坡地/墙边/水边移动正常，不穿墙不滑行
- 名称不追加 [AI] 等状态后缀

### P1-1 既有实体迁移
- 升级前已有的 NPC 在世界加载后自动同步 skin_id/arm_model 客户端属性
- 迁移不改动名称/对话/命令/AI 状态

### P1-2 数据上限
- 名称超 32 字被拒
- 对话超 256 字被拒
- 对话达 20 条后添加入口禁用
- 命令达 10 条后添加入口禁用
- 皮肤选择分页（每页 20 项，5 页）

## Content Log 检查项

参见 [CONTENT_LOG_CHECKLIST.md](./CONTENT_LOG_CHECKLIST.md)
