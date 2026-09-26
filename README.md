# UBC Rogers Databricks Hackathon — Team 1

Team workspace for the Rogers, Databricks, and UBC Data Intelligence for Smarter Communities Hackathon (September 25–27, ICICS Atrium).

Build one clear **transit and/or security** solution from the synthetic mobility table. Show the analysis in Databricks, and show the recommendation in a separate interactive tool (dashboard, app, or similar) that a judge can use.

## Data

Unity Catalog table `workspace.default.synthetic_data` (managed Delta) on workspace `dbc-d1555967-1ea3`. Query it with the Serverless Starter Warehouse. This Git folder is also checked out in that workspace.

| Column | Type | Meaning |
| --- | --- | --- |
| `location_name` | string | `UBC`, `Waterfront Station`, or `Park Royal Mall` |
| `longitude`, `latitude` | double | Coordinates of that place, repeated on every row. Not a per-person track, and not the origin’s location. |
| `timestamp` | timestamp | Visit start, a 1-second UTC instant. Bin and label hours in UTC. Do not convert to Pacific. |
| `origin` | string | Home area of the visit, one of 36 labels (Vancouver neighbourhoods, Metro municipalities, provinces, `International`, and `UBC`). Not a person id and not the previous stop. |
| `dwell_time` | bigint | Minutes the visit stays active after `timestamp`. Integer minutes, not a 30-minute unit. |

There is no device, subscriber, or visit id. A row is one visit. Do not link rows into people.

**Location: Waterfront Station.** Filter every analysis with `location_name = 'Waterfront Station'`.

The table has 21,496,090 rows, from `2025-11-01 00:00:00Z` through `2026-08-31 23:59:55Z`. Waterfront Station has 8,060,012 of those rows.

**Timezone: UTC.** Checked on the Serverless Starter Warehouse (session `Etc/UTC`) by comparing hour-of-day. Read as UTC, 91.0% of rows fall in 07:00–22:00 and 5.4% fall in 00:00–05:00. Converted to `America/Vancouver`, daytime falls to 56.6% and overnight rises to 33.9%. The same winner holds for UBC, Waterfront Station, and Park Royal Mall. A `Z` in exports matches this clock. 18:00 in the table is 18:00 UTC, not 6pm Pacific.

**Time grain.** At Waterfront Station every 30-minute UTC bin from `2025-11-01 00:00Z` through `2026-08-31 23:30Z` is occupied (14,592 bins). Rows are spread evenly inside each bin: minute offsets 0–29 each hold about 268,000 rows. Timestamps are whole seconds, and the share on an exact `:00` or `:30` matches a uniform 1-second clock. `dwell_time` runs from 1 to 17,941 minutes (median 53); 3.1% are multiples of 30. Keep 30-minute windows as the default aggregation. Do not snap events to the half hour. On this warehouse the session is already UTC, so `hour(timestamp)` and `window(timestamp, '30 minutes')` are the right bins. If a session is not UTC, convert to UTC before taking the hour. Do not convert to `America/Vancouver` for bins or axis labels.

The same origin has a median of 8 Waterfront rows in one 30-minute bin (up to 347). `longitude` and `latitude` on those rows are Waterfront’s coordinates.

Other datasets are allowed only if they are open source.

## How this gets judged

| Area | Points |
| --- | --- |
| Interactive tool with recommendations grounded in the data | 25 |
| Databricks analysis (patterns, segmentation, visualization, or modeling) | 15 |
| Extra credit for a well-structured, reproducible pipeline | +5 |
| Originality and a clearly stated impact | 10 |
| 5-minute pitch | 5 |

Sunday presentations are 5 minutes plus a short Q&A.

## Repo

```
notebooks/01_timestamp_timezone.py   # UTC vs America/Vancouver check (verdict: UTC)
notebooks/02_grain_and_identity.py   # 30-minute grid vs 1-second clock; no visitor id
```

The front end is not in the repo yet.
