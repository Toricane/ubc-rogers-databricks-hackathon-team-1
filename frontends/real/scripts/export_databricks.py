"""Export Waterfront presence snapshots from Databricks into public/data/internal/.

Read-only. Authenticates through the signed-in Databricks CLI; no token is written to disk.

    python scripts/export_databricks.py                       # pitch dates
    python scripts/export_databricks.py 2026-08-22 2026-08-23  # specific dates
    set DATABRICKS_CLI=C:\\path\\to\\databricks.exe  (if the CLI isn't on PATH)
    set DATABRICKS_CONFIG_PROFILE=workspace1         (CLI profile, default DEFAULT)

Metric: simultaneous active attachment sessions, start <= t <= start + dwell_time,
from workspace.rogers_waterfront_minute.silver_origin_minute sampled at :00 and :30.
Counts are exported as-is (no suppression). Clock strings are kept as recorded.
Every slot is checked against gold_activity_minute (total and four buckets); the
export stops if any slot disagrees.
"""
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HOST = "https://dbc-d1555967-1ea3.cloud.databricks.com"
WAREHOUSE = "20565b42b4da4903"  # Serverless Starter Warehouse
SILVER = "workspace.rogers_waterfront_minute.silver_origin_minute"
GOLD = "workspace.rogers_waterfront_minute.gold_activity_minute"
LOCATION = "Waterfront Station"
PITCH_DATES = ["2025-12-17", "2025-12-18", "2026-07-22", "2026-07-23", "2026-08-22", "2026-08-23"]
OUT = Path(__file__).resolve().parent.parent / "public" / "data" / "internal"
BUCKETS = ["local_waterfront", "vancouver_city", "metro_vancouver", "outside_metro_vancouver"]

_token = None


def token() -> str:
    global _token
    if _token is None:
        cli = os.environ.get("DATABRICKS_CLI") or shutil.which("databricks") or "databricks"
        args = [cli, "auth", "token"]
        if os.environ.get("DATABRICKS_CONFIG_PROFILE"):
            args += ["-p", os.environ["DATABRICKS_CONFIG_PROFILE"]]
        else:
            args += ["--host", HOST]
        out = subprocess.run(args, capture_output=True, text=True, check=True).stdout
        _token = json.loads(out)["access_token"]
    return _token


