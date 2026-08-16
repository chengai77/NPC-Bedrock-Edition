# 自定义NPC · 基岩版附加包

> 一个面向 Minecraft 基岩版的可交互 NPC 附加包，提供创造模式编辑器、交互模式、剧情模式、命令执行、100 套预设皮肤与 AI 行为。

## 基本信息

| 项目 | 内容 |
| --- | --- |
| 模组名称 | 自定义NPC |
| 附加包版本 | 1.1.69 |
| 最低引擎版本 | 1.26.10 |
| Script API | @minecraft/server 2.8.0 |
| UI API | @minecraft/server-ui 2.1.0 |
| 自定义实体 | `customnpc:npc` |
| 生成蛋物品 | `customnpc:npc_spawn_egg` |
| 作者 | 承挨 |

## 功能特性

### 核心交互
- **NPC 生成蛋**：创造模式物品栏可取，右键地面生成 NPC
- **创造模式右键 NPC** → 打开编辑器（名称 / 对话 / 指令 / 皮肤 / AI / 无敌 / 删除）
- **生存或冒险模式右键 NPC** → 按 NPC 模式进入交互对话或剧情独白
- **无敌保护**：开启后 NPC 免疫任何伤害

### 编辑器能力
- 名称编辑（部分皮肤名称锁定）
- 模式管理：所有显示文本可输入 `/n` 换行；剧情模式使用独白窗口，无选择框
- 对话布局：正文加大，按钮从窗口底部向上排列；内容过长时支持滚动
- 指令管理：支持 `{player}` 占位符（最多 10 条），通过 ID 引用，修改后自动同步所有关联按钮
- 皮肤选择：100 套预设，自动匹配 Classic/Slim 双臂型
- AI 开关、无敌开关、删除 NPC

### 皮肤系统
- 共 **100** 套预设皮肤，存放于 `RP/textures/entity/npc_skins/npc_1.png` ~ `npc_100.png`
- 双几何模型：`npc_classic.geo.json`（粗臂）、`npc_slim.geo.json`（细臂）
- 特殊槽位：
  - `npc_1` → 名称固定为「作者」，锁定不可改
  - `npc_2` → 默认名称「星野」，可更改

### 命令策略
- 仅允许单行命令，自动去除前导 `/`
- 命令长度上限 1024 字符
- 仅替换 `{player}` 占位符，不改写选择器与参数
- 玩家名校验：禁止引号、反斜杠、换行
- 每条命令分配唯一 ID（`command_1`、`command_2`…），对话按钮通过 `commandId` 引用，修改或删除命令时自动同步关联按钮

### 小木棍与区块填充
- **小木棍**（`customnpc:wooden_wand`）：创造模式物品栏「工具」分类获取，用于选定方块区域
- 左键方块 → 选区第 1 点；右键方块 → 选区第 2 点（会拦截原破坏/交互行为）
- 填充任务支持 **5,000,000** 方块上限、半径上限 512，远区块自动临时加载（tickingarea），完成后自动清理
- 仅创造模式可用，每位玩家最多同时 4 个任务

#### 小木棍指令表

| 指令 | 说明 |
| --- | --- |
| `/scriptevent customnpc:xhelp` | 查看指令帮助 |
| `/scriptevent customnpc:xstatus` | 查看选区坐标与任务进度 |
| `/scriptevent customnpc:xcancel` | 取消自己全部填充任务 |
| `/scriptevent customnpc:xfill x1 y1 z1 x2 y2 z2 方块ID` | 矩形填充（支持 `~` 相对坐标） |
| `/scriptevent customnpc:xfill sel 方块ID` | 用「小木棍」选区填充（如 `sel stone`） |
| `/scriptevent customnpc:xplatform here 半径 方块ID` | 脚下生成圆形平台（如 `here 198 stone`） |
| `/scriptevent customnpc:xplatform x y z 半径 方块ID` | 指定坐标生成圆形平台 |

