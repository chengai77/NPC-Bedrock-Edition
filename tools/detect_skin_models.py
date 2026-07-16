#!/usr/bin/env python3
"""
皮肤模型检测工具
扫描 npc_1..npc_100，检测 Classic/Slim 手臂模型，生成 skin_registry.js
- 空皮肤默认 Classic
- 检测存在歧义时构建失败，除非 skin_overrides.json 已显式覆盖
- npc_1、npc_2 必须显式覆盖，不依赖自动猜测
"""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
SKIN_DIR = ROOT / "RP" / "textures" / "entity" / "npc_skins"
OUTPUT = ROOT / "BP" / "scripts" / "skin_registry.js"
OVERRIDES_FILE = ROOT / "tools" / "skin_overrides.json"

# 固定名称配置
FIXED_NAMES = {
    1: {"fixedName": "作者", "nameLocked": True},
    2: {"fixedName": "星野", "nameLocked": False},
}

# 必须显式覆盖的槽位
REQUIRED_OVERRIDES = [1, 2]


def load_overrides():
    if OVERRIDES_FILE.exists():
        with open(OVERRIDES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def alpha_count(image, box):
    # 用 bytes 替代 getdata()，避免 Pillow 14 弃用警告
    return sum(1 for a in image.crop(box).getchannel("A").tobytes() if a > 0)


def total_alpha(image):
    return sum(1 for a in image.getchannel("A").tobytes() if a > 0)


def detect_model(path):
    """返回 (model, reason)，model: 0=Classic 1=Slim None=错误/歧义"""
    from PIL import Image
    image = Image.open(path).convert("RGBA")
    if image.size != (64, 64):
        return None, f"尺寸错误 {image.size[0]}x{image.size[1]}"
    # 空皮肤（完全透明）默认Classic
    if total_alpha(image) == 0:
        return 0, "空皮肤默认Classic"
    # Slim皮肤右臂未使用列(54,20)-(56,32)，左臂(46,52)-(48,64)
    right_unused = alpha_count(image, (54, 20, 56, 32))
    left_unused = alpha_count(image, (46, 52, 48, 64))
    if right_unused == 0 and left_unused == 0:
        return 1, "Slim透明列判定"
    if right_unused > 0 and left_unused > 0:
        return 0, "Classic像素列判定"
    return None, "AMBIGUOUS"


def main():
    from PIL import Image
    overrides = load_overrides()
    models = {}
    errors = []
    ambiguous = []

    # 检查必须显式覆盖的槽位
    for skin_id in REQUIRED_OVERRIDES:
        if str(skin_id) not in overrides:
            errors.append(f"npc_{skin_id}: 必须在 skin_overrides.json 显式指定模型类型")

    for skin_id in range(1, 101):
        path = SKIN_DIR / f"npc_{skin_id}.png"
        if not path.exists():
            errors.append(f"npc_{skin_id}: 文件缺失")
            models[skin_id] = 0
            continue

        # 有显式覆盖时直接使用，检测仅作一致性提示
        if str(skin_id) in overrides:
            models[skin_id] = int(overrides[str(skin_id)])
            print(f"npc_{skin_id}: {'Slim' if models[skin_id] == 1 else 'Classic'} (显式覆盖)")
            continue

        model, reason = detect_model(path)
        if model is None and reason == "AMBIGUOUS":
            ambiguous.append(skin_id)
            errors.append(f"npc_{skin_id}: AMBIGUOUS，必须在 skin_overrides.json 显式指定 0 或 1")
            models[skin_id] = 0
        elif model is None:
            errors.append(f"npc_{skin_id}: {reason}")
            models[skin_id] = 0
        else:
            models[skin_id] = model
            label = "Slim" if model == 1 else "Classic"
            print(f"npc_{skin_id}: {label} ({reason})")

    if errors:
        print("\n错误:")
        for e in errors:
            print(f"  [FAIL] {e}")
    if ambiguous:
        print(f"\nAMBIGUOUS 槽位: {ambiguous}")

    lines = []
    for skin_id in range(1, 101):
        model = models[skin_id]
        fixed = FIXED_NAMES.get(skin_id)
        if fixed:
            lines.append(f'    {skin_id}: {{ armModel: {model}, fixedName: "{fixed["fixedName"]}", nameLocked: {str(fixed["nameLocked"]).lower()} }}')
        else:
            lines.append(f"    {skin_id}: {{ armModel: {model} }}")

    content = (
        "// 皮肤槽位注册表\n"
        "// 0=Classic/Steve 粗臂, 1=Slim/Alex 细臂\n"
        "// 由 tools/detect_skin_models.py 生成，禁止手写100项\n"
        "export const SKIN_COUNT = 100;\n\n"
        "export const SKINS = Object.freeze({\n"
        + ",\n".join(lines)
        + "\n});\n\n"
        "export function getSkinInfo(skinId) {\n"
        "    return SKINS[skinId] ?? { armModel: 0 };\n"
        "}\n\n"
        "export function getArmModel(skinId) {\n"
        "    return getSkinInfo(skinId).armModel ?? 0;\n"
        "}\n\n"
        "export function isNameLocked(skinId) {\n"
        "    return getSkinInfo(skinId).nameLocked === true;\n"
        "}\n\n"
        "export function getFixedName(skinId) {\n"
        "    return getSkinInfo(skinId).fixedName ?? null;\n"
        "}\n\n"
        "export function getSkinDisplayName(skinId) {\n"
        "    const fixed = getFixedName(skinId);\n"
        "    return fixed ?? `皮肤 ${skinId}`;\n"
        "}\n"
    )
    OUTPUT.write_text(content, encoding="utf-8")
    print(f"\n已生成: {OUTPUT}")

    if errors:
        print(f"\n构建失败: {len(errors)} 个错误")
        return False
    print("\n构建成功: 所有槽位模型类型已确定")
    return True


if __name__ == "__main__":
    ok = main()
    exit(0 if ok else 1)
