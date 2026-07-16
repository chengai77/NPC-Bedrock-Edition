# 自定义 NPC 附加包重构实施计划

> **交接对象：** 基岩版附加包程序员
>
> **项目位置：** `D:\封装\草方块社区\自定义npc`
>
> **目标版本：** Minecraft Bedrock `1.26.10`，`@minecraft/server 2.6.0`，`@minecraft/server-ui 1.3.0`
>
> **本文件只定义重构方向、结构、关键模式与验收标准。不得在旧实现上继续叠加补丁；应先归档旧 BP/RP，再按本计划新建实现。`

## 1. 目标与范围

构建一个可安装、可获取、可交互、可编辑、可持久化的自定义 NPC 附加包。

### 必须满足

1. 创造模式物品栏的生物蛋分组中出现名称严格为 `NPC` 的生成蛋。
2. 命令 `/give @s customnpc:npc_spawn_egg` 可稳定获取生成蛋。
3. 命令 `/summon customnpc:npc` 可稳定生成 NPC，用于将“实体注册”与“物品注册”分开验证。
4. 创造模式玩家空手右键 NPC，打开编辑 UI。
5. 生存和冒险模式玩家空手右键 NPC，打开已配置的对话 UI。
6. 编辑功能至少包含：名称、对话、命令、皮肤槽位、AI 行走开关、删除确认。
7. NPC 数据必须持久化：世界重进、脚本热重载后，名称、对话、命令、皮肤、AI 状态不得丢失。
8. 提供 `npc_1.png` 至 `npc_100.png` 的独立皮肤槽位，用户解包覆盖 PNG 后可替换预设。
9. `npc_1` 使用作者皮肤并自动显示 `作者`，名称不可修改；`npc_2` 默认名称为 `星野`。
10. 使用标准 64x64 玩家皮肤模型：Classic/Steve 粗臂、Slim/Alex 细臂、完整第二层。
11. 皮肤槽位与手臂模型自动匹配。运行时不猜测 PNG；由构建前检测清单决定槽位模型。
12. NPC 名称显示仅为用户设置的名称，不追加 AI、模式等状态后缀。

### 不做

- 不继续使用 `minecraft:npc` 作为载体。原版 NPC 无法可靠绑定每实体的客户端皮肤属性和自定义持久化数据。
- 不保留 NPC 方块、NPC 法杖、弹药或其他无关入口。
- 不实现自动识别任意新 PNG 的运行时逻辑。基岩版运行时脚本不能读取资源包中的 PNG。
- 不在未通过游戏内验证前声称“功能已完成”。

---

## 2. 现有实现审计结论

当前工程中的以下问题必须作为重构风险处理，而不是继续修补：

| 问题 | 影响 | 重构决策 |
|---|---|---|
| 物品 ID 没有在游戏内注册 | `/give` 报未知参数，生成蛋不可用 | 先单独验收物品注册，再开发实体/UI |
| BP/RP 曾出现循环依赖 | 包可能表面导入但内容不完整加载 | 只允许 BP 依赖 RP；RP 不反向依赖 BP |
| 物品格式曾使用未证实的 `1.26.10` | 物品 JSON 可能被忽略 | 物品采用已验证的兼容格式，并以 Content Log 为准 |
| Script API 仅做 Node 语法检查 | 游戏运行期错误会让 UI 整体失效 | 用官方 API 类型检查 + 游戏内启动探针 + Content Log 验证 |
| `GameMode` 被当小写字符串判断 | 创造模式进入错误分支 | 必须使用 `GameMode.Creative` 枚举 |
| after 交互事件依赖交互成功 | 自定义实体交互可能不触发 UI | 用 before 事件取消默认交互，再延迟到下一 tick 打开 UI |
| 皮肤槽位混有 64x32 文件 | 无法支持第二层、左右独立肢体、细臂 | 100 个槽位全部统一为 64x64 RGBA PNG |
| 透明外层与头部异常混淆 | 容易错误删除用户皮肤内容 | 分别验证材质、模型膨胀、UV、皮肤真实像素 |

---

## 3. 目标架构

### 3.1 包关系

```text
BP (行为包)
  ├─ 自定义物品与实体定义
  ├─ Script API：交互、表单、持久化、AI
  └─ dependencies：只依赖 RP 的 header UUID

RP (资源包)
  ├─ 物品图集
  ├─ NPC 客户端实体
  ├─ Classic / Slim 几何
  ├─ 渲染控制器与动画
  └─ 100 个 64x64 PNG 皮肤槽位