def api(method: str, path: str, body=None):
    req = urllib.request.Request(
        HOST + path, method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def sql(statement: str, params: list[dict]) -> list[list]:
    r = api("POST", "/api/2.0/sql/statements", {
        "statement": statement, "parameters": params, "warehouse_id": WAREHOUSE,
        "wait_timeout": "50s", "on_wait_timeout": "CONTINUE", "disposition": "INLINE", "format": "JSON_ARRAY",
    })
    while r["status"]["state"] in ("PENDING", "RUNNING"):
        time.sleep(2)
        r = api("GET", f"/api/2.0/sql/statements/{r['statement_id']}")
    if r["status"]["state"] != "SUCCEEDED":
        raise RuntimeError(json.dumps(r["status"]))
    rows = list(r.get("result", {}).get("data_array") or [])
    chunk = r.get("result", {})
    while chunk.get("next_chunk_internal_link"):
        chunk = api("GET", chunk["next_chunk_internal_link"])
        rows += chunk.get("data_array") or []
    return rows


SILVER_SQL = f"""
SELECT date_format(minute_timestamp_local, 'HH:mm') AS slot_start, origin, origin_bucket, active_count, source_version
FROM {SILVER}
WHERE location_name = :loc
  AND minute_timestamp_local >= to_timestamp_ntz(:d)
  AND minute_timestamp_local <  to_timestamp_ntz(:d) + INTERVAL 1 DAY
  AND minute(minute_timestamp_local) IN (0, 30)
ORDER BY slot_start, origin
"""

GOLD_SQL = f"""
SELECT date_format(minute_timestamp_local, 'HH:mm') AS slot_start, total_count,
  local_waterfront_count, vancouver_city_count, metro_vancouver_count, outside_metro_vancouver_count
FROM {GOLD}
WHERE location_name = :loc
  AND minute_timestamp_local >= to_timestamp_ntz(:d)
  AND minute_timestamp_local <  to_timestamp_ntz(:d) + INTERVAL 1 DAY
  AND minute(minute_timestamp_local) IN (0, 30)
"""


def export_day(day: str) -> dict:
    params = [{"name": "loc", "value": LOCATION}, {"name": "d", "value": day}]
    silver = sql(SILVER_SQL, params)
    gold = {r[0]: [int(x) for x in r[1:]] for r in sql(GOLD_SQL, params)}

    rows, per_slot, versions, origins = [], {}, set(), set()
    for slot, origin, bucket, count, version in silver:
        n = int(count)
        rows.append({"slot_start": slot, "origin": origin, "present": n})
        s = per_slot.setdefault(slot, [0] * 5)
        s[0] += n
        s[1 + BUCKETS.index(bucket)] += n
        versions.add(int(version))
        origins.add(origin)

    problems = []
    if len(per_slot) != 48:
        problems.append(f"{len(per_slot)} slots, expected 48")
    if len(origins) != 36:
        problems.append(f"{len(origins)} origins, expected 36")
    if len(rows) != 48 * 36:
        problems.append(f"{len(rows)} rows, expected 1728")
    for slot, sums in per_slot.items():
        if gold.get(slot) != sums:
            problems.append(f"{slot}: silver {sums} != gold {gold.get(slot)}")
    if problems:
        raise SystemExit(f"{day}: export failed checks:\n  " + "\n  ".join(problems))

    (OUT / "presence").mkdir(parents=True, exist_ok=True)
    with open(OUT / "presence" / f"{day}.json", "w", encoding="utf-8", newline="\n") as f:
        json.dump(rows, f, ensure_ascii=False, separators=(",", ":"))
    peak_slot = max(per_slot, key=lambda s: per_slot[s][0])
    return {
        "date": day, "rows": len(rows), "slots": len(per_slot), "origins": len(origins),
        "source_version": sorted(versions),
        "gold_check": "all 48 slots match gold total_count and the four bucket counts",
        "gold_totals": {s: per_slot[s][0] for s in sorted(per_slot)},
        "peak_slot": peak_slot, "peak_total": per_slot[peak_slot][0],
    }


def main():
    days = sys.argv[1:] or PITCH_DATES
    for d in days:
        dt.date.fromisoformat(d)
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    for d in days:
        r = export_day(d)
        print(f"{d}: {r['rows']} rows, gold check OK, peak {r['peak_total']} at {r['peak_slot']}")
        results.append(r)

    # dates.json lists only dates that were exported and checked.
    present = sorted({p.stem for p in (OUT / "presence").glob("*.json")})
    with open(OUT / "dates.json", "w", encoding="utf-8", newline="\n") as f:
        json.dump(present, f)
    manifest_path = OUT / "manifest.json"
    old = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"days": {}}
    days_meta = {**old.get("days", {}), **{r["date"]: r for r in results}}
    manifest = {
        "kind": "historical_snapshot",
        "source": {"host": HOST, "presence_table": SILVER, "check_table": GOLD, "location_name": LOCATION},
        "metric": "Simultaneous active attachment sessions: start <= t <= start + dwell_time, at the exact minute :00 or :30.",
        "clock": "minute_timestamp_local as recorded; assumed Vancouver local, not confirmed. Not shifted.",
        "counts": "Actual active_count values. No suppression. Sessions, not verified unique people.",
        "source_period": "2025-11-01 to 2026-08-31",
        "exported_at_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "dates": present,
        "days": {d: days_meta[d] for d in present if d in days_meta},
    }
    with open(manifest_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"dates.json: {present}")


if __name__ == "__main__":
    main()
