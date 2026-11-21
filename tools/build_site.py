"""Сборка статики для публикации: копирует index.html, assets/ и data/ в dist/.

dist/ — самодостаточная публичная папка (index.html в корне).
Исходники (tools/, README.md) остаются только в приватном архиве исходников.
"""

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
PAYLOAD = ["index.html", "assets", "data"]


def main() -> None:
    DIST.mkdir(parents=True, exist_ok=True)
    for name in PAYLOAD:
        src = ROOT / name
        dst = DIST / name
        if src.is_dir():
            shutil.copytree(src, dst, dirs_exist_ok=True)
        else:
            shutil.copy2(src, dst)
        print(f"copied {name}")

    index = DIST / "index.html"
    if not index.is_file() or index.stat().st_size == 0:
        raise SystemExit("dist/index.html не создан")
    files = list(DIST.rglob("*"))
    size = sum(f.stat().st_size for f in files if f.is_file())
    print(f"dist готов: {len([f for f in files if f.is_file()])} файлов, {size / 1024 / 1024:.2f} MB")


if __name__ == "__main__":
    main()
