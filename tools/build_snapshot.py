"""Снимок данных локального рантайма MiniMax Code -> статический сайт.

Читает runtime-state.sqlite (только чтение) и собирает:
  data/snapshot.json          - агенты, сессии, статистика
  data/contexts/<sid>.json    - контекст переписки по сессии (ленивая загрузка на сайте)

Запуск:
  python tools/build_snapshot.py                 # полный сырой контекст
  python tools/build_snapshot.py --redact        # маскировать пути/ключи/почту
  python tools/build_snapshot.py --out <dir>     # другой каталог вывода
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(r"C:\Users\spay\.minimax\v2\sqlite\runtime-state.sqlite")
DATA_DIR = Path(r"C:\Users\spay\.minimax\agents")
BUILTIN_DIR = Path(r"C:\Users\spay\.minimax\agents\.builtin")

# Сколько последних сообщений хранить для «свежих» и «старых» сессий.
FULL_WINDOW_DAYS = 7
FULL_KEEP = 400
FRESH_KEEP = 60
STALE_KEEP = 30
RESULT_LIMIT = 20000

SECRET_PATTERNS = [
    (re.compile(r"(?i)\b(sk-[A-Za-z0-9_\-]{8,})"), "<REDACTED_KEY>"),
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._\-]{12,}"), r"\1<REDACTED_TOKEN>"),
    (re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}"), "<REDACTED_EMAIL>"),
    (re.compile(r"(?i)\b(password|passwd|api[_-]?key|secret|token)\b(\s*[:=]\s*)(\S+)"), r"\1\2<REDACTED>"),
    (re.compile(r"(?i)\b(gh[pousr]_[A-Za-z0-9]{10,})"), "<REDACTED_TOKEN>"),
]


def redact(text: str) -> str:
    if not text:
        return text
    for pattern, repl in SECRET_PATTERNS:
        text = pattern.sub(repl, text)
    text = re.sub(r"[A-Za-z]:\\Users\\[^\\\s\"']+", r"C:\\Users\\<user>", text)
    text = re.sub(r"/(?:home|Users)/[^/\s\"']+", r"/home/<user>", text)
    return text


def cut(text: str, limit: int) -> str:
    if not text:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n… [обрезано, ещё {len(text) - limit} символов]"


def parse_front_matter(text: str) -> tuple[dict, str]:
    """Мини-YAML front matter: плоские ключи, списки и один уровень вложенности."""
    meta: dict = {}
    body = text
    if not text.startswith("---"):
        return meta, text.strip()
    parts = text.split("---", 2)
    if len(parts) < 3:
        return meta, text.strip()
    head, body = parts[1], parts[2]

    def as_dict(value) -> dict:
        return value if isinstance(value, dict) else {}

    list_key: str | None = None
    dict_key: str | None = None
    for raw in head.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip())
        line = raw.strip()
        if line.startswith("- "):
            if list_key is None and dict_key is not None:
                existing = meta.get(dict_key)
                if isinstance(existing, dict) and not existing:
                    meta[dict_key] = []
                list_key = dict_key
                dict_key = None
            if list_key:
                bucket = meta.setdefault(list_key, [])
                if isinstance(bucket, list):
                    bucket.append(line[2:].strip())
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip()
        if indent > 0 and dict_key:
            if not isinstance(meta.get(dict_key), dict):
                meta[dict_key] = {}
            meta[dict_key][key] = value
            list_key = None
            continue
        if value == "":
            # Возможен вложенный блок или список - решаем по следующим строкам.
            meta[key] = {}
            list_key = None
            dict_key = key
        else:
            meta[key] = value
            list_key = None
            dict_key = None
    # Пустые dict-кандидаты превращаем в списки, если в них лежали "- " элементы.
    for key, value in list(meta.items()):
        if isinstance(value, dict) and not value:
            meta[key] = []
    return meta, body.strip()


def load_agents(conn: sqlite3.Connection) -> list[dict]:
    """Метаданные агентов: из agent.md (незашифрованные) + таблица agents."""
    agents: list[dict] = []
    db_rows = {
        row["agent_name"]: dict(row)
        for row in conn.execute("SELECT * FROM agents")
    }
    names = sorted(db_rows) or ["mavis"]
    for name in names:
        agent_md = BUILTIN_DIR / name / "agent.md"
        meta: dict = {}
        persona = ""
        if agent_md.exists():
            meta, persona = parse_front_matter(agent_md.read_text(encoding="utf-8"))
        db_row = db_rows.get(name, {})
        x_mavis = meta.get("x-mavis", {})
        if isinstance(x_mavis, str):
            x_mavis = {}
        display_name = x_mavis.get("displayName") or name.title()
        description = meta.get("description", "")
        role = db_row.get("agent_role")
        role_map = {0: "worker", 1: "orchestrator", 2: "explore", 3: "verifier"}
        agents.append(
            {
                "name": name,
                "display_name": display_name,
                "role": role_map.get(role, str(role or "agent")),
                "role_label": str(db_row.get("agent_role") or meta.get("role") or "agent"),
                "description": description,
                "persona": persona,
                "model": meta.get("model", ""),
                "effort": meta.get("effort", ""),
                "features": meta.get("features", {}),
                "tools": meta.get("tools", []),
                "framework": db_row.get("framework_type", "pi-agent"),
                "creation_source": db_row.get("creation_source", ""),
                "created_at": db_row.get("created_at"),
                "updated_at": db_row.get("updated_at"),
                "main_session_id": db_row.get("main_session_id"),
            }
        )
    return agents


def session_extra_model(row: sqlite3.Row) -> str:
    extra = row["extra_data_json"]
    if not extra:
        return ""
    try:
        data = json.loads(extra)
    except json.JSONDecodeError:
        return ""
    for key in ("effective_model", "model", "effectiveModel"):
        value = data.get(key)
        if isinstance(value, str) and value:
            return value
    model = data.get("model")
    if isinstance(model, dict):
        provider = model.get("provider_id", "")
        model_id = model.get("model_id", "")
        if model_id:
            return f"{provider}/{model_id}".strip("/")
    return ""


def collect(conn: sqlite3.Connection) -> tuple[list[dict], dict, dict]:
    """Сессии, токены, сообщения."""
    tokens: dict[str, dict] = {}
    for row in conn.execute(
        "SELECT session_id, model, ts, input_tokens, output_tokens, reasoning_tokens, "
        "cache_read_tokens, cache_write_tokens, cost_usd FROM local_runtime_token_usage"
    ):
        bucket = tokens.setdefault(
            row["session_id"],
            {
                "input": 0, "output": 0, "reasoning": 0,
                "cache_read": 0, "cache_write": 0, "cost_usd": 0.0,
                "turns": 0, "model": "",
            },
        )
        bucket["input"] += row["input_tokens"] or 0
        bucket["output"] += row["output_tokens"] or 0
        bucket["reasoning"] += row["reasoning_tokens"] or 0
        bucket["cache_read"] += row["cache_read_tokens"] or 0
        bucket["cache_write"] += row["cache_write_tokens"] or 0
        bucket["cost_usd"] += row["cost_usd"] or 0.0
        bucket["turns"] += 1
        if row["model"] and not bucket["model"]:
            bucket["model"] = row["model"]

    messages: dict[str, list] = {}
    for row in conn.execute(
        "SELECT session_id, data_json, created_at_ms FROM local_runtime_message_rows ORDER BY id ASC"
    ):
        try:
            data = json.loads(row["data_json"] or "{}")
        except json.JSONDecodeError:
            continue
        messages.setdefault(row["session_id"], []).append((row["created_at_ms"], data))

    sessions: list[dict] = []
    for row in conn.execute(
        "SELECT session_id, agent_name, title, status, session_type, workspace_dir, "
        "visibility, purpose, parent_session_id, created_at_ms, updated_at_ms, "
        "error_message, error_code, archived, extra_data_json FROM local_runtime_sessions"
    ):
        sid = row["session_id"]
        bucket = tokens.get(sid, {})
        msgs = messages.get(sid, [])
        sessions.append(
            {
                "id": sid,
                "agent": row["agent_name"] or "unknown",
                "title": row["title"] or "(без названия)",
                "status": row["status"] or "unknown",
                "session_type": row["session_type"] or "",
                "workspace": row["workspace_dir"] or "",
                "visibility": row["visibility"] or "",
                "purpose": row["purpose"] or "",
                "parent_session_id": row["parent_session_id"] or "",
                "created_at": row["created_at_ms"],
                "updated_at": row["updated_at_ms"],
                "error": row["error_message"] or "",
                "error_code": row["error_code"],
                "archived": bool(row["archived"]),
                "model": session_extra_model(row) or bucket.get("model", ""),
                "messages_total": len(msgs),
                "tokens": {
                    "input": bucket.get("input", 0),
                    "output": bucket.get("output", 0),
                    "reasoning": bucket.get("reasoning", 0),
                    "cache_read": bucket.get("cache_read", 0),
                    "cache_write": bucket.get("cache_write", 0),
                    "total": bucket.get("input", 0)
                    + bucket.get("output", 0)
                    + bucket.get("reasoning", 0)
                    + bucket.get("cache_read", 0)
                    + bucket.get("cache_write", 0),
                    "cost_usd": round(bucket.get("cost_usd", 0.0), 4),
                    "turns": bucket.get("turns", 0),
                },
                "_messages": msgs,
            }
        )
    return sessions, tokens, messages


def build_context(session: dict, now_ms: int, redact_mode: bool) -> dict:
    msgs = session["_messages"]
    age_days = (now_ms - (session["updated_at"] or now_ms)) / 86_400_000
    if age_days <= FULL_WINDOW_DAYS:
        keep = FULL_KEEP
    elif age_days <= 30:
        keep = FRESH_KEEP
    else:
        keep = STALE_KEEP
    kept = msgs[-keep:] if keep < len(msgs) else msgs
    truncated = len(kept) < len(msgs)

    out_msgs = []
    for created_at_ms, data in kept:
        text = data.get("msg_content") or ""
        thinking = data.get("thinking_content") or ""
        tools = []
        for call in data.get("tool_calls") or []:
            args = call.get("tool_call_args") or ""
            result_raw = call.get("tool_call_result_data") or ""
            result_text = ""
            if result_raw:
                try:
                    parsed = json.loads(result_raw)
                    chunks = parsed.get("content") or []
                    result_text = "\n".join(
                        c.get("text", "") for c in chunks if isinstance(c, dict) and c.get("text")
                    )
                    if not result_text:
                        result_text = json.dumps(parsed, ensure_ascii=False)
                except json.JSONDecodeError:
                    result_text = result_raw
            result_text = cut(result_text, RESULT_LIMIT)
            tools.append(
                {
                    "name": call.get("tool_name", ""),
                    "status": call.get("tool_call_status"),
                    "args": cut(args, 4000),
                    "result": result_text,
                }
            )
        entry = {
            "ts": data.get("timestamp") or created_at_ms,
            "role": data.get("role") or "unknown",
            "type": data.get("msg_type"),
            "text": text,
        }
        if thinking:
            entry["thinking"] = thinking
        if tools:
            entry["tools"] = tools
        if redact_mode:
            entry = json.loads(redact(json.dumps(entry, ensure_ascii=False)))
        out_msgs.append(entry)

    return {
        "session_id": session["id"],
        "title": session["title"],
        "agent": session["agent"],
        "status": session["status"],
        "model": session["model"],
        "workspace": session["workspace"],
        "messages_kept": len(out_msgs),
        "messages_total": len(msgs),
        "truncated": truncated,
        "tokens": session["tokens"],
        "messages": out_msgs,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Собрать снимок рантайма для статического сайта")
    parser.add_argument("--redact", action="store_true", help="маскировать пути/ключи/почту")
    parser.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "data"))
    args = parser.parse_args()

    out_dir = Path(args.out)
    contexts_dir = out_dir / "contexts"
    contexts_dir.mkdir(parents=True, exist_ok=True)

    if not DB_PATH.exists():
        print(f"База не найдена: {DB_PATH}")
        return 1

    conn = sqlite3.connect(f"file:{DB_PATH.as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    now_ms = int(datetime.now(tz=timezone.utc).timestamp() * 1000)

    agents = load_agents(conn)
    sessions, _, _ = collect(conn)

    per_agent: dict[str, dict] = {}
    for agent in agents:
        per_agent[agent["name"]] = {
            "sessions": 0, "running": 0, "messages": 0, "tokens": 0,
            "workspaces": {}, "last_active": 0,
        }
    status_counter: Counter = Counter()
    model_counter: Counter = Counter()
    total_tokens = {"input": 0, "output": 0, "reasoning": 0, "cache_read": 0, "total": 0}
    total_messages = 0

    cleaned: list[dict] = []
    for session in sessions:
        status_counter[session["status"]] += 1
        if session["model"]:
            model_counter[session["model"]] += 1
        total_messages += session["messages_total"]
        for key in ("input", "output", "reasoning", "cache_read"):
            total_tokens[key] += session["tokens"][key]
        total_tokens["total"] += session["tokens"]["total"]

        agent_bucket = per_agent.setdefault(
            session["agent"],
            {"sessions": 0, "running": 0, "messages": 0, "tokens": 0, "workspaces": {}, "last_active": 0},
        )
        agent_bucket["sessions"] += 1
        agent_bucket["messages"] += session["messages_total"]
        agent_bucket["tokens"] += session["tokens"]["total"]
        if session["status"] in ("started", "running"):
            agent_bucket["running"] += 1
        if session["workspace"]:
            agent_bucket["workspaces"][session["workspace"]] = agent_bucket["workspaces"].get(session["workspace"], 0) + 1
        agent_bucket["last_active"] = max(agent_bucket["last_active"], session["updated_at"] or 0)

        context = build_context(session, now_ms, args.redact)
        (contexts_dir / f"{session['id']}.json").write_text(
            json.dumps(context, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        session.pop("_messages", None)
        session["context_file"] = f"contexts/{session['id']}.json"
        session["messages_kept"] = context["messages_kept"]
        session["context_truncated"] = context["truncated"]
        cleaned.append(session)

    cleaned.sort(key=lambda s: s["updated_at"] or 0, reverse=True)

    for agent in agents:
        bucket = per_agent.get(agent["name"], {})
        agent["stats"] = {
            "sessions": bucket.get("sessions", 0),
            "running": bucket.get("running", 0),
            "messages": bucket.get("messages", 0),
            "tokens": bucket.get("tokens", 0),
            "workspaces": sorted(
                ({"path": p, "sessions": c} for p, c in bucket.get("workspaces", {}).items()),
                key=lambda w: w["sessions"],
                reverse=True,
            )[:5],
            "last_active": bucket.get("last_active", 0),
        }
        agent["status"] = "running" if bucket.get("running") else "idle"

    snapshot = {
        "generated_at": int(now_ms),
        "generated_at_iso": datetime.now(tz=timezone.utc).astimezone().isoformat(timespec="seconds"),
        "source": "MiniMax Code local runtime (runtime-state.sqlite)",
        "redacted": bool(args.redact),
        "stats": {
            "agents": len(agents),
            "sessions": len(cleaned),
            "messages": total_messages,
            "tokens": total_tokens,
            "statuses": dict(status_counter),
            "models": dict(model_counter),
            "context_files": len(cleaned),
        },
        "agents": agents,
        "sessions": cleaned,
    }
    (out_dir / "snapshot.json").write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    conn.close()
    size = (out_dir / "snapshot.json").stat().st_size
    ctx_size = sum(p.stat().st_size for p in contexts_dir.glob("*.json"))
    print(f"snapshot.json  : {size/1024:.1f} KB")
    print(f"contexts/      : {ctx_size/1024/1024:.2f} MB ({len(cleaned)} файлов)")
    print(f"agents={len(agents)} sessions={len(cleaned)} messages={total_messages} tokens={total_tokens['total']:,}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
