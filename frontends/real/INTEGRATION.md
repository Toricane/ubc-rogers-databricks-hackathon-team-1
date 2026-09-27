# Plugging in the real presence data

Five Bars 3G reads presence only. There is no baseline, trend, or forecast file.

## Contract

Put these files under `frontends/real/public/data/internal/`. Open the app with `?data=static`, which is also the default. If the files are missing, the app falls back to mock numbers and shows the "Mock data" badge.

| File | Shape | Definition |
|---|---|---|
| `internal/dates.json` | `["2025-11-01", …]` | Dates available |
| `internal/presence/{date}.json` | `[{ "slot_start": "21:30", "origin": "North Vancouver", "present": 412 }]` | Visits active in the 30-minute slot: `timestamp < slot_end` and `timestamp + dwell_time minutes >= slot_start`. Source is `workspace.default.synthetic_data` where `location_name = 'Waterfront Station'`. Timestamps stay as recorded; never convert them. Cells with fewer than 10 visits become `null`. |

Rules:

- `slot_start` is `"HH:MM"` on the table's own clock, which is UTC. The warehouse session is `Etc/UTC`. Don't shift to Pacific time.
- Write one row for every slot (48 per day) and every origin (36 labels, spelled exactly as in the table). A cell with 0 to 9 visits is `null`, not missing.
- `{date}` is the date of `slot_start`. A visit that runs past midnight counts in the next day's file too.
- A row counts visits, not people. The app says "people" in its labels and explains the difference in the (i) drawer.

## PySpark snippet (not run)

Run this in a notebook in the team workspace. It reads the table and writes nothing back to Databricks. It collects about 525,000 small rows to the driver and writes JSON files you can then copy into `public/data/internal/`.

```python
import json, os
from pyspark.sql import functions as F

spark.conf.set("spark.sql.session.timeZone", "Etc/UTC")  # table clock; do not convert

SLOT = 1800  # seconds
OUT = "/Workspace/Users/<you>/five-bars-internal"  # any scratch folder you can download from

visits = (
    spark.table("workspace.default.synthetic_data")
    .where(F.col("location_name") == "Waterfront Station")
    .select(
        "origin",
        F.unix_timestamp("timestamp").alias("t0"),
        (F.unix_timestamp("timestamp") + F.col("dwell_time") * 60).alias("t1"),
    )
)

# Slot s (start) is active when t0 < s + 30 min and t1 >= s.
# So s runs from floor30(t0) through floor30(t1), inclusive.
slots = visits.select(
    "origin",
    F.explode(
        F.sequence(
            (F.floor(F.col("t0") / SLOT) * SLOT),
            (F.floor(F.col("t1") / SLOT) * SLOT),
            F.lit(SLOT).cast("bigint"),
        )
    ).alias("s"),
)

counts = slots.groupBy("s", "origin").count()

# Full grid: every slot in the table's span x every origin, so zero cells exist.
span = spark.table("workspace.default.synthetic_data").where(
    F.col("location_name") == "Waterfront Station"
).agg(
    (F.floor(F.min(F.unix_timestamp("timestamp")) / SLOT) * SLOT).alias("lo"),
    (F.floor(F.max(F.unix_timestamp("timestamp")) / SLOT) * SLOT).alias("hi"),
)
grid_slots = span.select(F.explode(F.sequence("lo", "hi", F.lit(SLOT).cast("bigint"))).alias("s"))
origins = (
    spark.table("workspace.default.synthetic_data")
    .where(F.col("location_name") == "Waterfront Station")
    .select("origin").distinct()
)

cells = (
    grid_slots.crossJoin(origins)
    .join(counts, ["s", "origin"], "left")
    .select(
        F.date_format(F.timestamp_seconds("s"), "yyyy-MM-dd").alias("date"),
        F.date_format(F.timestamp_seconds("s"), "HH:mm").alias("slot_start"),
        "origin",
        F.when(F.coalesce("count", F.lit(0)) < 10, F.lit(None)).otherwise(F.col("count")).alias("present"),
    )
)

rows = cells.orderBy("date", "slot_start", "origin").collect()

os.makedirs(f"{OUT}/presence", exist_ok=True)
by_date = {}
for r in rows:
    by_date.setdefault(r.date, []).append(
        {"slot_start": r.slot_start, "origin": r.origin, "present": r.present}
    )
for d, items in by_date.items():
    with open(f"{OUT}/presence/{d}.json", "w") as f:
        json.dump(items, f, separators=(",", ":"))
with open(f"{OUT}/dates.json", "w") as f:
    json.dump(sorted(by_date), f)
```

Quick checks after running:

- `dates.json` holds 304 dates, from `2025-11-01` through `2026-08-31`.
- Each day file has 48 × 36 = 1,728 rows.
- No `present` value is between 1 and 9.

## Other adapters

- `?data=mock` always uses mock numbers.
- `?data=databricks` selects `DatabricksAdapter`, which is a stub (`/api/dates`, `/api/presence?date=&slot=`). Its presence calls throw until it's implemented. See `NEXT_STEPS.md`.
- You can set the default with `VITE_DATA_SOURCE=mock|static|databricks` at build time.

## External reference data

`public/data/external/*.json` holds the hubs, crossings, origins, rates, hazards and incidents. Every record names its source. Values that couldn't be confirmed are `null` with a TODO.
