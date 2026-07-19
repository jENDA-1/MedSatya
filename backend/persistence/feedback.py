"""Community feedback (doctors + patients) -> Delta table. Collected ONLY.

Guardrail: feedback does NOT change evidence live. It is the community-feedback hook from the
methodology; a future step wires it into the engine. Same warehouse client + write pattern as
`persistence/store.py` (parametrized table, `INSERT` via named params).
"""
from __future__ import annotations

import datetime
import uuid

from backend import config
from backend.data import warehouse

_ensured = False

_ALLOWED_ROLES = {"doctor", "patient"}


def _ensure_table() -> None:
    global _ensured
    if _ensured:
        return
    warehouse.run_sql(
        f"CREATE TABLE IF NOT EXISTS {config.feedback_fqn()} "
        "(id STRING, created_at STRING, role STRING, facility_id STRING, facility_name STRING, "
        "care_need STRING, correct_note STRING, incorrect_note STRING, evidence_url STRING, "
        "contact STRING, source STRING) USING DELTA"
    )
    _ensured = True


def record(
    *,
    role: str,
    facility_id: str | None,
    facility_name: str | None,
    care_need: str | None,
    correct_note: str | None,
    incorrect_note: str | None,
    evidence_url: str | None,
    contact: str | None,
    source: str = "app",
) -> dict:
    """Persist one feedback event. Raises on warehouse failure (caller catches -> 503)."""
    _ensure_table()
    fid = uuid.uuid4().hex
    created_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    role = role if role in _ALLOWED_ROLES else "patient"
    warehouse.run_sql(
        f"INSERT INTO {config.feedback_fqn()} "
        "(id, created_at, role, facility_id, facility_name, care_need, correct_note, "
        "incorrect_note, evidence_url, contact, source) VALUES "
        "(:id, :created_at, :role, :facility_id, :facility_name, :care_need, :correct_note, "
        ":incorrect_note, :evidence_url, :contact, :source)",
        parameters=[
            {"name": "id", "value": fid},
            {"name": "created_at", "value": created_at},
            {"name": "role", "value": role},
            {"name": "facility_id", "value": facility_id or ""},
            {"name": "facility_name", "value": facility_name or ""},
            {"name": "care_need", "value": care_need or ""},
            {"name": "correct_note", "value": correct_note or ""},
            {"name": "incorrect_note", "value": incorrect_note or ""},
            {"name": "evidence_url", "value": evidence_url or ""},
            {"name": "contact", "value": contact or ""},
            {"name": "source", "value": source or "app"},
        ],
    )
    return {"id": fid, "created_at": created_at}
