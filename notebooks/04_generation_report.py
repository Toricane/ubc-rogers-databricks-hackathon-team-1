# Databricks notebook source
# /// script
# [tool.databricks.environment]
# environment_version = "6"
# ///
# MAGIC %md
# MAGIC # How the synthetic visits were produced
# MAGIC
# MAGIC Recomputes the generation report from `workspace.default.synthetic_data` and draws the charts. The uploaded table is the bronze extract. This notebook does not create a silver or gold table.
# MAGIC
# MAGIC **Hour.** `hour(timestamp)` on the Serverless Starter Warehouse (session `Etc/UTC`). That stored hour is the daytime clock. Do not convert to `America/Vancouver` before taking the hour. Charts label it **Hour**.
# MAGIC
# MAGIC **What the charts are for.** Each site keeps its own calendar. UBC weekdays follow the [UBC Vancouver 2025/26 academic calendar](https://vancouver.calendar.ubc.ca/academic-year-202526). Home labels split into Greater Vancouver, provinces plus other B.C., and International. The calendar changes how many visits arrive. The hour changes which home labels they carry.
# MAGIC
# MAGIC Attach serverless compute and run the cells top to bottom. Do not use Run All if other people are in this notebook.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Setup
# MAGIC
# MAGIC Greater Vancouver is the City of Vancouver local areas, `UBC`, and the other Metro municipalities on the origin list. Provinces and other B.C. are `Alberta`, `Ontario`, `Manitoba`, `Atlantic Canada`, `Saskatchewan and Territories`, and `British Columbia Other`.

# COMMAND ----------

import matplotlib.pyplot as plt
import pandas as pd

TABLE = "workspace.default.synthetic_data"
SITES = ["Waterfront Station", "UBC", "Park Royal Mall"]
COLORS = {
    "Waterfront Station": "#1b9e77",
    "UBC": "#7570b3",
    "Park Royal Mall": "#d95f02",
}
SHORT = {
    "Waterfront Station": "Waterfront",
    "UBC": "UBC",
    "Park Royal Mall": "Park Royal",
}

NEIGHBOURHOODS = {
    "Arbutus Ridge", "Downtown", "Dunbar-Southlands", "Fairview",
    "Grandview-Woodland", "Hastings-Sunrise", "Kensington-Cedar Cottage",
    "Killarney", "Kitsilano", "Marpole", "Mount Pleasant", "Oakridge",
    "Renfrew-Collingwood", "Strathcona", "Sunset", "Victoria-Fraserview",
    "West End", "UBC",
}
CITIES = {
    "Burnaby", "Delta", "Langley", "Maple Ridge", "New Westminster",
    "North Vancouver", "Pitt Meadows", "Port Moody", "Richmond", "Surrey",
    "West Vancouver",
}
PROVINCES = {
    "Alberta", "Atlantic Canada", "British Columbia Other", "Manitoba",
    "Ontario", "Saskatchewan and Territories",
}

WINDOWS = [
    ("2025-11-01", "2025-12-05", "Nov 1–Dec 5 classes"),
    ("2025-12-09", "2025-12-20", "Dec 9–20 exams"),
    ("2025-12-21", "2026-01-04", "Dec 21–Jan 4 break"),
    ("2026-01-05", "2026-02-15", "Jan 5–Feb 15 classes"),
    ("2026-02-16", "2026-02-20", "Feb 16–20 break"),
    ("2026-02-21", "2026-04-10", "Feb 21–Apr 10 classes"),
    ("2026-04-14", "2026-04-25", "Apr 14–25 exams"),
    ("2026-08-01", "2026-08-31", "August"),
]
WINDOW_ORDER = [label for _, _, label in WINDOWS]

def origin_band(origin):
    if origin == "International":
        return "International"
    if origin in PROVINCES:
        return "Provinces and other B.C."
    if origin in NEIGHBOURHOODS or origin in CITIES:
        return "Greater Vancouver"
    raise ValueError(f"unclassified origin: {origin}")

def style_ax(ax, title, xlabel, ylabel):
    ax.set_title(title)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Weekday volume against the UBC calendar
# MAGIC
# MAGIC Monday–Friday only. Spark `dayofweek` is 1 Sunday through 7 Saturday, so weekdays are 2 through 6. Days outside these windows are left out.

# COMMAND ----------

