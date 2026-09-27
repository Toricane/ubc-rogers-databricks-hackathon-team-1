# Databricks notebook source
# /// script
# [tool.databricks.environment]
# environment_version = "6"
# ///
# MAGIC %md
# MAGIC # Dispatch tables: who leaves Waterfront, and which TransLink services go home
# MAGIC
# MAGIC Builds the three tables the Five Bars 3G "Getting home" tab reads (through `frontends/real/scripts/export_databricks.py`):
# MAGIC
# MAGIC | Table | Grain | What it holds |
# MAGIC |---|---|---|
# MAGIC | `workspace.rogers_waterfront_minute.gold_route_events` | one row per incident | The sourced incident this dispatch view covers (Jul 22 2026 heat and smoke) |
# MAGIC | `workspace.rogers_waterfront_minute.gold_route_demand` | date × 30-min slot × origin | `present` at the slot minute and `departing_30m`, sessions that end in `[slot, slot + 30 min)` |
# MAGIC | `workspace.rogers_waterfront_minute.gold_route_transit` | origin × TransLink route | Scheduled TransLink services from Waterfront toward each Metro home area, from the static GTFS feed |
# MAGIC
# MAGIC - Counts are sessions, not people. `present` is the same metric as `silver_origin_minute` (`start <= t <= end`), sampled at `:00` and `:30`. Clock strings are kept as recorded and never shifted.
# MAGIC - Only sourced incidents are used. No fabricated events, venues, or rates.
# MAGIC - The GTFS feed is static (not real-time) and describes the feed's own service period, not July 2026. The zip is read from the Unity Catalog volume below; `dispatch_transit.py` (next to this notebook) does the parsing.
# MAGIC
# MAGIC Attach serverless compute and run the cells top to bottom. Do not use Run All if other people are in this notebook.

# COMMAND ----------

dbutils.widgets.text("gtfs_zip", "/Volumes/workspace/rogers_waterfront_minute/reference/translink_gtfs.zip")
GTFS_ZIP = dbutils.widgets.get("gtfs_zip")
SCHEMA = "workspace.rogers_waterfront_minute"
LOCATION = "Waterfront Station"

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Incident
# MAGIC
# MAGIC Same record and source as `frontends/real/public/data/external/incidents.json` (`jul22`). Demand is built for the incident date and the day after, so the app's time stepper can pass midnight.

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE workspace.rogers_waterfront_minute.gold_route_events
# MAGIC COMMENT 'Sourced incidents covered by the dispatch view. Built by notebooks/05_dispatch.py.'
# MAGIC AS SELECT * FROM VALUES
# MAGIC   ('jul22', DATE'2026-07-22', 'heat_smoke', 'Heat and wildfire smoke', 'humidex up to 42°C',
# MAGIC    'https://anywherevancouver.com/heat-air-quality-warnings-metro-vancouver-july-22-2026/')
# MAGIC AS t(event_id, date, hazard, title, description, source_url)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Demand: present and departing, per origin and slot

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE workspace.rogers_waterfront_minute.gold_route_demand
# MAGIC COMMENT 'Waterfront sessions per origin at each :00/:30 slot (present) and sessions ending in [slot, slot+30 min) (departing_30m), for gold_route_events dates and the day after. Sessions, not people. Built by notebooks/05_dispatch.py.'
# MAGIC AS
# MAGIC WITH days AS (
# MAGIC   SELECT DISTINCT d FROM (
# MAGIC     SELECT date AS d FROM workspace.rogers_waterfront_minute.gold_route_events
# MAGIC     UNION ALL SELECT date_add(date, 1) FROM workspace.rogers_waterfront_minute.gold_route_events)
# MAGIC ),
# MAGIC present AS (
# MAGIC   SELECT minute_timestamp_local AS t, origin, active_count AS present
# MAGIC   FROM workspace.rogers_waterfront_minute.silver_origin_minute
# MAGIC   WHERE location_name = 'Waterfront Station'
# MAGIC     AND to_date(minute_timestamp_local) IN (SELECT d FROM days)
# MAGIC     AND minute(minute_timestamp_local) IN (0, 30)
# MAGIC ),
# MAGIC departing AS (
# MAGIC   SELECT date_trunc('HOUR', end_time_local)
# MAGIC            + CASE WHEN minute(end_time_local) >= 30 THEN INTERVAL 30 MINUTES ELSE INTERVAL 0 MINUTES END AS t,
# MAGIC          origin, count(*) AS departing_30m
# MAGIC   FROM workspace.rogers_waterfront_minute.silver_sessions_local
# MAGIC   WHERE location_name = 'Waterfront Station'
# MAGIC     AND to_date(end_time_local) IN (SELECT d FROM days)
# MAGIC   GROUP BY 1, 2
# MAGIC )
# MAGIC SELECT to_date(p.t) AS date, date_format(p.t, 'HH:mm') AS slot_start, p.origin,
# MAGIC        p.present, coalesce(d.departing_30m, 0) AS departing_30m
# MAGIC FROM present p
# MAGIC LEFT JOIN departing d ON d.t = p.t AND d.origin = p.origin

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Expect 48 slots × 36 origins = 1,728 rows per date.
# MAGIC SELECT date, count(*) AS n_rows, count(DISTINCT slot_start) AS n_slots, count(DISTINCT origin) AS n_origins,
# MAGIC        sum(departing_30m) AS departing_total
# MAGIC FROM workspace.rogers_waterfront_minute.gold_route_demand
# MAGIC GROUP BY date ORDER BY date

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. TransLink services from Waterfront toward each Metro home area
# MAGIC
# MAGIC Reference points (origins, crossings, the Waterfront site) come from the app's reviewed files so both sides use the same coordinates.

# COMMAND ----------

import json
from pathlib import Path

import dispatch_transit

EXTERNAL = Path("../frontends/real/public/data/external")
origins = json.loads((EXTERNAL / "origins.json").read_text())["origins"]
crossings = json.loads((EXTERNAL / "crossings.json").read_text())["crossings"]
site = json.loads((EXTERNAL / "hubs.json").read_text())["site"]

transit = dispatch_transit.build_transit(GTFS_ZIP, origins, crossings, site)
(spark.createDataFrame(transit).write.mode("overwrite").option("overwriteSchema", "true")
    .saveAsTable(f"{SCHEMA}.gold_route_transit"))
spark.sql(f"COMMENT ON TABLE {SCHEMA}.gold_route_transit IS "
          "'Scheduled TransLink services from Waterfront toward each Metro home area, from the static GTFS feed "
          "(not real-time). Built by notebooks/05_dispatch.py with dispatch_transit.py.'")
display(transit.drop(columns=["shape_json"]))
