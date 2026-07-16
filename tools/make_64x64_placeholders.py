#!/usr/bin/env python3
"""
64x64 透明占位图生成工具
将 npc_3 到 npc_100 中非 64x64 的皮肤替换为透明 64x64 模板
npc_1、npc_2 为作者/星野皮肤，不处理
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SKIN_DIR = ROOT / "RP" / "textures" / "entity" / "npc_skins"


def main():
    for skin_id in range(3, 101):
        path = SKIN_DIR / f"npc_{skin_id}.png"
        if not path.exists():
            img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
            img.save(path)
            print(f"创建: npc_{skin_id}.png (64x64 透明)")
            continue
        img = Image.open(path).convert("RGBA")
        if img.size != (64, 64):
            img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
            img.save(path)
            print(f"替换: npc_{skin_id}.png -> 64x64 透明")
        else:
            print(f"跳过: npc_{skin_id}.png (已为 64x64)")
    print("\n完成。npc_1、npc_2 未处理（作者/星野皮肤）。")


if __name__ == "__main__":
    main()