```

**禁止：** RP 依赖 BP。双向 UUID 依赖会让排错极其困难，且可能阻止包加载。

### 3.2 目录重建建议

先将现有实现完整复制到 `legacy_2026-07-15/`，该目录不得被新包加载。然后只新建如下结构：

```text
自定义npc/
├─ BP/
│  ├─ manifest.json
│  ├─ entities/
│  │  └─ npc.json
│  ├─ items/
│  │  └─ npc_spawn_egg.json
│  ├─ scripts/
│  │  ├─ main.js
│  │  ├─ npc_repository.js
│  │  ├─ npc_interaction.js
│  │  ├─ npc_forms.js
│  │  └─ skin_registry.js             # 构建工具生成，禁止手写100项
│  ├─ texts/
│  │  ├─ languages.json
│  │  ├─ zh_CN.lang
│  │  └─ en_US.lang
│  └─ pack_icon.png
├─ RP/
│  ├─ manifest.json
│  ├─ entity/
│  │  └─ npc.entity.json
│  ├─ models/entity/
│  │  ├─ npc_classic.geo.json
│  │  └─ npc_slim.geo.json
│  ├─ animations/
│  │  └─ npc.animation.json
│  ├─ render_controllers/
│  │  └─ npc.render_controllers.json
│  ├─ textures/
│  │  ├─ items_texture.json
│  │  ├─ items/npc_spawn_egg.png
│  │  └─ entity/npc_skins/
│  │     ├─ npc_1.png
│  │     ├─ npc_2.png
│  │     └─ npc_3.png ... npc_100.png
│  ├─ texts/
│  │  ├─ languages.json
│  │  ├─ zh_CN.lang
│  │  └─ en_US.lang
│  └─ pack_icon.png
├─ tools/
│  ├─ validate_pack.py
│  ├─ detect_skin_models.py
│  ├─ make_64x64_placeholders.py
│  └─ build_mcaddon.py
├─ docs/
│  ├─ TEST_MATRIX.md
│  ├─ CONTENT_LOG_CHECKLIST.md
│  └─ SKIN_SLOT_GUIDE.md
└─ NPC重构实施计划.md
```

---

## 4. 实施顺序与验收门

任何阶段未通过验收，不得进入下一阶段。每一阶段应提交一次独立可回退的版本。

### 阶段 A：最小包加载验证

**目标：** 先证明 BP 和 RP 能同时加载，不包含脚本、实体、物品。

1. 创建最小 BP/RP `manifest.json`。
2. BP 只依赖 RP header UUID；版本完全一致。
3. 两包均包含 `pack_icon.png`。
4. 导入后检查游戏的行为包、资源包列表：两包均显示，未显示依赖缺失。
5. 查看 Content Log：不得出现 manifest、UUID、dependency 错误。

**验收：** 创建测试世界并同时启用两个包，进入世界不报包加载错误。

### 阶段 B：物品注册优先

**目标：** 在没有实体、没有脚本前，先让生成蛋可获取且名称正确。

1. 新建 `BP/items/npc_spawn_egg.json`。
2. 使用经过目标版本实测的 item format version；候选为官方示例使用的 `1.20.20`，实际以 1.26.10 Content Log 结果为准。
3. `identifier` 固定为 `customnpc:npc_spawn_egg`。
4. `minecraft:display_name.value` 先固定为直接文本 `NPC`，不要同时混用语言键语义。
5. 配置 `minecraft:icon`，且 RP 只保留一个 `textures/items_texture.json`。
6. 暂时不要添加 `minecraft:entity_placer`，先只验证物品注册和名称。

**关键定义模式：**

```json
{
  "format_version": "1.20.20",
  "minecraft:item": {
    "description": {
      "identifier": "customnpc:npc_spawn_egg",
      "menu_category": {
        "category": "nature",
        "group": "itemGroup.name.spawnEgg",
        "is_hidden_in_commands": false
      }
    },
    "components": {
      "minecraft:display_name": { "value": "NPC" },
      "minecraft:max_stack_size": 64,
      "minecraft:icon": { "texture": "customnpc:npc_spawn_egg" }
    }
  }
}
```

**验收命令：**

```mcfunction
/give @s customnpc:npc_spawn_egg
```

**验收标准：**

- 命令不出现“意外的 customnpc:npc_spawn_egg”。
- 物品栏显示名称严格为 `NPC`。
- 创造模式 Nature / Spawn Eggs 分组可见。
- Content Log 无 item schema 或 atlas 错误。

### 阶段 C：实体注册与生成蛋联通

**目标：** 让实体和生成蛋建立最小闭环，不引入客户端皮肤或 UI。

1. 新建 `BP/entities/npc.json`，标识符固定 `customnpc:npc`。
2. 只添加最小生命、物理、碰撞箱、`minecraft:interact`、类型家族。
3. 先验证 `/summon customnpc:npc`。
4. 验证通过后才在物品中加入：

```json
"minecraft:entity_placer": {
  "entity": "customnpc:npc"
}
```

5. 再验证生成蛋生成实体。

**验收命令：**

```mcfunction
/summon customnpc:npc
/give @s customnpc:npc_spawn_egg
```

**验收标准：**

- `/summon` 可生成实体。
- 生成蛋可生成相同实体。
- 实体有交互提示，但此阶段可尚未弹出 UI。
- 若失败，必须先读取 Content Log，禁止改动脚本或渲染文件猜测修复。

### 阶段 D：Script API 启动探针

**目标：** 将“脚本是否加载”从猜测变为可观察事实。

1. 添加 Script 模块和只包含一个启动探针的 `BP/scripts/main.js`。
2. 顶层只订阅事件和 `system.run`，不得在 early-execution 直接调用世界修改 API。
3. 进入世界后一 tick 发送加载提示，例如 `NPC script loaded`。
4. 增加一个临时调试命令或聊天触发器，只输出当前版本号。
5. 使用项目安装的官方 `@minecraft/server@2.6.0` 和 `@minecraft/server-ui@1.3.0` 执行 `tsc --allowJs --checkJs --noEmit`。

**关键模式：**

```js
import { system, world } from "@minecraft/server";

