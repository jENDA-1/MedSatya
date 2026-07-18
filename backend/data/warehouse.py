"""SQL Warehouse access via the Databricks SDK Statement Execution API (REST).

Why this and not the thrift `databricks-sql-connector`:
  * In-platform (Databricks Apps): auth resolves automatically from the app's service-principal
    OAuth (env `DATABRICKS_CLIENT_ID`/`DATABRICKS_CLIENT_SECRET`/`DATABRICKS_HOST`). The warehouse
    must be attached to the app as a resource, which sets `DATABRICKS_WAREHOUSE_ID`.
  * Local dev: auth resolves from a PAT (`DATABRICKS_HOST` + `DATABRICKS_TOKEN` in .env). The
    thrift connector *silently hangs* behind the corporate TLS proxy, so we use the REST
    Statement Execution API and inject the system trust store instead.

No PAT ever lives in code — auth is entirely env / OAuth driven.
"""
from __future__ import annotations

import time
from typing import Any

# Fix the local TLS-proxy trap (self-signed MITM root trusted by the OS but not by Python's
# bundled CA). Harmless in-platform (no proxy). Best-effort: absence must not break in-platform.
try:  # pragma: no cover
    import truststore

    truststore.inject_into_ssl()
except Exception:  # pragma: no cover
    pass

from backend import config

_client = None
_last_error: str | None = None


def _client_or_none():
    """Lazily build a WorkspaceClient. Returns None (not raise) if auth can't be resolved,
    so the app stays up and endpoints can report 'data unavailable' honestly."""
    global _client, _last_error
    if _client is not None:
        return _client
    try:
        from databricks.sdk import WorkspaceClient

        _client = WorkspaceClient()
        _last_error = None
        return _client
    except Exception as e:  # pragma: no cover
        _last_error = f"{type(e).__name__}: {e}"
        return None


def available() -> bool:
    return _client_or_none() is not None


def last_error() -> str | None:
    return _last_error


def run_sql(statement: str, parameters: list[dict[str, Any]] | None = None) -> tuple[list[str], list[list]]:
    """Execute SQL on the configured warehouse; return (column_names, rows).

    `parameters` is a list of {"name","value"[,"type"]} for named `:param` markers.
    Raises RuntimeError on auth/exec failure (callers should catch and degrade gracefully).
    """
    global _last_error
    w = _client_or_none()
    if w is None:
        raise RuntimeError(f"Warehouse client unavailable: {_last_error}")

    from databricks.sdk.service.sql import StatementParameterListItem, StatementState

    params = None
    if parameters:
        params = [
            StatementParameterListItem(name=p["name"], value=str(p["value"]), type=p.get("type"))
            for p in parameters
        ]

    try:
        resp = w.statement_execution.execute_statement(
            warehouse_id=config.WAREHOUSE_ID,
            statement=statement,
            parameters=params,
            wait_timeout="30s",
        )
        # Poll until terminal state if it didn't finish within the sync wait window.
        deadline = time.time() + 120
        while resp.status and resp.status.state in (StatementState.PENDING, StatementState.RUNNING):
            if time.time() > deadline:
                raise RuntimeError("SQL statement timed out (>120s)")
            time.sleep(1.0)
            resp = w.statement_execution.get_statement(resp.statement_id)

        state = resp.status.state if resp.status else None
        if state != StatementState.SUCCEEDED:
            msg = ""
            if resp.status and resp.status.error:
                msg = resp.status.error.message or ""
            raise RuntimeError(f"SQL failed ({state}): {msg}")

        cols: list[str] = []
        if resp.manifest and resp.manifest.schema and resp.manifest.schema.columns:
            cols = [c.name for c in resp.manifest.schema.columns]
        rows: list[list] = []
        if resp.result and resp.result.data_array:
            rows = resp.result.data_array
        _last_error = None
        return cols, rows
    except RuntimeError:
        raise
    except Exception as e:  # pragma: no cover
        _last_error = f"{type(e).__name__}: {e}"
        raise RuntimeError(_last_error) from e


def rows_as_dicts(cols: list[str], rows: list[list]) -> list[dict[str, Any]]:
    return [dict(zip(cols, r)) for r in rows]