window_sql = " ".join(
    f"WHEN day BETWEEN DATE '{start}' AND DATE '{end}' THEN '{label}'"
    for start, end, label in WINDOWS
)
weekday = spark.sql(f"""
    SELECT location_name, window_label, count(*) AS n, count(DISTINCT day) AS n_days
    FROM (
      SELECT
        location_name,
        date(timestamp) AS day,
        CASE {window_sql} END AS window_label
      FROM {TABLE}
      WHERE dayofweek(timestamp) BETWEEN 2 AND 6
    )
    WHERE window_label IS NOT NULL
    GROUP BY location_name, window_label
""").toPandas()

means = weekday.copy()
means["mean_per_day"] = means["n"] / means["n_days"]
pivot = (
    means.pivot(index="window_label", columns="location_name", values="mean_per_day")
    .reindex(WINDOW_ORDER)[SITES]
)
site_avg = pivot.mean(axis=0)
indexed = pivot.div(site_avg, axis=1) * 100

fig, ax = plt.subplots(figsize=(11, 4.8))
pivot.plot(kind="bar", ax=ax, color=[COLORS[s] for s in SITES], width=0.8)
style_ax(ax, "Weekday visits by calendar window", "Window", "Mean visits per weekday")
ax.legend(title=None)
ax.tick_params(axis="x", labelrotation=30)
plt.tight_layout()
plt.show()

fig, ax = plt.subplots(figsize=(11, 4.8))
indexed.plot(kind="bar", ax=ax, color=[COLORS[s] for s in SITES], width=0.8)
ax.axhline(100, color="0.4", linewidth=1, linestyle="--", label="site average")
style_ax(ax, "Each site as a percent of its own average", "Window", "Percent of that site's average")
ax.legend(title=None)
ax.tick_params(axis="x", labelrotation=30)
plt.tight_layout()
plt.show()

# COMMAND ----------

# MAGIC %md
# MAGIC 100% on the second chart is that site's average weekday mean across these eight windows. UBC's break windows fall well below its own average. Park Royal's December window rises above its own average. Waterfront stays nearer 100 except in the winter break and in August.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Hour of day and dwell
# MAGIC
# MAGIC Counts are visit starts. Median dwell is `percentile_approx(dwell_time, 0.5)` in minutes.

# COMMAND ----------

by_hour = spark.sql(f"""
    SELECT
      location_name,
      hour(timestamp) AS hour,
      count(*) AS n,
      percentile_approx(dwell_time, 0.5) AS dwell_p50
    FROM {TABLE}
    GROUP BY location_name, hour(timestamp)
    ORDER BY hour
""").toPandas()
totals = by_hour.groupby("location_name")["n"].transform("sum")
by_hour["share"] = 100 * by_hour["n"] / totals

fig, ax = plt.subplots(figsize=(11, 4.5))
for site in SITES:
    part = by_hour[by_hour["location_name"] == site].sort_values("hour")
    ax.plot(part["hour"], part["share"], color=COLORS[site], label=SHORT[site], linewidth=2)
style_ax(ax, "Share of visits by hour", "Hour", "Percent of that site's visits")
ax.set_xticks(range(0, 24, 2))
ax.legend()
plt.tight_layout()
plt.show()

fig, ax = plt.subplots(figsize=(11, 4.5))
for site in SITES:
    part = by_hour[by_hour["location_name"] == site].sort_values("hour")
    ax.plot(part["hour"], part["dwell_p50"], color=COLORS[site], label=SHORT[site], linewidth=2)
style_ax(ax, "Median dwell by hour", "Hour", "Median dwell (minutes)")
ax.set_xticks(range(0, 24, 2))
ax.legend()
plt.tight_layout()
plt.show()

# COMMAND ----------

# MAGIC %md
# MAGIC Waterfront rises through the morning and peaks in the late afternoon. Park Royal peaks mid-afternoon and is quiet overnight. UBC is broader and higher at night. Median dwell at Waterfront and UBC stays flat through the daytime. At Park Royal it lengthens from the overnight hours into the afternoon.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Home labels
# MAGIC
# MAGIC The first row of pies is every visit. The second row is Greater Vancouver visits only.

# COMMAND ----------

origins = spark.sql(f"""
    SELECT location_name, origin, count(*) AS n
    FROM {TABLE}
    GROUP BY location_name, origin
""").toPandas()
origins["band"] = origins["origin"].map(origin_band)

band = origins.groupby(["location_name", "band"], as_index=False)["n"].sum()
band_order = ["Greater Vancouver", "Provinces and other B.C.", "International"]
band_colors = ["#4c78a8", "#f58518", "#54a24b"]