> 方块ID 支持省略 `minecraft:` 前缀；填充进度每隔 40 tick 播报一次，完成后统计放置/跳过/失败数量。

### 数据持久化

- 全部数据通过实体动态属性（DynamicProperty）存储，统一前缀 `customnpc:`
- 内置迁移逻辑（`migrateNpc`）兼容旧数据
- 数据上限保护（JSON ≤ 30 KB），损坏自动回退默认值
- 命令引用同步（`synchronizeCommandReferences`），命令内容变更自动更新所有引用该命令的按钮，命令删除时引用自动清空

## 项目结构

```
自定义npc/
├── BP/                              行为包
│   ├── manifest.json
│   ├── entities/npc.json
│   ├── items/npc_spawn_egg.json
│   ├── scripts/
│   │   ├── main.js                  主入口：同步/无敌/定时巡检
│   │   ├── npc_interaction.js       交互层：取消默认交互并分发 UI
│   │   ├── npc_forms.js             UI 表单：编辑器 / 对话 / 交易
│   │   ├── npc_repository.js        数据持久化与迁移
│   │   ├── command_policy.js        命令校验与构建
│   │   └── skin_registry.js         皮肤注册表（臂型/锁定名）
│   └── texts/                       en_US / zh_CN / languages.json
├── RP/                              资源包
│   ├── manifest.json
│   ├── animations/npc.animation.json
│   ├── entities/npc.json
│   ├── entity/npc.entity.json
│   ├── models/entity/
│   │   ├── npc_classic.geo.json     粗臂模型
│   │   └── npc_slim.geo.json        细臂模型
│   ├── render_controllers/npc.render_controllers.json
│   ├── textures/
│   │   ├── entity/npc_skins/        100 套皮肤
│   │   ├── items/npc_spawn_egg_v3.png
│   │   └── item_texture.json
│   └── texts/
├── package.json  tsconfig.json
├── 版权声明.txt
└── README.md
```

## 安装与使用

### 安装
1. 关闭 Minecraft
2. 运行 `python tools/import_bedrock_pack.py` 自动导入 BP/RP
3. 打开 Minecraft，在世界设置中启用「自定义NPC」行为包与资源包

> 自动导入脚本会同步 `behavior_packs/` 与 `resource_packs/`，并校验稳定 Script API 依赖；不需要开启 Beta API 或其他实验功能。

### 使用
- **生成 NPC**：创造模式取「NPC 生成蛋」右键地面
- **编辑 NPC**：创造模式右键 NPC 打开编辑器
- **交互/剧情**：生存或冒险模式右键 NPC，根据模式显示按钮交互或剧情独白

### 手动打包
- 选中 `BP/` 与 `RP/` 两个文件夹，右键压缩为 zip
- 将后缀 `.zip` 重命名为 `.mcaddon`
- `.mcaddon` 内必须直接包含 `BP/` 与 `RP/`，不要多套一层外部文件夹

## 数据上限

| 项 | 上限 |
| --- | --- |
| NPC 名称 | 32 字符 |
| 交互节点数 | 20 |
| 剧情文本数 | 20 |
| 每节点按钮数 | 6 |
| 指令条数 | 10 |
| 单条指令长度 | 512 字符（策略层校验 1024） |
| 交互/剧情文本 | 1024 字符 |
| 交互首页描述 | 1024 字符 |
| 按钮文本 | 32 字符 |
| 单 NPC JSON | 30 KB |

## 注意事项

1. 本附加包仅依赖稳定版 Script API，不需要开启 Beta API 或其他实验功能
2. 文本换行：输入 `/n`，例如 `第一行/n第二行`
3. 皮肤文件需为 **64×64** PNG
4. 单世界 NPC 数量过多会增加定时巡检开销，建议合理控制
5. AI 开启后 NPC 会自主游荡，避免在狭小空间内设置过大游荡半径

## 版权声明

© 2026 承挨. 保留所有权利.
