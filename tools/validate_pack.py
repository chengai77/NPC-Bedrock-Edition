#!/usr/bin/env python3
"""
附加包完整性验证工具
检查：JSON可解析、manifest合法、皮肤规格、registry覆盖、图集对齐、单向依赖
扩展：client entity引用图、render controller 100皮肤、脚本import图、归档内容
"""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
BP = ROOT / "BP"
RP = ROOT / "RP"
SKIN_DIR = RP / "textures" / "entity" / "npc_skins"

errors = []
warnings = []


def check_json_files(directory):
    for path in directory.rglob("*.json"):
        rel = path.relative_to(ROOT)
        try:
            with open(path, "r", encoding="utf-8") as f:
                json.load(f)
        except Exception as e:
            errors.append(f"JSON解析失败 {rel}: {e}")


def check_manifests():
    bp_man = BP / "manifest.json"
    rp_man = RP / "manifest.json"
    for man in [bp_man, rp_man]:
        if not man.exists():
            errors.append(f"manifest缺失: {man.relative_to(ROOT)}")
            continue
        with open(man, "r", encoding="utf-8") as f:
            data = json.load(f)
        header = data.get("header", {})
        version = header.get("version")
        for module in data.get("modules", []):
            if module.get("version") != version:
                errors.append(f"{man.name} 模块版本与header不一致")
    # 单向依赖：BP依赖RP，RP不依赖BP
    with open(bp_man, "r", encoding="utf-8") as f:
        bp_data = json.load(f)
    with open(rp_man, "r", encoding="utf-8") as f:
        rp_data = json.load(f)
    rp_header_uuid = rp_data["header"]["uuid"]
    rp_header_version = rp_data["header"]["version"]
    bp_deps = bp_data.get("dependencies", [])
    rp_dep = next((d for d in bp_deps if d.get("uuid") == rp_header_uuid), None)
    if not rp_dep:
        errors.append("BP未依赖RP header UUID")
    elif rp_dep.get("version") != rp_header_version:
        errors.append(
            f"BP→RP依赖版本[{rp_dep.get('version')}]与RP header版本[{rp_header_version}]不一致"
        )
    rp_deps = rp_data.get("dependencies", [])
    if rp_deps:
        errors.append("RP存在依赖，违反单向依赖规则")


def check_skins():
    from PIL import Image
    for skin_id in range(1, 101):
        path = SKIN_DIR / f"npc_{skin_id}.png"
        if not path.exists():
            errors.append(f"皮肤缺失: npc_{skin_id}.png")
            continue
        img = Image.open(path)
        if img.size != (64, 64):
            errors.append(f"npc_{skin_id}.png 尺寸 {img.size[0]}x{img.size[1]} 非64x64")
        if img.mode != "RGBA":
            warnings.append(f"npc_{skin_id}.png 模式 {img.mode} 非RGBA")


def check_registry():
    reg = BP / "scripts" / "skin_registry.js"
    if not reg.exists():
        errors.append("skin_registry.js 缺失")
        return
    text = reg.read_text(encoding="utf-8")
    for skin_id in range(1, 101):
        if f"{skin_id}: {{ armModel" not in text and f"{skin_id}:{{ armModel" not in text:
            errors.append(f"skin_registry.js 缺少槽位 {skin_id}")


def check_atlas():
    items_tex = RP / "textures" / "items_texture.json"
    if not items_tex.exists():
        errors.append("items_texture.json 缺失")
        return
    with open(items_tex, "r", encoding="utf-8") as f:
        data = json.load(f)
    tex_data = data.get("texture_data", {})
    if "customnpc:npc_spawn_egg" not in tex_data:
        errors.append("items_texture.json 缺少 customnpc:npc_spawn_egg")
    item_file = BP / "items" / "npc_spawn_egg.json"
    with open(item_file, "r", encoding="utf-8") as f:
        item_data = json.load(f)
    icon = item_data["minecraft:item"]["components"].get("minecraft:icon", {})
    icon_tex = icon.get("texture", "")
    if icon_tex not in tex_data:
        errors.append(f"物品icon key '{icon_tex}' 未在图集中定义")
    # 生成蛋PNG存在
    spawn_egg_png = RP / "textures" / "items" / "npc_spawn_egg.png"
    if not spawn_egg_png.exists():
        errors.append("生成蛋PNG缺失: textures/items/npc_spawn_egg.png")
    # 孤立atlas文件
    for p in (RP / "textures").glob("*.json"):
        if p.name != "items_texture.json":
            warnings.append(f"孤立图集文件: {p.name}")


