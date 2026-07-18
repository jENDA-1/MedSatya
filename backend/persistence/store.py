"""Persistence via a Delta table on the SQL warehouse — survives app restarts (required).

Stores saved facilities (bookmarks) + notes. The facility payload is kept as a JSON blob so the
schema stays stable as the card shape evolves. Table/catalog/schema are parametrized (config).

Also the seam for the not-built-yet hooks (overrides, feedback events) — those would be sibling
tables using the same client; only `saved` is implemented for this MVP.
"""
from __future__ import annotations

import datetime
import json
import uuid
from typing import Any

from backend import config
from backend.data import warehouse

_ensured = False


def _ensure_table() -> None:
    global _ensured
    if _ensured:
        return
    warehouse.run_sql(
        f"CREATE TABLE IF NOT EXISTS {config.store_fqn()} "
        "(id STRING, created_at STRING, care_need STRING, care_need_label STRING, "
        "note STRING, facility STRING) USING DELTA"
    )
    _ensured = True


def save(care_need: str, care_need_label: str | None, facility: dict, note: str | None = None) -> dict:
    _ensure_table()
    sid = uuid.uuid4().hex
    created_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    warehouse.run_sql(
        f"INSERT INTO {config.store_fqn()} (id, created_at, care_need, care_need_label, note, facility) "
        "VALUES (:id, :created_at, :care_need, :care_need_label, :note, :facility)",
        parameters=[
            {"name": "id", "value": sid},
            {"name": "created_at", "value": created_at},
            {"name": "care_need", "value": care_need or ""},
            {"name": "care_need_label", "value": care_need_label or ""},
            {"name": "note", "value": note or ""},
            {"name": "facility", "value": json.dumps(facility, ensure_ascii=False)},
        ],
    )
    return {"id": sid, "created_at": created_at}


def list_saved(limit: int = 200) -> list[dict[str, Any]]:
    _ensure_table()
    cols, rows = warehouse.run_sql(
        f"SELECT id, created_at, care_need, care_need_label, note, facility "
        f"FROM {config.store_fqn()} ORDER BY created_at DESC LIMIT {int(limit)}"
    )
    out = []
    for r in warehouse.rows_as_dicts(cols, rows):
        try:
            fac = json.loads(r.get("facility") or "{}")
        except (ValueError, TypeError):
            fac = {}
        out.append(
            {
                "id": r.get("id"),
                "created_at": r.get("created_at"),
                "care_need": r.get("care_need"),
                "care_need_label": r.get("care_need_label"),
                "note": r.get("note") or None,
                "facility": fac,
            }
        )
    return out


def delete(saved_id: str) -> bool:
    _ensure_table()
    warehouse.run_sql(
        f"DELETE FROM {config.store_fqn()} WHERE id = :id",
        parameters=[{"name": "id", "value": saved_id}],
    )
    return True
