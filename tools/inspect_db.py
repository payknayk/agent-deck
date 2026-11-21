"""Диагностика локальной базы runtime-state.sqlite (MiniMax Code).

Только чтение. Печатает список таблиц и их размеры, чтобы понять,
где лежат сессии, агенты и сообщения.
"""

import sqlite3
import sys
from pathlib import Path

DB = Path(r"C:\Users\spay\.minimax\v2\sqlite\runtime-state.sqlite")


def main() -> int:
    if not DB.exists():
        print(f"DB not found: {DB}")
        return 1

    conn = sqlite3.connect(f"file:{DB.as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        tables = conn.execute(
            "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY type, name"
        ).fetchall()
        for row in tables:
            name = row["name"]
            try:
                count = conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
            except Exception as exc:  # noqa: BLE001
                count = f"ERR {exc}"
            print(f"{row['type']:5} {name:44} rows={count}")

        print("\n--- columns of interesting tables ---")
        for row in tables:
            name = row["name"]
            if row["type"] != "table":
                continue
            if not any(
                key in name.lower()
                for key in ("session", "message", "agent", "task", "turn", "tool", "part", "event")
            ):
                continue
            cols = conn.execute(f'PRAGMA table_info("{name}")').fetchall()
            print(f"\n[{name}]")
            for col in cols:
                print(f"   {col['name']:32} {col['type']}")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