def check_client_entity_refs():
    """验证 client entity 引用的 geometry/animation/render controller/texture key 全部存在"""
    entity_file = RP / "entity" / "npc.entity.json"
    if not entity_file.exists():
        errors.append("client entity 缺失: entity/npc.entity.json")
        return
    with open(entity_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    desc = data.get("minecraft:client_entity", {}).get("description", {})

    # geometry 引用
    geo_refs = desc.get("geometry", {})
    for name, geo_id in geo_refs.items():
        geo_id_clean = geo_id.replace("geometry.", "")
        found = False
        for geo_file in (RP / "models" / "entity").glob("*.geo.json"):
            with open(geo_file, "r", encoding="utf-8") as f:
                geo_data = json.load(f)
            for g in geo_data.get("minecraft:geometry", []):
                if g.get("description", {}).get("identifier") == f"geometry.{geo_id_clean}":
                    found = True
                    break
            if found:
                break
        if not found:
            errors.append(f"client entity 引用 geometry '{geo_id}' 未定义")

    # animation 引用
    anim_refs = desc.get("animations", {})
    anim_file = RP / "animations" / "npc.animation.json"
    anim_defined = set()
    if anim_file.exists():
        with open(anim_file, "r", encoding="utf-8") as f:
            anim_data = json.load(f)
        anim_defined = set(anim_data.get("animations", {}).keys())
    for name, anim_id in anim_refs.items():
        if anim_id not in anim_defined:
            errors.append(f"client entity 引用 animation '{anim_id}' 未定义")

    # render controller 引用
    rc_refs = desc.get("render_controllers", [])
    rc_file = RP / "render_controllers" / "npc.render_controllers.json"
    rc_defined = set()
    if rc_file.exists():
        with open(rc_file, "r", encoding="utf-8") as f:
            rc_data = json.load(f)
        rc_defined = set(rc_data.get("render_controllers", {}).keys())
    for rc_id in rc_refs:
        if rc_id not in rc_defined:
            errors.append(f"client entity 引用 render controller '{rc_id}' 未定义")

    # texture key 引用
    tex_refs = desc.get("textures", {})
    for name, tex_path in tex_refs.items():
        # tex_path 形如 textures/entity/npc_skins/npc_N
        png_path = RP / (tex_path + ".png")
        if not png_path.exists():
            errors.append(f"client entity texture '{name}' -> {tex_path}.png 不存在")


def check_render_controller_skins():
    """验证 render controller 声明的 100 个皮肤全部在 client entity 和磁盘纹理中对应"""
    rc_file = RP / "render_controllers" / "npc.render_controllers.json"
    entity_file = RP / "entity" / "npc.entity.json"
    if not rc_file.exists() or not entity_file.exists():
        return
    with open(rc_file, "r", encoding="utf-8") as f:
        rc_data = json.load(f)
    with open(entity_file, "r", encoding="utf-8") as f:
        ent_data = json.load(f)

    rc = rc_data.get("render_controllers", {}).get("controller.render.npc", {})
    arr = rc.get("arrays", {}).get("textures", {}).get("Array.skins", [])
    ent_textures = ent_data.get("minecraft:client_entity", {}).get("description", {}).get("textures", {})

    for skin_id in range(1, 101):
        rc_key = f"Texture.skin_{skin_id}"
        ent_key = f"skin_{skin_id}"
        if rc_key not in arr:
            errors.append(f"render controller 数组缺少 {rc_key}")
        if ent_key not in ent_textures:
            errors.append(f"client entity 缺少 texture key {ent_key}")
        png = SKIN_DIR / f"npc_{skin_id}.png"
        if not png.exists():
            errors.append(f"磁盘纹理缺失: npc_{skin_id}.png")


def check_script_imports():
    """验证脚本入口和相对 import 图完整"""
    import re as _re
    entry = BP / "scripts" / "main.js"
    if not entry.exists():
        errors.append("脚本入口缺失: scripts/main.js")
        return
    visited = set()
    queue = [entry]
    while queue:
        current = queue.pop()
        if current in visited:
            continue
        visited.add(current)
        if not current.exists():
            errors.append(f"脚本 import 缺失: {current.relative_to(ROOT)}")
            continue
        text = current.read_text(encoding="utf-8")
        # 匹配 import ... from "./xxx.js"
        for m in _re.finditer(r'from\s+"(\./[^"]+)"', text):
            dep = current.parent / m.group(1)
            if not dep.exists():
                errors.append(f"脚本 import 失败: {current.name} -> {m.group(1)}")
            else:
                queue.append(dep)


def check_archive_excludes():
    """验证归档不含 node_modules、历史目录或开发文件"""
    excluded_prefixes = ["node_modules/", "legacy_", ".git/", "docs/", "tools/", "package.json", "tsconfig.json", "package-lock.json"]
    addon = ROOT / "自定义npc.mcaddon"
    if not addon.exists():
        warnings.append(".mcaddon 不存在，跳过归档内容检查")
        return
    import zipfile
    with zipfile.ZipFile(addon, "r") as zf:
        for name in zf.namelist():
            for prefix in excluded_prefixes:
                if name.startswith(prefix) or f"/{prefix}" in name:
                    errors.append(f"归档含不应发布的文件: {name}")


def main():
    print("开始验证...")
    check_json_files(BP)
    check_json_files(RP)
    check_manifests()
    check_atlas()
    check_registry()
    check_client_entity_refs()
    check_render_controller_skins()
    check_script_imports()
    check_archive_excludes()
    try:
        check_skins()
    except ImportError:
        warnings.append("PIL未安装，跳过皮肤尺寸检查")
    if warnings:
        print("\n警告:")
        for w in warnings:
            print(f"  [WARN] {w}")
    if errors:
        print("\n错误:")
        for e in errors:
            print(f"  [FAIL] {e}")
        print(f"\n验证失败: {len(errors)} 个错误")
        return False
    print("\n验证通过: 所有检查项均符合要求")
    return True


if __name__ == "__main__":
    ok = main()
    exit(0 if ok else 1)
