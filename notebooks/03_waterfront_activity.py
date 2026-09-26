# Databricks notebook source
# MAGIC %md
# MAGIC # Waterfront active visits by 30-minute bin
# MAGIC
# MAGIC **Recorded result.** Queried on the Serverless Starter Warehouse (session `Etc/UTC`) on 2026-09-26, `location_name = 'Waterfront Station'` (8,060,012 rows). A visit is active on a 30-minute UTC bin when `[timestamp, timestamp + dwell_time minutes)` overlaps that bin. Counts are visits, not distinct people.
# MAGIC
# MAGIC The overlap query returns 501,697 origin-bin rows (max 1,232 in one cell). Summed presence is 29,459,642. The busiest clock is 17:00 UTC. The five busiest clocks are 16:00, 16:30, 17:00, 17:30, and 18:00 UTC. Wednesday is the busiest weekday. June 2026 has the most presence per day and August 2026 the least. Ontario, Surrey, and Burnaby are the three largest origin totals. Waterfront’s own coordinates are longitude `-123.1115`, latitude `49.2857`.
# MAGIC
# MAGIC The player reads `frontends/waterfront-presence-sketch/public/data/activity.bin`, built from this overlap query. Re-run the cells only if the table is reloaded, and write any new verdict into `README.md` and `AGENTS.md`.
# MAGIC
# MAGIC Attach serverless compute and run the cells top to bottom. Do not use Run All if other people are in this notebook.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Station point
# MAGIC
# MAGIC These coordinates are the place, repeated on every Waterfront row. They are not home-area locations.

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT
# MAGIC   min(longitude) AS longitude,
# MAGIC   min(latitude) AS latitude,
# MAGIC   count(*) AS n,
# MAGIC   count(DISTINCT longitude) AS n_longitude,
# MAGIC   count(DISTINCT latitude) AS n_latitude
# MAGIC FROM workspace.default.synthetic_data
# MAGIC WHERE location_name = 'Waterfront Station'

# COMMAND ----------

# MAGIC %md
# MAGIC ## Active visits by bin and origin
# MAGIC
# MAGIC Bins are clipped to `2025-11-01 00:00:00` through `2026-08-31 23:30:00` UTC. This is about 502,000 rows. The app stores the same numbers as little-endian uint16 values.

# COMMAND ----------

# MAGIC %sql
# MAGIC WITH visits AS (
# MAGIC   SELECT
# MAGIC     origin,
# MAGIC     window(timestamp, '30 minutes').start AS first_bin,
# MAGIC     window(
# MAGIC       timestamp + (dwell_time * INTERVAL 1 MINUTE) - INTERVAL 1 SECOND,
# MAGIC       '30 minutes'
# MAGIC     ).start AS last_bin
# MAGIC   FROM workspace.default.synthetic_data
# MAGIC   WHERE location_name = 'Waterfront Station'
# MAGIC ),
# MAGIC clipped AS (
# MAGIC   SELECT
# MAGIC     origin,
# MAGIC     GREATEST(first_bin, TIMESTAMP '2025-11-01 00:00:00') AS first_bin,
# MAGIC     LEAST(last_bin, TIMESTAMP '2026-08-31 23:30:00') AS last_bin
# MAGIC   FROM visits
# MAGIC ),
# MAGIC expanded AS (
# MAGIC   SELECT
# MAGIC     origin,
# MAGIC     explode(sequence(first_bin, last_bin, INTERVAL 30 MINUTES)) AS bin_start
# MAGIC   FROM clipped
# MAGIC   WHERE first_bin <= last_bin
# MAGIC )
# MAGIC SELECT
# MAGIC   bin_start,
# MAGIC   origin,
# MAGIC   COUNT(*) AS active_visits
# MAGIC FROM expanded
# MAGIC GROUP BY bin_start, origin
# MAGIC ORDER BY bin_start, origin

# COMMAND ----------

# MAGIC %md
# MAGIC ## Presence by clock, weekday, month, and origin
# MAGIC
# MAGIC Same overlap as the cell above. `half_hour` 0 is 00:00 UTC and 34 is 17:00 UTC. `weekday` follows Spark: 1 Sunday through 7 Saturday.

# COMMAND ----------

# MAGIC %sql
# MAGIC WITH visits AS (
# MAGIC   SELECT
# MAGIC     origin,
# MAGIC     window(timestamp, '30 minutes').start AS first_bin,
# MAGIC     window(
# MAGIC       timestamp + (dwell_time * INTERVAL 1 MINUTE) - INTERVAL 1 SECOND,
# MAGIC       '30 minutes'
# MAGIC     ).start AS last_bin
# MAGIC   FROM workspace.default.synthetic_data
# MAGIC   WHERE location_name = 'Waterfront Station'
# MAGIC ),
# MAGIC clipped AS (
# MAGIC   SELECT
# MAGIC     origin,
# MAGIC     GREATEST(first_bin, TIMESTAMP '2025-11-01 00:00:00') AS first_bin,
# MAGIC     LEAST(last_bin, TIMESTAMP '2026-08-31 23:30:00') AS last_bin
# MAGIC   FROM visits
# MAGIC ),
# MAGIC expanded AS (
# MAGIC   SELECT
# MAGIC     origin,
# MAGIC     explode(sequence(first_bin, last_bin, INTERVAL 30 MINUTES)) AS bin_start
# MAGIC   FROM clipped
# MAGIC   WHERE first_bin <= last_bin
# MAGIC )
# MAGIC SELECT 'half_hour' AS grain, CAST(hour(bin_start) * 2 + IF(minute(bin_start) >= 30, 1, 0) AS STRING) AS bucket, SUM(1) AS active_visits
# MAGIC FROM expanded
# MAGIC GROUP BY hour(bin_start) * 2 + IF(minute(bin_start) >= 30, 1, 0)
# MAGIC UNION ALL
# MAGIC SELECT 'weekday', CAST(dayofweek(bin_start) AS STRING), SUM(1)
# MAGIC FROM expanded
# MAGIC GROUP BY dayofweek(bin_start)
# MAGIC UNION ALL
# MAGIC SELECT 'month', date_format(bin_start, 'yyyy-MM'), SUM(1)
# MAGIC FROM expanded
# MAGIC GROUP BY date_format(bin_start, 'yyyy-MM')
# MAGIC UNION ALL
# MAGIC SELECT 'origin', origin, SUM(1)
# MAGIC FROM expanded
# MAGIC GROUP BY origin
# MAGIC ORDER BY grain, bucket
