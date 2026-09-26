# Databricks notebook source
# /// script
# [tool.databricks.environment]
# environment_version = "6"
# ///
# MAGIC %md
# MAGIC # What is the 30-minute grain, and is there a visitor id?
# MAGIC
# MAGIC **Recorded result, Waterfront Station only.** Queried on the Serverless Starter Warehouse (session `Etc/UTC`) on 2026-09-26. 8,060,012 rows. There is no device, subscriber, or visit id. A row is one visit from a home-area label, active from `timestamp` for `dwell_time` minutes. Do not link rows into people.
# MAGIC
# MAGIC **30 minutes is the coverage grid, not the event clock.** All 14,592 UTC 30-minute bins from `2025-11-01 00:00Z` through `2026-08-31 23:30Z` are occupied. Inside each bin, minute offsets 0–29 each hold about 268,000 rows (range 267,305–269,899). Timestamps are whole seconds. The share on an exact `:00` or `:30` matches a uniform 1-second clock. `dwell_time` is an integer minute from 1 to 17,941 (median 53); 3.1% are multiples of 30. Keep 30-minute UTC windows as the default aggregation. Do not snap events to `:00` or `:30`, and do not convert to Pacific before binning.
# MAGIC
# MAGIC **`origin` is one of 36 home areas, not a person.** Vancouver neighbourhoods (for example `Kitsilano`, `Downtown`), Metro municipalities (for example `Surrey`, `Burnaby`), provinces, `International`, and `UBC`. In one 30-minute bin the same origin has a median of 8 rows and up to 347. 138,374 `(timestamp, origin)` pairs have more than one row (max 5). `(timestamp, origin, dwell_time)` is almost unique (8,058,918 distinct keys; 1,093 duplicated, max 3 copies). That only means exact duplicate rows are rare. It does not connect a visit today to a visit next week.
# MAGIC
# MAGIC **`longitude` and `latitude` are Waterfront’s coordinates on every row**, not the origin’s location.
# MAGIC
# MAGIC The cells below recompute that check. Re-run them only if the table is reloaded, and write any new verdict into `README.md` and `AGENTS.md`.
# MAGIC
# MAGIC Attach serverless compute and run the cells top to bottom. Do not use Run All if other people are in this notebook.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Columns
# MAGIC
# MAGIC Expect `location_name`, `longitude`, `latitude`, `timestamp`, `origin`, `dwell_time`. No id column. Waterfront should have one longitude and one latitude.

# COMMAND ----------

table = spark.table("workspace.default.synthetic_data")
for field in table.schema.fields:
    print(f"{field.name}: {field.dataType.simpleString()}")

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT
# MAGIC   count(*) AS n,
# MAGIC   count(DISTINCT longitude) AS n_longitude,
# MAGIC   count(DISTINCT latitude) AS n_latitude,
# MAGIC   min(longitude) AS longitude,
# MAGIC   min(latitude) AS latitude
# MAGIC FROM workspace.default.synthetic_data
# MAGIC WHERE location_name = 'Waterfront Station'

# COMMAND ----------

# MAGIC %md
# MAGIC ## 30-minute bins, second resolution, and dwell
# MAGIC
# MAGIC `n_30min_bins` should be 14,592. `rows_with_subsecond` should be 0. `exact_half_hour` is rows whose clock is exactly `:00:00` or `:30:00`. `dwell_multiple_of_30` is not the unit of `dwell_time`.

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT
# MAGIC   count(*) AS n,
# MAGIC   count(DISTINCT window(timestamp, '30 minutes').start) AS n_30min_bins,
# MAGIC   min(window(timestamp, '30 minutes').start) AS first_bin_start,
# MAGIC   max(window(timestamp, '30 minutes').start) AS last_bin_start,
# MAGIC   sum(CASE WHEN timestamp != date_trunc('second', timestamp) THEN 1 ELSE 0 END) AS rows_with_subsecond,
# MAGIC   sum(CASE WHEN second(timestamp) = 0 AND minute(timestamp) IN (0, 30) THEN 1 ELSE 0 END) AS exact_half_hour,
# MAGIC   min(dwell_time) AS min_dwell,
# MAGIC   percentile_approx(dwell_time, 0.5) AS p50_dwell,
# MAGIC   max(dwell_time) AS max_dwell,
# MAGIC   sum(CASE WHEN pmod(dwell_time, 30) = 0 THEN 1 ELSE 0 END) AS dwell_multiple_of_30
# MAGIC FROM workspace.default.synthetic_data
# MAGIC WHERE location_name = 'Waterfront Station'

