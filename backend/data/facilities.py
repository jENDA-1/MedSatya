"""Facility queries + parsing.

Reads candidate facilities for a care-need near a location from the SQL warehouse, then
normalizes the noisy source data:
  * JSON-array-in-string fields -> deduped lists (they contain duplicates)
  * coordinate validation against the India bbox -> location_confidence signal
  * cluster_id dedup (the same facility appears in multiple rows)
  * field-shift ETL bug filtered via organization_type = 'facility'

Pure data — no evidence scoring here (that's engine/). We only pass through fields + provenance.
"""
from __future__ import annotations

import json
import math
from typing import Any

from backend import config
from backend.data import warehouse

# Columns we read (backtick-quoted to be safe with camelCase identifiers).
_COLS = [
    "unique_id", "cluster_id", "name", "organization_type",
    "capability", "equipment", "procedure", "specialties", "description", "area",
    "source_urls",
    "latitude", "longitude", "coordinates",
    "address_line1", "address_city", "address_stateOrRegion", "address_zipOrPostcode", "address_country",
    "phone_numbers", "officialPhone", "websites", "officialWebsite",
    "recency_of_page_update", "post_metrics_most_recent_social_media_post_date",
]

# JSON-array-in-string fields (need json.loads + dedup).
_ARRAY_FIELDS = ("capability", "equipment", "procedure", "specialties", "source_urls",
                 "phone_numbers", "websites", "area")


def parse_array(raw: Any) -> list[str]:
    """json.loads a JSON-array-in-string, dedup case-insensitively, preserve order."""
    if not raw:
        return []
    val = raw
    if isinstance(raw, str):
        try:
            val = json.loads(raw)
        except (ValueError, TypeError):
            return [raw.strip()] if raw.strip() else []
    if isinstance(val, str):
        val = [val]
    if not isinstance(val, list):
        return []
    seen: set[str] = set()
    out: list[str] = []
    for x in val:
        s = (x if isinstance(x, str) else str(x)).strip()
        if s and s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out


def _to_float(x: Any) -> float | None:
    if x is None or x == "":
        return None
    try:
        return float(x)
    except (ValueError, TypeError):
        return None


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def _esc(s: str) -> str:
    return s.replace("'", "''")


def _claim_filter(care_need: str) -> str:
    """Build an OR of LOWER(capability|description) LIKE '%kw%' for the care-need's claim keywords."""
    cfg = config.care_need_config(care_need)
    if not cfg:
        return "TRUE"
    clauses = []
    for kw in cfg["claim_keywords"]:
        k = _esc(kw.lower())
        clauses.append(f"LOWER(`capability`) LIKE '%{k}%'")
        clauses.append(f"LOWER(`description`) LIKE '%{k}%'")
        clauses.append(f"LOWER(`specialties`) LIKE '%{k}%'")
    return "(" + " OR ".join(clauses) + ")" if clauses else "TRUE"


def _row_to_facility(d: dict[str, Any]) -> dict[str, Any]:
    lat = _to_float(d.get("latitude"))
    lon = _to_float(d.get("longitude"))
    coord_valid = config.coord_in_india(lat, lon)
    parsed = {f: parse_array(d.get(f)) for f in _ARRAY_FIELDS}
    return {
        "unique_id": d.get("unique_id"),
        "cluster_id": d.get("cluster_id"),
        "name": d.get("name"),
        "capability": parsed["capability"],
        "equipment": parsed["equipment"],
        "procedure": parsed["procedure"],
        "specialties": parsed["specialties"],
        "description": (d.get("description") or "").strip(),
        "area": parsed["area"],
        "source_urls": parsed["source_urls"],
        "latitude": lat,
        "longitude": lon,
        "coord_valid": coord_valid,
        "address": {
            "line1": d.get("address_line1"),
            "city": d.get("address_city"),
            "state": d.get("address_stateOrRegion"),
            "pincode": d.get("address_zipOrPostcode"),
            "country": d.get("address_country"),
        },
        "phones": _dedup_phones(parsed["phone_numbers"], d.get("officialPhone")),
        "websites": parsed["websites"] or ([d["officialWebsite"]] if d.get("officialWebsite") else []),
        "freshness": {
            "page_update": d.get("recency_of_page_update"),
            "last_social_post": d.get("post_metrics_most_recent_social_media_post_date"),
        },
    }


def _dedup_phones(phones: list[str], official: Any) -> list[str]:
    out = list(phones)
    if official and isinstance(official, str) and official.strip() and official.strip() not in out:
        out.insert(0, official.strip())
    return out


def _dedup_by_cluster(facilities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Same facility appears across rows sharing cluster_id -> keep the most information-rich row."""
    best: dict[str, dict[str, Any]] = {}

    def richness(f: dict[str, Any]) -> int:
        return sum(len(f.get(k, [])) for k in ("capability", "equipment", "procedure", "specialties")) + len(
            f.get("description", "")
        )

    for f in facilities:
        key = f.get("cluster_id") or f.get("unique_id")
        if key not in best or richness(f) > richness(best[key]):
            best[key] = f
    return list(best.values())


def find_candidates(
    care_need: str,
    lat: float | None = None,
    lon: float | None = None,
    box_deg: float = 2.0,
    limit: int = 400,
) -> list[dict[str, Any]]:
    """Return parsed, deduped candidate facilities that CLAIM the given care-need near (lat, lon).

    Evidence scoring is NOT done here — see engine/. If lat/lon are given, results are prefiltered
    to a bounding box (intersected with India) for speed; distance is added downstream.
    """
    cols = ", ".join(f"`{c}`" for c in _COLS)
    where = ["`organization_type` = 'facility'", _claim_filter(care_need)]

    if lat is not None and lon is not None:
        lat_min = max(config.INDIA_LAT[0], lat - box_deg)
        lat_max = min(config.INDIA_LAT[1], lat + box_deg)
        lon_min = max(config.INDIA_LON[0], lon - box_deg)
        lon_max = min(config.INDIA_LON[1], lon + box_deg)
        where.append(f"`latitude` BETWEEN {lat_min:.6f} AND {lat_max:.6f}")
        where.append(f"`longitude` BETWEEN {lon_min:.6f} AND {lon_max:.6f}")

    sql = (
        f"SELECT {cols} FROM {config.facilities_fqn()} "
        f"WHERE {' AND '.join(where)} LIMIT {int(limit)}"
    )
    scols, rows = warehouse.run_sql(sql)
    dicts = warehouse.rows_as_dicts(scols, rows)
    facilities = [_row_to_facility(d) for d in dicts]
    facilities = _dedup_by_cluster(facilities)

    if lat is not None and lon is not None:
        for f in facilities:
            if f["coord_valid"]:
                f["distance_km"] = round(haversine_km(lat, lon, f["latitude"], f["longitude"]), 1)
            else:
                f["distance_km"] = None
    return facilities