fig, axes = plt.subplots(1, 3, figsize=(12, 4.2))
for ax, site in zip(axes, SITES):
    part = band[band["location_name"] == site].set_index("band").reindex(band_order)
    shares = 100 * part["n"] / part["n"].sum()
    ax.pie(
        shares,
        labels=[f"{name}\n{value:.1f}%" for name, value in shares.items()],
        colors=band_colors,
        startangle=90,
        wedgeprops={"width": 0.45, "edgecolor": "white"},
    )
    ax.set_title(SHORT[site])
fig.suptitle("Home-label band, share of all visits")
plt.tight_layout()
plt.show()

def metro_slice(origin, site):
    if origin not in NEIGHBOURHOODS and origin not in CITIES:
        return None
    if site == "UBC" and origin == "UBC":
        return "UBC"
    if origin in NEIGHBOURHOODS:
        return "Other Vancouver neighbourhoods" if site == "UBC" else "Vancouver neighbourhoods"
    named = {
        "Waterfront Station": {"Surrey", "Burnaby", "North Vancouver", "Richmond", "New Westminster"},
        "UBC": {"Surrey", "Richmond", "Burnaby", "West Vancouver"},
        "Park Royal Mall": {"West Vancouver", "North Vancouver", "Burnaby", "Surrey"},
    }
    if origin in named[site]:
        return origin
    return "Other Metro"

metro_rows = []
for _, row in origins.iterrows():
    label = metro_slice(row["origin"], row["location_name"])
    if label:
        metro_rows.append((row["location_name"], label, row["n"]))
metro = pd.DataFrame(metro_rows, columns=["location_name", "slice", "n"]).groupby(
    ["location_name", "slice"], as_index=False
)["n"].sum()

slice_order = {
    "Waterfront Station": [
        "Vancouver neighbourhoods", "Surrey", "Burnaby", "North Vancouver",
        "Richmond", "New Westminster", "Other Metro",
    ],
    "UBC": [
        "Other Vancouver neighbourhoods", "UBC", "Surrey", "Richmond",
        "Burnaby", "West Vancouver", "Other Metro",
    ],
    "Park Royal Mall": [
        "West Vancouver", "North Vancouver", "Vancouver neighbourhoods",
        "Burnaby", "Surrey", "Other Metro",
    ],
}

fig, axes = plt.subplots(1, 3, figsize=(12, 4.6))
for ax, site in zip(axes, SITES):
    order = slice_order[site]
    part = metro[metro["location_name"] == site].set_index("slice").reindex(order)
    shares = 100 * part["n"] / part["n"].sum()
    ax.pie(
        shares,
        labels=[f"{name}\n{value:.1f}%" for name, value in shares.items()],
        startangle=90,
        wedgeprops={"width": 0.45, "edgecolor": "white"},
        textprops={"fontsize": 8},
    )
    ax.set_title(SHORT[site])
fig.suptitle("Inside Greater Vancouver, share of that site's Metro visits")
plt.tight_layout()
plt.show()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Largest Metro home areas
# MAGIC
# MAGIC Percent of all visits at that site, not only the Metro slice.

# COMMAND ----------

fig, axes = plt.subplots(1, 3, figsize=(12, 4.8))
for ax, site in zip(axes, SITES):
    part = origins[
        (origins["location_name"] == site)
        & (origins["origin"].isin(NEIGHBOURHOODS | CITIES))
    ].nlargest(8, "n")
    total = origins.loc[origins["location_name"] == site, "n"].sum()
    share = 100 * part["n"] / total
    ax.barh(part["origin"][::-1], share[::-1], color=COLORS[site])
    style_ax(ax, SHORT[site], "Percent of all visits", "")
plt.tight_layout()
plt.show()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Night changes the crowd. Calendar days change the count.
# MAGIC
# MAGIC 04:00, 08:00, and 16:00 are compared with the all-day mix. Boxing Day, the Jan 5 term start, the reading break, and the week of Nov 3–7 are the calendar checks.

# COMMAND ----------

hour_band = spark.sql(f"""
    SELECT location_name, hour(timestamp) AS hour, origin, count(*) AS n
    FROM {TABLE}
    WHERE hour(timestamp) IN (4, 8, 16)
    GROUP BY location_name, hour(timestamp), origin
""").toPandas()
hour_band["band"] = hour_band["origin"].map(origin_band)
hour_mix = hour_band.groupby(["location_name", "hour", "band"], as_index=False)["n"].sum()
hour_mix["share"] = 100 * hour_mix["n"] / hour_mix.groupby(["location_name", "hour"])["n"].transform("sum")