# COMMAND ----------

# MAGIC %md
# MAGIC ## Minute offset inside the 30-minute bin
# MAGIC
# MAGIC `offset_in_bin_min` is 0 at `:00` and `:30`, then 1, 2, … through 29. A flat `n` means events are spread across the bin. A spike at 0 would mean the clock is snapped to the half hour.

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT
# MAGIC   pmod(minute(timestamp), 30) AS offset_in_bin_min,
# MAGIC   count(*) AS n
# MAGIC FROM workspace.default.synthetic_data
# MAGIC WHERE location_name = 'Waterfront Station'
# MAGIC GROUP BY pmod(minute(timestamp), 30)
# MAGIC ORDER BY offset_in_bin_min

# COMMAND ----------

# MAGIC %md
# MAGIC ## Can a row be told apart from another visit?
# MAGIC
# MAGIC `(timestamp, origin, dwell_time)` distinguishes almost every row. Keys with `c > 1` are exact duplicate visits, not a person id.
# MAGIC
# MAGIC The second result counts rows that share a timestamp and an origin. Several rows at the same second from the same home area are different visits.

# COMMAND ----------

# MAGIC %sql
# MAGIC WITH keys AS (
# MAGIC   SELECT timestamp, origin, dwell_time, count(*) AS c
# MAGIC   FROM workspace.default.synthetic_data
# MAGIC   WHERE location_name = 'Waterfront Station'
# MAGIC   GROUP BY timestamp, origin, dwell_time
# MAGIC )
# MAGIC SELECT
# MAGIC   count(*) AS distinct_event_keys,
# MAGIC   sum(c) AS n,
# MAGIC   sum(CASE WHEN c > 1 THEN 1 ELSE 0 END) AS keys_with_duplicates,
# MAGIC   max(c) AS max_multiplicity
# MAGIC FROM keys

# COMMAND ----------

# MAGIC %sql
# MAGIC WITH pairs AS (
# MAGIC   SELECT timestamp, origin, count(*) AS c
# MAGIC   FROM workspace.default.synthetic_data
# MAGIC   WHERE location_name = 'Waterfront Station'
# MAGIC   GROUP BY timestamp, origin
# MAGIC )
# MAGIC SELECT
# MAGIC   count(*) AS timestamp_origin_pairs,
# MAGIC   sum(CASE WHEN c > 1 THEN 1 ELSE 0 END) AS pairs_with_multiple_rows,
# MAGIC   max(c) AS max_rows_sharing_timestamp_and_origin
# MAGIC FROM pairs

# COMMAND ----------

# MAGIC %md
# MAGIC ## Rows per origin per 30-minute bin
# MAGIC
# MAGIC `n_origins` should be 36. `p50_rows` and `max_rows` are how many visits from one home area fall in one bin. Those rows are not one traveler.

# COMMAND ----------

# MAGIC %sql
# MAGIC WITH bins AS (
# MAGIC   SELECT
# MAGIC     window(timestamp, '30 minutes').start AS bin_start,
# MAGIC     origin,
# MAGIC     count(*) AS c
# MAGIC   FROM workspace.default.synthetic_data
# MAGIC   WHERE location_name = 'Waterfront Station'
# MAGIC   GROUP BY window(timestamp, '30 minutes').start, origin
# MAGIC )
# MAGIC SELECT
# MAGIC   count(*) AS origin_bin_pairs,
# MAGIC   count(DISTINCT origin) AS n_origins,
# MAGIC   count(DISTINCT bin_start) AS n_bins,
# MAGIC   min(c) AS min_rows,
# MAGIC   percentile_approx(c, 0.5) AS p50_rows,
# MAGIC   max(c) AS max_rows
# MAGIC FROM bins