system.run(() => {
    world.sendMessage("[Custom NPC] Script loaded");
});
```

**验收：**

- 进入世界后只出现一次加载消息。
- Content Log 没有脚本导入、模块版本、early-execution、未定义 API 错误。
- 看不到加载消息时，停止开发 UI，先修脚本加载。

### 阶段 E：交互与空表单

**目标：** 先使“右键必然触发表单”，表单内容仅显示诊断信息。

1. 监听 `world.beforeEvents.playerInteractWithEntity`。
2. 筛选 `target.typeId === "customnpc:npc"`。
3. 在 before 回调设置 `event.cancel = true`。
4. 使用 `system.run` 延迟到普通执行上下文打开 UI。
5. 使用枚举判断创造模式：`player.getGameMode() === GameMode.Creative`，不得比较小写字符串。
6. 对所有 `form.show(player)` Promise 使用 `.catch(...)`，将错误发给玩家和 Content Log。

**关键模式：**

```js
world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
    if (event.target.typeId !== "customnpc:npc") return;
    event.cancel = true;

    system.run(() => {
        const form = new ActionFormData()
            .title("NPC 调试")
            .body(`实体: ${event.target.typeId}`)
            .button("关闭");
        form.show(event.player).catch((error) => {
            event.player.sendMessage(`[NPC UI] ${error}`);
        });
    });
});
```

**验收：**

- 创造、生存、冒险三种模式均能空手右键打开 `NPC 调试`。
- 手持任意物品时行为应明确：推荐仍允许交互，但不得消耗物品。
- UI 不出现时，必须提供玩家可见的脚本错误或 Content Log 错误；不能“无反应”。

### 阶段 F：数据模型与持久化

**目标：** 先完成每个 NPC 的稳定数据读写，再开发完整表单。

建议使用实体 Dynamic Properties，全部使用 `customnpc:` 前缀。

| Key | 类型 | 默认值 | 说明 |
|---|---:|---|---|
| `customnpc:name` | string | `NPC` | 显示名称 |
| `customnpc:skin_id` | number | `1` | 1-100 的皮肤槽位 |
| `customnpc:arm_model` | number | `0` | 0=Classic，1=Slim |
| `customnpc:dialogues` | JSON string | `[]` | 对话列表 |
| `customnpc:commands` | JSON string | `[]` | 指令列表 |
| `customnpc:ai_enabled` | boolean | `false` | AI 行走状态 |

实现 `npc_repository.js`，仅负责：初始化、读取、验证、保存。不允许 UI 模块直接拼接动态属性名。

**关键接口建议：**

```js
export function initializeNpc(entity) {}
export function loadNpc(entity) {}
export function saveNpc(entity, data) {}
export function validateNpcData(data) {}
```

**验收：**

- 编辑名称、皮肤、AI 后离开世界再进入，数据不丢失。
- 不存在的或损坏 JSON 数据应回退安全默认值，而不是让脚本崩溃。

### 阶段 G：完整 UI

**目标：** 在交互和持久化已验收后，完成业务表单。

创造模式菜单：

1. 编辑名称。
2. 编辑对话。
3. 编辑触发指令。
4. 选择皮肤。
5. 切换 AI 行走。
6. 删除 NPC（二次确认）。

生存/冒险菜单：

1. 读取已保存的对话。
2. 显示 NPC 名称与对话文本。
3. 用户选择后按白名单策略执行已保存命令。

**命令安全规则：**

- 生存玩家不能输入或编辑命令。
- 只有创造编辑者可保存命令。
- 运行前拒绝命令方块、OP 权限修改、脚本事件递归等高风险命令，或改为明确的项目命令白名单。
- 命令执行身份必须在设计中固定：建议 `npc.dimension.runCommandAsync()`，并明确 `@p` 的替换策略。

**验收：**

- 创造玩家编辑后，生存/冒险玩家只能使用，不能进入编辑表单。
- UI 链接打开下一级菜单前必须 `system.runTimeout(..., 1)` 延迟一 tick。
- 所有取消按钮返回上一级或关闭，不产生重复 UI。

### 阶段 H：皮肤资产与模型

**目标：** 完整支持 64x64 标准玩家皮肤的经典/细臂及双层。

#### H1. 统一资产规格

1. `npc_1.png` 到 `npc_100.png` 必须全部为 PNG、RGBA、`64x64`。
2. `npc_1` 保留当前作者皮肤；`npc_2` 保留星野皮肤。
3. `npc_3` 到 `npc_100` 不得继续使用 64x32 占位图，统一转为透明 64x64 模板。
4. 构建脚本必须检查：文件数量、编号连续性、图像尺寸、Alpha 通道。

#### H2. 双模型

必须分开维护，不要把 Classic 和 Slim 骨骼混在同一个超大 geometry 文件中。

- `geometry.customnpc.classic`：双臂基础层宽度 4 px。
- `geometry.customnpc.slim`：双臂基础层宽度 3 px，使用 Slim 标准 UV 和坐标。
- 两模型均包含：head、body、right_arm、left_arm、right_leg、left_leg。
- 两模型均包含：hat、jacket、right_sleeve、left_sleeve、right_pants、left_pants。
- 外层使用标准 inflate，不能与基础层同一平面，避免 Z-fighting 点阵。

#### H3. 材质与透明

- 客户端实体材质使用 `entity_alphatest`。
- 不要使用不透明 `entity` 渲染玩家皮肤外层。
- 不要对皮肤 PNG 自动填色、二值化、删除外层像素；用户皮肤的帽子层白点/发饰可能是真实设计。
- 出现头部网点时，按顺序检查：外层 inflate、几何 UV、材质、PNG Alpha，再判断是否为皮肤本身像素。

#### H4. 自动手臂映射

基岩运行时不能读取 PNG，因此自动兼容必须在构建时完成：

1. `tools/detect_skin_models.py` 扫描 `npc_1..npc_100`。
2. 检查皮肤尺寸必须为 64x64。
3. 根据 Slim 未使用列检测手臂类型；检测存在歧义时打印 `AMBIGUOUS`。
4. 程序员维护 `tools/skin_overrides.json`，显式覆盖误判槽位。
5. 生成 `BP/scripts/skin_registry.js`。
6. 当编辑者选择皮肤时，脚本同时写入 `skin_id` 和其预生成的 `arm_model`。

**关键数据结构：**

```js
export const SKINS = Object.freeze({
    1: { armModel: 0, fixedName: "作者", nameLocked: true },
    2: { armModel: 1, fixedName: "星野", nameLocked: false }
});
```

未配置的槽位可安全回退为 Classic，但构建验证应提示程序员确认。

**验收矩阵：**

- `npc_1` Classic 基础层与外层正确。
- `npc_2` Slim 基础层与外层正确。
- 使用一张标准 Steve 测试皮肤验证粗臂。
- 使用一张标准 Alex 测试皮肤验证细臂。
- 使用一张只含帽子层透明孔洞的测试皮肤验证 Alpha 裁剪。
- 使用一张头部第二层完全透明的皮肤验证无 Z-fighting。

### 阶段 I：AI 行走

**目标：** AI 是附加能力，不影响交互、名称或持久化。

1. 默认关闭。
2. 开启后使用官方实体 AI 组件或脚本控制，二选一，不允许两套移动逻辑并存。
3. 若用 Script API，必须使用有限状态：idle、choose_target、move、pause。
4. 不允许每个 tick 对所有维度全量 teleport；应限定刷新频率、距离、实体数量。
5. AI 状态不得修改 `nameTag`。

**验收：**

- 关闭时 NPC 原地不动。
- 开启时 NPC 在半径限制内自然移动，不穿墙、不每 tick 闪烁。
- 编辑、对话、世界重进后 AI 状态保持。

### 阶段 J：发布验证与打包

1. 运行 `tools/validate_pack.py`：
   - JSON 可解析；
   - manifest UUID/版本/依赖合法；
   - 100 张皮肤均为 RGBA 64x64；
   - 皮肤 registry 覆盖 1-100；
   - 图集 key 与物品 icon key 对齐；
   - 不存在孤立的重复 atlas 文件；
   - BP 只有对 RP 的单向依赖。
2. 运行 JS 官方类型检查。
3. 执行 `tools/build_mcaddon.py`，禁止手动 Zip。
4. 用 Python `zipfile.testzip()` 验证归档。
5. 新版本号必须在 BP header、BP modules、BP 的 RP dependency、RP header、RP module 完全同步。
6. 每个候选构建在干净 Minecraft 存储环境导入测试；不能只覆盖安装旧包。

---

## 5. 游戏内验收清单

程序员必须逐项录屏或截图，并附 Content Log：

| 编号 | 操作 | 预期结果 |
|---|---|---|
| V1 | 导入 `.mcaddon` | BP/RP 都显示且无依赖错误 |
| V2 | 新建世界启用包 | 进入世界有一次 Script loaded 提示 |
| V3 | `/give @s customnpc:npc_spawn_egg` | 成功给出名称为 NPC 的蛋 |
| V4 | 创造物品栏搜索 NPC | 显示 NPC 生成蛋和正确图标 |
| V5 | `/summon customnpc:npc` | 成功生成实体 |
| V6 | 使用生成蛋 | 生成同一实体类型 |
| V7 | 创造模式空手右键 | 打开编辑菜单 |
| V8 | 生存模式空手右键 | 打开对话菜单，不出现编辑入口 |
| V9 | 编辑并重进世界 | 名称、对话、皮肤、AI 保持 |
| V10 | 皮肤 1 | 作者、粗臂、双层正确、名称锁定 |
| V11 | 皮肤 2 | 星野、细臂、双层正确 |
| V12 | 透明帽子层测试皮肤 | 不出现灰块、白网点、全方块外层 |
| V13 | AI 开/关 | 行为正确，名称无状态后缀 |
| V14 | 打包后重新导入 | 不读取旧缓存，所有前项仍通过 |

任意 V1-V8 失败时，不得进入功能扩展；先附上对应 Content Log 片段定位。

---

## 6. 程序员交付要求

程序员交付时必须包含：

1. 新 BP/RP 源文件，不覆盖 `legacy_2026-07-15/`。
2. `tools/validate_pack.py`、`tools/detect_skin_models.py`、`tools/build_mcaddon.py`。
3. 100 个 `64x64` 皮肤槽位。
4. `docs/TEST_MATRIX.md`，逐项记录 V1-V14 的实际结果。
5. Content Log 中所有 warning/error 的处理说明。
6. 最终 `.mcaddon` 与完整文件清单。
7. 不以“JSON/JS 能解析”代替游戏内验证。

---

## 7. 技术总监审查重点

审查不通过的典型情况：

- 生成蛋无法 `/give`，却继续开发 UI 或模型。
- 只在 Node 中检查脚本，不提供游戏内 Script loaded 证据。
- 用 `"creative"` 字符串比较游戏模式。
- 依赖 `afterEvents.playerInteractWithEntity` 却没有证明事件实际发生。
- 皮肤中仍存在 64x32 占位图。
- 用一套粗臂模型渲染全部皮肤，要求用户手工猜手臂类型。
- 用不透明材质渲染含透明外层的玩家皮肤。
- 自动篡改用户 PNG 的帽子层来掩盖模型或材质问题。
- BP/RP 存在循环依赖。
- 没有干净安装测试，直接依赖旧包缓存。

## 8. 最终决策

新实现的第一成功标准不是“模型看起来像玩家”，而是以下链路按顺序稳定成立：

```text
包加载 → 物品注册 → 实体注册 → 生成蛋生成实体 → 脚本加载 → 右键调试表单
→ 数据持久化 → 完整编辑/对话 → 皮肤/双层/粗细臂 → AI → 发布回归
```

程序员只能沿此顺序推进。每一层通过真实游戏验证后，才允许进入下一层。
