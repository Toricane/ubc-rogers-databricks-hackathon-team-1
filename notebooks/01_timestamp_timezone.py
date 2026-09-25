# Databricks notebook source
# MAGIC %md
# MAGIC # Which clock is `timestamp` on?
# MAGIC
# MAGIC **Recorded result: UTC.** Queried on the Serverless Starter Warehouse (session `Etc/UTC`) on 2026-09-25. Of 21,496,090 rows, 91.0% fall in 07:00–22:00 UTC and 5.4% fall in 00:00–05:00 UTC. The same instants in `America/Vancouver` are 56.6% daytime and 33.9% overnight. UBC, Waterfront Station, and Park Royal Mall agree. Span is `2025-11-01 00:00:00Z` through `2026-08-31 23:59:55Z`. Label hours as UTC. Do not convert to Pacific for bins.
# MAGIC
# MAGIC `workspace.default.synthetic_data.timestamp` is a Databricks `timestamp`. The cells below recompute that comparison. Re-run them only if the table is reloaded, and write any new verdict into `README.md` and `AGENTS.md`.
# MAGIC
# MAGIC This notebook does not change the session timezone (that would affect anyone sharing the notebook). It converts each value explicitly to **UTC** and to **America/Vancouver**, which follows Pacific Daylight Time in June.
# MAGIC
# MAGIC **How to read the result.** These rows are visits at UBC, Waterfront Station, and Park Royal Mall. A correct local clock should put most events in waking hours (about 07:00–22:00) and few in the middle of the night (00:00–05:00). Park Royal is the sharpest check: a mall should be busy in retail hours and quiet overnight. The zone with the stronger daytime pattern is the one to label hours with.
# MAGIC
# MAGIC Attach serverless compute and run the cells top to bottom. Do not use Run All if other people are in this notebook.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Session and column type

# COMMAND ----------

spark.sql("SELECT current_timezone() AS session_timezone").show(truncate=False)

ts_type = spark.table("workspace.default.synthetic_data").schema["timestamp"].dataType
print(f"timestamp column type: {ts_type}")

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT
# MAGIC   location_name,
# MAGIC   count(*) AS n,
# MAGIC   min(timestamp) AS min_ts_session_display,
# MAGIC   max(timestamp) AS max_ts_session_display,
# MAGIC   min(date_format(convert_timezone(current_timezone(), 'UTC', timestamp), 'yyyy-MM-dd HH:mm:ss')) AS min_utc,
# MAGIC   max(date_format(convert_timezone(current_timezone(), 'UTC', timestamp), 'yyyy-MM-dd HH:mm:ss')) AS max_utc,
# MAGIC   min(date_format(convert_timezone(current_timezone(), 'America/Vancouver', timestamp), 'yyyy-MM-dd HH:mm:ss')) AS min_pacific,
# MAGIC   max(date_format(convert_timezone(current_timezone(), 'America/Vancouver', timestamp), 'yyyy-MM-dd HH:mm:ss')) AS max_pacific
# MAGIC FROM workspace.default.synthetic_data
# MAGIC GROUP BY location_name
# MAGIC ORDER BY location_name

# COMMAND ----------

# MAGIC %md
# MAGIC ## Same instants, two clocks
# MAGIC
# MAGIC Twenty arbitrary rows. `session_display` follows the session timezone. `utc_clock` and `pacific_clock` do not.

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT
# MAGIC   location_name,
# MAGIC   timestamp AS session_display,
# MAGIC   date_format(convert_timezone(current_timezone(), 'UTC', timestamp), 'yyyy-MM-dd HH:mm:ss') AS utc_clock,
# MAGIC   date_format(convert_timezone(current_timezone(), 'America/Vancouver', timestamp), 'yyyy-MM-dd HH:mm:ss') AS pacific_clock,
# MAGIC   origin,
# MAGIC   dwell_time
# MAGIC FROM workspace.default.synthetic_data
# MAGIC LIMIT 20

# COMMAND ----------

