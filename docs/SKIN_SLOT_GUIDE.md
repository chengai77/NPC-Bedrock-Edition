# 皮肤槽位指南

## 规格

- 文件位置: `RP/textures/entity/npc_skins/npc_1.png` 至 `npc_100.png`
- 格式: PNG, RGBA, 64x64
- 模型: 标准玩家皮肤布局（Classic 粗臂 4px / Slim 细臂 3px）

## 特殊槽位

| 槽位 | 文件 | 名称 | 手臂 | 名称锁定 |
|---|---|---|---|---|
| 1 | npc_1.png | 作者 | Classic | 是 |
| 2 | npc_2.png | 星野 | Slim | 否 |
| 3-100 | npc_N.png | 皮肤 N | Classic（空模板） | 否 |

## 替换皮肤

1. 解包 `.mcaddon` 或直接编辑资源包
2. 将自定义 64x64 PNG 覆盖 `RP/textures/entity/npc_skins/npc_N.png`
3. 运行 `python tools/detect_skin_models.py` 重新检测手臂模型
4. 若检测输出 `AMBIGUOUS`，在 `tools/skin_overrides.json` 中指定:
   ```json
   { "N": 0 }
   ```
   - `0` = Classic 粗臂
   - `1` = Slim 细臂
5. 重新打包: `python tools/build_mcaddon.py`

## 手臂模型检测原理

- Slim 皮肤在右臂 (54,20)-(56,32) 和左臂 (46,52)-(48,64) 有未使用的透明列
- Classic 皮肤在这些区域有像素
- 完全透明的空皮肤默认为 Classic
- 检测存在歧义时输出 `AMBIGUOUS`，需手动指定

## 双层渲染

- 基础层: head, body, right_arm, left_arm, right_leg, left_leg
- 外层: hat, jacket, right_sleeve, left_sleeve, right_pants, left_pants
- 外层使用 `inflate` 避免与基础层 Z-fighting
- 材质: `entity_alphatest`（支持透明外层）
