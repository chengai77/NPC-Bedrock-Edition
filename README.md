# 自定义NPC · 基岩版附加包

> 一个面向 Minecraft 基岩版的可交互 NPC 附加包，提供创造模式编辑器、生存模式对话、命令执行、100 套预设皮肤与 AI 行为。

## 基本信息

| 项目 | 内容 |
| --- | --- |
| 模组名称 | 自定义NPC |
| 附加包版本 | 1.1.20 |
| 最低引擎版本 | 1.26.33 |
| Script API | @minecraft/server 2.8.0 |
| UI API | @minecraft/server-ui 2.1.0 |
| 自定义实体 | `customnpc:npc` |
| 生成蛋物品 | `customnpc:npc_spawn_egg` |
| 作者 | 承挨 |

## 功能特性

### 核心交互
- **NPC 生成蛋**：创造模式物品栏可取，右键地面生成 NPC
- **创造模式右键 NPC** → 打开编辑器（名称 / 对话 / 指令 / 皮肤 / AI / 无敌 / 删除）
- **生存或冒险模式右键 NPC** → 进入对话界面，按钮可触发关联指令
- **无敌保护**：开启后 NPC 免疫任何伤害

### 编辑器能力
- 名称编辑（部分皮肤名称锁定）
- 对话节点管理：文本、跳转链接、按钮（最多 20 节点 / 每节点 6 按钮）
- 指令管理：支持 `{player}` 占位符（最多 10 条）
- 皮肤选择：100 套预设，自动匹配 Classic/Slim 双臂型
- AI 开关、无敌开关、删除 NPC

### 皮肤系统
- 共 **100** 套预设皮肤，存放于 `RP/textures/entity/npc_skins/npc_1.png` ~ `npc_100.png`
- 双几何模型：`npc_classic.geo.json`（粗臂）、`npc_slim.geo.json`（细臂）
- 由 `tools/detect_skin_models.py` 自动检测臂型并写入 `skin_registry.js`
- 特殊槽位：
  - `npc_1` → 名称固定为「作者」，锁定不可改
  - `npc_2` → 默认名称「星野」，可更改

### 命令策略
- 仅允许单行命令，自动去除前导 `/`
- 命令长度上限 1024 字符
- 仅替换 `{player}` 占位符，不改写选择器与参数
- 玩家名校验：禁止引号、反斜杠、换行

### 数据持久化
- 全部数据通过实体动态属性（DynamicProperty）存储，统一前缀 `customnpc:`
- 内置迁移逻辑（`migrateNpc`）兼容旧数据
- 数据上限保护（JSON ≤ 30 KB），损坏自动回退默认值

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
│   │   ├── items/npc_spawn_egg.png
│   │   └── item_texture.json
│   └── texts/
├── tools/                           构建与校验脚本
│   ├── build_mcaddon.py             打包 .mcaddon
│   ├── detect_skin_models.py        皮肤臂型检测
│   ├── make_64x64_placeholders.py   占位贴图生成
│   ├── validate_pack.py             附加包校验
│   └── skin_overrides.json
├── package.json  tsconfig.json
├── 版权声明
└── README.md
```

## 安装与使用

### 安装
1. 执行 `python tools/build_mcaddon.py` 生成 `自定义npc.mcaddon`
2. 双击导入 Minecraft（基岩版 1.26.33 及以上）
3. 在世界设置中启用「自定义NPC」行为包与资源包，并开启「Beta API」实验功能

### 使用
- **生成 NPC**：创造模式取「NPC 生成蛋」右键地面
- **编辑 NPC**：创造模式右键 NPC 打开编辑器
- **对话**：生存或冒险模式右键 NPC

## 数据上限

| 项 | 上限 |
| --- | --- |
| NPC 名称 | 32 字符 |
| 对话节点数 | 20 |
| 每节点按钮数 | 6 |
| 指令条数 | 10 |
| 单条指令长度 | 512 字符（策略层校验 1024） |
| 对话文本 | 256 字符 |
| 按钮文本 | 32 字符 |
| 单 NPC JSON | 30 KB |

## 注意事项

1. 需在世界选项中启用 **Beta API / 实验功能**，否则脚本无法加载
2. 皮肤文件需为 **64×64** PNG
3. NPC 执行的指令受玩家自身权限限制
4. 单世界 NPC 数量过多会增加定时巡检开销，建议合理控制
5. AI 开启后 NPC 会自主游荡，避免在狭小空间内设置过大游荡半径

## 版权声明

© 2026 承挨. 保留所有权利.