# MAGIC %md
# MAGIC ## Hour of day
# MAGIC
# MAGIC One row per place and hour. Compare `n` across `hour_utc` versus `hour_pacific`.

# COMMAND ----------

# MAGIC %sql
# MAGIC WITH clocks AS (
# MAGIC   SELECT
# MAGIC     location_name,
# MAGIC     hour(convert_timezone(current_timezone(), 'UTC', timestamp)) AS hour_utc,
# MAGIC     hour(convert_timezone(current_timezone(), 'America/Vancouver', timestamp)) AS hour_pacific
# MAGIC   FROM workspace.default.synthetic_data
# MAGIC )
# MAGIC SELECT location_name, 'UTC' AS clock, hour_utc AS hour_of_day, count(*) AS n
# MAGIC FROM clocks
# MAGIC GROUP BY location_name, hour_utc
# MAGIC UNION ALL
# MAGIC SELECT location_name, 'America/Vancouver' AS clock, hour_pacific AS hour_of_day, count(*) AS n
# MAGIC FROM clocks
# MAGIC GROUP BY location_name, hour_pacific
# MAGIC ORDER BY location_name, clock, hour_of_day

# COMMAND ----------

# MAGIC %md
# MAGIC ## Which clock looks local?
# MAGIC
# MAGIC Daytime is hours 7 through 22. Overnight is hours 0 through 5. The higher `daytime_minus_overnight` is the better fit. A gap under 0.05 is too close to call.

# COMMAND ----------

hours = spark.sql("""
SELECT
  location_name,
  hour(convert_timezone(current_timezone(), 'UTC', timestamp)) AS hour_utc,
  hour(convert_timezone(current_timezone(), 'America/Vancouver', timestamp)) AS hour_pacific
FROM workspace.default.synthetic_data
""")
hours.createOrReplaceTempView("tz_hours")

summary = spark.sql("""
SELECT
  scope,
  clock,
  sum(n) AS n,
  sum(CASE WHEN hour_of_day BETWEEN 7 AND 22 THEN n ELSE 0 END) / sum(n) AS daytime_share,
  sum(CASE WHEN hour_of_day BETWEEN 0 AND 5 THEN n ELSE 0 END) / sum(n) AS overnight_share
FROM (
  SELECT 'ALL' AS scope, 'UTC' AS clock, hour_utc AS hour_of_day, count(*) AS n
  FROM tz_hours GROUP BY hour_utc
  UNION ALL
  SELECT 'ALL', 'America/Vancouver', hour_pacific, count(*) FROM tz_hours GROUP BY hour_pacific
  UNION ALL
  SELECT location_name, 'UTC', hour_utc, count(*) FROM tz_hours GROUP BY location_name, hour_utc
  UNION ALL
  SELECT location_name, 'America/Vancouver', hour_pacific, count(*)
  FROM tz_hours GROUP BY location_name, hour_pacific
) AS counts
GROUP BY scope, clock
ORDER BY scope, clock
""")

display(summary)

rows = summary.collect()
by_scope = {}
for row in rows:
    by_scope.setdefault(row.scope, {})[row.clock] = row

print("Verdict (daytime 07-22 minus overnight 00-05):")
for scope, clocks in sorted(by_scope.items()):
    utc = clocks["UTC"]
    pacific = clocks["America/Vancouver"]
    utc_score = utc.daytime_share - utc.overnight_share
    pacific_score = pacific.daytime_share - pacific.overnight_share
    gap = abs(pacific_score - utc_score)
    if gap < 0.05:
        winner = "inconclusive"
    elif pacific_score > utc_score:
        winner = "America/Vancouver"
    else:
        winner = "UTC"
    print(
        f"  {scope}: {winner} "
        f"(UTC daytime {utc.daytime_share:.1%} overnight {utc.overnight_share:.1%}; "
        f"Pacific daytime {pacific.daytime_share:.1%} overnight {pacific.overnight_share:.1%})"
    )

print(
    "\nWrite the ALL-row winner into README.md and AGENTS.md before any analysis labels hours. "
    "If a single location_name is chosen later, prefer that location's row over ALL."
)