fig, axes = plt.subplots(1, 3, figsize=(12, 4.2), sharey=True)
hours = [4, 8, 16]
x = range(len(hours))
width = 0.25
for ax, site in zip(axes, SITES):
    for i, (name, color) in enumerate(zip(band_order, band_colors)):
        vals = []
        for hour in hours:
            match = hour_mix[
                (hour_mix["location_name"] == site)
                & (hour_mix["hour"] == hour)
                & (hour_mix["band"] == name)
            ]
            vals.append(float(match["share"].iloc[0]) if len(match) else 0.0)
        ax.bar([p + (i - 1) * width for p in x], vals, width=width, color=color, label=name)
    style_ax(ax, SHORT[site], "Hour", "Percent of visits in that hour")
    ax.set_xticks(list(x))
    ax.set_xticklabels(["04:00", "08:00", "16:00"])
axes[0].legend(fontsize=8)
plt.tight_layout()
plt.show()

marks = spark.sql(f"""
    SELECT
      location_name,
      CASE
        WHEN date(timestamp) = DATE '2025-12-26' THEN 'Boxing Day'
        WHEN date(timestamp) = DATE '2026-01-05' THEN 'Jan 5 term start'
        WHEN date(timestamp) BETWEEN DATE '2026-02-16' AND DATE '2026-02-20' THEN 'Feb 16–20 reading break'
        WHEN date(timestamp) BETWEEN DATE '2025-11-03' AND DATE '2025-11-07' THEN 'Nov 3–7 term week'
      END AS slice,
      origin,
      count(*) AS n
    FROM {TABLE}
    WHERE date(timestamp) = DATE '2025-12-26'
       OR date(timestamp) = DATE '2026-01-05'
       OR date(timestamp) BETWEEN DATE '2026-02-16' AND DATE '2026-02-20'
       OR date(timestamp) BETWEEN DATE '2025-11-03' AND DATE '2025-11-07'
    GROUP BY location_name, slice, origin
""").toPandas()
marks["band"] = marks["origin"].map(origin_band)
mark_mix = marks.groupby(["location_name", "slice", "band"], as_index=False)["n"].sum()
all_day = band.rename(columns={"n": "all_n"})
mark_mix["share"] = 100 * mark_mix["n"] / mark_mix.groupby(["location_name", "slice"])["n"].transform("sum")

rows = []
for site in SITES:
    base = all_day[all_day["location_name"] == site]
    base_total = base["all_n"].sum()
    rec = {"site": SHORT[site], "slice": "all days"}
    for name in band_order:
        rec[name] = round(100 * float(base.loc[base["band"] == name, "all_n"].iloc[0]) / base_total, 1)
    rows.append(rec)
    for sl in ["Nov 3–7 term week", "Jan 5 term start", "Feb 16–20 reading break", "Boxing Day"]:
        part = mark_mix[(mark_mix["location_name"] == site) & (mark_mix["slice"] == sl)]
        if part.empty:
            continue
        rec = {"site": SHORT[site], "slice": sl}
        for name in band_order:
            rec[name] = round(float(part.loc[part["band"] == name, "share"].iloc[0]), 1)
        rows.append(rec)
display(pd.DataFrame(rows))

# COMMAND ----------

# MAGIC %md
# MAGIC At 04:00, provinces and other B.C. are about half of Waterfront visits. By 08:00 each site is back to its all-day mix, and 16:00 matches 08:00. The calendar slices above stay within about a point of the all-day band. Read a holiday as a change in volume. Read 04:00 as a change in who is labeled as present.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Medallion sketch, not built
# MAGIC
# MAGIC Bronze is `workspace.default.synthetic_data` as uploaded. Do not rewrite it.
# MAGIC
# MAGIC Silver, when built, should stay one row per visit. Drop the repeated coordinates from the fact and keep them on a 3-row site table (`location_name`, `longitude`, `latitude`). Add `hour`, `day`, `dayofweek`, `origin_band`, and a Metro piece, all derived from the stored clock and the origin list above. Cluster by `location_name` and `day` so Waterfront filters do not scan the other sites. A view is enough until a gold job scans it repeatedly.
# MAGIC
# MAGIC Gold comes later: 30-minute active-visit counts by origin (the player extract), weekday window means, and the hour-by-band mix. Those are aggregates a judge-facing tool can read without scanning 21 million visits.