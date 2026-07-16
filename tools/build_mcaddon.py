#!/usr/bin/env python3
"""
.mcaddon 打包工具
将 BP/ 和 RP/ 打包为 .mcaddon，并用 zipfile.testzip() 验证归档完整性
"""
from pathlib import Path
import zipfile
import time

ROOT = Path(__file__).resolve().parents[1]
BP = ROOT / "BP"
RP = ROOT / "RP"
OUTPUT = ROOT / "自定义npc.mcaddon"


def add_dir_to_zip(zf, directory, base):
    # 排除开发文件，只打包 BP/RP 内容
    excluded = {"node_modules", ".git", "__pycache__"}
    for path in directory.rglob("*"):
        if path.is_file():
            # 跳过排除目录下的文件
            if any(part in excluded for part in path.parts):
                continue
            arcname = str(path.relative_to(base))
            zf.write(path, arcname)


def validate_release_layout():
    # 物品定义只能存在于行为包，RP/items 会导致客户端拒绝整个物品。
    invalid_rp_items = list((RP / "items").rglob("*.json")) if (RP / "items").exists() else []
    if invalid_rp_items:
        names = ", ".join(str(path.relative_to(RP)) for path in invalid_rp_items)
        raise ValueError(f"资源包禁止包含物品定义: {names}")


def main():
    if not BP.exists() or not RP.exists():
        print("错误: BP 或 RP 目录不存在")
        return False
    validate_release_layout()
    if OUTPUT.exists():
        OUTPUT.unlink()
    print(f"打包中: {OUTPUT.name}")
    with zipfile.ZipFile(OUTPUT, "w", zipfile.ZIP_DEFLATED) as zf:
        add_dir_to_zip(zf, BP, ROOT)
        add_dir_to_zip(zf, RP, ROOT)
    # 验证归档完整性
    print("验证归档完整性...")
    with zipfile.ZipFile(OUTPUT, "r") as zf:
        bad = zf.testzip()
        if bad:
            print(f"错误: 归档损坏 {bad}")
            return False
        count = len(zf.namelist())
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"打包完成: {OUTPUT.name}")
    print(f"  文件数: {count}")
    print(f"  大小: {size_kb:.1f} KB")
    return True


if __name__ == "__main__":
    ok = main()
    exit(0 if ok else 1)
