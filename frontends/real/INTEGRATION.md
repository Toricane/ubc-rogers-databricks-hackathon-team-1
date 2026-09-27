# Presence data: how it gets into the app

Five Bars 3G reads exported Databricks snapshots through `StaticAdapter`. There is no live SQL backend, and the browser never gets Databricks credentials.

## Source tables

| Table | Used for |
|---|---|
| `workspace.rogers_waterfront_minute.silver_origin_minute` | Per-origin rows shown in the app |
| `workspace.rogers_waterfront_minute.gold_activity_minute` | Checks: total and four-bucket counts per slot |

Both are filtered to `location_name = 'Waterfront Station'` on workspace `dbc-d1555967-1ea3`, using the Serverless Starter Warehouse.

## Metric

**Simultaneous active attachment sessions**: `start <= t <= start + dwell_time`, at the exact minute `t`.

- The app's 30-minute selector samples `minute_timestamp_local` at `:00` and `:30`. "21:30" means the sessions active at 21:30:00. It doesn't mean everyone seen during 21:30–22:00.
- Counts are sessions, not verified unique people or stranded people.
- Clock strings are kept as recorded. They're assumed to be Vancouver local time, which isn't confirmed. They're never shifted, and no `Z` is appended.
- Counts are exported as-is. There's no suppression, so `present` is never `null` in exported files and a zero is a real zero.
- The source period is November 2025 to August 2026.

## Files

Written by `scripts/export_databricks.py` into `public/data/internal/`. Vite copies them to `dist/data/internal/`, where `server.mjs` serves them.

| File | Shape |
|---|---|
| `dates.json` | `["2025-12-17", …]`, listing only dates that were exported and passed the checks |
| `presence/{date}.json` | `[{ "slot_start": "17:00", "origin": "North Vancouver", "present": 412 }, …]`: 48 slots × 36 origins = 1,728 rows |
| `manifest.json` | Source tables, metric, clock note, export time, and per-date checks with gold totals |

## Export

```bash
cd frontends/real
# Uses the signed-in Databricks CLI (databricks auth login). No token is saved.
set DATABRICKS_CONFIG_PROFILE=workspace1          # or your profile name
set DATABRICKS_CLI=C:\path\to\databricks.exe      # only if the CLI is not on PATH
python scripts/export_databricks.py               # pitch dates
python scripts/export_databricks.py 2026-06-15    # any extra dates
```

For each date the script:

1. Reads silver at `:00` and `:30` for that day (read-only SQL).
2. Stops if the day doesn't have exactly 48 slots, 36 origins and 1,728 rows.
3. Stops if any slot's silver sum differs from gold `total_count` or from any of gold's four bucket counts.
4. Writes the day file, then rewrites `dates.json` from the files actually present and updates `manifest.json`.

Current export: 2025-12-17, 2025-12-18, 2026-07-22, 2026-07-23, 2026-08-22 and 2026-08-23. Each is the date of a preset incident or the day after, so the time selector can step past midnight. All passed the gold check.

## Dispatch data ("Getting home" tab)

Built by `notebooks/05_dispatch.py`, exported by the same script (`--dispatch-only` skips the presence days).

| Table | File | Shape |
|---|---|---|
| `gold_route_events` | `dispatch/dates.json` | Event dates plus the day after each, e.g. `["2026-07-22","2026-07-23"]` |
| `gold_route_demand` | `dispatch/{date}.json` | `[{ "slot_start": "17:00", "origin": "Surrey", "present": 412, "departing_30m": 150 }, …]`, 1,728 rows. `departing_30m` = sessions that end in `[slot, slot + 30 min)` |
| `gold_route_transit` | `dispatch/transit.json` | `{ "feed": {version, start, end, url}, "routes": [{ origin, crossing_id, route_short_name, route_long_name, mode, board, alight, one_way_min, trips_per_hour_pm, shape }] }` |

Checks: each demand day must have 1,728 rows, and `present` summed per slot must equal gold `total_count`. The transit feed is TransLink's static GTFS (not real-time); feed dates and licence are in `public/data/external/transport.json`.

## What the app does with missing data

- `StaticAdapter` is the default and **never falls back to mock**. A date that isn't in `dates.json`, or a missing day file, shows a red "No exported snapshot for …" message and no numbers.
- Mock numbers appear only with `?data=mock`, always with the "Mock data" badge.
- `DatabricksAdapter` is still a stub and isn't selected.

## Grouping note

The app's groups aren't the same as gold's buckets:

- The app's **Vancouver** group is gold's `local_waterfront` (Downtown, West End) plus `vancouver_city` plus UBC.
- The app's **Metro** group is gold's `metro_vancouver` minus UBC.
- The app's **Outside Metro** group is the same as gold's `outside_metro_vancouver`.

The overall total is the same as gold's `total_count`.
